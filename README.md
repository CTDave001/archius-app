# Archius — iOS, Android, and Web

AI that actually works. Direct, honest AI assistant for iOS, Android, and the browser. Marketing site: [archius.app](https://archius.app).

## Stack

- Expo SDK 55 (React Native 0.83, React 19, Reanimated 4)
- Expo Router (file-based) with API routes for the backend proxy
- `@clerk/clerk-expo` v2 for auth (email + Apple + Google)
- RevenueCat native and web SDKs for entitlement-aware purchases
- Vercel AI SDK (`ai` v6 + `@ai-sdk/openai` + `@ai-sdk/react`)
- DeepSeek (text) + Google AI Studio / Gemini (images) — keys never bundled; proxied through `/api/chat`
- SQLite (`expo-sqlite`) for native chat history, managed Postgres for account-scoped web sync
- MMKV on native and `localStorage` on web for device-local preferences

## Getting started

```bash
npm install --legacy-peer-deps
cp DUMMY.env .env  # then fill in real values
npx expo start
```

Useful commands:

```bash
npm run typecheck
npm run build:web
node --env-file=.env.local scripts/migrate-web-db.mjs
```

### Environment variables

Client (safe to bundle):
- `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` — from clerk.com
- `EXPO_PUBLIC_RC_APPLE_KEY` / `EXPO_PUBLIC_RC_GOOGLE_KEY` — RevenueCat (optional during dev)
- `EXPO_PUBLIC_RC_WEB_KEY` — RevenueCat Web Billing public API key
- `EXPO_PUBLIC_RC_CUSTOMER_PORTAL_URL` — optional hosted web billing-management URL
- `EXPO_PUBLIC_API_URL` — backend origin; required for standalone production builds

Server-only (never prefix with `EXPO_PUBLIC_`):
- `DEEPSEEK_API_KEY` — DeepSeek API key
- `GEMINI_API_KEY` — Google AI Studio key for image messages
- `GEMINI_MODEL` — optional Gemini model override
- `TAVILY_API_KEY` — Tavily key for Pro web search
- `CLERK_SECRET_KEY` — for verifying JWTs in the API route
- `REVENUECAT_SECRET_KEY` — server key used to verify current entitlements
- `REVENUECAT_WEBHOOK_AUTH` — shared authorization value for RevenueCat webhooks
- `REVIEW_DEMO_EMAIL` — the single App Review account allowed through the review bridge
- `HEALTH_CHECK_TOKEN` — protects the synthetic `/api/health` provider check
- `DATABASE_URL` — Postgres connection used only by authenticated web chat routes

## Project structure

```
app/                  Expo Router routes (native/web screens + API)
  api/chat+api.ts     Server-side proxy to DeepSeek
  api/chats+api.ts    Authenticated web chat persistence
  (auth)/             Authenticated routes (drawer, chat, settings, paywall)
  index.web.tsx       Desktop-first browser landing page
  login.web.tsx       Clerk-powered browser sign-in
  _layout.tsx         Root layout (fonts, Clerk, splash)
components/           UI components (ChatPage, MessageInput, etc.)
constants/            Brand tokens (Colors.ts, Styles.ts)
db/                   Postgres schema migrations for web sync
providers/            Platform-specific chat database and RevenueCat contexts
utils/                Domain logic (Database, ai prompt + models, Interfaces)
assets/               Brand icons (icon.png, foreground.png, monochrome.png)
```

## Brand

Source of truth: `ARCHIUS_MOBILE_HANDOFF.md` in the repo root (one level up from this app).
