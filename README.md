# Archius — Mobile App

AI that actually works. Direct, honest AI assistant for iOS and Android. Marketing site: [archius.app](https://archius.app).

## Stack

- Expo SDK 55 (React Native 0.83, React 19, Reanimated 4)
- Expo Router (file-based) with API routes for the backend proxy
- `@clerk/clerk-expo` v2 for auth (email + Apple + Google)
- `react-native-purchases` v10 (RevenueCat) for in-app purchases
- Vercel AI SDK (`ai` v6 + `@ai-sdk/openai` + `@ai-sdk/react`)
- DeepSeek (text) + Google AI Studio / Gemini (images) — keys never bundled; proxied through `/api/chat`
- SQLite (`expo-sqlite`) for chat history, MMKV v4 for settings

## Getting started

```bash
npm install --legacy-peer-deps
cp DUMMY.env .env  # then fill in real values
npx expo start
```

### Environment variables

Client (safe to bundle):
- `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` — from clerk.com
- `EXPO_PUBLIC_RC_APPLE_KEY` / `EXPO_PUBLIC_RC_GOOGLE_KEY` — RevenueCat (optional during dev)
- `EXPO_PUBLIC_API_URL` — optional override for the API base URL

Server-only (never prefix with `EXPO_PUBLIC_`):
- `DEEPSEEK_API_KEY` — DeepSeek API key
- `CLERK_SECRET_KEY` — for verifying JWTs in the API route

## Project structure

```
app/                  Expo Router routes (screens + API)
  api/chat+api.ts     Server-side proxy to DeepSeek
  (auth)/             Authenticated routes (drawer, chat, settings, paywall)
  index.tsx           Landing screen (signed-out)
  login.tsx           Email login/signup
  _layout.tsx         Root layout (fonts, Clerk, splash)
components/           UI components (ChatPage, MessageInput, etc.)
constants/            Brand tokens (Colors.ts, Styles.ts)
providers/            React contexts (RevenueCat)
utils/                Domain logic (Database, ai prompt + models, Interfaces)
assets/               Brand icons (icon.png, foreground.png, monochrome.png)
```

## Brand

Source of truth: `ARCHIUS_MOBILE_HANDOFF.md` in the repo root (one level up from this app).
