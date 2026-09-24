// assets-src/html-render.mjs — renders the 2D portfolio pieces (UI mockups, brand
// sheets, copy cards) from the corpus params with headless Chrome.
//   node assets-src/html-render.mjs <jobs.json> <out_dir> [id ...]
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

const [jobsPath, outDir, ...only] = process.argv.slice(2);
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const W = 960;
const H = 720;
const tmp = path.join(path.dirname(jobsPath), "html");
mkdirSync(tmp, { recursive: true });
mkdirSync(outDir, { recursive: true });

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const page = (css, body) => `<!doctype html><meta charset="utf-8"><style>*{box-sizing:border-box;margin:0}html,body{width:${W}px;height:${H}px;overflow:hidden}${css}</style><body>${body}</body>`;

// deterministic sparkline / bar data per title
function series(seed, n, lo = 0.2, hi = 0.95) {
  let x = seed;
  const out = [];
  for (let i = 0; i < n; i++) {
    x = (x * 9301 + 49297) % 233280;
    out.push(lo + (hi - lo) * (0.35 * (x / 233280) + 0.65 * (0.5 + 0.45 * Math.sin(i / 2.3 + seed))));
  }
  return out;
}
const hash = (s) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 100000, 7);
// Layout variant per piece (or forced with j.variant) so two designers never ship the
// same composition in different colours — a shared template is, structurally, a copy.
const variant = (j) => j.variant ?? hash(j.id + j.title + (j.name || "")) % 3;
const VARIANT_CSS = {
  dashboard: [
    "",
    "body{grid-template-columns:1fr 190px}nav{order:2;border-right:0;border-left:1px solid #8883}.chart{grid-column:2/4}.bars{grid-column:1;grid-row:3}table{grid-row:4}",
    "body{display:block}nav{flex-direction:row;align-items:center;height:70px;padding:0 30px;border-right:0;border-bottom:1px solid #8883}nav b{margin:0 24px 0 0}main{grid-template-columns:1.4fr 1fr 1fr;grid-template-rows:auto 150px 1fr}.chart{grid-column:1/2;grid-row:2/4}.bars{grid-column:2/4}table{grid-column:2/4}",
  ],
  landing: [
    "",
    ".hero{grid-template-columns:1fr 1.1fr}.hero>div:first-child{order:2}.shot{height:380px}",
    ".hero{grid-template-columns:1fr;text-align:center;margin-top:36px;gap:26px}.hero p{margin:14px auto}.cta{justify-content:center}.shot{height:190px;width:80%;margin:0 auto}.logos{display:none}h1{font-size:46px}",
    ".hero{grid-template-columns:1fr;margin-top:24px;gap:22px}.shot{order:-1;height:250px}h1{font-size:42px}.logos{display:none}",
  ],
  mobile: [
    "",
    "body{justify-content:flex-start;padding-left:90px}.ph:nth-child(2){display:none}.pitch{display:block}",
    "body{gap:0}.ph{transform:rotate(-8deg) translateY(20px)}.ph:nth-child(2){transform:translateY(-10px);z-index:2}.ph3{display:block;transform:rotate(8deg) translateY(20px)}",
    "body{flex-direction:row-reverse;justify-content:flex-start;padding-right:90px;gap:70px}.ph:nth-child(2){display:none}.pitch{display:block}.ph{transform:rotate(6deg)}",
  ],
  brand: [
    "",
    "body{grid-template-columns:1fr 1.15fr}.hero{order:2}",
    "body{grid-template-columns:1fr;grid-template-rows:250px 1fr}.hero{flex-direction:row;gap:36px}.side{grid-template-columns:1.2fr 1fr 1fr;grid-template-rows:1fr}.sw{grid-template-columns:1fr 1fr}.sw div{height:auto}",
    "body{grid-template-columns:1fr;grid-template-rows:1fr 250px}.hero{order:2;flex-direction:row;gap:36px}.side{grid-template-columns:1.2fr 1fr 1fr;grid-template-rows:1fr}.sw{grid-template-columns:1fr 1fr}.sw div{height:auto}",
    "body{grid-template-columns:1fr}.side{display:none}.hero{border-radius:0;margin:-44px}.hero h1{font-size:112px}",
    "body{grid-template-columns:1fr}.hero{display:none}.side{grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr}",
  ],
  copy: [
    "",
    "body{align-items:center;text-align:center}.k:before{display:none}h1{max-width:18ch}",
    "body{display:grid;grid-template-columns:1.3fr 1fr;grid-template-rows:auto 1fr auto;align-items:end;column-gap:48px}h1{grid-row:2;font-size:78px}p{grid-row:2;align-self:end;border-left:3px solid currentColor;padding-left:22px}.k{grid-column:1/3}",
  ],
};
const withVariant = (kind, j, html) => html.replace("</style>", VARIANT_CSS[kind][variant(j)] + "</style>");

