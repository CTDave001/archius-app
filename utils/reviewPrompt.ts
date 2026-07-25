// In-app App Store rating prompt.
//
// Strategy: ask only after the user has had a few *successful* exchanges
// (a positive moment), and at most once per app version. iOS itself further
// throttles SKStoreReviewController to ~3 prompts/year and may show nothing —
// that's expected; we just pick a good moment and let the OS decide.

import Constants from 'expo-constants';
import { requireOptionalNativeModule } from 'expo-modules-core';
import { storage } from '@/utils/Storage';

// expo-store-review is a NATIVE module. On a binary built before the dependency
// was added — e.g. the live 1.0.0 App Store build, which then received the
// ratings JS via an over-the-air update — the native side simply isn't there,
// and OTA can't add it.
//
// `require('expo-store-review')` reaches `requireNativeModule('ExpoStoreReview')`
// at the top of a module factory, which THROWS when the module is absent. A
// try/catch around the require was supposed to swallow that, but in release
// Metro builds the throw escaped and hit the fatal error handler (a real user
// on 1.0.0 saw the "Cannot find native module 'ExpoStoreReview'" alert).
//
// requireOptionalNativeModule does the same lookup but returns null instead of
// throwing. expo-modules-core is present in every build, so this is safe to
// call anywhere. We check the native side ourselves first and never touch the
// JS wrapper unless the module is really there.
type StoreReviewModule = {
  isAvailableAsync: () => Promise<boolean>;
  requestReview: () => Promise<void>;
};

const loadStoreReview = (): StoreReviewModule | null => {
  try {
    if (!requireOptionalNativeModule('ExpoStoreReview')) return null;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('expo-store-review') as StoreReviewModule;
  } catch {
    return null;
  }
};

const COUNT_KEY = 'review.success_count';
const PROMPTED_VERSION_KEY = 'review.prompted_version';

// Ask after this many successful assistant responses (lifetime, across chats).
// High enough that the user has clearly gotten value; low enough to catch them
// while engaged.
const THRESHOLD = 4;

const appVersion = (): string =>
  Constants.expoConfig?.version ?? '0.0.0';

/**
 * Call after a genuinely successful assistant response. Increments a counter
 * and, once the user crosses the engagement threshold (and hasn't already
 * been asked on this app version), requests the native review prompt.
 * Fully best-effort: any failure is swallowed so it can never affect chat.
 */
export const maybeRequestReview = async (): Promise<void> => {
  try {
    const next = (storage.getNumber(COUNT_KEY) ?? 0) + 1;
    storage.set(COUNT_KEY, next);

    if (next < THRESHOLD) return;

    // Only once per version — don't nag on every response past the threshold.
    if (storage.getString(PROMPTED_VERSION_KEY) === appVersion()) return;

    const StoreReview = loadStoreReview();
    if (!StoreReview) return;

    const available = await StoreReview.isAvailableAsync();
    if (!available) return;

    storage.set(PROMPTED_VERSION_KEY, appVersion());
    await StoreReview.requestReview();
  } catch {
    // ignore — a rating prompt is never worth interrupting the app
  }
};
