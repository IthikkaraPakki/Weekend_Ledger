// Polyfills the `window.storage` key-value API (get/set/delete/list) that the
// component was originally written against, using the browser's real
// localStorage. This means all your data lives only in this browser/device
// storage — nothing is sent anywhere, and it survives reloads and works
// offline. Clearing site data / browser storage will erase it, same as any
// localStorage-based app.

function nsKey(key, shared) {
  return `${shared ? "wtl:shared:" : "wtl:local:"}${key}`;
}

function safeParseIsString(value) {
  return typeof value === "string";
}

const storage = {
  async get(key, shared = false) {
    try {
      const raw = window.localStorage.getItem(nsKey(key, shared));
      if (raw === null || raw === undefined) return null;
      return { key, value: raw, shared };
    } catch (e) {
      console.error("storage.get failed", e);
      return null;
    }
  },

  async set(key, value, shared = false) {
    try {
      const v = safeParseIsString(value) ? value : JSON.stringify(value);
      window.localStorage.setItem(nsKey(key, shared), v);
      return { key, value: v, shared };
    } catch (e) {
      console.error("storage.set failed", e);
      return null;
    }
  },

  async delete(key, shared = false) {
    try {
      const k = nsKey(key, shared);
      const existed = window.localStorage.getItem(k) !== null;
      window.localStorage.removeItem(k);
      return { key, deleted: existed, shared };
    } catch (e) {
      console.error("storage.delete failed", e);
      return null;
    }
  },

  async list(prefix = "", shared = false) {
    try {
      const base = shared ? "wtl:shared:" : "wtl:local:";
      const fullPrefix = base + prefix;
      const keys = [];
      for (let i = 0; i < window.localStorage.length; i++) {
        const k = window.localStorage.key(i);
        if (k && k.startsWith(fullPrefix)) keys.push(k.slice(base.length));
      }
      return { keys, prefix, shared };
    } catch (e) {
      console.error("storage.list failed", e);
      return null;
    }
  },
};

if (typeof window !== "undefined" && !window.storage) {
  window.storage = storage;
}

export default storage;
