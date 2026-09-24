// assets-src/shoot.mjs — full-page screenshots of the running app with headless Chrome
// (the dev-review loop; the Browser pane can't composite on this machine).
//   node assets-src/shoot.mjs <outdir> <width> <path> [path ...]
import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";

const [outDir, width, ...paths] = process.argv.slice(2);
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
mkdirSync(outDir, { recursive: true });
for (const p of paths) {
  const [route, h = "2400"] = p.split("@");
  const name = (route.replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "") || "home") + `-${width}.png`;
  const prof = path.resolve(outDir, `prof-${Date.now()}`);
  const r = spawnSync(CHROME, ["--headless=new", "--disable-gpu", "--hide-scrollbars", `--user-data-dir=${prof}`, `--window-size=${width},${h}`, "--virtual-time-budget=6000", `--screenshot=${path.resolve(outDir, name)}`, `http://localhost:3399${route}`], { encoding: "utf8" });
  rmSync(prof, { recursive: true, force: true });
  console.log(r.status === 0 ? "shot" : "FAILED", name);
}
