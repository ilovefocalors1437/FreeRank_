// src/storage.js — where Studio uploads and appeals persist.
//
// The engine itself is runtime-neutral: the host plugs in a backend before the
// first read. server.js uses files under data/ (storage-node.js); the static demo
// build uses the browser's localStorage (web/src/lib/local-api.ts). Without a
// backend everything lives in memory for the life of the process (the eval).
//
//   load(key)               -> parsed JSON, or null when nothing is stored
//   save(key, value)        -> persist a JSON-able value; throw if it cannot
//   saveImage(id, ext, b64) -> the URL the image will be served from

const memory = new Map();
let backend = {
  load: (key) => memory.get(key) ?? null,
  save: (key, value) => void memory.set(key, structuredClone(value)),
  saveImage: (_id, ext, b64) => dataUrl(ext, b64),
};

export const useStorage = (b) => void (backend = b);
export const storage = () => backend;

// For backends with nowhere to put a file: the image travels inside the record.
export const dataUrl = (ext, b64) => `data:image/${ext === "jpg" ? "jpeg" : ext};base64,${b64}`;

// Random hex ids. crypto.getRandomValues works in every context, unlike
// crypto.randomUUID, which browsers restrict to https/localhost.
export function randomHex(n) {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(Math.ceil(n / 2)));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("").slice(0, n);
}

// A persisted list, loaded on first use so the host can pick a backend before that.
//   all()     the live array; mutate it in place, then commit()
//   commit()  persist it. If that fails (browser storage full, disk error) the
//             unsaved change is discarded — the next all() reloads what really is
//             stored — and the caller gets a 507 instead of a silent success.
//   reset()   forget the in-memory copy (another tab changed the stored data)
const collections = new Set();
export function collection(key) {
  let items = null;
  const col = {
    all() {
      if (!items) {
        const stored = storage().load(key);
        items = Array.isArray(stored) ? stored : [];
      }
      return items;
    },
    commit() {
      try {
        storage().save(key, items);
      } catch (err) {
        items = null;
        throw Object.assign(new Error(`could not save your ${key} (${err.message || "storage unavailable"}); nothing was changed`), { status: 507 });
      }
    },
    reset() {
      items = null;
    },
  };
  collections.add(col);
  return col;
}

export const resetCollections = () => collections.forEach((c) => c.reset());
