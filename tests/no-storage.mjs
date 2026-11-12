#!/usr/bin/env node
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const banned = [
  "localStorage",
  "sessionStorage",
  "indexedDB",
  "openDatabase",
  "webkitIndexedDB",
  "navigator.storage",
  "caches.open",
  "cookie",
];
// Allowed mentions: comments in tests/README that *forbid* these APIs, and this file.
const skipDir = new Set(["node_modules", ".git", "dist", "target", "shots"]);
const skipFile = new Set(["no-storage.mjs", "README.md", "README.txt"]);

function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    if (skipDir.has(name)) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, acc);
    else if (/\.(js|mjs|cjs|ts|html|css|rs|toml|json)$/.test(name) && !skipFile.has(name)) acc.push(p);
  }
  return acc;
}

let failed = 0;
const files = walk(join(root, "src")).concat(walk(join(root, "scripts")));
// also scan built html later if present
const distHtml = join(root, "dist", "PathConduit.html");
try { files.push(distHtml); } catch {}

for (const f of files) {
  let text;
  try { text = readFileSync(f, "utf8"); } catch { continue; }
  for (const word of banned) {
    // ignore the privacy comment that names the APIs in order to forbid them
    const lines = text.split(/\n/);
    lines.forEach((line, i) => {
      if (!line.includes(word)) return;
      if (/no localStorage|No localStorage|not use localStorage|localStorage, sessionStorage, IndexedDB, or file writes/i.test(line) && word !== "cookie") return;
      if (/Nothing is saved/i.test(line)) return;
      // cookies: only flag document.cookie / cookie writes, not "cookie" in comments about not using them
      if (word === "cookie" && !/document\.cookie|cookie\s*=/.test(line)) return;
      if (/forbid|must not|do not use|never use|no persistence|no storage/i.test(line)) return;
      console.error(`FAIL: ${f}:${i + 1} mentions ${word}: ${line.trim().slice(0, 160)}`);
      failed++;
    });
  }
}

if (failed) {
  console.error(`\n${failed} storage-API mention(s) in source`);
  process.exit(1);
}
console.log("ok   source grep: no storage APIs in app source or built HTML");
