// Syllabus Tracker — app logic (vanilla JS, no build step)

const STORAGE_KEY = "syllabusTrackerV1";
const TIER_KEYS = Object.keys(DATA);

/**
 * state.checked[topicId]   = "YYYY-MM-DD" (date it was marked done)
 * state.resources[topicId] = [{ id, name, url, type }]  — type: "learning" | "test" | "reference"
 */
let state = { checked: {}, resources: {} };
try {
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  if (saved && typeof saved === "object") {
    state.checked = saved.checked || {};
    state.resources = saved.resources || {};
  }
} catch (e) { /* ignore corrupt storage */ }

function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) {}
}

function fmtDate(d) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, "0"), day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function todayStr() { return fmtDate(new Date()); }

function topicId(tierKey, si, ti) { return `${tierKey}::${si}::${ti}`; }

function isDone(id) { return !!state.checked[id]; }

function setDone(id, done) {
  if (done) state.checked[id] = todayStr();
  else delete state.checked[id];
  save();
}

/* ---------- Resources (per-topic learning links) ---------- */
const RESOURCE_TYPES = {
  learning: "Learn",
  test: "Test",
  reference: "Ref",
};
const FALLBACK_ICON = "data:image/svg+xml," + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" rx="4" fill="#e6e6e6"/><path d="M6.2 9.8 9.8 6.2M7 5.6H5.6a2 2 0 0 0-2 2V9m9.8-3v1.4a2 2 0 0 1-2 2H9" stroke="#9a9a9a" stroke-width="1.1" stroke-linecap="round" fill="none"/></svg>'
);

function genId() { return "r" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

function getResources(id) { return state.resources[id] || []; }

function addResource(id, { name, url, type }) {
  const list = getResources(id).slice();
  list.push({ id: genId(), name, url, type });
  state.resources[id] = list;
  save();
}

function removeResource(id, resId) {
  if (!state.resources[id]) return;
  const list = state.resources[id].filter(r => r.id !== resId);
  if (list.length) state.resources[id] = list; else delete state.resources[id];
  save();
}

function safeHostname(url) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch (e) { return null; }
}

function faviconFor(url) {
  const host = safeHostname(url);
  return host ? `https://www.google.com/s2/favicons?sz=32&domain=${host}` : FALLBACK_ICON;
}

/* ---------- Flatten all topics for global stats/search ---------- */
function allTopics() {
  const out = [];
  TIER_KEYS.forEach(tk => {
    DATA[tk].sections.forEach((sec, si) => {
      sec.topics.forEach((tp, ti) => {
        out.push({ id: topicId(tk, si, ti), tierKey: tk, tierLabel: DATA[tk].label, sectionIdx: si, sectionName: sec.name, topicIdx: ti, text: tp.t, related: !!tp.r });
      });
    });
  });
  return out;
}
const TOPICS = allTopics();

/* ---------- Analytics helpers ---------- */
function dailyCounts() {
  const counts = {};
  Object.values(state.checked).forEach(date => { counts[date] = (counts[date] || 0) + 1; });
  return counts;
}

