import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { api, type Summary, type TierId } from "../lib/api";
import { useAsync, useTitle } from "../lib/hooks";
import { Emblem, RankBadge } from "../components/Rank";
import { Mark } from "../brand/Logo";
import s from "./Landing.module.css";

const LADDER: { tier: TierId; name: string; band: string; note: string }[] = [
  { tier: "freelance", name: "Freelance", band: "1000–1299", note: "Where every ranked career starts" },
  { tier: "pro", name: "Pro", band: "1300–1499", note: "A record clients come back to" },
  { tier: "expert", name: "Expert", band: "1500–1699", note: "Consistently excellent, at volume" },
  { tier: "elite", name: "Elite", band: "1700–1899", note: "The top of the open ladder" },
  { tier: "master", name: "Master", band: "1900+ and a seat", note: "Three seats per craft. Earned, then defended" },
];

export function Landing() {
  useTitle("");
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const ladder = useAsync(() => api.ladder(), []);
  const people = useAsync(() => api.freelancers(), []);
  const caught = useAsync(() => fetch("/api/trust").then((r) => r.json() as Promise<{ imageEdges: { copyProject: string; hamming: number }[] }>), []);
  const bits = caught.data?.imageEdges.find((e) => e.copyProject === "king-p1")?.hamming;

  const masters = (ladder.data?.boards ?? []).flatMap((b) => b.entries.filter((e) => e.rank.tier === "master")).sort((a, b) => (b.rank.rating ?? 0) - (a.rank.rating ?? 0));
  const champion = masters[0];
  const topCharacters = ladder.data?.boards.find((b) => b.category === "3d_character")?.entries.slice(0, 4) ?? [];
  const casualFaces = (people.data ?? []).filter((p) => p.category === "3d_character" && p.cover && p.trust === "pass").slice(0, 6);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    nav(`/search?q=${encodeURIComponent(q.trim())}`, { viewTransition: true });
  };

  return (
    <div className={s.landing}>
      <section className={`${s.hero} on-cobalt`} aria-labelledby="hero-title">
        <svg className={s.pattern} viewBox="0 0 64 64" aria-hidden="true">
          <path d="M32 3 42 24 32 34 22 24Z" />
          <path d="M18 46 32 38 46 46 46 52 32 44 18 52Z" />
          <path d="M18 56 32 48 46 56 46 62 32 54 18 62Z" />
        </svg>
        <div className={`page ${s.heroGrid}`}>
          <div className={s.heroCopy}>
            <p className={s.kicker}>The freelance marketplace with a ladder</p>
            <h1 id="hero-title" className={s.title}>
              <span>Hire the rank,</span>
              <span>not the hype.</span>
            </h1>
            <p className={s.lede}>
              FreeRank ranks freelancers on paid client work and a portfolio we check for theft. Tags can't buy a rank, and stolen work never reaches the ladder.
            </p>
            <form className={s.search} onSubmit={submit} role="search">
              <label htmlFor="hero-q" className="sr">Describe what you need</label>
              <input id="hero-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Stylized anime character for a mobile game…" autoComplete="off" />
              <button className="btn btn-gold" type="submit">Find talent</button>
            </form>
            <p className={s.hint}>
              Rough is fine — a few words, a reference image, Thai or English. <Link to="/search?demo=hero">Try the example</Link>
            </p>
          </div>
          <div className={s.heroArt}>
            <Emblem tier="master" size={420} float alt="The FreeRank Master emblem: a gold crown frame around a lance tip and four rank chevrons on cobalt enamel" />
            {champion && (
              <Link to={`/f/${champion.id}`} className={s.champion} viewTransition>
                <img src={champion.cover ?? ""} alt="" width={64} height={48} />
                <span>
                  <b>{champion.name}</b>
                  <small>{champion.rank.label} · {champion.categoryLabel} · {champion.rank.rating} FR</small>
                </span>
              </Link>
            )}
          </div>
        </div>
      </section>

      <section className={`page ${s.arenas}`} aria-labelledby="arenas-title">
        <header className={s.sectionHead}>
          <h2 id="arenas-title" className="display">Two arenas. Pick the one you need.</h2>
          <p className="muted">Every client sees both. Freelancers start in Casual and earn their way into Competitive.</p>
        </header>
        <div className={s.arenaGrid}>
          <article className={s.casual}>
            <h3>Casual</h3>
            <p className={s.arenaLine}>Everyone whose work fits gets the same shot.</p>
            <p className="muted">We check that a freelancer's portfolio genuinely matches your request, then reshuffle who comes first every hour. Newcomers and veterans get equal turns — no ratings, no pay-to-rank.</p>
            <ul className={s.faces} aria-label="Some of the freelancers in Casual">
              {casualFaces.map((p) => (
                <li key={p.id}>
                  <Link to={`/f/${p.id}`} title={p.name}>
                    <img src={p.cover ?? ""} alt={`${p.name}'s portfolio`} width={120} height={90} loading="lazy" />
                  </Link>
                </li>
              ))}
            </ul>
            <Link to="/search" className="btn btn-ghost">Browse Casual</Link>
          </article>
          <article className={s.competitive}>
            <h3>Competitive</h3>
            <p className={s.arenaLine}>Ranked by rank. Hard to enter, harder to climb.</p>
            <p className={s.compText}>Three paying clients from Casual unlock it. After that only two things move you: client reviews and a portfolio we've checked.</p>
            <ol className={s.board} aria-label="Top of the 3D Characters ladder">
              {topCharacters.map((e: Summary, i) => (
                <li key={e.id}>
                  <span className={s.pos}>{i + 1}</span>
                  <Link to={`/f/${e.id}`}>{e.name}</Link>
                  <RankBadge tier={e.rank.tier} label={e.rank.label} size="sm" />
                  <span className={s.fr}>{e.rank.rating}</span>
                </li>
              ))}
              {ladder.loading && [0, 1, 2, 3].map((i) => <li key={i} className="skeleton" style={{ height: 40 }} />)}
            </ol>
            <Link to="/search?arena=competitive" className="btn btn-gold">Search Competitive</Link>
          </article>
        </div>
      </section>

      <section className={`${s.ladderBand} on-cobalt`} aria-labelledby="ladder-title">
        <div className="page">
          <header className={s.sectionHead}>
            <h2 id="ladder-title" className="display">Five tiers. Four divisions each. One way up.</h2>
            <p>Your FreeRank rating comes from client reviews, weighted by how big the job was and how recent, with repeat work from the same client counting less each time. A checked portfolio adds the rest.</p>
          </header>
          <ol className={s.stairs}>
            {LADDER.map((t, i) => (
              <li key={t.tier} style={{ ["--step" as string]: i }}>
                <Emblem tier={t.tier} size={96 + i * 22} />
                <b className="display">{t.name}</b>
                <span className={s.band}>{t.band}</span>
                <small>{t.note}</small>
              </li>
            ))}
          </ol>
          <Link to="/ranks" className="btn btn-gold">See the leaderboards</Link>
        </div>
      </section>

      <section className={`page ${s.theft}`} aria-labelledby="theft-title">
        <div className={s.theftCopy}>
          <h2 id="theft-title" className="display">We caught this one.</h2>
          <p>
            The piece on the right was uploaded to steal someone's reputation: the same render, hue-shifted and brightened so a naive duplicate check would miss it. Its structure fingerprint sits {bits ?? "a few"} bits from the original's, out of 256. It was held before it reached a single search.
          </p>
          <ul className={s.points}>
            <li><b>Every upload is fingerprinted</b> and compared with every image posted here — including pieces already on hold.</li>
            <li><b>A match is a question, not a verdict.</b> Selling the same asset on several marketplaces is normal; the appeal asks for the proof that settles it.</li>
            <li><b>People decide takedowns.</b> The system only holds and explains.</li>
          </ul>
          <Link to="/studio" className="btn btn-primary">Check an image yourself</Link>
        </div>
        <figure className={s.pair}>
          <div>
            <img src="/assets/portfolio/aoi-p1.webp" alt="Original: a cel-shaded anime heroine with pink twin tails and a staff" width={480} height={360} loading="lazy" />
            <figcaption><b>Original</b> Aoi Kurosawa, uploaded first</figcaption>
          </div>
          <div className={s.copy}>
            <img src="/assets/portfolio/king-p1.webp" alt="The copy: the same character recoloured green and brightened" width={480} height={360} loading="lazy" />
            <figcaption><b>Held</b> recoloured copy{bits != null && ` · ${bits}/256 bits`}</figcaption>
          </div>
        </figure>
      </section>

      <section className={`page ${s.close}`}>
        <Mark size={56} color="var(--cobalt)" />
        <h2 className="display">Your next hire has a record. Read it.</h2>
        <div className={s.closeActions}>
          <Link to="/search" className="btn btn-primary">Find talent</Link>
          <Link to="/studio" className="btn btn-ghost">I'm a freelancer</Link>
        </div>
      </section>
    </div>
  );
}
