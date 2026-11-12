#!/usr/bin/env node
/**
 * Path Conduit tests. Synthetic fixtures only in-repo.
 * The real work-file extract proof is opt-in via PATH_CONDUIT_SAMPLE.
 */
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const require = createRequire(import.meta.url);

function loadLinkedom() {
  const candidates = [
    join(root, "node_modules/linkedom"),
    "/tmp/node_modules/linkedom",
    "linkedom",
  ];
  for (const p of candidates) {
    try { return require(p); } catch {}
  }
  throw new Error("linkedom is required. npm install linkedom");
}

const { parseHTML } = loadLinkedom();
const { window } = parseHTML("<html><body></body></html>");
const { DOMParser } = window;
globalThis.DOMParser = DOMParser;
globalThis.window = window;
globalThis.document = window.document;
try { globalThis.navigator = window.navigator || { clipboard: undefined }; } catch {}

const extractSrc = readFileSync(join(root, "src/extract.js"), "utf8");
const appSrc = readFileSync(join(root, "src/app.js"), "utf8")
  .replace(/if\(typeof document[\s\S]*initApp\(\);\n\}/, "")
  .replace(/if\(typeof module[\s\S]*COLS \};\n\}/, "");
const modPath = join(here, ".bundle.cjs");
const fs = await import("node:fs");
fs.writeFileSync(modPath, extractSrc + "\n" + appSrc + "\nmodule.exports = { extract, indexRecords, recordKey, RE, ingestFile, clearSession, markAllSeen, summarizeNew, state, toCSV, COLS };\n");
const api = require(modPath);
const { extract, indexRecords, recordKey, ingestFile, clearSession, markAllSeen, summarizeNew, state, toCSV, COLS } = api;

let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    failed++;
    console.error("FAIL:", msg);
  } else {
    console.log("ok  ", msg);
  }
}
function sha256(s) {
  return createHash("sha256").update(s).digest("hex");
}

// --- extract() source is byte-identical to the Hub file when present ---
const hubXml = process.env.PATH_CONDUIT_HUB_XML || "";
if (existsSync(hubXml)) {
  const s = readFileSync(hubXml, "utf8");
  const i = s.indexOf("const RE=");
  const end = "return {records:ids.length,combos:out,unmatched};\n}";
  const j = s.indexOf(end);
  const block = s.slice(i, j + end.length);
  const local = extractSrc.trim();
  assert(local === block.trim(), "extract() source matches Hub xml.html (832-char block)");
  assert(block.trim().length === 832, "extract() block is 832 chars");
} else {
  console.log("skip extract() Hub source compare (xml.html not on this machine)");
}

// --- synthetic extract + identity ---
const f300 = readFileSync(join(here, "fixtures/demo-300.xml"), "utf8");
const f500 = readFileSync(join(here, "fixtures/demo-500.xml"), "utf8");
const fRetest = readFileSync(join(here, "fixtures/demo-500-plus-retests.xml"), "utf8");

const e300 = extract(f300);
const e500 = extract(f500);
assert(e300.records === 300, `demo-300 extract records == 300 (got ${e300.records})`);
assert(e500.records === 500, `demo-500 extract records == 500 (got ${e500.records})`);
assert(e300.unmatched.length === 0 && e500.unmatched.length === 0, "no unmatched demo CableIDs");
assert(e300.combos.map(c => c.pc).join(",") === "10-1,20-2", "demo-300 combos are 10-1 and 20-2");
assert(e500.combos.map(c => c.pc).join(",") === "10-1,20-2,30-3", "demo-500 combos are 10-1, 20-2, 30-3");

const recs300 = indexRecords(f300);
const recs500 = indexRecords(f500);
assert(recs300.length === 300 && recs500.length === 500, "indexRecords counts match file sizes");
const keys300 = new Set(recs300.map(r => r.key));
const keys500 = new Set(recs500.map(r => r.key));
assert(keys300.size === 300 && keys500.size === 500, "all synthetic keys unique");
const newKeys = recs500.filter(r => !keys300.has(r.key)).map(r => r.key);
assert(newKeys.length === 200, `300 then 500 yields 200 new keys (got ${newKeys.length})`);
const expectedNew = recs500.slice(300).map(r => r.key);
assert(JSON.stringify(newKeys) === JSON.stringify(expectedNew), "new key identities are exactly the last 200 records");

