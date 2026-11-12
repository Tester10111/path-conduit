/* Path Conduit — session memory only. No localStorage, sessionStorage, IndexedDB, or file writes. */

const IS_TAURI = typeof window !== "undefined" && !!(window.__TAURI_INTERNALS__ || window.__TAURI__);
const COLS = ["Path-Conduit","Records","A0X","A0X records"];
const state = {
  files: [],
  active: 0,
  hideDone: false,
  showNewOnly: false,
  query: "",
  cursor: null,
  exportOpen: false,
  seen: new Set(),
  lastKeys: new Set(),
  lastLoadAt: null,
  lastName: "",
  checks: Object.create(null),
  folds: Object.create(null),
  firstLoad: true,
};

function $(s, r){ return (r||document).querySelector(s); }
function $$(s, r){ return [...(r||document).querySelectorAll(s)]; }
function esc(s){ return String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c])); }
function cid(pc, a){ return pc + "|" + a; }
function fmtTime(d){
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

/* Record identity: CableID + TAB + DateTime.
   CableID is not unique (retests appear as extra rows). FileName is also unique
   on typical LinkWare exports, but CableID + DateTime is the documented key.
   Path, conduit, and A0X are parsed from CableID with the same RE as extract(). */
function recordKey(cableId, dateTime, fileName){
  return String(cableId || "") + "\t" + String(dateTime || fileName || "");
}

function indexRecords(text){
  const doc = new DOMParser().parseFromString(text, "application/xml");
  let nodes = [...doc.getElementsByTagName("TestSummary")];
  if(!nodes.length) nodes = [...doc.getElementsByTagName("testsummary")];
  const recs = [];
  if(nodes.length){
    for(const n of nodes){
      const val = tag => (n.getElementsByTagName(tag)[0]?.textContent || "").trim();
      const cableId = val("CableID");
      const dateTime = val("DateTime");
      const fileName = val("FileName");
      const key = recordKey(cableId, dateTime, fileName);
      const m = cableId.match(RE);
      recs.push({
        key, cableId, dateTime, fileName,
        pc: m ? `${+m[1]}-${+m[2]}` : "",
        a: m ? m[3] : "",
      });
    }
    return recs;
  }
  let ids = [...doc.getElementsByTagName("CableID")].map(n => n.textContent.trim());
  if(!ids.length) ids = [...text.matchAll(/<CableID>([^<]*)<\/CableID>/g)].map(m => m[1]);
  ids.forEach((cableId, i) => {
    const m = cableId.match(RE);
    recs.push({
      key: recordKey(cableId, "", "row-" + i),
      cableId, dateTime: "", fileName: "row-" + i,
      pc: m ? `${+m[1]}-${+m[2]}` : "",
      a: m ? m[3] : "",
    });
  });
  return recs;
}

function toast(msg){
  const el = $("#toast");
  if(!el) return;
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove("show"), 1800);
}

function typingInField(){
  const a = document.activeElement;
  if(!a) return false;
  const tag = (a.tagName || "").toLowerCase();
  if(tag === "textarea" || tag === "select") return true;
  if(tag === "input"){
    const t = (a.type || "text").toLowerCase();
    return t !== "checkbox" && t !== "radio" && t !== "button" && t !== "submit";
  }
  return a.isContentEditable;
}

function current(){ return state.files[state.active] || null; }

function itemChecked(pc, a){ return !!state.checks[cid(pc, a)]; }
function setChecked(pc, a, on){
  const k = cid(pc, a);
  if(on) state.checks[k] = true;
  else delete state.checks[k];
}

function comboDone(c){ return c.a0x.length > 0 && c.a0x.every(x => itemChecked(c.pc, x.a)); }
function doneCount(file){
  if(!file) return 0;
  return file.r.combos.reduce((n, c) => n + c.a0x.filter(x => itemChecked(c.pc, x.a)).length, 0);
}
function totalItems(file){
  if(!file) return 0;
  return file.r.combos.reduce((n, c) => n + c.a0x.length, 0);
}

function summarizeNew(file){
  if(!file) return { newCount: 0, removed: 0, newKeys: new Set(), newCombos: new Set(), newA0x: new Set() };
  const newKeys = new Set();
  for(const rec of file.recs){
    if(!state.seen.has(rec.key)) newKeys.add(rec.key);
  }
  const removed = file.removed || 0;
  const newCombos = new Set();
  const newA0x = new Set();
  const counts = Object.create(null);
  for(const rec of file.recs){
    if(!newKeys.has(rec.key) || !rec.pc) continue;
    counts[cid(rec.pc, rec.a)] = (counts[cid(rec.pc, rec.a)] || 0) + 1;
    newCombos.add(rec.pc);
    newA0x.add(cid(rec.pc, rec.a));
  }
  return { newCount: newKeys.size, removed, newKeys, newCombos, newA0x, counts };
}