function computeStreaks() {
  const counts = dailyCounts();
  const dates = Object.keys(counts).filter(d => counts[d] > 0).sort();
  if (!dates.length) return { current: 0, longest: 0 };

  let longest = 1, run = 1;
  for (let i = 1; i < dates.length; i++) {
    const prev = new Date(dates[i - 1] + "T00:00:00");
    const cur = new Date(dates[i] + "T00:00:00");
    const diff = Math.round((cur - prev) / 86400000);
    run = diff === 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
  }

  const today = new Date();
  let cursor = new Date(today);
  if (!(counts[fmtDate(cursor)] > 0)) cursor.setDate(cursor.getDate() - 1);
  let current = 0;
  while (counts[fmtDate(cursor)] > 0) {
    current++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return { current, longest };
}

function paceEstimate(totalDone, totalTopics) {
  const counts = dailyCounts();
  let last7 = 0;
  const d = new Date();
  for (let i = 0; i < 7; i++) {
    last7 += counts[fmtDate(d)] || 0;
    d.setDate(d.getDate() - 1);
  }
  const pace = last7 / 7;
  const remaining = totalTopics - totalDone;
  if (pace <= 0 || remaining <= 0) return { pace, etaDays: null, remaining };
  return { pace, etaDays: Math.ceil(remaining / pace), remaining };
}

/* ---------- View state ---------- */
let activeView = "dashboard";
let searchQuery = "";
const openSections = {}; // key: `${tierKey}::${si}` -> bool

/* ---------- DOM refs ---------- */
const viewEl = document.getElementById("view");
const viewTitle = document.getElementById("viewTitle");
const viewSubtitle = document.getElementById("viewSubtitle");
const searchInput = document.getElementById("searchInput");
const navEl = document.getElementById("nav");

/* ---------- Nav ---------- */
navEl.querySelectorAll(".nav-item").forEach(btn => {
  btn.addEventListener("click", () => {
    activeView = btn.dataset.view;
    searchQuery = "";
    searchInput.value = "";
    render();
  });
});

searchInput.addEventListener("input", () => {
  searchQuery = searchInput.value.trim().toLowerCase();
  renderView();
});
document.addEventListener("keydown", e => {
  if (e.key === "/" && document.activeElement !== searchInput) {
    e.preventDefault();
    searchInput.focus();
  } else if (e.key === "Escape" && document.activeElement === searchInput) {
    searchInput.value = "";
    searchQuery = "";
    searchInput.blur();
    renderView();
  }
});

/* ---------- Rendering ---------- */
function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

function render() {
  navEl.querySelectorAll(".nav-item").forEach(b => b.classList.toggle("active", b.dataset.view === activeView));
  renderView();
  renderSidebarRing();
}

function renderSidebarRing() {
  const total = TOPICS.length;
  const done = TOPICS.filter(t => isDone(t.id)).length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const c = 2 * Math.PI * 15.5;
  document.getElementById("sidebarRingFill").style.strokeDasharray = c.toFixed(1);
  document.getElementById("sidebarRingFill").style.strokeDashoffset = (c - (pct / 100) * c).toFixed(1);
  document.getElementById("sidebarPct").textContent = pct + "%";
}

function renderView() {
  if (searchQuery) { viewTitle.textContent = "Search"; viewSubtitle.textContent = `Results for "${searchQuery}"`; renderSearch(); return; }
  if (activeView === "dashboard") { viewTitle.textContent = "Dashboard"; viewSubtitle.textContent = "Your study progress at a glance"; renderDashboard(); return; }
  const tier = DATA[activeView];
  viewTitle.textContent = tier.label;
  viewSubtitle.textContent = `${tier.sections.reduce((n, s) => n + s.topics.length, 0)} topics across ${tier.sections.length} sections`;
  renderTier(activeView);
}

/* ---------- Dashboard ---------- */
function renderDashboard() {
  const total = TOPICS.length;
  const done = TOPICS.filter(t => isDone(t.id)).length;
  const core = TOPICS.filter(t => !t.related);
  const coreDone = core.filter(t => isDone(t.id)).length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const { current, longest } = computeStreaks();
  const { pace, etaDays } = paceEstimate(done, total);

  viewEl.innerHTML = "";

  // Stat cards
  const grid = el("div", "stat-grid");
  grid.appendChild(statCard("Overall completion", pct + "%", `${done} / ${total} topics`, "accent"));
  grid.appendChild(statCard("Core syllabus", `${coreDone}/${core.length}`, "excludes foundational topics"));
  grid.appendChild(statCard("Current streak", current + (current === 1 ? " day" : " days"), longest ? `longest: ${longest} days` : "start today", current > 0 ? "good" : ""));
  grid.appendChild(statCard("Study pace", pace > 0 ? pace.toFixed(1) + "/day" : "—", etaDays ? `~${etaDays} days to finish` : "avg. last 7 days"));
  viewEl.appendChild(grid);

  // Hero row: ring + heatmap
  const heroRow = el("div", "hero-row");

  const ringPanel = el("div", "panel");
  ringPanel.innerHTML = `<div class="panel-head"><h2>Completion</h2></div>`;
  const heroInner = el("div", "ring-hero");
  const c = 2 * Math.PI * 42;
  heroInner.innerHTML = `
    <div class="ring-hero-num">
      <svg width="96" height="96" viewBox="0 0 96 96">
        <circle cx="48" cy="48" r="42" fill="none" stroke="var(--border)" stroke-width="8"/>
        <circle cx="48" cy="48" r="42" fill="none" stroke="var(--accent)" stroke-width="8" stroke-linecap="round"
          stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${(c - (pct / 100) * c).toFixed(1)}"/>
      </svg>
      <div class="pct mono">${pct}%</div>
    </div>
    <div class="ring-hero-text">
      <div class="t">${done} of ${total} topics done</div>
      <div class="d">${total - done} topics remaining</div>
      <div class="d">${core.length - coreDone} core topics left · ${TOPICS.length - core.length - (done - coreDone)} foundational left</div>
    </div>`;
  ringPanel.appendChild(heroInner);
  heroRow.appendChild(ringPanel);

  const hmPanel = el("div", "panel");
  hmPanel.innerHTML = `<div class="panel-head"><h2>Activity</h2><span class="dim mono">last 91 days</span></div>`;
  hmPanel.appendChild(buildHeatmap());
  heroRow.appendChild(hmPanel);

  viewEl.appendChild(heroRow);

  // Per-tier / per-subject progress
  TIER_KEYS.forEach(tk => {
    const tier = DATA[tk];
    const tierTotal = tier.sections.reduce((n, s) => n + s.topics.length, 0);
    const tierDone = tier.sections.reduce((n, s, si) => n + s.topics.filter((tp, ti) => isDone(topicId(tk, si, ti))).length, 0);
    const panel = el("div", "panel");
    const head = el("div", "panel-head");
    head.innerHTML = `<h2>${tier.label}</h2><span class="dim mono">${tierDone}/${tierTotal}</span>`;
    panel.appendChild(head);
    tier.sections.forEach((sec, si) => {
      const secDone = sec.topics.filter((tp, ti) => isDone(topicId(tk, si, ti))).length;
      const secPct = sec.topics.length ? Math.round((secDone / sec.topics.length) * 100) : 0;
      const row = el("div", "progress-row");
      row.innerHTML = `
        <span class="name">${sec.name}</span>
        <span class="track"><span class="fill" style="width:${secPct}%"></span></span>
        <span class="count mono dim">${secDone}/${sec.topics.length}</span>`;
      panel.appendChild(row);
    });
    viewEl.appendChild(panel);
  });
}

function statCard(label, value, sub, tone) {
  const c = el("div", "stat-card");
  c.innerHTML = `<div class="lbl">${label}</div><div class="val mono${tone ? " " + tone : ""}">${value}</div><div class="sub">${sub}</div>`;
  return c;
}

function buildHeatmap() {
  const wrap = el("div", "heatmap-wrap");
  const grid = el("div", "heatmap");
  const counts = dailyCounts();

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Start the grid on the Sunday at/before 91 days ago, end on the Saturday at/after today —
  // this keeps every column a full Sun–Sat week, which lines up with grid-auto-flow:column.
  const start = new Date(today);
  start.setDate(start.getDate() - 90);
  start.setDate(start.getDate() - start.getDay());
  const end = new Date(today);
  end.setDate(end.getDate() + (6 - end.getDay()));

  const cursor = new Date(start);
  while (cursor <= end) {
    const ds = fmtDate(cursor);
    const inRange = cursor <= today;
    const n = inRange ? (counts[ds] || 0) : 0;
    let level = 0;
    if (n >= 5) level = 4; else if (n >= 3) level = 3; else if (n >= 1) level = 2; else level = 0;

    const d = el("div", "hm-cell");
    if (inRange) {
      d.dataset.level = level;
      d.title = `${ds}: ${n} topic${n === 1 ? "" : "s"}`;
    } else {
      d.style.visibility = "hidden";
    }
    grid.appendChild(d);
    cursor.setDate(cursor.getDate() + 1);
  }

  wrap.appendChild(grid);
  const legend = el("div", "heatmap-legend", `
    <span>Less</span>
    <span class="hm-cell" data-level="0"></span>
    <span class="hm-cell" data-level="2"></span>
    <span class="hm-cell" data-level="3"></span>
    <span class="hm-cell" data-level="4"></span>
    <span>More</span>`);
  wrap.appendChild(legend);
  return wrap;
}

/* ---------- Tier view ---------- */
function renderTier(tierKey) {
  const tier = DATA[tierKey];
  viewEl.innerHTML = "";

  const pattern = el("div", "pattern");
  tier.pattern.forEach(([k, v]) => {
    pattern.appendChild(el("div", "cell", `<div class="k">${k}</div><div class="v">${v}</div>`));
  });
  viewEl.appendChild(pattern);

  viewEl.appendChild(el("div", "legend", `
    <span><span class="dot"></span> Core syllabus topic</span>
    <span><span class="dot dash"></span> Foundational / related — not asked directly, but needed to understand a core topic</span>`));

  tier.sections.forEach((sec, si) => {
    viewEl.appendChild(buildSection(tierKey, sec, si));
  });
}

function buildSection(tierKey, sec, si) {
  const key = `${tierKey}::${si}`;
  if (!(key in openSections)) openSections[key] = si === 0;

  const doneCount = sec.topics.filter((tp, ti) => isDone(topicId(tierKey, si, ti))).length;
  const pct = sec.topics.length ? Math.round((doneCount / sec.topics.length) * 100) : 0;

  const wrap = el("div", "section" + (openSections[key] ? " open" : ""));

  const head = el("div", "section-head");
  head.tabIndex = 0;
  head.setAttribute("role", "button");
  head.innerHTML = `
    <svg class="chev" viewBox="0 0 16 16" fill="none"><path d="M6 3l5 5-5 5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
    <h3>${sec.name}</h3>
    <span class="meta">${doneCount}/${sec.topics.length} · ${sec.meta}</span>`;
  const toggle = () => { openSections[key] = !openSections[key]; wrap.classList.toggle("open"); };
  head.addEventListener("click", toggle);
  head.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); } });
  wrap.appendChild(head);

  const barTrack = el("div", "bar-track", `<div class="bar-fill" style="width:${pct}%"></div>`);
  wrap.appendChild(barTrack);

  const topicsEl = el("div", "topics");
  sec.topics.forEach((tp, ti) => topicsEl.appendChild(buildTopicRow(tierKey, si, ti, tp)));
  wrap.appendChild(topicsEl);

  return wrap;
}

