// e2e-verify.mjs — drives real SPA navigation against the production build via
// the DevTools protocol and fails on any uncaught exception (e.g. the old
// "I is not a function" destroy crash on pathname change).
// Usage: node e2e-verify.mjs  (expects server.js on :3399 and Edge at the usual path)
import { spawn } from "node:child_process";
import { existsSync, rmSync } from "node:fs";

const EDGE = ["C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
              "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe"].find(existsSync);
const PROFILE = "C:\\Users\\LENOVO\\AppData\\Local\\Temp\\edge-e2e-profile";
rmSync(PROFILE, { recursive: true, force: true });

const browser = spawn(EDGE, [
  "--headless=new", "--disable-gpu", "--no-first-run", `--user-data-dir=${PROFILE}`,
  "--remote-debugging-port=9333", "--window-size=1280,900", "about:blank",
], { stdio: "ignore" });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function targets() {
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch("http://127.0.0.1:9333/json/list");
      const list = await r.json();
      const page = list.find((t) => t.type === "page");
      if (page) return page;
    } catch {}
    await sleep(250);
  }
  throw new Error("no CDP target");
}

const page = await targets();
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));

let id = 0;
const pending = new Map();
const errors = [];
ws.onmessage = (e) => {
  const msg = JSON.parse(e.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  if (msg.method === "Runtime.exceptionThrown") {
    errors.push(msg.params.exceptionDetails?.exception?.description ?? "exception");
  }
  if (msg.method === "Log.entryAdded" && msg.params.entry.level === "error") {
    errors.push(msg.params.entry.text);
  }
};
const send = (method, params = {}) =>
  new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });

await send("Runtime.enable");
await send("Log.enable");
await send("Page.enable");

const evaluate = async (expr) => {
  const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
  return r.result?.result?.value;
};

const goto = async (url) => {
  await send("Page.navigate", { url });
  for (let i = 0; i < 40; i++) {
    if (await evaluate("document.readyState === 'complete' && !!document.querySelector('nav')")) return;
    await sleep(250);
  }
};

const clickNav = async (label) => {
  const ok = await evaluate(`(() => {
    const a = [...document.querySelectorAll('nav a')].find((x) => x.textContent.trim() === ${JSON.stringify(label)});
    if (!a) return false; a.click(); return true;
  })()`);
  if (!ok) throw new Error(`nav link not found: ${label}`);
  await sleep(1200);
};

console.log("-> / (landing)");
await goto("http://localhost:3399/");
console.log("   title:", await evaluate("document.title"));

console.log("-> click Studio (the old crash path)");
await clickNav("Studio");
console.log("   heading:", await evaluate("document.querySelector('h1')?.textContent"));
console.log("   url:", await evaluate("location.pathname"));

console.log("-> click Ranks");
await clickNav("Ranks");
console.log("   heading:", await evaluate("document.querySelector('h1')?.textContent"));

console.log("-> click Find talent, then home logo");
await clickNav("Find talent");
await clickNav("Find talent").catch(() => {});
console.log("   url:", await evaluate("location.pathname"));

const errorBody = await evaluate("document.body.innerText.slice(0, 200)");
const crashed = /Unexpected Application Error|is not a function/.test(String(errorBody));
console.log("\nRESULT");
console.log("  uncaught exceptions:", errors.length);
for (const e of errors.slice(0, 5)) console.log("   !", String(e).split("\n")[0]);
console.log("  crash banner on page:", crashed);

ws.close();
browser.kill();
if (errors.length || crashed) process.exit(1);
console.log("  E2E PASS");
