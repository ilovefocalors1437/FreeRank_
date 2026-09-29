// The static demo build's "server": the engine (../../../src/api.js) running in the
// page, answering the same requests server.js would. Loaded lazily by api.ts, and
// only in `vite build --mode static`, so the normal build stays a thin client.
//
// Differences from the real server, all deliberate:
//   * uploads and appeals persist in this browser's localStorage, per visitor
//   * uploaded images are stored as data URLs (there is no disk to write them to)
//   * the LLM grader is off — no API key ever ships to a browser

import { createApi, serialize } from "../../../src/api.js";
import { useStorage, dataUrl } from "../../../src/storage.js";

const PREFIX = "freerank-demo:";

useStorage({
  load(key) {
    try {
      const raw = localStorage.getItem(PREFIX + key);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },
  // Throws when the browser refuses (quota, blocked storage): the engine then drops
  // the change and the Studio shows the error, rather than pretending it was saved.
  save(key, value) {
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(value));
    } catch (err) {
      const full = err instanceof DOMException && (err.name === "QuotaExceededError" || err.name === "NS_ERROR_DOM_QUOTA_REACHED" || err.code === 22 || err.code === 1014);
      throw new Error(full ? "this browser's storage for the demo is full" : "this browser is blocking storage for the demo");
    }
  },
  saveImage: (_id, ext, b64) => dataUrl(ext, b64),
});

const api = createApi();

// Two tabs share one localStorage but each holds its own copy in memory. A write
// in another tab fires "storage" here; re-read so this tab neither shows stale
// data nor overwrites the other tab's changes with its own copy on its next write.
window.addEventListener("storage", (e) => {
  if (e.key === null || e.key.startsWith(PREFIX)) api.refresh();
});

// Engine views carry root-relative asset URLs ("/assets/..."); on Pages the site
// lives under /<repo>/, so those fields are rebased on the way out. Only the fields
// that hold URLs are touched, never free text a user typed.
const BASE = import.meta.env.BASE_URL;
const URL_FIELDS = new Set(["cover", "thumb", "image", "url", "originalThumb", "copyThumb"]);
const rebase = (v: unknown, field?: string): unknown => {
  if (typeof v === "string") return BASE !== "/" && field && URL_FIELDS.has(field) && v.startsWith("/assets/") ? BASE + v.slice(1) : v;
  if (Array.isArray(v)) return v.map((x) => rebase(x, field));
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, rebase(x, k)]));
  return v;
};

// The same per-route body limits the server enforces (src/api.js passes them in).
const readBody = (body: unknown) => async (limit: number) => {
  const text = JSON.stringify(body ?? {});
  if (text.length > limit) throw Object.assign(new Error(`request body over ${limit / 1024} KB`), { status: 413 });
  return JSON.parse(text);
};

export async function local<T>(path: string, method: string, body: unknown): Promise<T> {
  const url = new URL(path, location.origin);
  try {
    const out = await api.handle(method, url, readBody(body));
    return rebase(JSON.parse(serialize(out))) as T;
  } catch (err) {
    const e = err as Error & { status?: number };
    if (!e.status) console.error(err);
    throw new Error(e.message || "something went wrong");
  }
}
