import { useEffect, useMemo, useRef, useState, type DragEvent, type FormEvent, type KeyboardEvent } from "react";
import { Link, useSearchParams } from "react-router";
import { api, human, type Arena, type Grid, type Result, type SearchResponse } from "../lib/api";
import { useMeta, useTitle } from "../lib/hooks";
import { analyseImage } from "../lib/image";
import { RankBadge } from "../components/Rank";
import s from "./Search.module.css";

type RefImage = { id: string; label: string; grid: Grid; url: string };
const CATEGORY_LABEL: Record<string, string> = { "3d_character": "3D characters", "3d_props": "3D props", ui_design: "UI design", brand_design: "Brand identity", copywriting: "Copywriting" };

export function Search() {
  useTitle("Find talent");
  const meta = useMeta();
  const [params, setParams] = useSearchParams();
  const arena: Arena = params.get("arena") === "competitive" ? "competitive" : "casual";
  const [text, setText] = useState(params.get("q") ?? "");
  const [tags, setTags] = useState<string[]>(params.getAll("tag"));
  const [tagDraft, setTagDraft] = useState("");
  const [ref, setRef] = useState<RefImage | null>(null);
  const [rotation, setRotation] = useState<number | undefined>(undefined);
  const [res, setRes] = useState<SearchResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const booted = useRef(false);

  // Deep links: ?q=&tag=&ref=&arena=, and ?demo=<scenario> from the landing page.
  useEffect(() => {
    if (!meta.data || booted.current) return;
    booted.current = true;
    const demo = params.get("demo");
    const sc = demo ? meta.data.scenarios.find((x) => x.id === demo) : null;
    const refId = sc?.q.ref ?? params.get("ref");
    const r = refId ? meta.data.refs.find((x) => x.id === refId) ?? null : null;
    const t = sc?.q.text ?? params.get("q") ?? "";
    const tg = sc?.q.tags ?? params.getAll("tag");
    setText(t);
    setTags(tg);
    setRef(r);
    if (t || tg.length || r) run(t, tg, r, arena);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta.data]);

  async function run(t = text, tg = tags, r = ref, a: Arena = arena, rot = rotation) {
    if (!t.trim() && !tg.length && !r) {
      setError("Describe what you need, add a tag, or drop a reference image.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const out = await api.search({ text: t, tags: tg, image: r?.grid, mode: a, k: 12, rotation: rot });
      setRes(out);
      const next = new URLSearchParams();
      if (t) next.set("q", t);
      tg.forEach((x) => next.append("tag", x));
      if (r && !r.id.startsWith("upload")) next.set("ref", r.id);
      if (a === "competitive") next.set("arena", a);
      setParams(next, { replace: true });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const pending = tagDraft.trim();
    const tg = pending ? [...tags, pending] : tags;
    if (pending) {
      setTags(tg);
      setTagDraft("");
    }
    run(text, tg);
  };
  const switchArena = (a: Arena) => {
    const next = new URLSearchParams(params);
    if (a === "competitive") next.set("arena", a);
    else next.delete("arena");
    setParams(next, { replace: true });
    if (res) run(text, tags, ref, a);
  };
  const onTagKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if ((e.key === "Enter" || e.key === ",") && tagDraft.trim()) {
      e.preventDefault();
      if (!tags.includes(tagDraft.trim())) setTags([...tags, tagDraft.trim()]);
      setTagDraft("");
    } else if (e.key === "Backspace" && !tagDraft && tags.length) setTags(tags.slice(0, -1));
  };
  async function takeFile(file?: File | null) {
    if (!file || !file.type.startsWith("image/")) return setError("That file isn't an image.");
    try {
      const a = await analyseImage(file);
      setRef({ id: `upload-${Date.now()}`, label: file.name, grid: a.grid, url: a.url });
    } catch {
      setError("Couldn't read that image. Try a PNG, JPEG or WebP.");
    }
  }
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    takeFile(e.dataTransfer.files[0]);
  };

  const understood = useMemo(() => {
    if (!res) return [];
    const sp = res.spec;
    const out: string[] = [];
    if (sp.work_type.category) out.push(CATEGORY_LABEL[sp.work_type.category] ?? human(sp.work_type.category));
    for (const [k, v] of Object.entries(sp.style.attributes).filter(([, v]) => v >= 0.4).sort((a, b) => b[1] - a[1]).slice(0, 2)) if (v) out.push(human(k));
    for (const sk of sp.skills.slice(0, 4)) out.push(human(sk.skill));
    for (const t of sp.technical_requirements) out.push(human(t.req));
    return [...new Set(out)];
  }, [res]);

  return (
    <div className={`page ${s.wrap}`}>
      <form className={s.composer} onSubmit={submit} onDragOver={(e) => (e.preventDefault(), setDragging(true))} onDragLeave={() => setDragging(false)} onDrop={onDrop} data-dragging={dragging || undefined}>
        <div className={s.arenaSwitch} role="radiogroup" aria-label="Arena">
          {(["casual", "competitive"] as Arena[]).map((a) => (
            <button key={a} type="button" role="radio" aria-checked={arena === a} className={s.arenaBtn} onClick={() => switchArena(a)}>
              <b>{a === "casual" ? "Casual" : "Competitive"}</b>
              <span>{a === "casual" ? "Every good match, equal turns" : "Ranked freelancers, best first"}</span>
            </button>
          ))}
        </div>
        <div className={s.inputs}>
          <label className={s.need}>
            <span className="sr">Describe what you need</span>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.ctrlKey || e.metaKey) && submit(e)}
              placeholder="Need something like this for a game — stylized, cute, Blender…"
              rows={2}
            />
          </label>
          <div className={s.row}>
            <div className={s.tags}>
              {tags.map((t) => (
                <span key={t} className="chip">
                  {t}
                  <button type="button" aria-label={`Remove ${t}`} onClick={() => setTags(tags.filter((x) => x !== t))}>×</button>
                </span>
              ))}
              <input value={tagDraft} onChange={(e) => setTagDraft(e.target.value)} onKeyDown={onTagKey} placeholder={tags.length ? "Add tag" : "Tags, optional — Blender, rigging…"} aria-label="Add a tag" />
            </div>
          </div>
          <div className={s.refRow}>
            <span className={s.refLabel}>Reference</span>
            <button type="button" className={`${s.refPick} ${!ref ? s.on : ""}`} onClick={() => setRef(null)} aria-pressed={!ref}>None</button>
            {(meta.data?.refs ?? []).map((r) => (
              <button type="button" key={r.id} className={`${s.refPick} ${ref?.id === r.id ? s.on : ""}`} onClick={() => setRef(r)} aria-pressed={ref?.id === r.id} title={r.label}>
                <img src={r.url} alt={r.label} width={52} height={39} />
              </button>
            ))}
            {ref?.id.startsWith("upload") && (
              <button type="button" className={`${s.refPick} ${s.on}`} aria-pressed title={ref.label}>
                <img src={ref.url} alt={`Your reference: ${ref.label}`} width={52} height={39} />
              </button>
            )}
            <button type="button" className="btn btn-ghost btn-small" onClick={() => fileRef.current?.click()}>Upload…</button>
            <input ref={fileRef} type="file" accept="image/*" className="sr" onChange={(e) => takeFile(e.target.files?.[0])} tabIndex={-1} />
            <span className={s.dropHint}>or drop an image anywhere here</span>
          </div>
        </div>
        <button className={`btn btn-primary ${s.go}`} type="submit" disabled={busy}>{busy ? "Searching…" : "Search"}</button>
      </form>

      {error && <p className={s.error} role="alert">{error}</p>}

      {res && (
        <section className={s.understood} aria-live="polite">
          <span className={s.ulabel}>Looking for</span>
          {understood.map((u) => <span key={u} className="chip"><b>{u}</b></span>)}
          {res.spec.assumptions.slice(0, 1).map((a) => <span key={a} className={s.assume}>Assumed: {a}</span>)}
        </section>
      )}

      {res && <ArenaNote res={res} onReshuffle={() => { const r = (res.rotation ?? 0) + 1; setRotation(r); run(text, tags, ref, arena, r); }} onSwitch={switchArena} />}

      <section className={s.results} aria-busy={busy} aria-label="Results">
        {busy && !res && [0, 1, 2].map((i) => <div key={i} className={`skeleton ${s.skel}`} />)}
        {res && res.results.length === 0 && (
          <div className={s.empty}>
            <h2 className="display">Nobody fits that yet.</h2>
            <p className="muted">
              {res.arena === "competitive" && res.outside_arena > 0
                ? "No ranked freelancer matches this. Casual includes everyone whose work fits, ranked or not."
                : "Try naming the kind of work (a character, a logo, a landing page), adding a tag, or dropping a reference image."}
            </p>
            {res.arena === "competitive" && <button className="btn btn-primary" onClick={() => switchArena("casual")}>Search Casual instead</button>}
          </div>
        )}
        {res?.results.map((r) => <ResultCard key={r.freelancer.id} r={r} arena={res.arena} />)}
      </section>

      {!res && !busy && meta.data && (
        <section className={s.starters}>
          <h2>Or start from an example</h2>
          <div>
            {meta.data.scenarios.slice(0, 8).map((sc) => (
              <button
                key={sc.id}
                className="chip"
                onClick={() => {
                  const r = sc.q.ref ? meta.data!.refs.find((x) => x.id === sc.q.ref) ?? null : null;
                  setText(sc.q.text ?? "");
                  setTags(sc.q.tags ?? []);
                  setRef(r);
                  run(sc.q.text ?? "", sc.q.tags ?? [], r);
                }}
              >
                {sc.label}
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function ArenaNote({ res, onReshuffle, onSwitch }: { res: SearchResponse; onReshuffle: () => void; onSwitch: (a: Arena) => void }) {
  if (res.arena === "casual") {
    return (
      <div className={s.note}>
        <p>
          <b>{res.matched} freelancers fit this request.</b> In Casual they take turns: the order reshuffles every hour, so each of them leads as often as the others. Nobody here was ranked above anyone else.
        </p>
        <button className="btn btn-ghost btn-small" onClick={onReshuffle}>Reshuffle now</button>
      </div>
    );
  }
  return (
    <div className={`${s.note} ${s.noteComp}`}>
      <p>
        <b>Ranked by relevance × rank.</b> Only freelancers who've earned a rank appear here.
        {res.outside_arena > 0 && <> {res.outside_arena} others aren't ranked yet.</>}
      </p>
      <button className="btn btn-ghost btn-small" onClick={() => onSwitch("casual")}>See everyone in Casual</button>
    </div>
  );
}

function ResultCard({ r, arena }: { r: Result; arena: string }) {
  const [main, ...rest] = r.portfolio;
  return (
    <article className={s.card}>
      <Link to={`/f/${r.freelancer.id}`} className={s.gallery} aria-label={`${r.freelancer.name}'s portfolio`} viewTransition>
        {main?.thumb && <img className={s.hero} src={main.thumb} alt={main.title} width={480} height={360} loading="lazy" />}
        <div className={s.side}>
          {rest.slice(0, 2).map((p) => p.thumb && <img key={p.id} src={p.thumb} alt={p.title} width={240} height={180} loading="lazy" />)}
        </div>
      </Link>
      <div className={s.body}>
        <header className={s.who}>
          {arena === "competitive" && <span className={s.place}>{r.rank}</span>}
          <div>
            <h3><Link to={`/f/${r.freelancer.id}`} viewTransition>{r.freelancer.name}</Link></h3>
            <p className="muted">{r.freelancer.headline} · {r.freelancer.location}</p>
          </div>
          {arena === "competitive" && <RankBadge tier={r.ladder?.tier ?? null} label={r.ladder?.label ?? null} rating={r.ladder?.rating} />}
        </header>
        <p className={s.why}>{r.why.summary}</p>
        {r.why.reasons.length > 2 && (
          <ul className={s.reasons}>
            {r.why.reasons.slice(2, 4).map((x) => <li key={x.text}>{x.text}</li>)}
          </ul>
        )}
        {r.why.caveats.filter((c) => !c.startsWith("original work")).slice(0, 1).map((c) => <p key={c} className={s.caveat}>{c}</p>)}
        <footer className={s.meta}>
          <span>{r.stats.jobs ? `${r.stats.jobs} jobs · ${r.stats.clients} clients · ${r.stats.rehired} rehires` : "New — no client jobs yet"}</span>
          {r.freelancer.newcomer && <span className="chip">New here</span>}
          <Link to={`/f/${r.freelancer.id}`} className="btn btn-ghost btn-small" viewTransition>View profile</Link>
        </footer>
      </div>
    </article>
  );
}