function ingestFile(name, text){
  const r = extract(text);
  const recs = indexRecords(text);
  const keySet = new Set(recs.map(x => x.key));
  const file = { name, text, r, recs, keySet, loadedAt: new Date() };
  if(state.firstLoad || !state.files.length){
    state.seen = new Set(keySet);
    state.firstLoad = false;
    file.baseline = true;
    file.removed = 0;
  } else {
    file.baseline = false;
    let removed = 0;
    for(const k of state.lastKeys){ if(!keySet.has(k)) removed++; }
    file.removed = removed;
  }
  state.lastKeys = keySet;
  state.lastLoadAt = file.loadedAt;
  state.lastName = name;
  const existing = state.files.findIndex(f => f.name === name);
  if(existing >= 0) state.files[existing] = file;
  else state.files.push(file);
  state.active = existing >= 0 ? existing : state.files.length - 1;
  return file;
}

function clearSession(){
  state.files = [];
  state.active = 0;
  state.seen = new Set();
  state.lastKeys = new Set();
  state.lastLoadAt = null;
  state.lastName = "";
  state.checks = Object.create(null);
  state.folds = Object.create(null);
  state.firstLoad = true;
  state.query = "";
  state.showNewOnly = false;
  state.cursor = null;
  const inp = $("#q");
  if(inp) inp.value = "";
}

function markAllSeen(){
  const f = current();
  if(!f) return 0;
  let n = 0;
  for(const k of f.keySet){
    if(!state.seen.has(k)){ state.seen.add(k); n++; }
  }
  return n;
}

async function readFile(file){
  const text = await file.text();
  ingestFile(file.name, text);
  render();
}

