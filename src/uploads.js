// src/uploads.js — portfolio pieces published through the Studio.
//
// Stored in data/uploads.json + data/uploads/<id>.jpg (both git-ignored). The index
// is rebuilt from corpus + uploads after every publish and every appeal decision,
// so a new piece goes through exactly the same fingerprinting, duplicate scan,
// evidence and rank maths as everything else.
//
// States: live      published, no match
//         held      matched someone's earlier upload; hidden until an appeal decides
//         cleared   a reviewer approved the appeal; treated as legitimately the
//                   freelancer's (e.g. sold on several marketplaces)
//         rejected  appeal rejected; stays hidden

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { randomUUID } from "node:crypto";

const DATA = new URL("../data/", import.meta.url);
const FILE = new URL("uploads.json", DATA);
export const UPLOAD_DIR = new URL("uploads/", DATA);

let uploads = [];
try {
  if (existsSync(FILE)) uploads = JSON.parse(readFileSync(FILE, "utf8"));
} catch {
  uploads = [];
}
const save = () => {
  mkdirSync(UPLOAD_DIR, { recursive: true });
  writeFileSync(FILE, JSON.stringify(uploads, null, 1));
};

export const listUploads = () => uploads;

export function addUpload({ freelancerId, title, description, grid, g64, preview, grade, state }) {
  const m = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(preview || ""));
  if (!m) throw Object.assign(new Error("preview must be a JPEG, PNG or WebP data URL"), { status: 400 });
  const bytes = Buffer.from(m[2], "base64");
  if (bytes.length > 1.5 * 1024 * 1024) throw Object.assign(new Error("preview over 1.5 MB"), { status: 413 });
  const id = `up-${randomUUID().slice(0, 8)}`;
  const ext = m[1] === "jpeg" ? "jpg" : m[1];
  mkdirSync(UPLOAD_DIR, { recursive: true });
  writeFileSync(new URL(`${id}.${ext}`, UPLOAD_DIR), bytes);
  const u = {
    id,
    freelancerId,
    title: String(title || "Untitled piece").slice(0, 140),
    description: String(description || "").slice(0, 2000),
    grid: { w: 8, h: 8, rgb: grid.rgb },
    g64,
    image: `/uploads/${id}.${ext}`,
    grade: grade ?? null,
    state,
    createdAt: new Date().toISOString(),
  };
  uploads.push(u);
  save();
  return u;
}

export function setUploadState(id, state) {
  const u = uploads.find((x) => x.id === id);
  if (!u) return null;
  u.state = state;
  save();
  return u;
}

// Uploads become ordinary projects on a copy of the corpus. They are the newest
// thing on the platform, so any match with existing work makes them the later copy.
export function mergeUploads(raw, list = uploads) {
  if (!list.length) return raw;
  const out = structuredClone(raw);
  const byId = new Map(out.map((f) => [f.id, f]));
  list.forEach((u, i) => {
    const f = byId.get(u.freelancerId);
    if (!f || u.state === "rejected") return;
    f.projects.push({
      id: u.id,
      title: u.title,
      description: u.description,
      tools: /\bblender\b/i.test(u.description) ? ["blender"] : /\bzbrush\b/i.test(u.description) ? ["zbrush"] : /\bfigma\b/i.test(u.description) ? ["figma"] : [],
      tags: [],
      style: {},
      difficulty: 0.5,
      img: { w: 8, h: 8, rgb: u.grid.rgb, g64: u.g64 },
      ts: 100000 + i,
      imageUrl: u.image,
      thumbUrl: u.image,
      grade: u.grade ?? undefined,
      cleared: u.state === "cleared",
      upload: { state: u.state },
    });
  });
  return out;
}
