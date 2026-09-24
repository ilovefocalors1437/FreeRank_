# freelance-search

Prototype search engine for a freelance marketplace where **vector search is one recall
layer, not the system**. Ranking reads *evidence* (portfolio facts, client jobs,
verified credentials), never self-claimed tags, and an authenticity layer holds stolen
portfolios back before they can rank. Zero dependencies, Node 18+.

```bash
npm start      # console + API on http://localhost:3399  (PORT to change)
npm test       # golden set + attack simulations, exits 1 on any failure
```

## What happens to a request

```
text / tags / reference image
  └─ SearchSpec  (spec.js: rule stub, or an LLM writes the same JSON)
       └─ recall, every channel gated by hard filters          (search.js)
            visual    opponent-colour image vector, cosine      ← the only ANN-shaped part
            lexical   BM25 over title + description + tools     (tags excluded: they are claims)
            semantic  hashed bag-of-words cosine                ← swap point for bge/e5
            skills    evidence-weighted skill score
       └─ RRF fusion → features → query-adaptive weights × trust − claim-gap penalty
       └─ relevance gate → MMR (λ 0.92) → exploration slot for a qualified newcomer
       └─ explanations built only from logged feature values
```

Indexing (`index.js`) runs once at startup: fingerprints and embeddings per image
(`data.js`, `embed.js`), cross-account duplicate scan (`fraud.js`), copies held, then the
evidence graph (`evidence.js`) and a risk tier per freelancer.

| File | Design section | Job |
|---|---|---|
| `src/spec.js` | §3 | SearchSpec contract, `validateSpec`, rule-based `understand()`, degraded mode |
| `src/search.js` | §5–7 | recall channels, RRF, scoring, gate, MMR, exploration, explanations |
| `src/evidence.js` | §7 | fact extraction (VLM swap point), evidence graph, dedupe, claim gap |
| `src/fraud.js` | §8 | dHash + LSH, recolour detection, SimHash, risk signals, tiers, review cases |
| `src/index.js` | §4 | indexing pipeline, BM25 index, outcome rollups |
| `src/embed.js` | §9 | deterministic stand-ins for the ML models |
| `src/corpus-*.js` | — | 9 demo freelancers, each one a test case |
| `eval.js` | §14 | nDCG / recall / MRR + attack suite + explanation audit |

The demo corpus is built around the edge cases: **aoi** is the genuine match for the anime
example, **king** recoloured aoi's images and uploaded them later, **max** claims 25
skills with no evidence, **rin** uploaded one piece as five projects, **vera** is a new
account with verified source files, and **dan** is a copywriter who must ignore images.

## Plugging in an LLM as the query-understanding layer

The engine never calls a model. Anything that can write the spec can drive it. POST it
as `spec` and it's used as-is once it passes `validateSpec`. A spec that fails validation
drops to degraded mode (tags + lexical) and the errors come back in `spec_errors`.

```bash
curl -s localhost:3399/api/search -H "content-type: application/json" -d '{
  "spec": {
    "spec_version": "1", "producer": "claude",
    "work_type": { "category": "3d_character", "confidence": 0.9, "visual": true },
    "style": { "attributes": { "stylized_anime": 0.9, "cel_shaded": 0.8 } },
    "skills": [ { "skill": "blender", "weight": 0.9 }, { "skill": "rigging", "weight": 0.8 } ],
    "technical_requirements": [ { "req": "rigged", "weight": 0.8 } ],
    "difficulty": { "score": 0.7 },
    "expanded_terms": ["anime", "rigged", "character", "blender"],
    "hard_filters": { "accepting_work": true }
  }
}'
```

Vocabulary: `GET /api/meta` → `vocabulary` (categories, style keys, tech requirements).
Skills are free strings; the ones with evidence rules are the keys of `SKILL_RULES` in
`evidence.js`. In the console, **Edit spec** does the same thing by hand.

## API

| Route | |
|---|---|
| `POST /api/search` | `{text, tags, image?, spec?, k?}` → spec, weights, channels, results, blocked, below_floor, timing |
| `POST /api/understand` | same input → the SearchSpec only |
| `GET /api/trust` | review queue, image and text duplicate edges, per-account risk |
| `GET /api/freelancers` | profiles with evidence scores and held projects |
| `GET /api/log` | last 200 queries (the future learning-to-rank set) |

`image` is an 8×8 thumbnail `{w: 8, h: 8, rgb: [192 numbers]}`. The console downsamples uploads in the browser.

## What is real and what is a stand-in

Real: the pipeline shape, the RRF/scoring/gating/MMR/exploration logic, the evidence
maths, LSH-banded dHash duplicate detection, recolour and SimHash detection, the risk
tiers, and the explanation ledger.

Stand-ins, each behind one function:

- `gridVector` is a toy image vector. Replace it with SigLIP/DINOv2, then re-measure `calib()` in `search.js`: it's tuned to this vector's measured background cosine (median 0.48).
- `textVector` is hashed bag-of-words. Replace it with bge/e5.
- `extractFacts` uses regex over project text. Replace it with a VLM that reads the images too.
- The style probe is kNN over labelled portfolio images. Replace it with zero-shot style heads.

## Known limits

- **Crops defeat 8×8 dHash.** Production needs ORB+RANSAC or patch-embedding matching (design §8, layer 2). It's not faked here.
- **Earliest uploader wins.** A thief who uploads before the real artist joins wins the tie. Verified source files are the tie-break, and the appeal path is a human one.
- **Thresholds were measured on this corpus.** Copies sit at dHash ≤ 2 / SimHash ≤ 6, unrelated work at ≥ 7 / ≥ 17. The gap is narrow on 8×8 images; re-measure on real data.
- **The golden labels were written by the person who tuned the engine.** They guard against regressions; they don't prove quality. Real judgments need 2–3 graders pooling top-20s.
- Everything is in memory and rebuilt at startup (~10 ms for this corpus). Postgres + pgvector is the next step (design §10).
