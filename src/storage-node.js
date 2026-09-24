// src/storage-node.js — the server's storage backend: data/<key>.json plus
// data/uploads/<id>.<ext> (all git-ignored), so a demo survives restarts.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";

const DATA = new URL("../data/", import.meta.url);
export const UPLOAD_DIR = new URL("uploads/", DATA);

export const nodeStorage = {
  load(key) {
    const file = new URL(`${key}.json`, DATA);
    try {
      return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : null;
    } catch {
      return null;
    }
  },
  save(key, value) {
    mkdirSync(DATA, { recursive: true });
    writeFileSync(new URL(`${key}.json`, DATA), JSON.stringify(value, null, 1));
  },
  saveImage(id, ext, b64) {
    mkdirSync(UPLOAD_DIR, { recursive: true });
    writeFileSync(new URL(`${id}.${ext}`, UPLOAD_DIR), Buffer.from(b64, "base64"));
    return `/uploads/${id}.${ext}`;
  },
};
