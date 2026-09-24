import { Link } from "react-router";
import { Mark } from "../brand/Logo";
import { useTitle } from "../lib/hooks";

export function NotFound() {
  useTitle("Not found");
  return (
    <div className="page" style={{ padding: "120px 0 40px", display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 18 }}>
      <Mark size={48} color="var(--cobalt)" />
      <h1 className="display" style={{ fontSize: "clamp(3rem, 7vw, 5rem)" }}>No rank here.</h1>
      <p className="muted" style={{ maxWidth: "48ch" }}>That page doesn't exist. The freelancers do — try searching for the work you need.</p>
      <Link to="/search" className="btn btn-primary">Find talent</Link>
    </div>
  );
}
