// Server-side Tavily search client.
//
// Tavily is purpose-built for LLM use — it returns extracted, ready-to-cite
// content rather than raw HTML. Used by the web_search tool in the chat API.
//
// Env: TAVILY_API_KEY (server-only — never expose to the client).
// Get a key at https://app.tavily.com (free tier: 1,000 searches/month).

import { env } from '@/utils/env';

const TAVILY_ENDPOINT = 'https://api.tavily.com/search';

export type TavilySource = {
  title: string;
  url: string;
  content: string;
};

export type TavilyResult = {
  answer: string | null;
  sources: TavilySource[];
};

export type TavilyError = { error: string };

export async function searchWeb(
  query: string,
  opts: { maxResults?: number; depth?: 'basic' | 'advanced' } = {}
): Promise<TavilyResult | TavilyError> {
  const apiKey = env('TAVILY_API_KEY');
  if (!apiKey) {
    return { error: 'Web search is not configured (missing TAVILY_API_KEY).' };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);

  try {
    const res = await fetch(TAVILY_ENDPOINT, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        query: query.slice(0, 400),
        max_results: opts.maxResults ?? 5,
        search_depth: opts.depth ?? 'basic',
        include_answer: true,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.warn('[tavily] non-ok response', res.status, text.slice(0, 200));
      return { error: `Search failed (${res.status}).` };
    }

    const data: any = await res.json();
    const sources: TavilySource[] = Array.isArray(data?.results)
      ? data.results.slice(0, opts.maxResults ?? 5).map((r: any) => ({
          title: typeof r?.title === 'string' ? r.title : r?.url ?? 'Untitled',
          url: typeof r?.url === 'string' ? r.url : '',
          content: typeof r?.content === 'string' ? r.content : '',
        }))
      : [];

    return {
      answer: typeof data?.answer === 'string' ? data.answer : null,
      sources,
    };
  } catch (e: any) {
    if (e?.name === 'AbortError') {
      return { error: 'Search timed out.' };
    }
    console.warn('[tavily] search error', e?.message ?? e);
    return { error: 'Search is temporarily unavailable.' };
  } finally {
    clearTimeout(timeout);
  }
}
