// assets-src/jobs.mjs — writes the render job list from the corpus.
//   node assets-src/jobs.mjs > assets-src/.cache/jobs.json
import { CORPUS, REFERENCE_IMAGES, ATTACK_FIXTURES } from "../src/corpus.js";

const jobs = [];
for (const f of CORPUS) for (const p of f.projects) jobs.push({ id: p.id, ...p.image });
for (const [id, r] of Object.entries(REFERENCE_IMAGES)) jobs.push({ id: `ref-${id}`, ...r.image });
for (const fx of ATTACK_FIXTURES) jobs.push(fx);
process.stdout.write(JSON.stringify(jobs, null, 1));
