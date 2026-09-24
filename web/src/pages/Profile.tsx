import { useRef, useState } from "react";
import { Link, useParams } from "react-router";
import { api, human, TIER_NAMES, type PortfolioItem, type Profile as P } from "../lib/api";
import { useAsync, useTitle } from "../lib/hooks";
import { Emblem, TIER_COLOR } from "../components/Rank";
import s from "./Profile.module.css";

export function Profile() {
  const { id = "" } = useParams();
  const q = useAsync(() => api.profile(id), [id]);
  useTitle(q.data?.name ?? "Profile");
  if (q.error) {
    return (
      <div className={`page ${s.missing}`}>
        <h1 className="display">Profile unavailable</h1>
        <p className="muted">{q.error}</p>
        <Link to="/search" className="btn btn-primary">Back to search</Link>
      </div>
    );
  }
  if (!q.data) return <div className={`page ${s.loading}`}><div className="skeleton" style={{ height: 260 }} /><div className="skeleton" style={{ height: 420 }} /></div>;
  const p = q.data;
  return (
    <div className={s.profile}>
      <header className={s.head}>
        <div className={`page ${s.headGrid}`}>
          <div className={s.identity}>
            <p className={s.cat}>{p.categoryLabel} · {p.location}</p>
            <h1 className="display">{p.name}</h1>
            <p className={s.headline}>{p.headline}</p>
            <div className={s.creds}>
              {p.credentials.map((c) => <span key={c.type} className="chip"><b>Verified</b> {human(c.type)} · {c.issuer}</span>)}
              {p.newcomer && <span className="chip">New to FreeRank</span>}
            </div>
          </div>
          <RankPanel p={p} />
        </div>
      </header>

      <section className={`page ${s.section}`} aria-labelledby="work">
        <h2 id="work" className={s.h2}>Portfolio</h2>
        <Gallery items={p.portfolio} />
      </section>

      <div className={`page ${s.columns}`}>
        <section aria-labelledby="skills">
          <h2 id="skills" className={s.h2}>Verified skills</h2>
          <p className={s.explain}>Scored from evidence — portfolio pieces that show the skill, paid client jobs, verified credentials — never from the tags a freelancer adds. Six is the cap.</p>
          <ul className={s.skills}>
            {p.skills.map((sk) => (
              <li key={sk.skill}>
                <span className={s.skillName}>{human(sk.skill)}</span>
                <span className={s.meter} aria-hidden="true"><i style={{ width: `${(sk.score / 6) * 100}%` }} /></span>
                <span className={s.skillScore}>{sk.score.toFixed(1)}</span>
                <small>{[sk.distinctProjects ? `${sk.distinctProjects} piece${sk.distinctProjects > 1 ? "s" : ""}` : null, sk.sources.includes("work_history") ? "client jobs" : null, sk.sources.includes("credential") ? "credential" : null, sk.sources.includes("review_mention") ? "named in a review" : null].filter(Boolean).join(" · ")}</small>
              </li>
            ))}
          </ul>
          {p.unsupportedClaims.length > 0 && (
            <p className={s.claims}><b>Listed but not yet shown in work:</b> {p.unsupportedClaims.map(human).join(", ")}. These don't count toward search or rank until a project, job or credential backs them up.</p>
          )}
        </section>

        <section aria-labelledby="record">
          <h2 id="record" className={s.h2}>Client record</h2>
          <dl className={s.stats}>
            <div><dt>Jobs</dt><dd>{p.stats.jobs}</dd></div>
            <div><dt>Clients</dt><dd>{p.stats.clients}</dd></div>
            <div><dt>Avg review</dt><dd>{p.stats.avgStars ? `${p.stats.avgStars}★` : "—"}</dd></div>
            <div><dt>On time</dt><dd>{p.stats.onTime != null ? `${Math.round(p.stats.onTime * 100)}%` : "—"}</dd></div>
          </dl>
          {p.reviews.length > 0 && (
            <div className={s.reviews}>
              {p.reviews.slice(0, 3).map((r, i) => (
                <blockquote key={i}>
                  <p>“{r.text}”</p>
                  <footer>{r.client} · {"★".repeat(Math.round(r.stars))}</footer>
                </blockquote>
              ))}
            </div>
          )}
          {p.recentJobs.length > 0 ? (
            <table className={s.jobs}>
              <caption className="sr">Recent jobs</caption>
              <thead><tr><th scope="col">Client</th><th scope="col">Arena</th><th scope="col">Review</th><th scope="col">When</th></tr></thead>
              <tbody>
                {p.recentJobs.map((j, i) => (
                  <tr key={i}>
                    <td>{j.client}{j.rehired && <span className={s.rehire}>rehired</span>}</td>
                    <td className={s.arena}>{j.arena}</td>
                    <td>{j.stars}★</td>
                    <td className="muted">{j.daysAgo} days ago</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className={s.explain}>No client jobs yet. Everyone starts in Casual, where good matches get equal turns in search.</p>
          )}
        </section>
      </div>
    </div>
  );
}

function RankPanel({ p }: { p: P }) {
  const r = p.rank;
  if (!r.competitive || !r.tier) {
    const el = r.eligibility;
    const steps = [
      { ok: el.clients.have >= el.clients.need, label: `${Math.min(el.clients.have, el.clients.need)} of ${el.clients.need} paying clients in Casual` },
      { ok: el.portfolio.have >= el.portfolio.need, label: `${Math.min(el.portfolio.have, el.portfolio.need)} of ${el.portfolio.need} checked portfolio pieces` },
      { ok: el.trust.ok, label: el.trust.ok ? "Portfolio authenticity clear" : "Account under review" },
    ];
    return (
      <aside className={s.rank} aria-label="Rank">
        <div className={s.unranked}>
          <span className={s.unrankedTitle}>Casual</span>
          <p>Not ranked yet. Competitive opens when all three are done:</p>
          <ol className={s.steps}>
            {steps.map((st) => <li key={st.label} data-ok={st.ok || undefined}>{st.label}</li>)}
          </ol>
        </div>
      </aside>
    );
  }
  const tierName = TIER_NAMES[r.tier];
  const pct = r.progress?.toNextDivision != null ? Math.max(6, 100 - Math.min(100, (r.progress.toNextDivision / r.progress.span) * 100)) : 100;
  return (
    <aside className={s.rank} aria-label="Rank" style={{ ["--tier" as string]: TIER_COLOR[r.tier] }}>
      <Emblem tier={r.tier} size={190} alt={`${tierName} emblem`} />
      <div className={s.rankText}>
        <span className={s.rankLabel}>{r.label}</span>
        <span className={s.rating}>{r.rating} FR</span>
        <span className="muted">#{r.categoryPosition} of {r.categorySize} ranked in {p.categoryLabel}</span>
        {r.progress?.nextLabel ? (
          <div className={s.progress}>
            <span className={s.bar}><i style={{ width: `${pct}%` }} /></span>
            <small>{r.progress.toNextDivision} FR to {r.progress.nextLabel}{r.masterEligible ? " — waiting for a Master seat" : ""}</small>
          </div>
        ) : (
          <small className={s.seat}>Holds Master seat {r.masterSeat}. Seats are defended: a higher rating takes it.</small>
        )}
        <small className={s.breakdown}>Clients {Math.round(r.components.client * 100)} · Portfolio {Math.round(r.components.system * 100)} · {r.components.effectiveJobs.toFixed(1)} weighted jobs</small>
      </div>
    </aside>
  );
}

function Gallery({ items }: { items: PortfolioItem[] }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState<PortfolioItem | null>(null);
  const show = (it: PortfolioItem) => {
    setOpen(it);
    dialog.current?.showModal();
  };
  return (
    <>
      {/* A lead tile only when the rest fill a clean 2x2 beside it; otherwise an even grid. */}
      <ul className={s.gallery} data-lead={items.length >= 5 || undefined} style={{ ["--cols" as string]: items.length >= 5 ? 4 : Math.min(3, Math.max(items.length, 1)) }}>
        {items.map((it, i) => (
          <li key={it.id} className={i === 0 && items.length >= 5 ? s.lead : undefined}>
            <button onClick={() => show(it)} className={s.tile} aria-label={`Open ${it.title}`}>
              {it.thumb && <img src={i === 0 || items.length < 5 ? it.image ?? it.thumb : it.thumb} alt="" loading={i > 2 ? "lazy" : undefined} width={960} height={720} />}
              {it.duplicateOf && <span className={s.flag}>Same piece as another upload — counted once</span>}
              {it.status === "held" && <span className={`${s.flag} ${s.held}`}>Held for review</span>}
            </button>
            <p className={s.caption}>{it.title}</p>
          </li>
        ))}
      </ul>
      <dialog ref={dialog} className={s.lightbox} onClose={() => setOpen(null)} onClick={(e) => e.target === dialog.current && dialog.current?.close()}>
        {open && (
          <figure>
            {open.image && <img src={open.image} alt={open.title} width={960} height={720} />}
            <figcaption>
              <h3>{open.title}</h3>
              <p>{open.description}</p>
              <p className={s.grade}>System grade {Math.round(open.grade.overall * 100)} · craft {Math.round(open.grade.craft * 100)} · complexity {Math.round(open.grade.complexity * 100)} <span>({open.grade.source === "system_estimate" ? "deterministic estimate" : open.grade.source})</span></p>
              <form method="dialog"><button className="btn btn-ghost btn-small">Close</button></form>
            </figcaption>
          </figure>
        )}
      </dialog>
    </>
  );
}
