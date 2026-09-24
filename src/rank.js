// src/rank.js — FreeRank's competitive ladder. Rules live in docs/RANKS.md; this file
// is the single implementation of them.
//
//   S = 0.75 * clientScore + 0.25 * systemScore          (quality, 0..1)
//   rating R = 1000 + 2500 * max(0, S - 0.3)              (0.3 = where everyone starts)
//
// clientScore is a Bayesian average of job performance: every freelancer starts
// with PRIOR_WEIGHT imaginary mediocre jobs, so three perfect reviews cannot buy
// a high rank — volume of genuinely good work can. systemScore is the portfolio
// grade (MiMo or the deterministic estimate) times an authenticity factor.

export const RATING_BASE = 1000;
export const RATING_SCALE = 2500;
export const RATING_ZERO = 0.3;
export const RATING_SPAN = 1500; // 1000..2500 is the practical range, used for search boosts
export const PRIOR = 0.3;
export const PRIOR_WEIGHT = 8;
export const CLIENT_SHARE = 0.75;

export const TIERS = [
  { id: "freelance", name: "Freelance", min: 1000 },
  { id: "pro", name: "Pro", min: 1300 },
  { id: "expert", name: "Expert", min: 1500 },
  { id: "elite", name: "Elite", min: 1700 },
  { id: "master", name: "Master", min: 1900 },
];
export const DIVISIONS = 4; // numbered 4 (entry) -> 1 (top of tier), each a quarter of the tier
export const DEMOTION_SHIELD = 25; // must fall this far below a boundary to drop
export const MASTER_SEATS = 3; // per category in this demo corpus; production: top 100 or 0.5%

export const ENTRY = { distinctClients: 3, minJobValue: 50, portfolioPieces: 3 };
export const ACTIVE_DAYS = 180; // no competitive job in half a year: out of Competitive search until the next one

const clamp01 = (x) => Math.max(0, Math.min(1, x));

// ---------------------------------------------------------------- per-job maths

export function jobPerformance(j) {
  if (j.outcome === "dispute_lost") return 0;
  if (j.outcome === "cancelled") return 0.15;
  const stars = clamp01(((j.stars ?? 3) - 1) / 4);
  return clamp01(0.8 * stars + 0.2 * (j.onTime === false ? 0 : 1) + (j.rehired ? 0.05 : 0));
}

// Big contracts count more (log scale), the same client counts less each time
// (collusion), old work fades (half-life one year).
export function jobWeight(j, nthWithClient) {
  const value = Math.max(1, j.value ?? ENTRY.minJobValue);
  const size = Math.max(0.5, Math.min(1.5, 0.5 + 0.5 * Math.log10(value / ENTRY.minJobValue)));
  const repeat = 0.5 ** Math.max(0, nthWithClient - 1);
  const recency = 0.5 ** ((j.daysAgo ?? 0) / 365);
  const disputeWeight = j.outcome === "dispute_lost" ? 2 : 1;
  return size * repeat * recency * disputeWeight;
}

export function clientScore(jobs) {
  const seen = new Map();
  let num = PRIOR * PRIOR_WEIGHT;
  let den = PRIOR_WEIGHT;
  const ledger = [];
  for (const j of [...jobs].sort((a, b) => (b.daysAgo ?? 0) - (a.daysAgo ?? 0))) {
    const nth = (seen.get(j.client) || 0) + 1;
    seen.set(j.client, nth);
    const w = jobWeight(j, nth);
    const p = jobPerformance(j);
    num += w * p;
    den += w;
    ledger.push({ client: j.client, arena: j.arena, stars: j.stars, value: j.value, daysAgo: j.daysAgo, performance: +p.toFixed(3), weight: +w.toFixed(3) });
  }
  return { score: num / den, effectiveJobs: den - PRIOR_WEIGHT, ledger };
}

// ---------------------------------------------------------------- portfolio side

const AUTHENTICITY = { verified: 1.0, pass: 0.9, soft_flag: 0.5, hard_hold: 0 };

export function systemScore(f) {
  const grades = f.projects.filter((p) => p.status !== "held").map((p) => p.grade?.overall ?? 0).sort((a, b) => b - a);
  const top = grades.slice(0, 3);
  const portfolio = top.length ? top.reduce((a, b) => a + b, 0) / 3 : 0; // fewer than 3 pieces is penalised
  const verified = f.credentials.some((c) => c.verified && c.type === "source_files");
  const auth = f.trust.tier === "pass" && verified ? AUTHENTICITY.verified : AUTHENTICITY[f.trust.tier];
  return { score: portfolio * auth, portfolio, authenticity: auth };
}

// ---------------------------------------------------------------- tiers

export function tierFor(rating) {
  let t = TIERS[0];
  for (const x of TIERS) if (rating >= x.min) t = x;
  return t;
}

const tierWidth = (t) => {
  const next = TIERS[TIERS.indexOf(t) + 1];
  return next ? (next.min - t.min) / DIVISIONS : null;
};

export function divisionFloor({ tier, division }) {
  const t = TIERS.find((x) => x.id === tier);
  if (!t || tier === "master") return null;
  return t.min + (DIVISIONS - division) * tierWidth(t);
}

