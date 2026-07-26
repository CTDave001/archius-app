// Persistence for Clerk's auth state.
//
// Clerk holds the signed-in session in memory and depends on this layer to
// survive an app restart. When it fails, the app behaves perfectly right up
// until the user closes it — and then they land back on the login screen. The
// previous implementation swallowed every keychain error, so a total
// persistence failure was indistinguishable from working correctly, and it
// shipped that way.
//
// Two things are different here:
//
//  1. keychainAccessible: AFTER_FIRST_UNLOCK. The expo-secure-store default is
//     WHEN_UNLOCKED, which is unreadable if iOS wakes the app while the device
//     is still locked. Clerk's own cache uses AFTER_FIRST_UNLOCK for exactly
//     this reason.
//
//  2. A keychain that refuses to store the token must not silently sign the
//     user out forever. If SecureStore throws, we fall back to MMKV — same app
//     sandbox, but no at-rest encryption — and say so loudly. That is a real
//     (if modest) downgrade, taken deliberately: the alternative on such a
//     device is being logged out on every single launch.
//
import * as SecureStore from 'expo-secure-store';

import { storage as fallbackStore } from '@/utils/Storage';

const OPTS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
};

// Flipped the first time the keychain refuses us, and never flipped back for
// the life of the process: alternating between the two stores would strand
// values in whichever one we weren't looking at.
let keychainUsable = true;

const reportKeychainFailure = (op: 'read' | 'write', e: unknown) => {
  const message = (e as any)?.message ?? String(e);
  console.warn(
    `[clerkStorage] keychain ${op} failed (${message}) — falling back to ` +
      'unencrypted local storage. The session will persist, but not in the keychain.'
  );
};

const get = async (key: string): Promise<string | null> => {
  if (keychainUsable) {
    try {
      const value = await SecureStore.getItemAsync(key, OPTS);
      if (value !== null) return value;
    } catch (e) {
      keychainUsable = false;
      reportKeychainFailure('read', e);
    }
  }
  // Also covers the migration case: a value written during a previous run that
  // had fallen back to MMKV is still found once the keychain starts working.
  return fallbackStore.getString(key) ?? null;
};

const set = async (key: string, value: string): Promise<void> => {
  if (keychainUsable) {
    try {
      await SecureStore.setItemAsync(key, value, OPTS);
      // Drop any copy left behind by an earlier fallback run so a stale token
      // can never be resurrected by the read path above.
      fallbackStore.delete(key);
      return;
    } catch (e) {
      keychainUsable = false;
      reportKeychainFailure('write', e);
    }
  }
  fallbackStore.set(key, value);
};

const remove = async (key: string): Promise<void> => {
  try {
    await SecureStore.deleteItemAsync(key, OPTS);
  } catch {
    // Nothing useful to do — we still clear the fallback below.
  }
  fallbackStore.delete(key);
};

/**
 * Clerk TokenCache: persists the client JWT that keeps the user signed in
 * across launches.
 */
export const tokenCache = {
  getToken: (key: string) => get(key),
  saveToken: (key: string, token: string) => set(key, token),
  clearToken: (key: string) => {
    void remove(key);
  },
};
