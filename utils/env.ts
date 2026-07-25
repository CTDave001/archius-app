// Server-side environment variable reader.
//
// Vercel stores exactly the bytes you pipe into `vercel env add`, and
// `echo "value" | vercel env add ...` includes the trailing newline. That
// newline is invisible in the dashboard and in `vercel env ls`, survives into
// process.env, and breaks any code that compares the value as a string.
//
// It has already cost us once: REVENUECAT_WEBHOOK_AUTH was stored as
// "secret\n", the webhook compared it with `!==` against the clean value
// RevenueCat sends, so every entitlement event was rejected with a 401 and no
// paying user was ever marked Pro. Reading through here makes that class of
// bug impossible regardless of how the value got set.
//
// (Header values happen to survive it — undici normalizes surrounding
// whitespace — which is why the API keys kept working and hid the problem.)

export const env = (name: string): string | undefined => {
  const raw = process.env[name];
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

/** Same as env(), but throws if the variable is missing. */
export const requireEnv = (name: string): string => {
  const value = env(name);
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
};