function dashboard(j) {
  const s = series(hash(j.title), 24);
  const pts = s.map((v, i) => `${20 + i * 22},${190 - v * 150}`).join(" ");
  const bars = series(hash(j.title) + 3, 7).map((v, i) => `<rect x="${14 + i * 34}" y="${130 - v * 110}" width="20" height="${v * 110}" rx="4" fill="${i === 5 ? j.accent : j.accent2}" opacity="${i === 5 ? 1 : 0.55}"/>`).join("");
  const rows = ["Northwind", "Pixelhaus", "Orbit Labs", "Glasshouse"].map((n, i) => `<tr><td>${n}</td><td>${["Paid", "Pending", "Paid", "Review"][i]}</td><td style="text-align:right">$${(12400 - i * 2710).toLocaleString("en-US")}</td></tr>`).join("");
  return page(`
    body{background:${j.bg};color:${j.ink};font:15px "Segoe UI",sans-serif;display:grid;grid-template-columns:190px 1fr}
    nav{padding:28px 20px;border-right:1px solid color-mix(in srgb,${j.ink} 10%,transparent);display:flex;flex-direction:column;gap:6px}
    nav b{font:600 20px Bahnschrift,sans-serif;margin-bottom:22px;display:flex;align-items:center;gap:8px}
    nav b i{width:22px;height:22px;border-radius:7px;background:${j.accent};display:block}
    nav span{padding:9px 12px;border-radius:9px;opacity:.7}
    nav span.on{background:color-mix(in srgb,${j.accent} 18%,transparent);opacity:1;color:${j.accent};font-weight:600}
    main{padding:28px 30px;display:grid;grid-template-columns:1fr 1fr 1fr;grid-template-rows:auto auto 1fr;gap:16px}
    h1{grid-column:1/4;font:600 26px Bahnschrift,sans-serif;display:flex;justify-content:space-between;align-items:center}
    h1 small{font:500 13px "Segoe UI";padding:8px 14px;border-radius:9px;background:${j.accent};color:${j.bg}}
    .k{background:${j.surface};border-radius:16px;padding:18px}
    .k p{opacity:.6;font-size:13px}.k strong{display:block;font:600 28px Bahnschrift,sans-serif;margin-top:6px}
    .k em{font-style:normal;color:${j.accent};font-size:13px}
    .chart{grid-column:1/3;background:${j.surface};border-radius:16px;padding:16px}
    .bars{background:${j.surface};border-radius:16px;padding:16px}
    table{grid-column:1/4;background:${j.surface};border-radius:16px;padding:10px 16px;border-collapse:separate;font-size:14px}
    td{padding:9px 6px;border-top:1px solid color-mix(in srgb,${j.ink} 8%,transparent)}tr:first-child td{border:0}`,
    `<nav><b><i></i>${esc(j.title)}</b><span class="on">Overview</span><span>Transfers</span><span>Cards</span><span>Reports</span><span>Settings</span></nav>
    <main><h1>Overview <small>New transfer</small></h1>
      <div class="k"><p>Balance</p><strong>$84,210</strong><em>+4.2% this week</em></div>
      <div class="k"><p>Incoming</p><strong>$12,940</strong><em>+18 payments</em></div>
      <div class="k"><p>Outgoing</p><strong>$7,380</strong><em>3 scheduled</em></div>
      <div class="chart"><svg width="100%" height="200" viewBox="0 0 540 200"><polyline points="${pts}" fill="none" stroke="${j.accent}" stroke-width="3" stroke-linejoin="round"/><polyline points="20,190 ${pts} ${20 + 23 * 22},190" fill="${j.accent}" opacity=".12"/></svg></div>
      <div class="bars"><svg width="100%" height="200" viewBox="0 0 250 150">${bars}</svg></div>
      <table>${rows}</table></main>`);
}

