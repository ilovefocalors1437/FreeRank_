// src/storage.js — where Studio uploads and appeals persist.
//
// The engine itself is runtime-neutral: the host plugs in a backend before the
// first read. server.js uses files under data/ (storage-node.js); the static demo
// build uses the browser's localStorage (web/src/lib/local-api.ts). Without a
// backend everything lives in memory for the life of the process (the eval).
//
//   load(key)              -> parsed JSON, or null when nothing is stored
//   save(key, value)       -> persist a JSON-able value
//   saveImage(id, ext, b64) -> the URL the image will be served from

const memory = new Map();
let backend = {
  load: (key) => memory.get(key) ?? null,
  save: (key, value) => void memory.set(key, value),
  saveImage: (_id, ext, b64) => `data:image/${ext === "jpg" ? "jpeg" : ext};base64,${b64}`,
};

export const useStorage = (b) => void (backend = b);
export const storage = () => backend;
