// src/appeals.js — the right of reply when an upload matches someone else's work.
//
// Legitimate reasons a 1:1 match happens: you are the original author and the
// other account copied you; you sell the same asset on several marketplaces; it
// is client work you are credited on. Each reason asks for the evidence that
// actually settles it. Appeals go to the human review queue — nothing is taken
// down or restored automatically.
//
// Stored in data/appeals.json (git-ignored) so a demo survives restarts.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { randomUUID } from "node:crypto";

export const REASONS = {
  original_author: { label: "I made this — the other upload copied me", needs: "a source file, WIP screenshots or a timelapse link" },
  multi_marketplace: { label: "I sell this on other marketplaces too", needs: "a link to your listing elsewhere; put the code shown below in that profile so we can confirm it is yours" },
  licensed_client_work: { label: "It is client work I am credited on", needs: "the client's credit page or a licence / contract excerpt" },
  other: { label: "Something else", needs: "anything that helps a reviewer understand" },
};
const STATUSES = ["submitted", "in_review", "approved", "rejected"];

const FILE = new URL("../data/appeals.json", import.meta.url);
let appeals = [];
try {
  if (existsSync(FILE)) appeals = JSON.parse(readFileSync(FILE, "utf8"));
} catch {
  appeals = [];
}
const save = () => {
  mkdirSync(new URL("../data/", import.meta.url), { recursive: true });
  writeFileSync(FILE, JSON.stringify(appeals, null, 2));
};

const bad = (msg) => Object.assign(new Error(msg), { status: 400 });

export function createAppeal(index, b) {
  const reason = REASONS[b.reason] ? b.reason : null;
  if (!reason) throw bad(`reason must be one of ${Object.keys(REASONS).join(", ")}`);
  const message = String(b.message || "").trim().slice(0, 2000);
  const links = (Array.isArray(b.links) ? b.links : []).map((l) => String(l).trim()).filter((l) => /^https?:\/\/\S+$/.test(l)).slice(0, 5);
  if (reason === "multi_marketplace" && !links.length) throw bad("add a link to your listing on the other marketplace");
  if (reason !== "other" && !links.length && message.length < 20) throw bad(`this reason needs ${REASONS[reason].needs}`);
  const match = b.matchProject ? index.projectById.get(String(b.matchProject)) : null;
  const appeal = {
    id: randomUUID().slice(0, 8),
    createdAt: new Date().toISOString(),
    status: "submitted",
    freelancerId: b.freelancerId ? String(b.freelancerId).slice(0, 40) : null,
    upload: { title: String(b.title || "Untitled upload").slice(0, 140), fingerprint: String(b.fingerprint || "").slice(0, 64) },
    uploadId: b.uploadId ? String(b.uploadId).slice(0, 40) : null,
    matched: match ? { project: match.id, title: match.title, owner: match.freelancerId } : null,
    reason,
    message,
    links,
    verificationCode: `FR-${randomUUID().slice(0, 6).toUpperCase()}`,
    history: [{ at: new Date().toISOString(), status: "submitted" }],
  };
  appeals.unshift(appeal);
  save();
  return appeal;
}

export const listAppeals = () => appeals;

export function updateAppeal(id, b) {
  const a = appeals.find((x) => x.id === id);
  if (!a) throw Object.assign(new Error("no such appeal"), { status: 404 });
  if (!STATUSES.includes(b.status)) throw bad(`status must be one of ${STATUSES.join(", ")}`);
  a.status = b.status;
  a.history.push({ at: new Date().toISOString(), status: b.status, note: String(b.note || "").slice(0, 500) });
  save();
  return a;
}
