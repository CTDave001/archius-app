type KVValue = boolean | string | number;

interface KVStore {
  getBoolean(key: string): boolean | undefined;
  getString(key: string): string | undefined;
  getNumber(key: string): number | undefined;
  set(key: string, value: KVValue): void;
  delete(key: string): void;
}

const memory = new Map<string, string>();

const browserStore = (namespace: string): KVStore => {
  const keyFor = (key: string) => `archius:${namespace}:${key}`;
  const getRaw = (key: string) => {
    const namespaced = keyFor(key);
    if (typeof window === 'undefined' || !window.localStorage) return memory.get(namespaced);
    try {
      return window.localStorage.getItem(namespaced) ?? undefined;
    } catch {
      return memory.get(namespaced);
    }
  };
  const writeRaw = (key: string, value: string) => {
    const namespaced = keyFor(key);
    memory.set(namespaced, value);
    try {
      window.localStorage?.setItem(namespaced, value);
    } catch {
      // Privacy modes can disable localStorage; the in-memory copy keeps the
      // current browser session functional.
    }
  };

  return {
    getBoolean: (key) => {
      const value = getRaw(key);
      return value === 'true' ? true : value === 'false' ? false : undefined;
    },
    getString: getRaw,
    getNumber: (key) => {
      const value = getRaw(key);
      if (value === undefined) return undefined;
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : undefined;
    },
    set: (key, value) => writeRaw(key, String(value)),
    delete: (key) => {
      const namespaced = keyFor(key);
      memory.delete(namespaced);
      try {
        window.localStorage?.removeItem(namespaced);
      } catch {
        // Ignore unavailable storage.
      }
    },
  };
};

export const storage = browserStore('settings');
export const chatStorage = browserStore('chats');
