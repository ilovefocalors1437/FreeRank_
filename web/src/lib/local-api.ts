// The static demo build's "server": the engine (../../../src/api.js) running in the
// page, answering the same requests server.js would. Loaded lazily by api.ts, and
// only in `vite build --mode static`, so the normal build stays a thin client.
//
// Differences from the real server, all deliberate:
//   * uploads and appeals persist in this browser's localStorage, per visitor
//   * uploaded images are stored as data URLs (there is no disk to write them to)
//   * the LLM grader is off — no API key ever ships to a browser

import { createApi, serialize } from "../../../src/api.js";
import { useStorage } from "../../../src/storage.js";

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
  save(key, value) {
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(value));
    } catch (err) {
      console.warn(`FreeRank demo: could not save ${key} in this browser (kept for this visit only)`, err);
    }
  },
  saveImage: (_id, ext, b64) => `data:image/${ext === "jpg" ? "jpeg" : ext};base64,${b64}`,
});

const api = createApi();

// Engine views carry root-relative asset URLs ("/assets/..."); on Pages the site
// lives under /<repo>/, so they are rebased on the way out.
const BASE = import.meta.env.BASE_URL;
const rebase = (text: string) => (BASE === "/" ? text : text.replaceAll('"/assets/', `"${BASE}assets/`));

export async function local<T>(path: string, method: string, body: unknown): Promise<T> {
  const url = new URL(path, location.origin);
  try {
    const out = await api.handle(method, url, async () => JSON.parse(JSON.stringify(body ?? {})));
    return JSON.parse(rebase(serialize(out))) as T;
  } catch (err) {
    const e = err as Error & { status?: number };
    if (!e.status) console.error(err);
    throw new Error(e.message || "something went wrong");
  }
}
