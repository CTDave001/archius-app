// Synthetic end-to-end health check for the chat backend.
//
// This exists because the DeepSeek model rename broke chat for *every* user
// and nothing noticed — the /api/chat endpoint kept returning a clean 401 to
// anonymous callers, so a naive "is the URL up" ping stayed green while real
// requests died one layer deeper at the upstream model call. A useful check
// has to actually reach the things that break: the AI providers.
//
// So this endpoint really does call the upstreams (a tiny DeepSeek completion,
// a model-list check against DeepSeek and Gemini) and reports what's wrong.
//
// Severity model:
//   - CRITICAL failures (chat is down for everyone) -> HTTP 503.
//   - DEGRADED failures (a Pro-only feature is down: web search, images,
//     entitlements) -> still HTTP 200, but `ok:false` and `degraded:true` in
//     the body.
// An external uptime monitor watches the status code for the page-me-now case
// and can additionally keyword-match `"ok":true` to catch degradation.
//
// Protected by HEALTH_CHECK_TOKEN: the DeepSeek completion costs money, so an
// open endpoint would be a way to run up the bill. Pass it as `?token=` or an
// `x-health-token` header.

import { env } from '@/utils/env';
import { GEMINI_VISION_MODEL, MODELS } from '@/utils/ai';

type CheckResult = {
  name: string;
  ok: boolean;
  critical: boolean;
  detail: string;
};

const withTimeout = (ms: number) => AbortSignal.timeout(ms);

// GET /v1/models on DeepSeek and confirm BOTH configured ids still exist. This
// is the check that would have caught the rename, and it's free (no tokens).
async function checkDeepSeekModels(key: string): Promise<CheckResult> {
  const name = 'deepseek_models';
  try {
    const res = await fetch('https://api.deepseek.com/v1/models', {
      headers: { Authorization: `Bearer ${key}` },
      signal: withTimeout(8_000),
    });
    if (!res.ok) {
      return { name, ok: false, critical: true, detail: `models list HTTP ${res.status}` };
    }
    const data: any = await res.json();
    const ids: string[] = (data?.data ?? []).map((m: any) => m?.id);
    const missing = [MODELS.flash, MODELS.pro].filter((id) => !ids.includes(id));
    if (missing.length) {
      return {
        name,
        ok: false,
        critical: true,
        detail: `configured model(s) no longer offered: ${missing.join(', ')}. Available: ${ids.join(', ') || '(none)'}`,
      };
    }
    return { name, ok: true, critical: true, detail: `both ids present: ${ids.join(', ')}` };
  } catch (e: any) {
    return { name, ok: false, critical: true, detail: `unreachable: ${e?.message ?? e}` };
  }
}

// A real (tiny) completion on the default tier. Catches what a models-list
// check can't: an invalid/expired key, exhausted quota, or an upstream outage.
async function checkDeepSeekCompletion(key: string): Promise<CheckResult> {
  const name = 'deepseek_flash_completion';
  try {
    const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: MODELS.flash,
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 4,
      }),
      signal: withTimeout(12_000),
    });
    if (!res.ok) {
      const body = (await res.text().catch(() => '')).slice(0, 160);
      return { name, ok: false, critical: true, detail: `HTTP ${res.status} ${body}` };
    }
    const data: any = await res.json();
    if (!data?.choices?.length) {
      return { name, ok: false, critical: true, detail: 'no choices in response' };
    }
    return { name, ok: true, critical: true, detail: 'live completion succeeded' };
  } catch (e: any) {
    return { name, ok: false, critical: true, detail: `request failed: ${e?.message ?? e}` };
  }
}

// Gemini backs image messages (Pro-only), so a failure is degraded, not down.
async function checkGemini(key: string): Promise<CheckResult> {
  const name = 'gemini_models';
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`,
      { signal: withTimeout(8_000) }
    );
    if (!res.ok) {
      return { name, ok: false, critical: false, detail: `models list HTTP ${res.status}` };
    }
    const data: any = await res.json();
    const ids: string[] = (data?.models ?? []).map((m: any) => String(m?.name ?? ''));
    // Gemini reports ids as "models/gemini-2.5-flash".
    const present = ids.some((id) => id.endsWith(GEMINI_VISION_MODEL));
    return present
      ? { name, ok: true, critical: false, detail: `${GEMINI_VISION_MODEL} available` }
      : {
          name,
          ok: false,
          critical: false,
          detail: `${GEMINI_VISION_MODEL} not in Gemini's model list`,
        };
  } catch (e: any) {
    return { name, ok: false, critical: false, detail: `unreachable: ${e?.message ?? e}` };
  }
}

// Presence-only checks for secrets that don't warrant a live call every ping.
// Missing CLERK_SECRET_KEY breaks auth for everyone (critical); the rest gate
// Pro-only features (degraded).
function checkEnvPresence(): CheckResult[] {
  const spec: Array<{ key: string; critical: boolean }> = [
    { key: 'CLERK_SECRET_KEY', critical: true },
    { key: 'REVENUECAT_WEBHOOK_AUTH', critical: false },
    { key: 'REVENUECAT_SECRET_KEY', critical: false },
    { key: 'TAVILY_API_KEY', critical: false },
  ];
  return spec.map(({ key, critical }) => ({
    name: `env_${key}`,
    ok: !!env(key),
    critical,
    detail: env(key) ? 'present' : 'MISSING',
  }));
}

export async function GET(req: Request) {
  const expected = env('HEALTH_CHECK_TOKEN');
  if (!expected) {
    return Response.json({ ok: false, error: 'HEALTH_CHECK_TOKEN not configured' }, { status: 500 });
  }

  const url = new URL(req.url);
  const provided = (url.searchParams.get('token') ?? req.headers.get('x-health-token') ?? '').trim();
  if (provided !== expected) {
    return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const deepseekKey = env('DEEPSEEK_API_KEY');
  const geminiKey = env('GEMINI_API_KEY');

  const checks: CheckResult[] = [...checkEnvPresence()];

  // Run the live provider checks in parallel; each is individually bounded.
  const live = await Promise.all([
    deepseekKey
      ? checkDeepSeekModels(deepseekKey)
      : Promise.resolve<CheckResult>({
          name: 'deepseek_models',
          ok: false,
          critical: true,
          detail: 'DEEPSEEK_API_KEY missing',
        }),
    deepseekKey
      ? checkDeepSeekCompletion(deepseekKey)
      : Promise.resolve<CheckResult>({
          name: 'deepseek_flash_completion',
          ok: false,
          critical: true,
          detail: 'DEEPSEEK_API_KEY missing',
        }),
    geminiKey
      ? checkGemini(geminiKey)
      : Promise.resolve<CheckResult>({
          name: 'gemini_models',
          ok: false,
          critical: false,
          detail: 'GEMINI_API_KEY missing',
        }),
  ]);
  checks.push(...live);

  const criticalFail = checks.some((c) => c.critical && !c.ok);
  const anyFail = checks.some((c) => !c.ok);

  const payload = {
    ok: !anyFail,
    degraded: anyFail && !criticalFail,
    checkedAt: new Date().toISOString(),
    checks,
  };

  // 503 only when chat is actually down for everyone — that's the page-me-now
  // signal the monitor watches. Degraded (Pro feature down) stays 200 so a
  // Tavily blip doesn't wake anyone at 3am, but shows in the body.
  return Response.json(payload, { status: criticalFail ? 503 : 200 });
}
