<p align="center"><img src="web/public/brand/freerank-logo.svg" alt="FreeRank" width="360"></p>

# FreeRank

A freelance marketplace where **rank is earned from paid client work and a checked
portfolio** — and where stolen portfolios never reach the ladder.

> **สรุป (ไทย)** — FreeRank มีสองโหมด: **Casual** ทุกคนที่งานตรงกับที่ลูกค้าหา ได้โอกาสขึ้นเป็นคนแรกเท่ากัน (สลับลำดับทุกชั่วโมง)
> และ **Competitive** เรียงตาม relevance × rank เข้าได้เมื่อมีลูกค้าจ่ายเงินจริง 3 รายจาก Casual + ผลงาน 3 ชิ้นที่ผ่านการตรวจ
> Rank มี Freelance → Pro → Expert → Elite (4 ดิวิชั่นต่อเทียร์) และ **Master = ที่นั่ง** top 3 ต่อสาย (Master #1, #2, #3)
> Rating มาจากรีวิวลูกค้า 75% + คะแนนพอร์ต 25% (MiMo ให้คะแนนได้ถ้าตั้งค่า) — กฎทั้งหมดอยู่ใน [docs/RANKS.md](docs/RANKS.md)
> ทุกรูปที่อัปโหลดถูกเทียบลายนิ้วมือกับทุกรูปในระบบ เจอซ้ำ = hold + ยื่นอุทธรณ์ได้ (เช่น ขายหลายแพลตฟอร์ม) คนตัดสินเท่านั้นที่ปล่อยหรือลบ

```bash
npm install --prefix web     # once
npm run build                # builds the web app into web/dist
npm start                    # API + web on http://localhost:3399
npm test                     # 51 checks: search quality, attacks, arenas, rank maths, HTTP contract
```

For frontend work, run `npm start` and `npm run dev` together (Vite on :5178 proxies
`/api` to :3399). The engine's own test console is at `/console`.

## What's in it

| | |
|---|---|
| **Search** (`src/search.js`) | Hybrid engine: a request becomes a SearchSpec, four recall channels (visual, BM25, semantic, skill evidence) are fused with RRF, then evidence-weighted scoring with explanations built from logged features. The two arenas sit on top: Casual = fair rotation, Competitive = relevance × rank. |
| **Ranks** (`src/rank.js`, [docs/RANKS.md](docs/RANKS.md)) | Bayesian client score + confidence-shrunk portfolio grade → rating → tier/division; Master seats per craft; entry gate; demotion shield; collusion decay. |
| **Authenticity** (`src/fraud.js`, `src/portfolio.js`, `src/appeals.js`) | 256-bit structure fingerprints on every image, cross-account duplicate scan, recolour detection, claim/evidence gap, portfolio padding, risk tiers, upload check, appeals with a human review queue. |
| **Studio uploads** (`src/uploads.js`) | Publish → re-checked server-side → index rebuilt. Matches are stored held; an approved appeal puts them live. |
| **Grader** (`src/grader.js`) | Portfolio grade from an OpenAI-compatible vision model when configured, deterministic estimate otherwise. |
| **Web** (`web/`) | React 19 + Vite 8 + TypeScript. Landing, search, profiles, ladder/leaderboards, studio, review queue. |
| **Assets** (`assets-src/`) | Blender scripts for the 3D tier emblems and every portfolio render, a Chrome-rendered set for UI/brand/copy work, the fingerprint measurement script. |

## Using MiMo (or another model) as the grader

```bash
GRADER_BASE_URL=https://token-plan-sgp.xiaomimimo.com/v1 GRADER_API_KEY=... GRADER_MODEL=mimo-v2.6-pro npm start
```

The grade is a *feature*: schema-checked, clamped, blended 70/30 with the deterministic
estimate, and it falls back to the estimate if the model fails. The model has to accept
images (`image_url` content). The Studio says which grader produced each grade.

## Rebuilding the assets

```bash
node assets-src/jobs.mjs > assets-src/.cache/jobs.json
blender --background --python assets-src/blender/portfolio.py -- assets-src/.cache/jobs.json assets-src/.cache/raw
node assets-src/html-render.mjs assets-src/.cache/jobs.json assets-src/.cache/raw
python assets-src/finalize.py assets-src/.cache/jobs.json assets-src/.cache/raw web/public/assets/portfolio data/grids.json
node assets-src/measure-fp.mjs          # re-check thresholds whenever images change
blender --background --python assets-src/blender/emblems.py -- assets-src/.cache/emblems-hi
python assets-src/export_emblems.py assets-src/.cache/emblems-hi web/public/assets/emblems
python assets-src/logo.py
```

Blender 5.2, Python with Pillow and fontTools, and Chrome are the only tools needed.

## Demo data

26 invented freelancers across five crafts, each with a job history. Nobody's rank is
typed in; `rank.js` derives it. The cast includes the test cases:

| | |
|---|---|
| **aoi** | genuine stylized-character artist, Elite |
| **king** | uploaded aoi's renders hue-shifted and brightened → held, never in search |
| **max** | claims 25 skills, shows none → under review, never ranked |
| **rin** | one character uploaded as five projects → counted once |
| **vera** | new, verified source files, no clients yet → Casual only, on equal terms |
| **kenta / ivan / hana / theo / maya** | Masters of their crafts |

## Honest limits

- **The image and text "embeddings" are stand-ins** (8×8 colour layout, hashed bag of
  words). The visual channel mostly sees palette, which is why the arenas don't trust
  it for inclusion. Swap `gridVector` / `textVector` in `src/embed.js` for SigLIP / bge
  and re-measure `calib()` in `search.js`.
- **The fingerprint margins were measured on procedural renders** that share
  compositions: theft at 17–18 bits against honest work at 21+. Re-run
  `assets-src/measure-fp.mjs` on real portfolios; crops are not handled (that needs
  keypoint matching).
- **External reverse image search is not wired in.** The internal index is the only
  duplicate check.
- **The relevance labels in the eval were written by the builder.** They guard against
  regressions; they don't prove quality.
- Everything is in memory and rebuilt at start (~70 ms). Uploads and appeals persist to
  `data/*.json` (git-ignored). There are no accounts: the Studio's "viewing as" picker
  stands in for sign-in.
