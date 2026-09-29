// src/appeals.js — the right of reply when an upload matches someone else's work.
//
// Legitimate reasons a 1:1 match happens: you are the original author and the
// other account copied you; you sell the same asset on several marketplaces; it
// is client work you are credited on. Each reason asks for the evidence that
// actually settles it. Appeals go to the human review queue — nothing is taken
// down or restored automatically.
//
// Persisted through src/storage.js (data/appeals.json on the server, localStorage
// in the static demo) so a demo survives restarts.

import { collection, randomHex } from "./storage.js";

export const REASONS = {
  original_author: { label: "I made this — the other upload copied me", needs: "a source file, WIP screenshots or a timelapse link" },
  multi_marketplace: { label: "I sell this on other marketplaces too", needs: "a link to your listing elsewhere; put the code shown below in that profile so we can confirm it is yours" },
  licensed_client_work: { label: "It is client work I am credited on", needs: "the client's credit page or a licence / contract excerpt" },
  other: { label: "Something else", needs: "anything that helps a reviewer understand" },
};
const STATUSES = ["submitted", "in_review", "approved", "rejected"];

const appeals = collection("appeals");

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
    id: randomHex(8),
    createdAt: new Date().toISOString(),
    status: "submitted",
    freelancerId: b.freelancerId ? String(b.freelancerId).slice(0, 40) : null,
    upload: { title: String(b.title || "Untitled upload").slice(0, 140), fingerprint: String(b.fingerprint || "").slice(0, 64) },
    uploadId: b.uploadId ? String(b.uploadId).slice(0, 40) : null,
    matched: match ? { project: match.id, title: match.title, owner: match.freelancerId } : null,
    reason,
    message,
    links,
    verificationCode: `FR-${randomHex(6).toUpperCase()}`,
    history: [{ at: new Date().toISOString(), status: "submitted" }],
  };
  appeals.all().unshift(appeal);
  appeals.commit();
  return appeal;
}

export const listAppeals = () => appeals.all();

export function updateAppeal(id, b) {
  const a = appeals.all().find((x) => x.id === id);
  if (!a) throw Object.assign(new Error("no such appeal"), { status: 404 });
  if (!STATUSES.includes(b.status)) throw bad(`status must be one of ${STATUSES.join(", ")}`);
  a.status = b.status;
  a.history.push({ at: new Date().toISOString(), status: b.status, note: String(b.note || "").slice(0, 500) });
  appeals.commit();
  return a;
}
