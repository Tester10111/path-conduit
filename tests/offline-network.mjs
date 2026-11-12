#!/usr/bin/env node
/**
 * The built HTML must contain no http(s) URLs, and the page must render
 * in a network-blocked Chrome session (proxy blackhole). Chrome's own
 * process pings are ignored; page-initiated requests are not allowed.
 */
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const htmlPath = join(here, "..", "dist", "PathConduit.html");
if (!existsSync(htmlPath)) { console.error("missing PathConduit.html"); process.exit(1); }

const src = readFileSync(htmlPath, "utf8");
const srcBad = [...src.matchAll(/https?:\/\/[^\s"'<>]+/g)].map(m => m[0]);
if (srcBad.length) {
  console.error("FAIL: built HTML contains network URLs:", srcBad);
  process.exit(1);
}
console.log("ok   offline: PathConduit.html has no http(s) URLs");

const chrome =
  process.env.CHROME ||
  ["/usr/bin/google-chrome", "/usr/bin/chromium-browser", "/usr/bin/chromium"].find(existsSync);
if (!chrome) { console.error("Chrome not found"); process.exit(1); }

const url = "file://" + htmlPath;
const args = [
  "--headless",
  "--disable-gpu",
  "--no-sandbox",
  "--disable-dev-shm-usage",
  "--allow-file-access-from-files",
  "--disable-background-networking",
  "--disable-sync",
  "--disable-extensions",
  "--disable-component-update",
  "--no-first-run",
  "--no-default-browser-check",
  "--proxy-server=127.0.0.1:9",
  "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost",
  "--virtual-time-budget=6000",
  "--dump-dom",
  url,
];
const proc = spawn(chrome, args, { stdio: ["ignore", "pipe", "pipe"] });
let stdout = "", stderr = "";
proc.stdout.on("data", d => stdout += d);
proc.stderr.on("data", d => stderr += d);
const code = await new Promise(r => proc.on("close", r));
if (!stdout.includes("Path Conduit") || !stdout.includes("Nothing is saved")) {
  console.error("FAIL: page did not render with network blocked, exit", code);
  console.error(stdout.slice(0, 400));
  process.exit(1);
}
console.log("ok   offline: page rendered in a network-blocked headless Chrome session");
