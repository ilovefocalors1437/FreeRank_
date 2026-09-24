// Typed client for ../server.js. Shapes mirror the server's views; see server.js.

export type TierId = "freelance" | "pro" | "expert" | "elite" | "master";
export type Arena = "casual" | "competitive";
export interface Grid { w: 8; h: 8; rgb: number[] }

export interface Eligibility {
  eligible: boolean;
  clients: { have: number; need: number };
  portfolio: { have: number; need: number };
  trust: { ok: boolean; tier: string };
  active: boolean;
}
export interface RankView {
  competitive: boolean;
  rating: number | null;
  label: string | null;
  tier: TierId | null;
  division: number | null;
  masterSeat: number | null;
  masterEligible: boolean;
  categoryPosition: number | null;
  categorySize: number | null;
  progress: { toNextDivision: number | null; nextLabel: string | null; span: number } | null;
  eligibility: Eligibility;
  components: { client: number; system: number; systemRaw: number; portfolio: number; authenticity: number; effectiveJobs: number };
}
export interface Summary {
  id: string;
  name: string;
  headline: string;
  location: string;
  category: string;
  categoryLabel: string;
  newcomer: boolean;
  trust: string;
  rank: RankView;
  cover: string | null;
  jobs: number;
}
export interface Grade { overall: number; craft: number; complexity: number; presentation: number; source: string; notes?: string; graderError?: string }
export interface PortfolioItem { id: string; title: string; description: string; tools: string[]; image: string | null; thumb: string | null; status: string; heldReason: string | null; grade: Grade; duplicateOf: string | null }
export interface Profile extends Summary {
  claims: string[];
  unsupportedClaims: string[];
  trustDetail: { tier: string; risk: number; signals: { signal: string; value: number; detail: string }[]; copiedBy: string[] };
  credentials: { type: string; issuer: string; skill: string; note: string | null }[];
  stats: { jobs: number; casual: number; competitive: number; clients: number; rehired: number; avgStars: number | null; onTime: number | null; lastJobDaysAgo: number | null };
  skills: { skill: string; score: number; sources: string[]; distinctProjects: number }[];
  portfolio: PortfolioItem[];
  reviews: { text: string; client: string; stars: number }[];
  recentJobs: { client: string; arena: Arena; stars: number; daysAgo: number; value: number; rehired: boolean }[];
}
export interface Tier { id: TierId; name: string; min: number }
export interface Meta {
  categories: { id: string; label: string; count: number }[];
  tiers: Tier[];
  divisions: number;
  entry: { distinctClients: number; minJobValue: number; portfolioPieces: number };
  masterSeats: number;
  refs: { id: string; label: string; grid: Grid; url: string }[];
  scenarios: { id: string; label: string; q: { text?: string; tags?: string[]; ref?: string } }[];
  appealReasons: Record<string, { label: string; needs: string }>;
  grader: { llm: string | null; fallback: string };
  reverseSearch: Record<string, string>;
  stats: { freelancers: number; ranked: number; projects: number; liveProjects: number; held: number; flagged: number; builtMs: number };
}
export interface Reason { text: string; feature: string; value: number }
export interface Result {
  rank: number;
  slot: string;
  arena_score: number | null;
  freelancer: { id: string; name: string; headline: string; category: string; location: string; newcomer: boolean };
  ladder: { rating: number; tier: TierId; division: number | null; label: string; masterSeat: number | null } | null;
  stats: { jobs: number; rehired: number; clients: number };
  portfolio: { id: string; title: string; thumb: string | null; image: string | null }[];
  score: number;
  trust: { tier: string; risk: number };
  features: Record<string, number | null>;
  why: { summary: string; reasons: Reason[]; caveats: string[] };
}
export interface SearchResponse {
  arena: Arena | "open";
  rotation: number | null;
  matched: number;
  outside_arena: number;
  mode: string;
  spec: {
    work_type: { category: string | null; confidence: number };
    style: { attributes: Record<string, number> };
    skills: { skill: string; weight: number; source?: string }[];
    technical_requirements: { req: string }[];
    ambiguity: { flags: string[] };
    assumptions: string[];
  };
  results: Result[];
  blocked: { id: string; name: string; reasons: string[] }[];
  below_floor: { id: string; score: number; why: string }[];
  timing_ms: { total: number };
  notes: string[];
}
export interface Ladder {
  tiers: (Tier & { max: number | null; divisions: { division: number; min: number }[] | null; count: number })[];
  boards: { category: string; label: string; entries: Summary[] }[];
  masterSeats: number;
  casualOnly: number;
}
export interface UploadCheck {
  verdict: "clear" | "already_in_your_portfolio" | "identical_match" | "altered_match";
  status: string;
  appealable: boolean;
  matches: { project: { id: string; title: string; thumb: string | null; status: string }; freelancer: { id: string; name: string }; distance: number; stableDistance: number; colorSim: number; kind: string; mine: boolean }[];
  fingerprint: { dhash256: string; edge256: string };
  thresholds: { match: number; identical: number; bits: number };
  grade: Grade | null;
  reverseSearch: Record<string, string>;
}
export interface Upload { id: string; freelancerId: string; title: string; description: string; image: string; state: "live" | "held" | "cleared" | "rejected"; createdAt: string }
export interface Appeal {
  id: string;
  createdAt: string;
  status: "submitted" | "in_review" | "approved" | "rejected";
  freelancerId: string | null;
  upload: { title: string; fingerprint: string };
  matched: { project: string; title: string; owner: string } | null;
  reason: string;
  message: string;
  links: string[];
  verificationCode: string;
  history: { at: string; status: string; note?: string }[];
}

async function call<T>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: init?.json !== undefined ? { "content-type": "application/json" } : undefined,
    body: init?.json !== undefined ? JSON.stringify(init.json) : undefined,
  });
  const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
  if (!res.ok) throw new Error((data as { error?: string }).error || `HTTP ${res.status}`);
  return data as T;
}

export const api = {
  meta: () => call<Meta>("/api/meta"),
  search: (body: { text: string; tags: string[]; image?: Grid; mode: Arena; k?: number; rotation?: number }) => call<SearchResponse>("/api/search", { method: "POST", json: body }),
  freelancers: () => call<Summary[]>("/api/freelancers"),
  profile: (id: string) => call<Profile>(`/api/freelancers/${encodeURIComponent(id)}`),
  ladder: () => call<Ladder>("/api/ladder"),
  checkUpload: (body: { grid: Grid; g64: string; title: string; description: string; freelancerId: string; preview?: string }) => call<UploadCheck>("/api/portfolio/check", { method: "POST", json: body }),
  publish: (body: { grid: Grid; g64: string; title: string; description: string; freelancerId: string; preview: string }) => call<{ upload: Upload; verdict: string }>("/api/portfolio/publish", { method: "POST", json: body }),
  uploads: () => call<Upload[]>("/api/uploads"),
  appeals: () => call<Appeal[]>("/api/appeals"),
  appeal: (body: Record<string, unknown>) => call<Appeal>("/api/appeals", { method: "POST", json: body }),
  setAppeal: (id: string, status: Appeal["status"], note?: string) => call<Appeal>(`/api/appeals/${id}`, { method: "PATCH", json: { status, note } }),
};

export const TIER_NAMES: Record<TierId, string> = { freelance: "Freelance", pro: "Pro", expert: "Expert", elite: "Elite", master: "Master" };
export const human = (s: string) => s.replace(/_/g, " ");
