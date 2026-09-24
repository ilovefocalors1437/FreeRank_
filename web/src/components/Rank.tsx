import { useRef, type CSSProperties, type PointerEvent } from "react";
import { TIER_NAMES, type TierId } from "../lib/api";
import s from "./Rank.module.css";

export const TIER_COLOR: Record<TierId, string> = {
  freelance: "var(--tier-freelance)",
  pro: "var(--tier-pro)",
  expert: "var(--tier-expert)",
  elite: "var(--tier-elite)",
  master: "var(--tier-master)",
};

export const emblemSrc = (tier: TierId, size: 160 | 640 = 160) => `/assets/emblems/${tier}-${size}.webp`;

// A rendered 3D emblem that leans toward the pointer. Motion is a transform only
// and stops entirely under prefers-reduced-motion (the CSS handles that).
export function Emblem({ tier, size = 220, float = false, alt }: { tier: TierId; size?: number; float?: boolean; alt?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const move = (e: PointerEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    el.style.setProperty("--rx", `${(-y * 16).toFixed(2)}deg`);
    el.style.setProperty("--ry", `${(x * 20).toFixed(2)}deg`);
  };
  const leave = () => {
    ref.current?.style.setProperty("--rx", "0deg");
    ref.current?.style.setProperty("--ry", "0deg");
  };
  return (
    <div ref={ref} className={`${s.emblem} ${float ? s.float : ""}`} style={{ width: size, height: size } as CSSProperties} onPointerMove={move} onPointerLeave={leave}>
      <img src={emblemSrc(tier, size > 160 ? 640 : 160)} alt={alt ?? `${TIER_NAMES[tier]} emblem`} width={size} height={size} draggable={false} />
    </div>
  );
}

export function RankBadge({ tier, label, rating, size = "md" }: { tier: TierId | null; label: string | null; rating?: number | null; size?: "sm" | "md" }) {
  if (!tier || !label) {
    return (
      <span className={`${s.badge} ${s.casual} ${size === "sm" ? s.sm : ""}`} title="Not ranked yet — shown in Casual on equal terms">
        Casual
      </span>
    );
  }
  return (
    <span className={`${s.badge} ${size === "sm" ? s.sm : ""}`} style={{ "--tier": TIER_COLOR[tier] } as CSSProperties}>
      <img src={emblemSrc(tier)} alt="" width={size === "sm" ? 22 : 30} height={size === "sm" ? 22 : 30} />
      <span className={s.label}>{label}</span>
      {rating != null && <span className={s.rating}>{rating}</span>}
    </span>
  );
}
