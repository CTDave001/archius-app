// Key-value storage backed by MMKV, with an in-memory fallback.
//
// MMKV instances used to be created unconditionally at module scope; if the
// native module ever fails to initialize (Nitro module registration issues
// have been reported on some devices), that throw happens during bundle
// evaluation and takes the whole app down before anything renders. The
// fallback trades persistence for survival: preferences become session-only
// instead of crashing at launch.

type KVValue = boolean | string | number;

interface KVStore {
  getBoolean(key: string): boolean | undefined;
  getString(key: string): string | undefined;
  getNumber(key: string): number | undefined;
  set(key: string, value: KVValue): void;
  delete(key: string): void;
}

const memoryStore = (): KVStore => {
  const m = new Map<string, KVValue>();
  return {
    getBoolean: (k) => {
      const v = m.get(k);
      return typeof v === 'boolean' ? v : undefined;
    },
    getString: (k) => {
      const v = m.get(k);
      return typeof v === 'string' ? v : undefined;
    },
    getNumber: (k) => {
      const v = m.get(k);
      return typeof v === 'number' ? v : undefined;
    },
    set: (k, v) => {
      m.set(k, v);
    },
    delete: (k) => {
      m.delete(k);
    },
  };
};

function safeCreate(id: string): KVStore {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { createMMKV } = require('react-native-mmkv');
    return createMMKV({ id });
  } catch (e) {
    console.warn(`[Storage] MMKV init failed for "${id}" — using in-memory fallback`, e);
    return memoryStore();
  }
}

export const storage = safeCreate('archius-settings');
export const chatStorage = safeCreate('archius-chats');
