import { useState } from "react";
import { Link } from "react-router";
import { api, human, type Appeal } from "../lib/api";
import { useAsync, useMeta, useTitle } from "../lib/hooks";
import s from "./Trust.module.css";

interface Case {
  id: string;
  subject: { id: string; name: string };
  risk: number;
  tier: string;
  state: string;
  signals: { signal: string; value: number; detail: string }[];
  evidence: { image_pairs: { originalProject: string; copyProject: string; hamming: number; colorSim: number; kind: string }[] };
}
interface TrustData {
  cases: Case[];
  imageEdges: { originalProject: string; copyProject: string; originalThumb: string; copyThumb: string; hamming: number }[];
  lsh: { candidatePairs: number; naivePairs: number };
}

export function Trust() {
  useTitle("Review queue");
  const meta = useMeta();
  const appeals = useAsync(() => api.appeals(), []);
  const trust = useAsync(() => api.trust<TrustData>(), []);
  const open = (appeals.data ?? []).filter((a) => a.status === "submitted" || a.status === "in_review");
  const closed = (appeals.data ?? []).filter((a) => a.status === "approved" || a.status === "rejected");

  return (
    <div className={`page ${s.trust}`}>
      <header>
        <h1 className="display">Review queue</h1>
        <p className="muted">The system holds and explains; people decide. Nothing on this page is removed or restored without a reviewer.</p>
      </header>

      <section aria-labelledby="ap">
        <h2 id="ap" className={s.h2}>Appeals <span>{open.length} open</span></h2>
        {appeals.loading && <div className="skeleton" style={{ height: 120 }} />}
        {!appeals.loading && open.length === 0 && <p className={s.empty}>No open appeals. When an upload matches someone else's work and the freelancer answers, it lands here.</p>}
        <ul className={s.list}>
          {open.map((a) => <AppealCard key={a.id} a={a} reasons={meta.data?.appealReasons ?? {}} onChange={appeals.reload} />)}
        </ul>
        {closed.length > 0 && (
          <details className={s.closed}>
            <summary>{closed.length} decided</summary>
            <ul className={s.list}>{closed.map((a) => <AppealCard key={a.id} a={a} reasons={meta.data?.appealReasons ?? {}} onChange={appeals.reload} />)}</ul>
          </details>
        )}
      </section>

      <section aria-labelledby="cases">
        <h2 id="cases" className={s.h2}>Accounts on hold or under review <span>{trust.data?.cases.length ?? 0}</span></h2>
        <ul className={s.list}>
          {(trust.data?.cases ?? []).map((c) => {
            const pairs = trust.data!.imageEdges.filter((e) => c.evidence.image_pairs.some((p) => p.copyProject === e.copyProject));
            return (
              <li key={c.id} className={s.case}>
                <header>
                  <b>{c.subject.name}</b>
                  <span className={s.tier} data-tier={c.tier}>{c.tier === "hard_hold" ? "Held — hidden" : "Under review — shown with less weight"}</span>
                  <span className="muted">risk {c.risk.toFixed(2)}</span>
                </header>
                <ul className={s.signals}>
                  {c.signals.filter((x) => x.value > 0).map((x) => <li key={x.signal}><b>{human(x.signal)}</b> {x.detail}</li>)}
                </ul>
                {pairs.length > 0 && (
                  <div className={s.pairs}>
                    {pairs.map((p) => (
                      <figure key={p.copyProject}>
                        <img src={p.originalThumb} alt={`Original ${p.originalProject}`} />
                        <img src={p.copyThumb} alt={`Copy ${p.copyProject}`} />
                        <figcaption>{p.hamming}/256 bits</figcaption>
                      </figure>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        {trust.data && <p className={s.small}>Duplicate scan: LSH banding compared {trust.data.lsh.candidatePairs} of {trust.data.lsh.naivePairs} possible image pairs.</p>}
      </section>
    </div>
  );
}

function AppealCard({ a, reasons, onChange }: { a: Appeal; reasons: Record<string, { label: string }>; onChange: () => void }) {
  const [busy, setBusy] = useState(false);
  const set = async (status: Appeal["status"]) => {
    setBusy(true);
    try {
      await api.setAppeal(a.id, status);
      onChange();
    } finally {
      setBusy(false);
    }
  };
  return (
    <li className={s.appeal}>
      <header>
        <b>{a.upload.title}</b>
        <span className={s.status} data-status={a.status}>{human(a.status)}</span>
        <span className="muted">ref {a.id} · {new Date(a.createdAt).toLocaleString()}</span>
      </header>
      <p>
        {a.freelancerId && <><Link to={`/f/${a.freelancerId}`}>{a.freelancerId}</Link> says: </>}
        <b>{reasons[a.reason]?.label ?? a.reason}</b>
        {a.matched && <> — matched “{a.matched.title}” by <Link to={`/f/${a.matched.owner}`}>{a.matched.owner}</Link></>}
      </p>
      {a.message && <blockquote>{a.message}</blockquote>}
      {a.links.length > 0 && (
        <p className={s.links}>
          {a.links.map((l) => <a key={l} href={l} target="_blank" rel="noopener noreferrer nofollow">{l}</a>)}
          {a.reason === "multi_marketplace" && <span>look for <code>{a.verificationCode}</code> on that profile</span>}
        </p>
      )}
      {(a.status === "submitted" || a.status === "in_review") && (
        <div className={s.actions}>
          {a.status === "submitted" && <button className="btn btn-ghost btn-small" disabled={busy} onClick={() => set("in_review")}>Start review</button>}
          <button className="btn btn-primary btn-small" disabled={busy} onClick={() => set("approved")}>Approve — restore the piece</button>
          <button className="btn btn-ghost btn-small" disabled={busy} onClick={() => set("rejected")}>Reject</button>
        </div>
      )}
    </li>
  );
}
