import { NavLink, Link, Outlet, useLocation } from "react-router";
import { useEffect } from "react";
import { Logo, Mark } from "../brand/Logo";
import s from "./Shell.module.css";

const NAV = [
  { to: "/search", label: "Find talent" },
  { to: "/ranks", label: "Ranks" },
  { to: "/studio", label: "Studio" },
];

export function Shell() {
  const { pathname } = useLocation();
  const onBrand = pathname === "/";
  useEffect(() => {
    // Block body on purpose: an effect must not return a value. Some builds of
    // Chromium return a thenable from window.scrollTo, and a returned Promise
    // becomes the effect "cleanup" — which then crashes as "destroy is not a
    // function" on the next pathname change.
    window.scrollTo(0, 0);
  }, [pathname]);
  return (
    <>
      <a href="#main" className={s.skip}>Skip to content</a>
      <header className={`${s.header} ${onBrand ? s.overlay : ""}`}>
        <div className={`page ${s.bar}`}>
          <Link to="/" className={s.home} aria-label="FreeRank home" viewTransition>
            <Logo size={26} tone={onBrand ? "light" : "ink"} />
          </Link>
          <nav aria-label="Main" className={s.nav}>
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} viewTransition className={({ isActive }) => `${s.link} ${isActive ? s.active : ""}`}>
                {n.label}
              </NavLink>
            ))}
          </nav>
          <Link to="/search" className={`btn btn-small ${onBrand ? "btn-gold" : "btn-primary"} ${s.cta}`} viewTransition>
            Hire someone
          </Link>
        </div>
      </header>
      <main id="main">
        <Outlet />
      </main>
      <footer className={s.footer}>
        <div className={`page ${s.foot}`}>
          <div className={s.brand}>
            <Mark size={36} color="var(--cobalt)" />
            <p>Rank is earned from paid client work and a checked portfolio. It cannot be bought, tagged or borrowed.</p>
          </div>
          <nav aria-label="Footer" className={s.cols}>
            <div>
              <h2>Marketplace</h2>
              <Link to="/search">Casual arena</Link>
              <Link to="/search?arena=competitive">Competitive arena</Link>
              <Link to="/ranks">Leaderboards</Link>
            </div>
            <div>
              <h2>Freelancers</h2>
              <Link to="/studio">Your studio</Link>
              <Link to="/ranks#how">How rank works</Link>
              <Link to="/studio#appeals">Appeals</Link>
            </div>
            <div>
              <h2>Trust</h2>
              <Link to="/trust">Review queue</Link>
              <a href="/console">Engine console</a>
            </div>
          </nav>
        </div>
        <div className={`page ${s.legal}`}>© FreeRank prototype · demo data, no real people or payments</div>
      </footer>
    </>
  );
}