function buildTopicRow(tierKey, si, ti, tp) {
  const id = topicId(tierKey, si, ti);
  const done = isDone(id);
  const cbId = "cb-" + id;
  const row = el("div", "topic-row" + (done ? " done" : ""));

  const cb = document.createElement("input");
  cb.type = "checkbox";
  cb.id = cbId;
  cb.checked = done;
  cb.addEventListener("change", () => {
    setDone(id, cb.checked);
    row.classList.toggle("done", cb.checked);
    dateEl.textContent = cb.checked ? `done ${state.checked[id]}` : "";
    refreshSectionChrome(tierKey, si);
    renderSidebarRing();
  });
  row.appendChild(cb);

  const main = el("div", "topic-main");

  const textRow = el("div", "topic-text-row");
  const label = document.createElement("label");
  label.className = "topic-text";
  label.htmlFor = cbId;
  label.textContent = tp.t;
  textRow.appendChild(label);
  if (tp.r) textRow.appendChild(el("span", "tag", "foundational"));
  main.appendChild(textRow);

  const dateEl = el("span", "done-date", done ? `done ${state.checked[id]}` : "");
  main.appendChild(dateEl);

  main.appendChild(buildResourceArea(id));

  row.appendChild(main);
  return row;
}

/* ---------- Resource area (attach learning/test/reference links to a topic) ---------- */
function buildResourceArea(id) {
  const wrap = el("div", "resources");
  wrap.dataset.resourcesFor = id;

  const list = getResources(id);
  if (list.length) {
    const chips = el("div", "res-chips");
    list.forEach(r => chips.appendChild(buildResourceChip(id, r)));
    wrap.appendChild(chips);
  }

  const addBtn = el("button", "res-add-btn",
    '<svg viewBox="0 0 16 16" fill="none"><path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg><span>Add resource</span>');
  addBtn.type = "button";
  addBtn.addEventListener("click", e => {
    e.preventDefault();
    const openForm = wrap.querySelector(".res-form");
    if (openForm) { openForm.remove(); addBtn.classList.remove("open"); return; }
    addBtn.classList.add("open");
    wrap.appendChild(buildResourceForm(id));
  });
  wrap.appendChild(addBtn);

  return wrap;
}

