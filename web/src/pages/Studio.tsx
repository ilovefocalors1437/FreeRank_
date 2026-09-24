import { useEffect, useRef, useState, type DragEvent, type FormEvent } from "react";
import { Link } from "react-router";
import { api, type Appeal, type Grid, type Upload as Published, type UploadCheck } from "../lib/api";
import { useAsync, useMeta, useTitle } from "../lib/hooks";
import { analyseImage, fetchAsBlob } from "../lib/image";
import { RankBadge } from "../components/Rank";
import s from "./Studio.module.css";

type Upload = { grid: Grid; g64: string; preview: string; url: string; name: string };

export function Studio() {
  useTitle("Studio");
  const meta = useMeta();
  const people = useAsync(() => api.freelancers(), []);
  const [me, setMe] = useState("vera");
  const profile = useAsync(() => api.profile(me), [me]);
  const appeals = useAsync(() => api.appeals(), []);
  const published = useAsync(() => api.uploads(), []);
  const [upload, setUpload] = useState<Upload | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [check, setCheck] = useState<UploadCheck | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setCheck(null);
  }, [me]);

  async function take(file: Blob, name: string) {
    setError(null);
    setCheck(null);
    try {
      const a = await analyseImage(file);
      setUpload({ ...a, name });
      if (!title) setTitle(name.replace(/\.[a-z0-9]+$/i, "").replace(/[-_]/g, " "));
    } catch {
      setError("Couldn't read that image. Try a PNG, JPEG or WebP.");
    }
  }
  const sample = async (path: string, name: string, t: string, d: string) => {
    await take(await fetchAsBlob(path), name);
    setTitle(t);
    setDescription(d);
  };
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!upload) return setError("Add an image first.");
    setBusy(true);
    setError(null);
    try {
      setCheck(await api.checkUpload({ grid: upload.grid, g64: upload.g64, preview: upload.preview, title, description, freelancerId: me }));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) take(f, f.name);
  };

  const mine = (appeals.data ?? []).filter((a) => a.freelancerId === me);
  const p = profile.data;

  return (
    <div className={`page ${s.studio}`}>
      <header className={s.head}>
        <div>
          <h1 className="display">Your studio</h1>
          <p className="muted">Check a piece before it goes live, track your way into Competitive, and answer a match if one comes up.</p>
        </div>
        <label className={s.as}>
          <span>Viewing as</span>
          <select className="input" value={me} onChange={(e) => setMe(e.target.value)}>
            {(people.data ?? []).map((f) => (
              <option key={f.id} value={f.id}>{f.name} — {f.rank.label ?? "Casual"}</option>
            ))}
          </select>
        </label>
      </header>

      {p && (
        <section className={s.status} aria-label="Your standing">
          {p.rank.competitive && p.rank.tier ? (
            <>
              <RankBadge tier={p.rank.tier} label={p.rank.label} rating={p.rank.rating} />
              <p>{p.rank.progress?.nextLabel ? `${p.rank.progress.toNextDivision} FR to ${p.rank.progress.nextLabel}.` : `You hold Master seat ${p.rank.masterSeat}.`} Keep taking Competitive jobs — six months without one takes you out of Competitive search.</p>
            </>
          ) : (
            <>
              <RankBadge tier={null} label={null} />
              <ol className={s.checklist} aria-label="Competitive entry">
                <li data-ok={p.rank.eligibility.clients.have >= p.rank.eligibility.clients.need || undefined}>
                  <b>{Math.min(p.rank.eligibility.clients.have, 3)}/{p.rank.eligibility.clients.need}</b> paying clients
                </li>
                <li data-ok={p.rank.eligibility.portfolio.have >= p.rank.eligibility.portfolio.need || undefined}>
                  <b>{Math.min(p.rank.eligibility.portfolio.have, 3)}/{p.rank.eligibility.portfolio.need}</b> checked pieces
                </li>
                <li data-ok={p.rank.eligibility.trust.ok || undefined}>{p.rank.eligibility.trust.ok ? "Authenticity clear" : "Under review"}</li>
              </ol>
              <p>Until then you're in Casual, where every good match gets equal turns.</p>
            </>
          )}
          <Link to={`/f/${me}`} className="btn btn-ghost btn-small">Public profile</Link>
        </section>
      )}

      <div className={s.work}>
        <form className={s.uploader} onSubmit={submit} onDragOver={(e) => (e.preventDefault(), setDragging(true))} onDragLeave={() => setDragging(false)} onDrop={onDrop} data-dragging={dragging || undefined}>
          <h2>Add a portfolio piece</h2>
          <button type="button" className={s.drop} onClick={() => fileRef.current?.click()}>
            {upload ? <img src={upload.url} alt={`Selected: ${upload.name}`} /> : <span><b>Drop an image</b> or click to choose one<small>PNG, JPEG or WebP. Only a small fingerprint and preview leave your browser.</small></span>}
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="sr" tabIndex={-1} onChange={(e) => e.target.files?.[0] && take(e.target.files[0], e.target.files[0].name)} />
          <div className={s.samples}>
            <span>Try it:</span>
            <button type="button" className="chip" onClick={() => sample("/assets/portfolio/aoi-p2.webp", "mage.webp", "Anime mage companion", "Stylized anime character with rigging in Blender.")}>someone else's piece</button>
            <button type="button" className="chip" onClick={() => sample("/assets/portfolio/ref-cozy.webp", "mushrooms.webp", "Cozy mushroom props", "Stylized cozy mushroom props modeled in Blender, game-ready.")}>a new piece</button>
          </div>
          <label className="field">Title<input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What is it?" /></label>
          <label className="field">Description<textarea className="input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What you made, with which tools, for what use." rows={3} /></label>
          {error && <p className={s.error} role="alert">{error}</p>}
          <button className="btn btn-primary" type="submit" disabled={busy || !upload}>{busy ? "Checking…" : "Check authenticity"}</button>
        </form>

        <div className={s.result} aria-live="polite">
          {!check && (
            <div className={s.idle}>
              <h2>What happens when you publish</h2>
              <ol>
                <li>Your browser shrinks the image to a 64×64 fingerprint input and a small preview; only those are sent, never the full file. We hash its structure, 256 bits.</li>
                <li>We compare it with every image on FreeRank, including pieces on hold. Recolouring or re-lighting doesn't hide a copy.</li>
                <li>{meta.data?.grader.llm ? `${meta.data.grader.llm} grades craft and complexity.` : "The piece gets a system grade (an AI grader plugs in here when configured)."} Grades feed a quarter of your rank.</li>
                <li>A match with someone else's earlier upload holds the piece and opens an appeal — selling on several marketplaces is normal.</li>
              </ol>
            </div>
          )}
          {check && upload && (
            <CheckResult
              check={check}
              upload={upload}
              title={title}
              description={description}
              me={me}
              onChange={() => {
                appeals.reload();
                published.reload();
                profile.reload();
              }}
            />
          )}
        </div>
      </div>

      <section className={s.appeals} aria-labelledby="pieces-title">
        <h2 id="pieces-title" className="display">Pieces you've published here</h2>
        {(published.data ?? []).filter((u) => u.freelancerId === me).length === 0 ? (
          <p className="muted">Nothing published from the Studio yet. Pieces that pass the check go straight into your portfolio and into search.</p>
        ) : (
          <ul>
            {(published.data ?? []).filter((u) => u.freelancerId === me).map((u: Published) => (
              <li key={u.id} className={s.appeal}>
                <img src={u.image} alt="" width={64} height={48} className={s.pieceThumb} />
                <div>
                  <b>{u.title}</b>
                  <small>{new Date(u.createdAt).toLocaleDateString()}</small>
                </div>
                <span className={s.pill} data-status={u.state === "live" || u.state === "cleared" ? "approved" : u.state === "held" ? "in_review" : "rejected"}>
                  {u.state === "live" ? "Live" : u.state === "cleared" ? "Live — appeal approved" : u.state === "held" ? "Held — appeal open" : "Held — appeal rejected"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section id="appeals" className={s.appeals} aria-labelledby="appeals-title">
        <h2 id="appeals-title" className="display">Your appeals</h2>
        {mine.length === 0 ? (
          <p className="muted">No appeals. If an upload ever matches someone else's work, you'll answer it here.</p>
        ) : (
          <ul>
            {mine.map((a) => <AppealRow key={a.id} a={a} />)}
          </ul>
        )}
      </section>
    </div>
  );
}

function CheckResult({ check, upload, title, description, me, onChange }: { check: UploadCheck; upload: Upload; title: string; description: string; me: string; onChange: () => void }) {
  const meta = useMeta();
  const [appealing, setAppealing] = useState(false);
  const [done, setDone] = useState<Appeal | null>(null);
  const [live, setLive] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const publish = () => api.publish({ grid: upload.grid, g64: upload.g64, preview: upload.preview, title, description, freelancerId: me });
  if (check.verdict === "clear") {
    const g = check.grade!;
    return (
      <div className={`${s.panel} ${s.ok}`}>
        <h2>{live ? "Published" : "Clear — ready to publish"}</h2>
        <p>No image on FreeRank shares this piece's structure (closest allowed: {check.thresholds.match} of {check.thresholds.bits} bits).</p>
        <dl className={s.grades}>
          {(["overall", "craft", "complexity", "presentation"] as const).map((k) => (
            <div key={k}><dt>{k}</dt><dd><span><i style={{ width: `${Math.round(g[k] * 100)}%` }} /></span>{Math.round(g[k] * 100)}</dd></div>
          ))}
        </dl>
        <p className={s.small}>Graded by {g.source === "system_estimate" ? "the system estimate (no AI grader configured)" : g.source}. External reverse search: {check.reverseSearch.google_lens}.</p>
        {err && <p className={s.error} role="alert">{err}</p>}
        {live ? (
          <div className={s.actions}>
            <Link to={`/f/${me}`} className="btn btn-primary">See it on your profile</Link>
            <span className={s.small}>It's in search now, and counts toward your skills and rank.</span>
          </div>
        ) : (
          <div className={s.actions}>
            <button
              className="btn btn-primary"
              onClick={async () => {
                setErr(null);
                try {
                  await publish();
                  setLive(true);
                  onChange();
                } catch (x) {
                  setErr((x as Error).message);
                }
              }}
            >
              Publish to portfolio
            </button>
          </div>
        )}
      </div>
    );
  }
  if (check.verdict === "already_in_your_portfolio") {
    return (
      <div className={`${s.panel} ${s.info}`}>
        <h2>You've already posted this</h2>
        <p>It matches “{(check.matches.find((x) => x.mine) ?? check.matches[0]).project.title}” in your portfolio. Re-uploads of the same piece count once toward your skills and rank, so there's nothing to gain from posting it again.</p>
      </div>
    );
  }
  const m = check.matches.find((x) => !x.mine)!;
  return (
    <div className={`${s.panel} ${s.bad}`}>
      <h2>{check.verdict === "identical_match" ? "This image is already on FreeRank" : "This looks like an altered copy"}</h2>
      <div className={s.compare}>
        <figure><img src={upload.url} alt="Your upload" /><figcaption>Your upload</figcaption></figure>
        <figure>{m.project.thumb && <img src={m.project.thumb} alt={m.project.title} />}<figcaption>“{m.project.title}” · {m.freelancer.name}, uploaded earlier</figcaption></figure>
      </div>
      <p>
        {m.kind === "identical" ? (
          <>It's the same image: fingerprints differ by <b>{m.stableDistance} of 256 bits</b>, which is re-compression noise.</>
        ) : (
          <>Structure fingerprints differ by <b>{m.distance} of 256 bits</b>{m.kind === "recoloured" ? " with the colours changed — the pattern a recoloured copy leaves." : "."}</>
        )}{" "}
        The piece is held and won't appear in search while this is open.
      </p>
      {done ? (
        <div className={s.appealed}>
          <h3>Appeal sent</h3>
          <p>Reference <b>{done.id}</b>. The piece is saved but held; if a reviewer approves, it goes live in your portfolio. Nothing is removed or restored automatically.</p>
          {done.reason === "multi_marketplace" && <p>Put <code>{done.verificationCode}</code> in your profile on the other marketplace so the reviewer can confirm the listing is yours.</p>}
        </div>
      ) : appealing ? (
        <AppealForm
          reasons={meta.data?.appealReasons ?? {}}
          onCancel={() => setAppealing(false)}
          onSubmit={async (body) => {
            const { upload: held } = await publish(); // stored as held; the appeal decides it
            const a = await api.appeal({ ...body, freelancerId: me, matchProject: m.project.id, title, fingerprint: check.fingerprint.dhash256, uploadId: held.id });
            setDone(a);
            onChange();
          }}
        />
      ) : (
        <div className={s.actions}>
          <button className="btn btn-primary" onClick={() => setAppealing(true)}>This is mine — appeal</button>
          <span className={s.small}>Sell it on other marketplaces too? That's fine; the appeal asks for the link.</span>
        </div>
      )}
    </div>
  );
}

function AppealForm({ reasons, onSubmit, onCancel }: { reasons: Record<string, { label: string; needs: string }>; onSubmit: (b: { reason: string; message: string; links: string[] }) => Promise<void>; onCancel: () => void }) {
  const [reason, setReason] = useState("multi_marketplace");
  const [message, setMessage] = useState("");
  const [link, setLink] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await onSubmit({ reason, message, links: link.trim() ? [link.trim()] : [] });
    } catch (x) {
      setErr((x as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className={s.appealForm} onSubmit={submit}>
      <fieldset>
        <legend>Why does this match?</legend>
        {Object.entries(reasons).map(([id, r]) => (
          <label key={id} className={s.reason}>
            <input type="radio" name="reason" value={id} checked={reason === id} onChange={() => setReason(id)} />
            <span><b>{r.label}</b><small>Needs {r.needs}.</small></span>
          </label>
        ))}
      </fieldset>
      <label className="field">Link{reason === "multi_marketplace" ? " to your other listing" : " (optional)"}<input className="input" type="url" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://" /></label>
      <label className="field">Anything a reviewer should know<textarea className="input" value={message} onChange={(e) => setMessage(e.target.value)} rows={3} /></label>
      {err && <p className={s.error} role="alert">{err}</p>}
      <div className={s.actions}>
        <button className="btn btn-primary" disabled={busy}>{busy ? "Sending…" : "Send appeal"}</button>
        <button type="button" className="btn btn-ghost" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

const STATUS_LABEL: Record<Appeal["status"], string> = { submitted: "Submitted", in_review: "In review", approved: "Approved", rejected: "Rejected" };
function AppealRow({ a }: { a: Appeal }) {
  return (
    <li className={s.appeal}>
      <span className={s.pill} data-status={a.status}>{STATUS_LABEL[a.status]}</span>
      <div>
        <b>{a.upload.title}</b>
        <small>Matched “{a.matched?.title}” · {new Date(a.createdAt).toLocaleDateString()} · ref {a.id}</small>
      </div>
    </li>
  );
}