function landing(j) {
  return page(`
    body{background:${j.bg};color:${j.ink};font:16px "Segoe UI",sans-serif;padding:34px 56px}
    header{display:flex;align-items:center;gap:28px;font-size:14px}
    header b{font:700 21px Bahnschrift,sans-serif;margin-right:auto;display:flex;gap:9px;align-items:center}
    header b i{width:20px;height:20px;border-radius:50%;background:${j.accent};display:block}
    header span{opacity:.65}header em{font-style:normal;padding:9px 16px;border-radius:999px;background:${j.ink};color:${j.bg}}
    .hero{display:grid;grid-template-columns:1.1fr 1fr;gap:40px;margin-top:66px;align-items:center}
    h1{font:600 54px/1.02 Bahnschrift,sans-serif;letter-spacing:-.02em}
    p{margin-top:18px;opacity:.7;line-height:1.5;max-width:34ch}
    .cta{margin-top:26px;display:flex;gap:12px}
    .cta span{padding:13px 22px;border-radius:999px;background:${j.accent};color:#fff;font-weight:600}
    .cta span+span{background:transparent;color:${j.ink};border:1px solid color-mix(in srgb,${j.ink} 25%,transparent)}
    .shot{height:330px;border-radius:22px;background:${j.surface};box-shadow:0 30px 60px -30px color-mix(in srgb,${j.ink} 40%,transparent);padding:22px;display:grid;grid-template-rows:auto 1fr;gap:14px}
    .shot div{border-radius:12px;background:color-mix(in srgb,${j.accent2} 60%,${j.surface})}
    .shot .bar{height:14px;width:60%;background:color-mix(in srgb,${j.ink} 12%,transparent)}
    .logos{display:flex;gap:44px;margin-top:62px;opacity:.45;font:700 18px Bahnschrift,sans-serif}`,
    `<header><b><i></i>${esc(j.title)}</b><span>Product</span><span>Pricing</span><span>Customers</span><em>Start free</em></header>
     <section class="hero"><div><h1>${esc(j.title === "Shipyard" ? "Ship on Friday. Sleep on Friday." : j.title === "Clearwell" ? "Care that fits your calendar." : j.title === "Marginalia" ? "Books with notes in the margins." : "Customer relationships, minus the noise.")}</h1><p>Everything your team needs in one calm place — no setup call, no seat maths.</p><div class="cta"><span>Get started</span><span>See a demo</span></div></div><div class="shot"><div class="bar"></div><div></div></div></section>
     <div class="logos"><span>NORTHWIND</span><span>orbit</span><span>Glasshouse</span><span>PAPER CRANE</span></div>`);
}

