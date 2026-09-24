# How FreeRank ranks work

This file states the rules. `src/rank.js` is the single implementation, and `npm test`
checks the behaviour described here.

## Two arenas

| | Casual | Competitive |
|---|---|---|
| Who's in it | everyone whose work genuinely matches the request | ranked freelancers only |
| Order | **fair rotation**: the matching list is shuffled per hour-long rotation window, so each person leads equally often (tested over 400 rotations) | relevance × rank: `score × (0.55 + 0.45 × rankNorm)` |
| Rank badges shown | no — it would bias clicks in an arena that promises equal turns | yes |
| Purpose | a fair start; where the first three clients come from | where clients who want proven quality go; unequal on purpose |

"Genuinely matches" means the same relevance gate in both arenas: some query-specific
evidence (skills, the look of the work, or what the work is about), plus the same work
type as the request unless skill evidence for the request is strong. Tags alone never
qualify — claimed tags are worth nothing without evidence (see `src/evidence.js`).

## Entering Competitive

All three, checked on every index build:

1. **3 different paying clients** from Casual, each job worth at least $50. Repeat work
   from one client counts once.
2. **3 portfolio pieces** that are live (not held by the authenticity check).
3. **Trust tier `pass`**. An account under review drops out of Competitive until it's
   cleared.

A ranked freelancer with no Competitive job in **180 days** is left out of Competitive
search until their next one. The rating itself doesn't change.

## The rating

```
S      = 0.75 · clientScore + 0.25 · systemScore        (quality, 0..1)
rating = 1000 + 2500 · max(0, S − 0.3)
```

**clientScore** is a Bayesian average of job performance, starting from **8 imaginary
jobs at 0.3**. That prior is why three perfect reviews still land low (tested: 3
perfect jobs and a strong portfolio stay below Expert), and why sustained volume of
excellent work reaches Master (tested: 30 perfect jobs → Master territory).

- job performance = `0.8 · (stars − 1)/4 + 0.2 · on-time`, +0.05 if rehired;
  a lost dispute is 0 and counts double
- job weight = size × repeat × recency
  - size: `0.5 + 0.5 · log10(value / $50)`, clamped to 0.5–1.5
  - repeat: the n-th job from the same client weighs `0.5^(n−1)` (tested: 20 extra jobs
    from one client move the rating less than 20% as much as 20 jobs from 20 clients)
  - recency: half-life of one year

**systemScore** = portfolio grade × authenticity, then **shrunk toward the prior by the
same client confidence**. A beautiful portfolio is a claim until clients have paid for
the work.

- portfolio grade: the mean of the top 3 pieces (fewer than 3 counts as zeros). Each
  piece is graded by an LLM with vision when `GRADER_*` is configured (MiMo or any
  OpenAI-compatible model), blended 70/30 with a deterministic estimate; otherwise
  the estimate alone
- authenticity: verified source files 1.0 · clean 0.9 · under review 0.5 · held 0

## Tiers and divisions

| Tier | Rating | Divisions (4 → 1) |
|---|---|---|
| Freelance | 1000–1299 | 75 points each |
| Pro | 1300–1499 | 50 each |
| Expert | 1500–1699 | 50 each |
| Elite | 1700–1899 | 50 each |
| **Master** | 1900+ **and a seat** | numbered: Master #1, #2, #3 |

**Master is relative.** Only the top **3 per craft** (`MASTER_SEATS`) with a rating of
1900+ are Masters. Anyone else at 1900+ shows as Elite 1, "waiting for a seat". The number
of Masters never inflates as the marketplace grows. In production the seat count would
be something like the top 100 or top 0.5% per craft.

**Demotion shield:** falling up to 25 points below a division's floor keeps the division
(tested). Promotion is immediate.

## Why these numbers

They were set against the demo population (26 freelancers, 5 crafts) so that every tier
is occupied and the order matches what the job histories say. They are constants at the
top of `src/rank.js`. With real data, re-fit the tier bands to the rating distribution
(e.g. Master ≈ top 1%, Elite next 4%) instead of reusing these.

## Portfolio authenticity and appeals

- Every upload is fingerprinted from 64×64 luma (`src/embed.js`) and compared with every
  image in the index, held ones included. Decisions use a 256-bit structure hash plus a
  "stable" variant that ignores flat-area noise. An edge hash is recorded for reviewers
  but decides nothing, because it was too unstable on recoloured copies.
- A match with someone else's **earlier** upload holds the piece. The freelancer can
  appeal: *I'm the original author*, *I sell this on other marketplaces* (with a link
  and a verification code placed on that profile), *credited client work*, or *other*.
- A reviewer approves (the piece goes live and is treated as the freelancer's own) or
  rejects (it stays hidden). Nothing is taken down or restored automatically.
- Thresholds were measured on the real renders (`assets-src/measure-fp.mjs`). Recoloured
  thefts sit at 17–18 of 256 bits and the closest honest pair at 21, so the copy
  threshold is 19. A re-upload of the same file sits at 0–2 on the stable hash, against
  12 for the closest honest pair, so the same-file threshold is 4.
- External reverse image search (e.g. Google Lens through SerpApi) is **not wired in
  yet**. The internal index is the only check today. An external one needs an API key
  and publicly reachable image URLs, and would slot in next to `checkUpload` in
  `src/portfolio.js`.
