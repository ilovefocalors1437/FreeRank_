import { useState } from "react";
import { Link } from "react-router";
import { api, TIER_NAMES } from "../lib/api";
import { useAsync, useMeta, useTitle } from "../lib/hooks";
import { Emblem, RankBadge, TIER_COLOR } from "../components/Rank";
import s from "./Ranks.module.css";

export function Ranks() {
  useTitle("Ranks");
  const ladder = useAsync(() => api.ladder(), []);
  const meta = useMeta();
  const [cat, setCat] = useState("3d_character");
  const board = ladder.data?.boards.find((b) => b.category === cat);
  const entry = meta.data?.entry;

  return (
    <div className={s.ranks}>
      <section className={`${s.band} on-cobalt`}>
        <div className="page">
          <h1 className="display">The ladder</h1>
          <p className={s.lede}>Five tiers, four divisions in each, and a handful of Master seats per craft. Your place moves with paid client work and a portfolio we've checked — nothing else.</p>
          <ol className={s.tiers}>
            {(ladder.data?.tiers ?? []).map((t) => (
              <li key={t.id} style={{ ["--tier" as string]: TIER_COLOR[t.id] }}>
                <Emblem tier={t.id} size={132} />
                <h2 className="display">{t.name}</h2>
                <p className={s.range}>{t.id === "master" ? `${t.min}+ and one of ${ladder.data?.masterSeats} seats` : `${t.min}–${t.max}`}</p>
                {t.divisions && (
                  <p className={s.divs}>
                    {t.divisions.map((d) => (
                      <span key={d.division} title={`${t.name} ${d.division} from ${d.min}`}>{d.division}</span>
                    ))}
                  </p>
                )}
                <p className={s.count}>{t.count} ranked</p>
              </li>
            ))}
            {ladder.loading && [0, 1, 2, 3, 4].map((i) => <li key={i} className="skeleton" style={{ height: 260, opacity: 0.2 }} />)}
          </ol>
        </div>
      </section>

      <section className={`page ${s.how}`} id="how" aria-labelledby="how-title">
        <h2 id="how-title" className="display">How a rank is earned</h2>
        <div className={s.rules}>
          <article>
            <span className={s.step}>1</span>
            <h3>Enter from Casual</h3>
            <p>Competitive opens after <b>{entry?.distinctClients ?? 3} different paying clients</b> (jobs of ${entry?.minJobValue ?? 50} or more) and <b>{entry?.portfolioPieces ?? 3} portfolio pieces</b> that pass the authenticity check. Repeat work from one client counts once toward entry.</p>
          </article>
          <article>
            <span className={s.step}>2</span>
            <h3>Clients set most of it</h3>
            <p>Three quarters of your rating is client reviews. Bigger jobs weigh more, a review's weight halves each year, and each extra job from the same client counts half the last — so a friend can't carry you. Everyone starts with eight imaginary average jobs, which is why three perfect reviews still land you low.</p>
          </article>
          <article>
            <span className={s.step}>3</span>
            <h3>Your portfolio sets the rest</h3>
            <p>A quarter is the portfolio grade — an AI grader when one is configured, a system estimate otherwise — multiplied by authenticity. It's shrunk by the same client confidence: a beautiful portfolio is a claim until clients have paid for the work.</p>
          </article>
          <article>
            <span className={s.step}>4</span>
            <h3>Master is a seat</h3>
            <p>Reach <b>1900 FR</b> and you're Master-eligible; hold one of the top <b>{ladder.data?.masterSeats ?? 3} seats</b> in your craft and you're Master #1, #2 or #3. The count never inflates as FreeRank grows.</p>
          </article>
          <article>
            <span className={s.step}>5</span>
            <h3>Fair on the way down</h3>
            <p>Drop just under a division line and a 25-point shield keeps your division. Six months without a Competitive job takes you out of Competitive search until the next one — the rating stays.</p>
          </article>
        </div>
        <p className={s.formula}>
          <span>rating</span> = 1000 + 2500 × (0.75 · client score + 0.25 · portfolio score − 0.3)
        </p>
      </section>

      <section className={`page ${s.boards}`} aria-labelledby="boards-title">
        <div className={s.boardsHead}>
          <h2 id="boards-title" className="display">Leaderboards</h2>
          <div className={s.tabs} role="tablist" aria-label="Craft">
            {(ladder.data?.boards ?? []).map((b) => (
              <button key={b.category} role="tab" aria-selected={cat === b.category} onClick={() => setCat(b.category)}>
                {b.label}
              </button>
            ))}
          </div>
        </div>
        <ol className={s.board} role="tabpanel" aria-label={board?.label}>
          {board?.entries.map((e, i) => (
            <li key={e.id} data-master={e.rank.tier === "master" || undefined}>
              <span className={s.pos}>{i + 1}</span>
              {e.cover ? <img src={e.cover} alt="" width={72} height={54} loading="lazy" /> : <span />}
              <span className={s.name}>
                <Link to={`/f/${e.id}`}>{e.name}</Link>
                <small>{e.headline}</small>
              </span>
              <RankBadge tier={e.rank.tier} label={e.rank.label} />
              <span className={s.rating}>{e.rank.rating}<small>FR</small></span>
            </li>
          ))}
          {board && board.entries.length === 0 && <li className={s.none}>Nobody is ranked in {board.label} yet.</li>}
        </ol>
        {ladder.data && (
          <p className="muted">
            {ladder.data.casualOnly} freelancers aren't ranked yet — they're in <Link to="/search">Casual</Link>, where every good match gets equal turns. Ranks here: {Object.entries(TIER_NAMES).map(([id, n]) => `${n} ${ladder.data!.tiers.find((t) => t.id === id)?.count ?? 0}`).join(" · ")}.
          </p>
        )}
      </section>
    </div>
  );
}