// Division from rating; `previous` ({tier, division}) applies the demotion shield.
export function divisionFor(rating, previous) {
  const capped = Math.min(rating, TIERS[TIERS.length - 1].min - 1);
  const tier = tierFor(capped);
  const division = DIVISIONS - Math.min(DIVISIONS - 1, Math.floor((capped - tier.min) / tierWidth(tier)));
  const placed = { tier: tier.id, division };
  if (!previous) return placed;
  const prevFloor = divisionFloor(previous);
  if (prevFloor != null && rating < prevFloor && rating >= prevFloor - DEMOTION_SHIELD) return { ...previous, shielded: true };
  return placed;
}

// ---------------------------------------------------------------- eligibility

export function eligibility(f) {
  const casualClients = new Set(
    f.workHistory.filter((j) => j.arena === "casual" && j.outcome === "completed" && (j.value ?? 0) >= ENTRY.minJobValue).map((j) => j.client),
  );
  const cleanPieces = f.projects.filter((p) => p.status !== "held").length;
  const trustOk = f.trust.tier === "pass";
  const lastComp = Math.min(...f.workHistory.filter((j) => j.arena === "competitive").map((j) => j.daysAgo ?? 9999), 9999);
  return {
    eligible: casualClients.size >= ENTRY.distinctClients && cleanPieces >= ENTRY.portfolioPieces && trustOk,
    clients: { have: casualClients.size, need: ENTRY.distinctClients },
    portfolio: { have: cleanPieces, need: ENTRY.portfolioPieces },
    trust: { ok: trustOk, tier: f.trust.tier },
    active: lastComp <= ACTIVE_DAYS || f.workHistory.every((j) => j.arena !== "competitive"),
  };
}

// ---------------------------------------------------------------- ladder

export function rateFreelancer(f) {
  const cs = clientScore(f.workHistory.filter((j) => j.client));
  const ss = systemScore(f);
  // The portfolio grade is shrunk toward the prior by the same client confidence:
  // a beautiful portfolio is a claim until clients have paid for the work.
  // Measured: unshrunk, three perfect jobs + a 0.9 portfolio placed at Expert 3.
  const n = cs.effectiveJobs;
  const system = (ss.score * n + PRIOR * PRIOR_WEIGHT) / (n + PRIOR_WEIGHT);
  const S = CLIENT_SHARE * cs.score + (1 - CLIENT_SHARE) * system;
  const rating = Math.round(RATING_BASE + RATING_SCALE * Math.max(0, S - RATING_ZERO));
  return {
    rating,
    quality: +S.toFixed(3),
    components: {
      client: +cs.score.toFixed(3),
      system: +system.toFixed(3),
      systemRaw: +ss.score.toFixed(3),
      portfolio: +ss.portfolio.toFixed(3),
      authenticity: ss.authenticity,
      effectiveJobs: +cs.effectiveJobs.toFixed(2),
    },
    ledger: cs.ledger,
  };
}

// Master is relative: rating >= 1900 AND one of the top MASTER_SEATS in the
// category. Everyone else is placed on the fixed rating bands.
export function buildLadder(freelancers) {
  const out = new Map();
  for (const f of freelancers) {
    const el = eligibility(f);
    const r = rateFreelancer(f);
    out.set(f.id, { ...r, eligibility: el, competitive: el.eligible });
  }
  const byCat = new Map();
  for (const f of freelancers) {
    const e = out.get(f.id);
    if (!e.competitive) continue;
    if (!byCat.has(f.category)) byCat.set(f.category, []);
    byCat.get(f.category).push(f);
  }
  for (const [cat, list] of byCat) {
    list.sort((a, b) => out.get(b.id).rating - out.get(a.id).rating || a.id.localeCompare(b.id));
    let seat = 0;
    list.forEach((f, i) => {
      const e = out.get(f.id);
      e.categoryPosition = i + 1;
      e.categorySize = list.length;
      if (e.rating >= TIERS[4].min && seat < MASTER_SEATS) {
        seat++;
        e.rank = { tier: "master", division: null, masterSeat: seat, label: `Master #${seat}` };
      } else {
        const d = divisionFor(e.rating);
        const waiting = e.rating >= TIERS[4].min;
        e.rank = { ...d, label: `${TIERS.find((t) => t.id === d.tier).name} ${d.division}`, masterEligible: waiting };
      }
      const t = TIERS.find((x) => x.id === e.rank.tier);
      const next = TIERS[TIERS.indexOf(t) + 1];
      e.progress = e.rank.tier === "master" ? null : {
        toNextDivision: e.rank.division > 1 ? divisionFloor({ tier: t.id, division: e.rank.division - 1 }) - e.rating : next ? next.min - e.rating : null,
        nextLabel: e.rank.division > 1 ? `${t.name} ${e.rank.division - 1}` : next ? (next.id === "master" ? "Master" : `${next.name} ${DIVISIONS}`) : null,
        span: tierWidth(t),
      };
    });
  }
  return out;
}

export const rankNorm = (rating) => clamp01((rating - RATING_BASE) / RATING_SPAN);