function refreshResourceArea(id) {
  document.querySelectorAll(`[data-resources-for="${id}"]`).forEach(node => {
    node.replaceWith(buildResourceArea(id));
  });
}

function buildResourceChip(id, r) {
  const chip = el("div", "res-chip");

  const a = document.createElement("a");
  a.className = "res-chip-link";
  a.href = r.url;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  a.title = r.url;
  const img = document.createElement("img");
  img.src = faviconFor(r.url);
  img.width = 14; img.height = 14; img.alt = "";
  img.addEventListener("error", () => { img.src = FALLBACK_ICON; }, { once: true });
  a.appendChild(img);
  a.appendChild(el("span", "res-name", escapeHtml(r.name)));
  chip.appendChild(a);

  chip.appendChild(el("span", `res-tag ${r.type}`, RESOURCE_TYPES[r.type] || "Link"));

  const del = document.createElement("button");
  del.type = "button";
  del.className = "res-del";
  del.title = "Remove resource";
  del.textContent = "×";
  del.addEventListener("click", e => {
    e.preventDefault();
    e.stopPropagation();
    removeResource(id, r.id);
    refreshResourceArea(id);
  });
  chip.appendChild(del);

  return chip;
}

function buildResourceForm(id) {
  const form = document.createElement("form");
  form.className = "res-form";
  form.innerHTML = `
    <input class="res-input res-name-input" type="text" placeholder="Resource name" maxlength="60" required />
    <input class="res-input res-url-input" type="text" placeholder="https://…" required />
    <select class="res-input res-type-input">
      <option value="learning">Learning</option>
      <option value="test">Test</option>
      <option value="reference">Reference</option>
    </select>
    <button type="submit" class="res-save">Add</button>
  `;
  form.addEventListener("click", e => e.stopPropagation());
  form.addEventListener("submit", e => {
    e.preventDefault();
    const name = form.querySelector(".res-name-input").value.trim();
    let url = form.querySelector(".res-url-input").value.trim();
    const type = form.querySelector(".res-type-input").value;
    if (!name || !url) return;
    if (!/^https?:\/\//i.test(url)) url = "https://" + url;
    addResource(id, { name, url, type });
    refreshResourceArea(id);
  });
  setTimeout(() => { const n = form.querySelector(".res-name-input"); if (n) n.focus(); }, 0);
  return form;
}

function refreshSectionChrome(tierKey, si) {
  // Recompute the header count + bar without a full re-render (keeps scroll position)
  const sec = DATA[tierKey].sections[si];
  const doneCount = sec.topics.filter((tp, ti) => isDone(topicId(tierKey, si, ti))).length;
  const pct = sec.topics.length ? Math.round((doneCount / sec.topics.length) * 100) : 0;
  const sections = viewEl.querySelectorAll(".section");
  const idx = si; // sections rendered in order
  const wrap = sections[idx];
  if (!wrap) return;
  wrap.querySelector(".meta").textContent = `${doneCount}/${sec.topics.length} · ${sec.meta}`;
  wrap.querySelector(".bar-fill").style.width = pct + "%";
}

/* ---------- Search ---------- */
function renderSearch() {
  viewEl.innerHTML = "";
  const q = searchQuery;
  const matches = TOPICS.filter(t => t.text.toLowerCase().includes(q) || t.sectionName.toLowerCase().includes(q));

  if (!matches.length) {
    viewEl.appendChild(el("div", "empty-state", `No topics match "<strong>${escapeHtml(searchQuery)}</strong>"`));
    return;
  }

  const grouped = {};
  matches.forEach(m => {
    const gk = `${m.tierKey}::${m.sectionIdx}`;
    if (!grouped[gk]) grouped[gk] = { tierKey: m.tierKey, tierLabel: m.tierLabel, sectionName: m.sectionName, items: [] };
    grouped[gk].items.push(m);
  });

  Object.values(grouped).forEach(group => {
    const panel = el("div", "panel");
    panel.innerHTML = `<div class="panel-head"><h2>${group.sectionName}</h2><span class="dim">${group.tierLabel}</span></div>`;
    group.items.forEach(m => {
      const row = buildTopicRow(m.tierKey, m.sectionIdx, m.topicIdx, { t: m.text, r: m.related ? 1 : 0 });
      panel.appendChild(row);
    });
    viewEl.appendChild(panel);
  });
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/* ---------- Init ---------- */
render();