function mobile(j) {
  const phone = (title, inner) => `<div class="ph"><div class="scr"><p class="t">${title}</p>${inner}</div></div>`;
  const list = ["Morning run", "Hydration", "Sleep", "Stretch"].map((x, i) => `<div class="row"><i style="background:${i % 2 ? j.accent2 : j.accent}"></i><span>${x}</span><b>${[82, 64, 91, 40][i]}%</b></div>`).join("");
  return page(`
    body{background:linear-gradient(135deg,${j.bg},color-mix(in srgb,${j.accent2} 35%,${j.bg}));font:14px "Segoe UI",sans-serif;color:${j.ink};display:flex;gap:46px;justify-content:center;align-items:center}
    .ph{width:270px;height:560px;border-radius:44px;background:#0d0d0f;padding:11px;box-shadow:0 40px 80px -40px rgba(0,0,0,.45)}
    .ph:nth-child(2){transform:translateY(34px)}
    .scr{height:100%;border-radius:34px;background:${j.surface};padding:44px 20px 20px;display:flex;flex-direction:column;gap:14px;overflow:hidden}
    .t{font:600 22px Bahnschrift,sans-serif}
    .ring{width:170px;height:170px;border-radius:50%;margin:6px auto;background:conic-gradient(${j.accent} 0 72%,color-mix(in srgb,${j.ink} 8%,transparent) 0);display:grid;place-items:center}
    .ring b{width:130px;height:130px;border-radius:50%;background:${j.surface};display:grid;place-items:center;font:600 34px Bahnschrift,sans-serif}
    .row{display:flex;align-items:center;gap:10px;padding:10px;border-radius:14px;background:color-mix(in srgb,${j.ink} 4%,transparent)}
    .row i{width:30px;height:30px;border-radius:10px}.row span{flex:1}
    .card{border-radius:18px;padding:16px;background:${j.accent};color:#fff}.card b{font:600 26px Bahnschrift,sans-serif;display:block;margin-top:8px}
    .btn{margin-top:auto;text-align:center;padding:13px;border-radius:14px;background:${j.ink};color:${j.surface};font-weight:600}`,
    phone(esc(j.title), `<div class="ring"><b>72%</b></div>${list}`) + phone("Today", `<div class="card">Weekly goal<b>4 of 5 days</b></div>${list}<div class="btn">Log activity</div>`) +
    `<div class="ph ph3" style="display:none"><div class="scr"><p class="t">Insights</p><div class="card">Streak<b>12 days</b></div>${list}</div></div>` +
    `<div class="pitch" style="display:none;max-width:330px"><p style="font:600 44px/1.05 Bahnschrift,sans-serif">${esc(j.title)}, designed for one thumb.</p><p style="margin-top:16px;opacity:.7;font-size:17px;line-height:1.5">Component library, 48 screens, light and dark themes, handed off with tokens.</p></div>`);
}

const MARKS = {
  arch: (c) => `<path d="M20 90V50a30 30 0 0 1 60 0v40h-16V52a14 14 0 0 0-28 0v38z" fill="${c}"/>`,
  anvil: (c) => `<path d="M12 30h62c0 12-8 20-20 22v10h10v12H26V62h10V52C22 50 12 42 12 30z" fill="${c}"/><circle cx="82" cy="24" r="8" fill="${c}"/>`,
  peak: (c) => `<path d="M8 84 40 26l14 24 10-16 28 50z" fill="${c}"/><path d="M40 26l8 14-8 6-8-6z" fill="#fff" opacity=".85"/>`,
  circle: (c) => `<circle cx="50" cy="50" r="38" fill="none" stroke="${c}" stroke-width="12"/><circle cx="50" cy="50" r="12" fill="${c}"/>`,
  star: (c) => `<path d="M50 8l10 30 32 2-25 19 9 31-26-18-26 18 9-31L8 40l32-2z" fill="${c}"/>`,
};

