// src/uploads.js — portfolio pieces published through the Studio.
//
// Persisted through src/storage.js (data/uploads.json + data/uploads/ on the
// server, localStorage in the static demo). The index
// is rebuilt from corpus + uploads after every publish and every appeal decision,
// so a new piece goes through exactly the same fingerprinting, duplicate scan,
// evidence and rank maths as everything else.
//
// States: live      published, no match
//         held      matched someone's earlier upload; hidden until an appeal decides
//         cleared   a reviewer approved the appeal; treated as legitimately the
//                   freelancer's (e.g. sold on several marketplaces)
//         rejected  appeal rejected; stays hidden

import { storage } from "./storage.js";

// Loaded on first use, so the host can pick a storage backend before that.
let uploads = null;
const all = () => {
  if (!uploads) {
    const stored = storage().load("uploads");
    uploads = Array.isArray(stored) ? stored : [];
  }
  return uploads;
};
const save = () => storage().save("uploads", uploads);

export const listUploads = () => all();

export function addUpload({ freelancerId, title, description, grid, g64, preview, grade, state }) {
  const m = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(preview || ""));
  if (!m) throw Object.assign(new Error("preview must be a JPEG, PNG or WebP data URL"), { status: 400 });
  const bytes = Math.floor((m[2].length * 3) / 4) - (m[2].match(/=*$/)[0].length);
  if (bytes > 1.5 * 1024 * 1024) throw Object.assign(new Error("preview over 1.5 MB"), { status: 413 });
  const id = `up-${crypto.randomUUID().slice(0, 8)}`;
  const ext = m[1] === "jpeg" ? "jpg" : m[1];
  const image = storage().saveImage(id, ext, m[2]);
  const u = {
    id,
    freelancerId,
    title: String(title || "Untitled piece").slice(0, 140),
    description: String(description || "").slice(0, 2000),
    grid: { w: 8, h: 8, rgb: grid.rgb },
    g64,
    image,
    grade: grade ?? null,
    state,
    createdAt: new Date().toISOString(),
  };
  all().push(u);
  save();
  return u;
}

export function setUploadState(id, state) {
  const u = all().find((x) => x.id === id);
  if (!u) return null;
  u.state = state;
  save();
  return u;
}

// Uploads become ordinary projects on a copy of the corpus. They are the newest
// thing on the platform, so any match with existing work makes them the later copy.
export function mergeUploads(raw, list = all()) {
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