function csvEscape(v){ return /[",\n]/.test(v) ? "\"" + v.replace(/"/g, "\"\"") + "\"" : v; }
function toCSV(file){
  const rows = [COLS.join(",")];
  for(const c of file.r.combos){
    const a = c.a0x.map(x => x.a).join(" ");
    const n = c.a0x.map(x => String(x.n)).join(" ");
    rows.push([c.pc, String(c.records), a, n].map(csvEscape).join(","));
  }
  return rows.join("\n") + "\n";
}
function downloadCSV(){
  const f = current();
  if(!f) return;
  const blob = new Blob([toCSV(f)], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = (f.name.replace(/\.xml$/i, "") || "path-conduit") + ".csv";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast("CSV saved");
}

function copyText(s){
  if(navigator.clipboard && navigator.clipboard.writeText){
    return navigator.clipboard.writeText(s).then(() => true).catch(() => fallbackCopy(s));
  }
  return Promise.resolve(fallbackCopy(s));
}
function fallbackCopy(s){
  const ta = document.createElement("textarea");
  ta.value = s; document.body.appendChild(ta); ta.select();
  let ok = false;
  try{ ok = document.execCommand("copy"); }catch(_){}
  ta.remove();
  return ok;
}

function exportTSV(){
  const f = current();
  if(!f) return;
  const lines = [COLS.join("\t")];
  for(const c of f.r.combos){
    lines.push([c.pc, c.records, c.a0x.map(x => x.a).join(" "), c.a0x.map(x => x.n).join(" ")].join("\t"));
  }
  copyText(lines.join("\n")).then(ok => toast(ok ? "Copied table" : "Copy failed"));
}

function renderEmpty(){
  $("#workspace").innerHTML = `
    <div class="drop" id="dropzone" tabindex="0" role="button" aria-label="Open an XML file">
      <span class="big">Drop a Fluke XML here</span>
      <span class="hint">or click Open. Fully offline.</span>
      <div class="drop-actions"><button type="button" class="btn primary" id="openBtnEmpty">Open file</button></div>
    </div>`;
  bindDrop($("#dropzone"));
  $("#openBtnEmpty")?.addEventListener("click", e => { e.stopPropagation(); openPicker(); });
}

function render(){
  const f = current();
  const body = $("#workspace");
  if(!f){ renderEmpty(); updateChrome(); return; }
  const q = state.query.trim().toLowerCase();
  const info = summarizeNew(f);
  const done = doneCount(f), tot = totalItems(f);
  const pct = tot ? Math.round(done / tot * 100) : 0;
  const when = state.lastLoadAt ? fmtTime(state.lastLoadAt) : "";
  const newChip = f.baseline
    ? `<span class="chip">Baseline · ${f.r.records.toLocaleString()} records</span>`
    : (info.newCount
        ? `<span class="chip new">New since ${when}: ${info.newCount.toLocaleString()}</span>`
        : `<span class="chip">No new records since ${when}</span>`);
  const remChip = (!f.baseline && info.removed) ? `<span class="chip warn">Removed: ${info.removed.toLocaleString()}</span>` : "";
  const unmatched = f.r.unmatched.length
    ? `<div class="banner">Unmatched CableIDs: ${f.r.unmatched.length.toLocaleString()}</div>` : "";

  let table = `<div class="section-hd"><h2>Combos</h2><span class="meta">${f.r.combos.length} groups</span></div>
    <table class="grid"><thead><tr><th>Path-Conduit</th><th>Records</th><th>A0X</th></tr></thead><tbody>`;
  for(const c of f.r.combos){
    const isNew = info.newCombos.has(c.pc);
    const ahtml = c.a0x.map(x => {
      const n = info.counts[cid(c.pc, x.a)] || 0;
      return `<span class="mini${n ? " is-new" : ""}">${esc(x.a)} ${x.n}${n ? ` · ${n} new` : ""}</span>`;
    }).join(" ");
    table += `<tr data-jump="${esc(c.pc)}"><td class="pc">${esc(c.pc)}${isNew ? ` <span class="badge">New</span>` : ""}</td><td>${c.records}</td><td>${ahtml}</td></tr>`;
  }
  table += `</tbody></table>`;

  let lists = `<div class="section-hd"><h2>Checklist</h2><span class="meta">${done} / ${tot} done</span></div>`;
  for(const c of f.r.combos){
    const folded = !!state.folds[c.pc];
    const isNewC = info.newCombos.has(c.pc);
    const newInC = c.a0x.reduce((n, x) => n + (info.counts[cid(c.pc, x.a)] || 0), 0);
    const cd = comboDone(c);
    const qHit = !q || c.pc.toLowerCase().includes(q) || c.a0x.some(x => x.a.toLowerCase().includes(q));
    const cls = ["combo", folded ? "collapsed" : "", isNewC || newInC ? "has-new" : "", cd ? "done" : "", qHit ? "" : "filtered-out"].filter(Boolean).join(" ");
    lists += `<section class="${cls}" data-pc="${esc(c.pc)}" id="combo-${esc(c.pc)}">
      <div class="combo-hd">
        <button type="button" class="foldbtn" data-fold="${esc(c.pc)}" aria-label="Fold ${esc(c.pc)}">${folded ? "▸" : "▾"}</button>
        <div class="grow"><h3>${esc(c.pc)}${isNewC ? ` <span class="badge">New</span>` : ""}</h3>
          <div class="sub">${c.records.toLocaleString()} records${newInC ? ` · ${newInC} new` : ""}</div></div>
        <span class="combo-prog">${c.a0x.filter(x => itemChecked(c.pc, x.a)).length}/${c.a0x.length}</span>
      </div>`;
    if(!folded){
      lists += `<ul class="ck">`;
      for(const x of c.a0x){
        const id = cid(c.pc, x.a);
        const on = itemChecked(c.pc, x.a);
        const nNew = info.counts[id] || 0;
        const hit = !q || c.pc.toLowerCase().includes(q) || x.a.toLowerCase().includes(q);
        const cur = state.cursor === id ? "on" : "";
        lists += `<li class="${[on?"done":"", nNew?"has-new":"", cur, hit?"":"filtered-out"].filter(Boolean).join(" ")}" data-id="${esc(id)}">
          <label><input type="checkbox" data-check="${esc(id)}" ${on?"checked":""}>
            <span class="pl">${esc(x.a)} <small>${x.n} record${x.n===1?"":"s"}</small></span>
            ${nNew ? `<span class="badge">New ${nNew}</span>` : ""}
            <button type="button" class="btn copy-one" data-copy="${esc(c.pc)} ${esc(x.a)}">Copy</button>
          </label>
        </li>`;
      }
      lists += `</ul>`;
    }
    lists += `</section>`;
  }

  body.innerHTML = `
    <div class="chips">
      <span class="chip">${esc(f.name)}</span>
      <span class="chip">${f.r.records.toLocaleString()} records</span>
      ${newChip}${remChip}
    </div>
    <div class="progwrap"><div class="progbar"><i style="width:${pct}%"></i></div>
      <div class="progmeta"><span>${done} of ${tot} A0X checked</span><span>${pct}%</span></div></div>
    ${unmatched}
    ${table}
    ${lists}`;
  updateChrome();
}

function updateChrome(){
  const f = current();
  const tb = $("#toolbar");
  if(!f){ tb.hidden = true; document.body.classList.remove("hide-done","show-new"); return; }
  tb.hidden = false;
  document.body.classList.toggle("hide-done", state.hideDone);
  document.body.classList.toggle("show-new", state.showNewOnly);
  $("#hideDoneBtn").classList.toggle("primary", state.hideDone);
  $("#showNewBtn").classList.toggle("primary", state.showNewOnly);
  $("#showNewBtn").hidden = f.baseline || summarizeNew(f).newCount === 0;
  $("#markSeenBtn").hidden = f.baseline || summarizeNew(f).newCount === 0;
  $("#fileLabel").textContent = f.name;
}

function bindDrop(el){
  if(!el || el._bound) return;
  el._bound = true;
  el.addEventListener("dragover", e => { e.preventDefault(); el.classList.add("on"); });
  el.addEventListener("dragleave", () => el.classList.remove("on"));
  el.addEventListener("drop", e => {
    e.preventDefault(); el.classList.remove("on");
    const file = [...(e.dataTransfer?.files || [])].find(f => /\.xml$/i.test(f.name) || f.type.includes("xml")) || e.dataTransfer?.files?.[0];
    if(file) readFile(file);
  });
  el.addEventListener("click", () => openPicker());
  el.addEventListener("keydown", e => { if(e.key === "Enter" || e.key === " ") { e.preventDefault(); openPicker(); } });
}

function openPicker(){ $("#fileInput").click(); }

function visibleItems(){
  return $$(".ck li").filter(li => li.offsetParent !== null);
}
function moveCursor(dir){
  const items = visibleItems();
  if(!items.length) return;
  let i = items.findIndex(li => li.dataset.id === state.cursor);
  i = i < 0 ? (dir > 0 ? 0 : items.length - 1) : Math.max(0, Math.min(items.length - 1, i + dir));
  state.cursor = items[i].dataset.id;
  $$(".ck li").forEach(li => li.classList.toggle("on", li.dataset.id === state.cursor));
  items[i].scrollIntoView({ block: "nearest" });
}
function toggleCursor(){
  if(!state.cursor) { moveCursor(1); if(!state.cursor) return; }
  const [pc, a] = state.cursor.split("|");
  setChecked(pc, a, !itemChecked(pc, a));
  render();
}

function confirmUncheckAll(){
  if(!current()) return;
  if(!window.confirm("Uncheck every A0X in this file?")) return;
  state.checks = Object.create(null);
  render();
  toast("All unchecked");
}

function initApp(){
  if(IS_TAURI) document.documentElement.classList.add("app");

  $("#openBtn").addEventListener("click", openPicker);
  $("#fileInput").addEventListener("change", e => {
    const file = e.target.files && e.target.files[0];
    if(file) readFile(file);
    e.target.value = "";
  });
  $("#q").addEventListener("input", e => { state.query = e.target.value; render(); });
  $("#hideDoneBtn").addEventListener("click", () => { state.hideDone = !state.hideDone; updateChrome(); });
  $("#showNewBtn").addEventListener("click", () => { state.showNewOnly = !state.showNewOnly; updateChrome(); });
  $("#markSeenBtn").addEventListener("click", () => {
    const n = markAllSeen();
    state.showNewOnly = false;
    render();
    toast(n ? `Marked ${n} as seen` : "Already seen");
  });
  $("#clearBtn").addEventListener("click", () => {
    if(!window.confirm("Clear this session? The file, checkmarks, and seen records will be forgotten.")) return;
    clearSession();
    render();
    toast("Session cleared");
  });
  $("#exportBtn").addEventListener("click", e => {
    e.stopPropagation();
    state.exportOpen = !state.exportOpen;
    $("#exportMenu").hidden = !state.exportOpen;
  });
  $("#exportCsv").addEventListener("click", () => { state.exportOpen = false; $("#exportMenu").hidden = true; downloadCSV(); });
  $("#exportCopy").addEventListener("click", () => { state.exportOpen = false; $("#exportMenu").hidden = true; exportTSV(); });
  $("#exportPrint").addEventListener("click", () => { state.exportOpen = false; $("#exportMenu").hidden = true; window.print(); });
  $("#helpBtn").addEventListener("click", () => $("#help").classList.add("on"));
  $("#helpClose").addEventListener("click", () => $("#help").classList.remove("on"));
  $("#help").addEventListener("click", e => { if(e.target.id === "help") $("#help").classList.remove("on"); });

  document.addEventListener("click", e => {
    if(state.exportOpen && !e.target.closest(".menu")){
      state.exportOpen = false;
      $("#exportMenu").hidden = true;
    }
  });

  $("#workspace").addEventListener("change", e => {
    const id = e.target.getAttribute("data-check");
    if(!id) return;
    const [pc, a] = id.split("|");
    setChecked(pc, a, e.target.checked);
    render();
  });
  $("#workspace").addEventListener("click", e => {
    const fold = e.target.closest("[data-fold]");
    if(fold){
      const pc = fold.getAttribute("data-fold");
      state.folds[pc] = !state.folds[pc];
      render();
      return;
    }
    const copy = e.target.closest("[data-copy]");
    if(copy){
      e.preventDefault();
      copyText(copy.getAttribute("data-copy")).then(ok => toast(ok ? "Copied" : "Copy failed"));
      return;
    }
    const jump = e.target.closest("[data-jump]");
    if(jump){
      const el = document.getElementById("combo-" + jump.getAttribute("data-jump"));
      el?.scrollIntoView({ block: "start" });
    }
  });

  document.addEventListener("keydown", e => {
    if(e.key === "Escape"){
      $("#help").classList.remove("on");
      state.exportOpen = false;
      $("#exportMenu").hidden = true;
      return;
    }
    if(e.key === "?" && !typingInField()){ e.preventDefault(); $("#help").classList.toggle("on"); return; }
    if(e.key === "/" && !typingInField()){ e.preventDefault(); $("#q").focus(); return; }
    if(typingInField()) return;
    if(e.key === "o" && !e.metaKey && !e.ctrlKey){ e.preventDefault(); openPicker(); }
    if(e.key === "j") moveCursor(1);
    if(e.key === "k") moveCursor(-1);
    if(e.key === "x" || e.key === " ") { e.preventDefault(); toggleCursor(); }
  });

  document.addEventListener("dragover", e => { e.preventDefault(); $("#overlay").classList.add("on"); });
  document.addEventListener("dragleave", e => { if(e.target === document.documentElement || e.relatedTarget === null) $("#overlay").classList.remove("on"); });
  document.addEventListener("drop", e => {
    e.preventDefault();
    $("#overlay").classList.remove("on");
    const file = [...(e.dataTransfer?.files || [])].find(f => /\.xml$/i.test(f.name) || f.type.includes("xml")) || e.dataTransfer?.files?.[0];
    if(file) readFile(file);
  });

  bindTitlebar();
  render();
}

function bindTitlebar(){
  const pin = $("#pinBtn"), min = $("#minBtn"), close = $("#closeBtn");
  if(!IS_TAURI){
    pin?.addEventListener("click", () => toast("Pin is available in the desktop app"));
    return;
  }
  const getWin = async () => {
    const w = window.__TAURI__ && window.__TAURI__.window;
    if(w && w.getCurrentWindow) return w.getCurrentWindow();
    if(w && w.getCurrent) return w.getCurrent();
    return null;
  };
  pin?.addEventListener("click", async () => {
    try{
      const win = await getWin();
      if(!win) return;
      const on = await win.isAlwaysOnTop();
      await win.setAlwaysOnTop(!on);
      pin.classList.toggle("on", !on);
      pin.setAttribute("aria-pressed", String(!on));
    }catch(err){ toast("Could not pin"); }
  });
  min?.addEventListener("click", async () => { try{ (await getWin())?.minimize(); }catch(_){ } });
  close?.addEventListener("click", async () => { try{ (await getWin())?.close(); }catch(_){ window.close(); } });
}

if(typeof document !== "undefined"){
  if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", initApp);
  else initApp();
}

if(typeof module !== "undefined"){
  module.exports = { extract, indexRecords, recordKey, RE, ingestFile, clearSession, markAllSeen, summarizeNew, state, toCSV, COLS };
}