function brandSheet(j) {
  const mark = (c, size) => `<svg width="${size}" height="${size}" viewBox="0 0 100 100">${(MARKS[j.mark] || MARKS.circle)(c)}</svg>`;
  return page(`
    body{background:${j.bg};color:${j.ink};font:15px "Segoe UI",sans-serif;display:grid;grid-template-columns:1.15fr 1fr;padding:44px;gap:28px}
    .hero{border-radius:26px;background:${j.ink};color:${j.bg};display:flex;flex-direction:column;justify-content:center;align-items:center;gap:18px}
    .hero h1{font:700 64px Bahnschrift,sans-serif;letter-spacing:-.02em}
    .side{display:grid;grid-template-rows:auto auto 1fr;gap:18px}
    .sw{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}
    .sw div{height:92px;border-radius:14px;padding:10px;font:12px Consolas,monospace;display:flex;align-items:flex-end}
    .type{border-radius:18px;border:1px solid color-mix(in srgb,${j.ink} 15%,transparent);padding:18px;display:flex;gap:20px;align-items:center}
    .type b{font:700 70px Bahnschrift,sans-serif}.type p{opacity:.7;line-height:1.5}
    .cards{position:relative}
    .card{position:absolute;width:260px;height:150px;border-radius:14px;padding:18px;display:flex;flex-direction:column;justify-content:space-between;box-shadow:0 20px 40px -24px rgba(0,0,0,.5)}
    .card.a{background:${j.accent};color:${j.bg};left:0;top:10px;transform:rotate(-5deg)}
    .card.b{background:#fff;color:${j.ink};left:120px;top:50px;transform:rotate(4deg)}`,
    `<div class="hero">${mark(j.accent, 170)}<h1>${esc(j.name)}</h1></div>
     <div class="side"><div class="sw"><div style="background:${j.ink};color:${j.bg}">${j.ink}</div><div style="background:${j.accent};color:${j.bg}">${j.accent}</div><div style="background:${j.accent2}">${j.accent2}</div><div style="background:#fff;border:1px solid #0001">#FFFFFF</div></div>
     <div class="type"><b>Aa</b><p>Bahnschrift Bold for display<br>Segoe UI for text and labels<br>Always set the mark before the name</p></div>
     <div class="cards"><div class="card a">${mark(j.bg, 44)}<span>hello@${esc(j.name.toLowerCase().replace(/\s+/g, ""))}.co</span></div><div class="card b">${mark(j.accent, 40)}<span><b>${esc(j.name)}</b><br>Studio & shop</span></div></div></div>`);
}

function copyCard(j) {
  const serif = j.font === "serif";
  return page(`
    body{background:${j.bg};color:${j.ink};padding:74px 84px;display:flex;flex-direction:column;justify-content:center;gap:26px;font-family:${serif ? 'Georgia,"Sitka Text",serif' : 'Bahnschrift,"Segoe UI",sans-serif'}}
    .k{font:600 15px "Segoe UI",sans-serif;letter-spacing:.04em;color:${j.accent};display:flex;align-items:center;gap:12px}
    .k:before{content:"";width:36px;height:3px;background:${j.accent}}
    h1{font-size:${serif ? 62 : 66}px;line-height:1.04;font-weight:${serif ? 400 : 700};letter-spacing:-.015em;max-width:15ch}
    p{font:21px/1.55 ${serif ? 'Georgia,"Leelawadee UI",serif' : '"Segoe UI","Leelawadee UI",sans-serif'};opacity:.78;max-width:44ch}
    .m{margin-top:10px;font:13px "Segoe UI",sans-serif;opacity:.5}`,
    `<div class="k">${esc(j.kicker)}</div><h1>${esc(j.headline)}</h1><p>${esc(j.body)}</p><div class="m">Copy · ${j.font === "serif" ? "long-form" : "product"} voice</div>`);
}

const RENDER = {
  ui: (j) => withVariant(j.layout, j, ({ dashboard, landing, mobile })[j.layout](j)),
  brand: (j) => withVariant("brand", j, brandSheet(j)),
  copy: (j) => withVariant("copy", j, copyCard(j)),
};
const jobs = JSON.parse(readFileSync(jobsPath, "utf8")).filter((j) => RENDER[j.kind] && (!only.length || only.includes(j.id)));
for (const j of jobs) {
  const htmlPath = path.resolve(tmp, `${j.id}.html`);
  writeFileSync(htmlPath, RENDER[j.kind](j));
  const prof = path.resolve(tmp, `prof-${j.id}`);
  const out = path.resolve(outDir, `${j.id}.png`);
  const r = spawnSync(CHROME, ["--headless=new", "--disable-gpu", "--hide-scrollbars", `--user-data-dir=${prof}`, `--window-size=${W},${H}`, "--virtual-time-budget=1500", `--screenshot=${out}`, `file:///${htmlPath.replace(/\\/g, "/")}`], { encoding: "utf8" });
  rmSync(prof, { recursive: true, force: true });
  console.log(r.status === 0 ? "WROTE" : "FAILED", j.id, r.status === 0 ? "" : r.stderr.slice(-300));
}
