#!/usr/bin/env node
/**
 * Load PathConduit.html in Chrome with file:// and assert no storage APIs are called.
 */
import { spawn } from "node:child_process";
import { writeFileSync, readFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, "..", "dist", "PathConduit.html");
if (!existsSync(src)) {
  console.error("dist/PathConduit.html missing; run scripts/build-html.py first");
  process.exit(1);
}

const work = join(tmpdir(), "path-conduit-runtime-test");
mkdirSync(work, { recursive: true });

const hook = `
(function(){
  const log = [];
  const report = (name) => { log.push(name); };
  ["getItem","setItem","removeItem","clear","key"].forEach(m => {
    try {
      const ls = window.localStorage;
      const orig = ls[m].bind(ls);
      ls[m] = function(){ report("localStorage." + m); return orig.apply(null, arguments); };
    } catch(e){}
    try {
      const ss = window.sessionStorage;
      const orig = ss[m].bind(ss);
      ss[m] = function(){ report("sessionStorage." + m); return orig.apply(null, arguments); };
    } catch(e){}
  });
  const idb = window.indexedDB;
  if (idb) {
    ["open","deleteDatabase","cmp","databases"].forEach(m => {
      if (typeof idb[m] === "function") {
        const o = idb[m].bind(idb);
        idb[m] = function(){ report("indexedDB." + m); return o.apply(null, arguments); };
      }
    });
  }
  const oc = Object.getOwnPropertyDescriptor(Document.prototype, "cookie") ||
             Object.getOwnPropertyDescriptor(document, "cookie");
  if (oc && oc.set) {
    Object.defineProperty(document, "cookie", {
      configurable: true,
      get(){ report("document.cookie.get"); return oc.get.call(this); },
      set(v){ report("document.cookie.set"); return oc.set.call(this, v); }
    });
  }
  const ofetch = window.fetch;
  if (ofetch) window.fetch = function(){ report("fetch"); return ofetch.apply(this, arguments); };
  const ox = window.XMLHttpRequest;
  if (ox) {
    const open = ox.prototype.open;
    ox.prototype.open = function(){ report("XMLHttpRequest.open"); return open.apply(this, arguments); };
  }
  if (navigator.sendBeacon) {
    const ob = navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = function(){ report("sendBeacon"); return ob.apply(null, arguments); };
  }
  const oWS = window.WebSocket;
  if (oWS) {
    window.WebSocket = function(){ report("WebSocket"); return new oWS(...arguments); };
  }
  window.__pcStorageDump = () => JSON.stringify(log);
})();
`;

const html = readFileSync(src, "utf8");
const wrapped = html
  .replace(/<head>/, `<head><script>${hook}</script>`)
  .replace("</body>", `<script>document.documentElement.setAttribute("data-storage-log", window.__pcStorageDump ? window.__pcStorageDump() : "NOHOOK");</script></body>`);
const page = join(work, "PathConduit.html");
writeFileSync(page, wrapped);

const chrome =
  process.env.CHROME ||
  ["/usr/bin/google-chrome", "/usr/bin/chromium-browser", "/usr/bin/chromium"].find(existsSync);
if (!chrome) {
  console.error("Chrome not found");
  process.exit(1);
}

const url = "file://" + page;
const args = [
  "--headless",
  "--disable-gpu",
  "--no-sandbox",
  "--disable-dev-shm-usage",
  "--allow-file-access-from-files",
  "--virtual-time-budget=6000",
  "--dump-dom",
  url,
];

const proc = spawn(chrome, args, { stdio: ["ignore", "pipe", "pipe"] });
let dom = "", err = "";
proc.stdout.on("data", d => { dom += d; });
proc.stderr.on("data", d => { err += d; });
const code = await new Promise(r => proc.on("close", r));
const m = dom.match(/data-storage-log="([^"]*)"/);
if (!m) {
  console.error("could not read storage log from dump-dom, chrome exit", code);
  console.error(dom.slice(0, 500));
  process.exit(1);
}
const raw = m[1].replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&#39;/g, "'");
const log = JSON.parse(raw);
if (log.length) {
  console.error("FAIL: storage or network APIs called at runtime:", log);
  process.exit(1);
}
if (!dom.includes("Nothing is saved. Closing clears everything.")) {
  console.error("FAIL: privacy note missing from rendered DOM");
  process.exit(1);
}
console.log("ok   runtime: no localStorage/sessionStorage/indexedDB/cookie/fetch/XHR/WebSocket calls on load");
console.log("ok   runtime: privacy note is visible in the DOM");
