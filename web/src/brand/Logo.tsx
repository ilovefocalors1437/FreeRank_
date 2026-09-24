// The FreeRank mark: a lance tip (a freelancer is literally a "free lance") over two
// rank chevrons. Same 64-unit outlines as assets-src/blender/emblems.py, so the flat
// mark and the 3D tier emblems read as one family.

export const SPEAR = "M32 3 42 24 32 34 22 24Z";
export const chevron = (apex: number) => `M18 ${apex + 8} 32 ${apex} 46 ${apex + 8} 46 ${apex + 14} 32 ${apex + 6} 18 ${apex + 14}Z`;

export function Mark({ size = 32, color = "currentColor", title }: { size?: number; color?: string; title?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role={title ? "img" : undefined} aria-hidden={title ? undefined : true} aria-label={title}>
      <path d={SPEAR} fill={color} />
      <path d={chevron(38)} fill={color} />
      <path d={chevron(48)} fill={color} opacity={0.55} />
    </svg>
  );
}

export function Logo({ size = 28, tone = "ink" }: { size?: number; tone?: "ink" | "light" }) {
  const color = tone === "light" ? "var(--on-cobalt)" : "var(--cobalt)";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: size * 0.28, color: tone === "light" ? "var(--on-cobalt)" : "var(--ink)" }}>
      <Mark size={size} color={color} />
      <span style={{ fontFamily: "var(--display)", fontWeight: 800, fontSize: size * 0.95, letterSpacing: "0.01em", lineHeight: 1 }}>
        Free<span style={{ color: tone === "light" ? "var(--gold)" : "var(--cobalt)" }}>Rank</span>
      </span>
    </span>
  );
}
