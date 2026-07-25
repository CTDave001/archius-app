// Vercel entry point — single Node serverless function that delegates to the
// Expo Router server output (everything under dist/server after `expo export`).
// `vercel.json` rewrites all incoming requests to this file, and `@expo/server`
// matches the path against the exported route handlers.

import { createRequestHandler } from '@expo/server/adapter/vercel';
import path from 'path';

export default createRequestHandler({
  build: path.join(process.cwd(), 'dist', 'server'),
});