// CableID is not unique when retests exist; CableID+DateTime is
const recsR = indexRecords(fRetest);
const cableIds = recsR.map(r => r.cableId);
const uniqueCables = new Set(cableIds);
assert(uniqueCables.size < recsR.length, "retest fixture has duplicate CableIDs");
assert(new Set(recsR.map(r => r.key)).size === recsR.length, "CableID+DateTime remains unique with retests");
assert(recordKey("A", "B", "C") === "A\tB", "recordKey prefers DateTime over FileName");

// --- in-session new-records flow ---
clearSession();
const first = ingestFile("demo-300.xml", f300);
const s1 = summarizeNew(first);
assert(first.baseline === true && s1.newCount === 0, "first load is a baseline with 0 new");
assert(state.seen.size === 300, "first load marks 300 keys seen");
const second = ingestFile("demo-500.xml", f500);
const s2 = summarizeNew(second);
assert(second.baseline === false && s2.newCount === 200, `second load reports 200 new (got ${s2.newCount})`);
assert(s2.removed === 0, "no removed records on a superset");
assert([...s2.newKeys].sort().join("\n") === expectedNew.slice().sort().join("\n"), "session new keys match last 200 identities");
const marked = markAllSeen();
assert(marked === 200, `Mark all as seen adds 200 keys (got ${marked})`);
const s3 = summarizeNew(second);
assert(s3.newCount === 0, "after mark-all-as-seen, new count is 0");

clearSession();
ingestFile("demo-500.xml", f500);
ingestFile("demo-300.xml", f300);
const shrink = summarizeNew(state.files[state.files.length - 1] || state.files[0]);
// after clear + 500 baseline then 300: all 300 are already seen, 200 removed
assert(shrink.newCount === 0, "loading a subset after the full file has 0 new");
assert(shrink.removed === 200, `subset after full reports 200 removed (got ${shrink.removed})`);

// CSV export is computed, not auto-written
const csv = toCSV(second);
assert(csv.startsWith(COLS.join(",") + "\n"), "CSV header is Path-Conduit, Records, A0X, A0X records");

// --- optional real sample extract proof (never stored in the repo) ---
const sample = process.env.PATH_CONDUIT_SAMPLE || "";
const baselinePath = process.env.PATH_CONDUIT_EXTRACT_BASELINE || "";
if (existsSync(sample) && existsSync(baselinePath)) {
  const text = readFileSync(sample, "utf8");
  const got = extract(text);
  const expected = JSON.parse(readFileSync(baselinePath, "utf8"));
  const gotJ = JSON.stringify(got);
  const expJ = JSON.stringify(expected);
  assert(gotJ === expJ, "extract() on the local sample is byte-identical to the Hub baseline");
  assert(got.records === 2486, `sample has 2486 records (got ${got.records})`);
  assert(got.combos.length === 4, `sample has 4 groups (got ${got.combos.length})`);
  const a0x = got.combos.reduce((n, c) => n + c.a0x.length, 0);
  assert(a0x === 27, `sample has 27 A0X items (got ${a0x})`);
  const recs = indexRecords(text);
  assert(recs.length === 2486, "indexRecords counts 2486 TestSummary rows");
  const cables = recs.map(r => r.cableId);
  assert(new Set(cables).size === 2476, `CableID is not unique (2476 unique, got ${new Set(cables).size})`);
  assert(new Set(recs.map(r => r.key)).size === 2486, "CableID+DateTime is unique on the sample");
  console.log("sample extract sha256", sha256(gotJ));
} else {
  console.log("skip real-sample extract proof (file not present; expected when running on the build box)");
}

if (failed) {
  console.error(`\n${failed} test(s) failed`);
  process.exit(1);
}
console.log("\nAll tests passed.");
