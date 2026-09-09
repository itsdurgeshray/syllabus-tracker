// Syllabus Tracker - app logic (vanilla JS, no build step)

const STORAGE_KEY = "syllabusTrackerV1";
const TIER_KEYS = Object.keys(DATA);

/**
 * state.progress[topicId]  = "in_progress" | "done" (absent = not started)
 * state.checked[topicId]   = "YYYY-MM-DD" (date it was marked done)
 * state.resources[topicId] = [{ id, name, url, type }], type: "learning" | "test" | "reference"
 * state.status[topicId]    = "revise" | "doubt" | "skip"
 * state.notes[topicId]     = HTML string from the notes editor
 */
let state = { progress: {}, checked: {}, resources: {}, status: {}, notes: {} };

function applyState(obj) {
  state.progress = (obj && obj.progress) || {};
  state.checked = (obj && obj.checked) || {};
  state.resources = (obj && obj.resources) || {};
  state.status = (obj && obj.status) || {};
  state.notes = (obj && obj.notes) || {};
  // Migrate the old "unclear" status label to "doubt".
  Object.keys(state.status).forEach(id => {
    if (state.status[id] === "unclear") state.status[id] = "doubt";
  });
  // Backfill progress for topics checked done before this feature existed.
  Object.keys(state.checked).forEach(id => {
    if (!state.progress[id]) state.progress[id] = "done";
  });
}

try {
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  if (saved && typeof saved === "object") applyState(saved);
} catch (e) { /* ignore corrupt storage */ }

function persistLocal() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) {}
}

function save() {
  persistLocal();
  if (window.CloudSync) window.CloudSync.pushState(state);
}

function fmtDate(d) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, "0"), day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function todayStr() { return fmtDate(new Date()); }

function topicId(tierKey, si, ti) { return `${tierKey}::${si}::${ti}`; }

/* ---------- Progress status (Not started / In progress / Done) ---------- */
const PROGRESS_STATES = [
  { key: "todo", label: "Not started", color: "var(--ink-faint)" },
  { key: "in_progress", label: "In progress", color: "var(--accent)" },
  { key: "done", label: "Done", color: "var(--good)" },
];

function getProgress(id) { return state.progress[id] || "todo"; }
function isDone(id) { return getProgress(id) === "done"; }
function isInProgress(id) { return getProgress(id) === "in_progress"; }

function setProgress(id, key) {
  if (key === "todo") delete state.progress[id];
  else state.progress[id] = key;

  if (key === "done") state.checked[id] = todayStr();
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

/* ---------- Status tags (revise / doubt / skip) ---------- */
const STATUS_TYPES = {
  revise: "Revise",
  doubt: "Doubt",
  skip: "Skip",
};

function getStatus(id) { return state.status[id] || null; }

function setStatus(id, key) {
  if (key) state.status[id] = key;
  else delete state.status[id];
  save();
}

/* ---------- Notes (Tiptap rich text) ---------- */
function getNote(id) { return state.notes[id] || ""; }

function setNote(id, html, plainText) {
  if (plainText && plainText.trim()) state.notes[id] = html;
  else delete state.notes[id];
  save();
}

function plainTextFrom(html) {
  const tmp = document.createElement("div");
  tmp.innerHTML = html;
  return (tmp.textContent || "").trim();
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
let sortMode = "default";
const openSections = {}; // key: `${tierKey}::${si}` -> bool

const SORT_MODES = {
  default: "Syllabus order",
  active: "In progress first",
  incomplete: "Not started first",
  complete: "Completed first",
  flagged: "Flagged first",
  az: "A to Z",
};

/** Indices into sec.topics, reordered for display - topic ids still use the original index. */
function sortedTopicIndices(tierKey, si, sec) {
  const idx = sec.topics.map((_, ti) => ti);
  if (sortMode === "default") return idx;

  const doneRank = ti => (isDone(topicId(tierKey, si, ti)) ? 1 : 0);
  const activeRank = ti => (isInProgress(topicId(tierKey, si, ti)) ? 0 : 1);
  const flagRank = ti => {
    const s = getStatus(topicId(tierKey, si, ti));
    return s === "revise" || s === "doubt" ? 0 : s === "skip" ? 2 : 1;
  };

  if (sortMode === "active") idx.sort((a, b) => activeRank(a) - activeRank(b));
  else if (sortMode === "incomplete") idx.sort((a, b) => doneRank(a) - doneRank(b));
  else if (sortMode === "complete") idx.sort((a, b) => doneRank(b) - doneRank(a));
  else if (sortMode === "flagged") idx.sort((a, b) => flagRank(a) - flagRank(b));
  else if (sortMode === "az") idx.sort((a, b) => sec.topics[a].t.localeCompare(sec.topics[b].t));
  return idx;
}

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
  const flagged = Object.values(state.status).filter(s => s === "revise" || s === "doubt").length;
  const inProgress = TOPICS.filter(t => isInProgress(t.id)).length;

  viewEl.innerHTML = "";

  // Stat cards
  const grid = el("div", "stat-grid");
  grid.appendChild(statCard("Overall completion", pct + "%", `${done} / ${total} topics`, "accent"));
  grid.appendChild(statCard("Core syllabus", `${coreDone}/${core.length}`, "excludes foundational topics"));
  grid.appendChild(statCard("In progress", String(inProgress), "currently studying", inProgress > 0 ? "accent" : ""));
  grid.appendChild(statCard("Current streak", current + (current === 1 ? " day" : " days"), longest ? `longest: ${longest} days` : "start today", current > 0 ? "good" : ""));
  grid.appendChild(statCard("Study pace", pace > 0 ? pace.toFixed(1) + "/day" : "-", etaDays ? `~${etaDays} days to finish` : "avg. last 7 days"));
  grid.appendChild(statCard("Needs attention", String(flagged), "marked revise / doubt", flagged > 0 ? "warn" : ""));
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
        <span class="track"><span class="fill" style="transform:scaleX(${secPct / 100})"></span></span>
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

  // Start the grid on the Sunday at/before 91 days ago, end on the Saturday at/after today -
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

  const toolsRow = el("div", "tools-row");
  toolsRow.appendChild(el("div", "legend", `
    <span><span class="dot"></span> Core syllabus topic</span>
    <span><span class="dot dash"></span> Foundational / related - not asked directly, but needed to understand a core topic</span>`));
  toolsRow.appendChild(buildSortControl(tierKey));
  viewEl.appendChild(toolsRow);

  tier.sections.forEach((sec, si) => {
    viewEl.appendChild(buildSection(tierKey, sec, si));
  });
}

function buildSortControl(tierKey) {
  const wrap = el("div", "sort-control");
  wrap.appendChild(el("label", null, "Sort"));

  const selectWrap = el("div", "select-wrap");
  const select = document.createElement("select");
  Object.keys(SORT_MODES).forEach(key => {
    const opt = document.createElement("option");
    opt.value = key;
    opt.textContent = SORT_MODES[key];
    if (key === sortMode) opt.selected = true;
    select.appendChild(opt);
  });
  select.addEventListener("change", () => {
    sortMode = select.value;
    renderTier(tierKey);
  });
  selectWrap.appendChild(select);
  wrap.appendChild(selectWrap);
  return wrap;
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
    <span class="meta">${sectionMetaText(sec, doneCount)}</span>`;
  const toggle = () => { openSections[key] = !openSections[key]; wrap.classList.toggle("open"); };
  head.addEventListener("click", toggle);
  head.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); } });
  wrap.appendChild(head);

  const barTrack = el("div", "bar-track", `<div class="bar-fill" style="transform:scaleX(${pct / 100})"></div>`);
  wrap.appendChild(barTrack);

  const topicsEl = el("div", "topics");
  sortedTopicIndices(tierKey, si, sec).forEach(ti => topicsEl.appendChild(buildTopicRow(tierKey, si, ti, sec.topics[ti])));
  wrap.appendChild(topicsEl);

  return wrap;
}

function buildTopicRow(tierKey, si, ti, tp) {
  const id = topicId(tierKey, si, ti);
  const done = isDone(id);
  const row = el("div", "topic-row" + (done ? " done" : "") + (isInProgress(id) ? " in-progress" : ""));

  const main = el("div", "topic-main");

  const textRow = el("div", "topic-text-row");
  const textMain = el("div", "topic-text-main");
  const label = el("span", "topic-text", tp.t);
  textMain.appendChild(label);
  textRow.appendChild(textMain);

  // All state indicators - progress, foundational flag, revise/doubt/skip - grouped as one badge cluster.
  const badges = el("div", "topic-badges");
  badges.appendChild(buildProgressControl(id, key => {
    row.classList.toggle("done", key === "done");
    row.classList.toggle("in-progress", key === "in_progress");
    dateEl.textContent = key === "done" ? `done ${state.checked[id]}` : "";
    refreshSectionChrome(tierKey, si);
    renderSidebarRing();
  }));
  if (tp.r) badges.appendChild(el("span", "tag", "foundational"));
  badges.appendChild(buildStatusRow(id));
  textRow.appendChild(badges);
  main.appendChild(textRow);

  const dateEl = el("span", "done-date", done ? `done ${state.checked[id]}` : "");
  main.appendChild(dateEl);

  const extras = el("div", "topic-extras");
  extras.appendChild(buildResourceArea(id));
  extras.appendChild(buildNotesArea(id));
  main.appendChild(extras);

  row.appendChild(main);
  return row;
}

/* ---------- Progress pill + dropdown menu (ClickUp-style) ---------- */
let closeOpenProgressMenu = null;

function buildProgressControl(id, onChange) {
  const wrap = el("div", "progress-control");
  const btn = document.createElement("button");
  btn.type = "button";
  renderProgressPill(btn, getProgress(id));

  btn.addEventListener("click", e => {
    e.stopPropagation();
    if (wrap.querySelector(".progress-menu")) { if (closeOpenProgressMenu) closeOpenProgressMenu(); return; }
    openProgressMenu(wrap, btn, id, onChange);
  });

  wrap.appendChild(btn);
  return wrap;
}

function renderProgressPill(btn, key) {
  const st = PROGRESS_STATES.find(s => s.key === key) || PROGRESS_STATES[0];
  btn.className = "progress-pill pp-" + st.key;
  btn.innerHTML = `<span class="progress-dot"></span><span class="progress-label">${st.label}</span>`;
}

function openProgressMenu(wrap, btn, id, onChange) {
  if (closeOpenProgressMenu) closeOpenProgressMenu();

  const menu = el("div", "progress-menu");
  PROGRESS_STATES.forEach(st => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "progress-menu-item" + (getProgress(id) === st.key ? " active" : "");
    item.innerHTML = `<span class="progress-dot pp-${st.key}"></span><span>${st.label}</span>`;
    item.addEventListener("click", e => {
      e.stopPropagation();
      setProgress(id, st.key);
      renderProgressPill(btn, st.key);
      closeMenu();
      onChange(st.key);
    });
    menu.appendChild(item);
  });
  wrap.appendChild(menu);

  function closeMenu() {
    menu.remove();
    document.removeEventListener("click", outsideHandler);
    document.removeEventListener("keydown", escHandler);
    closeOpenProgressMenu = null;
  }
  function outsideHandler(e) { if (!wrap.contains(e.target)) closeMenu(); }
  function escHandler(e) { if (e.key === "Escape") closeMenu(); }

  // Defer so the click that opened the menu doesn't immediately close it.
  setTimeout(() => {
    document.addEventListener("click", outsideHandler);
    document.addEventListener("keydown", escHandler);
  }, 0);

  closeOpenProgressMenu = closeMenu;
}

/* ---------- Status dropdown (revise / doubt / skip) ---------- */
function buildStatusRow(id) {
  const wrap = el("div", "status-row");
  const selectWrap = el("div", "status-select-wrap");

  const select = document.createElement("select");
  const current = getStatus(id) || "";
  select.className = "status-select" + (current ? " st-" + current : "");

  const opt0 = document.createElement("option");
  opt0.value = "";
  opt0.textContent = "No status";
  select.appendChild(opt0);

  Object.keys(STATUS_TYPES).forEach(key => {
    const opt = document.createElement("option");
    opt.value = key;
    opt.textContent = STATUS_TYPES[key];
    if (key === current) opt.selected = true;
    select.appendChild(opt);
  });

  select.addEventListener("change", () => {
    setStatus(id, select.value || null);
    select.className = "status-select" + (select.value ? " st-" + select.value : "");
  });

  selectWrap.appendChild(select);
  wrap.appendChild(selectWrap);
  return wrap;
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

/* ---------- Notes (Tiptap) ---------- */
const TOOL_ICONS = {
  list: '<svg viewBox="0 0 16 16" fill="none"><circle cx="2.3" cy="4" r="1" fill="currentColor"/><circle cx="2.3" cy="8" r="1" fill="currentColor"/><circle cx="2.3" cy="12" r="1" fill="currentColor"/><path d="M6 4h8M6 8h8M6 12h8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>',
  ordered: '<svg viewBox="0 0 16 16" fill="none"><rect x="1.3" y="3.2" width="2" height="2" rx="0.4" fill="currentColor"/><rect x="1.3" y="7.2" width="2" height="2" rx="0.4" fill="currentColor"/><rect x="1.3" y="11.2" width="2" height="2" rx="0.4" fill="currentColor"/><path d="M6 4h8M6 8h8M6 12h8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>',
  task: '<svg viewBox="0 0 16 16" fill="none"><rect x="1.5" y="2" width="5" height="5" rx="1" stroke="currentColor" stroke-width="1.3"/><path d="M2.7 4.5l0.9 0.9 1.8-1.8" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M9 4.5h5.5M1.5 11h5M9 11h5.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>',
  text: '<svg viewBox="0 0 16 16" fill="none"><path d="M3 4h10M8 4v9" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>',
  align: '<svg viewBox="0 0 16 16" fill="none"><path d="M2 3.5h12M2 7h8M2 10.5h12M2 14h8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>',
  link: '<svg viewBox="0 0 16 16" fill="none"><path d="M6.3 9.7l3.4-3.4M4.7 11.3l-1.4 1.4a2.5 2.5 0 0 1-3.5-3.5l1.4-1.4m7.6-2.9L10.3 3.4a2.5 2.5 0 0 1 3.5 3.5l-1.4 1.4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  image: '<svg viewBox="0 0 16 16" fill="none"><rect x="1.5" y="2.5" width="13" height="11" rx="1.5" stroke="currentColor" stroke-width="1.3"/><circle cx="5" cy="6" r="1" fill="currentColor"/><path d="M2.5 11l3.5-3.5L9 10l1.5-1.5 2.5 2.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  more: '<svg viewBox="0 0 16 16" fill="none"><circle cx="3" cy="8" r="1.2" fill="currentColor"/><circle cx="8" cy="8" r="1.2" fill="currentColor"/><circle cx="13" cy="8" r="1.2" fill="currentColor"/></svg>',
  caret: '<svg class="tool-caret" viewBox="0 0 10 6" fill="none"><path d="M1 1l4 4 4-4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

function buildNotesArea(id) {
  const wrap = el("div", "notes-area");
  wrap.dataset.notesFor = id;

  const noteHtml = getNote(id);
  const previewText = noteHtml ? plainTextFrom(noteHtml) : "";

  if (previewText) {
    wrap.appendChild(el("div", "notes-preview", escapeHtml(previewText.slice(0, 180)) + (previewText.length > 180 ? "…" : "")));
  }

  const toggleBtn = el("button", "notes-toggle-btn",
    '<svg viewBox="0 0 16 16" fill="none"><path d="M4 3h8a1 1 0 0 1 1 1v6.5L10 13H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M6 6.5h4M6 8.7h2.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>' +
    `<span>${previewText ? "Edit note" : "Add note"}</span>`);
  toggleBtn.type = "button";
  toggleBtn.addEventListener("click", () => {
    if (wrap.querySelector(".notes-editor-panel")) closeNotesEditor(id, wrap);
    else openNotesEditor(id, wrap);
  });
  wrap.appendChild(toggleBtn);

  return wrap;
}

function refreshNotesArea(id) {
  document.querySelectorAll(`[data-notes-for="${id}"]`).forEach(node => {
    node.replaceWith(buildNotesArea(id));
  });
}

let closeOpenToolMenu = null;

/** A toolbar button that opens a floating menu of choices (List type, Text style, Align...). */
function buildToolDropdown(editorElGetter, { icon, showCaret, cmds }) {
  const wrap = el("div", "tool-dropdown");
  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "notes-tool tool-dropdown-trigger";
  trigger.innerHTML = icon + (showCaret ? TOOL_ICONS.caret : "");
  trigger.addEventListener("mousedown", e => e.preventDefault());
  trigger.addEventListener("click", e => {
    e.stopPropagation();
    if (wrap.querySelector(".tool-menu")) { if (closeOpenToolMenu) closeOpenToolMenu(); return; }
    openMenu();
  });
  wrap.appendChild(trigger);

  function openMenu() {
    if (closeOpenToolMenu) closeOpenToolMenu();
    const editorEl = editorElGetter();
    const menu = el("div", "tool-menu");
    cmds.forEach(({ cmd, label, icon: itemIcon }) => {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "tool-menu-item" + (window.TiptapNotes && window.TiptapNotes.isActive(editorEl, cmd) ? " active" : "");
      item.innerHTML = (itemIcon || "") + `<span>${label}</span>`;
      item.addEventListener("mousedown", e => e.preventDefault());
      item.addEventListener("click", e => {
        e.stopPropagation();
        if (window.TiptapNotes) window.TiptapNotes.run(editorEl, cmd);
        closeMenu();
      });
      menu.appendChild(item);
    });
    wrap.appendChild(menu);
    function closeMenu() {
      menu.remove();
      document.removeEventListener("click", outsideHandler);
      closeOpenToolMenu = null;
    }
    function outsideHandler(e) { if (!wrap.contains(e.target)) closeMenu(); }
    setTimeout(() => document.addEventListener("click", outsideHandler), 0);
    closeOpenToolMenu = closeMenu;
  }

  wrap._refreshActive = () => {
    const editorEl = editorElGetter();
    trigger.classList.toggle("active", window.TiptapNotes && cmds.some(c => window.TiptapNotes.isActive(editorEl, c.cmd)));
  };
  return wrap;
}

/** The link toolbar button: opens a small popover with a URL field instead of a native prompt(). */
function buildLinkTool(editorElGetter) {
  const wrap = el("div", "tool-dropdown");
  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "notes-tool";
  trigger.innerHTML = TOOL_ICONS.link;
  trigger.title = "Link";
  trigger.addEventListener("mousedown", e => e.preventDefault());
  trigger.addEventListener("click", e => {
    e.stopPropagation();
    if (wrap.querySelector(".tool-menu")) { if (closeOpenToolMenu) closeOpenToolMenu(); return; }
    openPopover();
  });
  wrap.appendChild(trigger);

  function openPopover() {
    if (closeOpenToolMenu) closeOpenToolMenu();
    const editorEl = editorElGetter();
    const menu = el("div", "tool-menu tool-link-popover");
    const form = document.createElement("form");
    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = "https://...";
    input.value = window.TiptapNotes ? window.TiptapNotes.getLinkHref(editorEl) : "";
    const submit = document.createElement("button");
    submit.type = "submit";
    submit.textContent = "Apply";
    form.append(input, submit);
    form.addEventListener("mousedown", e => e.stopPropagation());
    form.addEventListener("submit", e => {
      e.preventDefault();
      let url = input.value.trim();
      if (url && !/^https?:\/\//i.test(url)) url = "https://" + url;
      if (window.TiptapNotes) window.TiptapNotes.run(editorEl, "link", url || null);
      closeMenu();
    });
    menu.appendChild(form);
    wrap.appendChild(menu);
    setTimeout(() => input.focus(), 0);
    function closeMenu() {
      menu.remove();
      document.removeEventListener("click", outsideHandler);
      closeOpenToolMenu = null;
    }
    function outsideHandler(e) { if (!wrap.contains(e.target)) closeMenu(); }
    setTimeout(() => document.addEventListener("click", outsideHandler), 0);
    closeOpenToolMenu = closeMenu;
  }

  wrap._refreshActive = () => {
    trigger.classList.toggle("active", window.TiptapNotes && window.TiptapNotes.isActive(editorElGetter(), "link"));
  };
  return wrap;
}

let lightboxEl = null;
function openImageLightbox(src) {
  if (!lightboxEl) {
    lightboxEl = el("div", "img-lightbox");
    lightboxEl.innerHTML = '<img alt="" /><button type="button" class="img-lightbox-close" aria-label="Close">&times;</button>';
    lightboxEl.addEventListener("click", e => { if (e.target === lightboxEl || e.target.closest(".img-lightbox-close")) closeImageLightbox(); });
    document.addEventListener("keydown", e => { if (e.key === "Escape") closeImageLightbox(); });
    document.body.appendChild(lightboxEl);
  }
  lightboxEl.querySelector("img").src = src;
  lightboxEl.classList.add("open");
}
function closeImageLightbox() {
  if (lightboxEl) lightboxEl.classList.remove("open");
}

function openNotesEditor(id, wrap) {
  wrap.classList.add("open");
  wrap.querySelector(".notes-toggle-btn").querySelector("span").textContent = "Close note";

  const panel = el("div", "notes-editor-panel");
  const toolbar = el("div", "notes-toolbar");
  const getEditorEl = () => editorEl;

  const simpleTools = [
    ["bold", "<b>B</b>", "Bold"],
    ["italic", "<i>I</i>", "Italic"],
    ["underline", "<u>U</u>", "Underline"],
    ["strike", "<s>S</s>", "Strikethrough"],
    ["code", "&lt;/&gt;", "Code"],
  ];

  const dropdowns = [];

  const listDropdown = buildToolDropdown(getEditorEl, {
    icon: TOOL_ICONS.list, showCaret: true,
    cmds: [
      { cmd: "bulletList", label: "Bullet list", icon: TOOL_ICONS.list },
      { cmd: "orderedList", label: "Numbered list", icon: TOOL_ICONS.ordered },
      { cmd: "taskList", label: "Task list", icon: TOOL_ICONS.task },
    ],
  });
  toolbar.appendChild(listDropdown);
  dropdowns.push(listDropdown);

  const styleDropdown = buildToolDropdown(getEditorEl, {
    icon: TOOL_ICONS.text, showCaret: true,
    cmds: [
      { cmd: "paragraph", label: "Text" },
      { cmd: "heading1", label: "Heading 1" },
      { cmd: "heading2", label: "Heading 2" },
      { cmd: "heading3", label: "Heading 3" },
    ],
  });
  toolbar.appendChild(styleDropdown);
  dropdowns.push(styleDropdown);

  simpleTools.forEach(([cmd, html, title]) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "notes-tool";
    btn.dataset.cmd = cmd;
    btn.title = title;
    btn.innerHTML = html;
    btn.addEventListener("mousedown", e => e.preventDefault());
    btn.addEventListener("click", () => { if (window.TiptapNotes) window.TiptapNotes.run(editorEl, cmd); });
    toolbar.appendChild(btn);
  });

  const alignDropdown = buildToolDropdown(getEditorEl, {
    icon: TOOL_ICONS.align, showCaret: true,
    cmds: [
      { cmd: "align-left", label: "Align left" },
      { cmd: "align-center", label: "Align center" },
      { cmd: "align-right", label: "Align right" },
    ],
  });
  toolbar.appendChild(alignDropdown);
  dropdowns.push(alignDropdown);

  const linkTool = buildLinkTool(getEditorEl);
  toolbar.appendChild(linkTool);
  dropdowns.push(linkTool);

  const imageBtn = document.createElement("button");
  imageBtn.type = "button";
  imageBtn.className = "notes-tool";
  imageBtn.title = "Add image";
  imageBtn.innerHTML = TOOL_ICONS.image;
  const imageInput = document.createElement("input");
  imageInput.type = "file";
  imageInput.accept = "image/*";
  imageInput.multiple = true;
  imageInput.hidden = true;
  imageInput.addEventListener("change", () => {
    Array.from(imageInput.files || []).forEach(file => {
      window.TiptapNotes && window.TiptapNotes.insertImageFile(editorEl, file).catch(showImageError);
    });
    imageInput.value = "";
  });
  imageBtn.addEventListener("mousedown", e => e.preventDefault());
  imageBtn.addEventListener("click", () => imageInput.click());
  toolbar.appendChild(imageBtn);
  toolbar.appendChild(imageInput);

  const moreDropdown = buildToolDropdown(getEditorEl, {
    icon: TOOL_ICONS.more, showCaret: false,
    cmds: [
      { cmd: "blockquote", label: "Quote" },
      { cmd: "horizontalRule", label: "Divider" },
      { cmd: "clear", label: "Clear formatting" },
    ],
  });
  toolbar.appendChild(moreDropdown);

  panel.appendChild(toolbar);

  const imgError = el("div", "notes-tool-error");
  panel.appendChild(imgError);
  let imgErrorTimer;
  function showImageError(err) {
    imgError.textContent = err && err.message ? err.message : "Couldn't add that image.";
    imgError.classList.add("show");
    clearTimeout(imgErrorTimer);
    imgErrorTimer = setTimeout(() => imgError.classList.remove("show"), 4000);
  }

  const editorEl = el("div", "notes-editor", '<span class="notes-loading">Loading editor...</span>');
  editorEl.addEventListener("click", e => {
    const img = e.target.closest("img");
    if (img) { e.preventDefault(); openImageLightbox(img.src); }
  });
  editorEl._imageErrorListener = e => { if (e.detail.container === editorEl) showImageError(e.detail.error); };
  window.addEventListener("tiptap-image-error", editorEl._imageErrorListener);
  panel.appendChild(editorEl);
  wrap.appendChild(panel);

  const init = () => {
    editorEl.innerHTML = "";
    let saveTimer;
    window.TiptapNotes.mount(editorEl, getNote(id), (html, text) => {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => setNote(id, html, text), 400);
    });
    editorEl._toolbarUpdate = () => {
      toolbar.querySelectorAll(".notes-tool[data-cmd]").forEach(b => {
        b.classList.toggle("active", window.TiptapNotes.isActive(editorEl, b.dataset.cmd));
      });
      dropdowns.forEach(d => d._refreshActive());
    };
  };

  if (window.TiptapNotes) init();
  else window.addEventListener("tiptap-ready", init, { once: true });
}

function closeNotesEditor(id, wrap) {
  const panel = wrap.querySelector(".notes-editor-panel");
  const editorEl = panel && panel.querySelector(".notes-editor");
  if (editorEl) {
    if (window.TiptapNotes) window.TiptapNotes.destroy(editorEl);
    if (editorEl._imageErrorListener) window.removeEventListener("tiptap-image-error", editorEl._imageErrorListener);
  }
  refreshNotesArea(id);
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
  wrap.querySelector(".meta").textContent = sectionMetaText(sec, doneCount);
  wrap.querySelector(".bar-fill").style.transform = `scaleX(${pct / 100})`;
}

function sectionMetaText(sec, doneCount) {
  const base = `${doneCount}/${sec.topics.length}`;
  return sec.meta ? `${base} · ${sec.meta}` : base;
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

/* ---------- Cloud sync (Google sign-in + Firestore) ---------- */
const GOOGLE_ICON_SVG = '<svg viewBox="0 0 18 18" width="16" height="16"><path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.57 2.7-3.88 2.7-6.62Z"/><path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.84.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.95v2.33A9 9 0 0 0 9 18Z"/><path fill="#FBBC05" d="M3.95 10.7A5.41 5.41 0 0 1 3.67 9c0-.59.1-1.17.28-1.7V4.96H.95A9 9 0 0 0 0 9c0 1.45.35 2.83.95 4.04l3-2.33Z"/><path fill="#EA4335" d="M9 3.58c1.32 0 2.51.46 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .95 4.96l3 2.33C4.66 5.17 6.65 3.58 9 3.58Z"/></svg>';

function renderAuthBox() {
  const box = document.getElementById("authBox");
  if (!box) return;
  const user = window.CloudSync && window.CloudSync.getUser();

  if (user) {
    box.innerHTML = `
      <div class="auth-user">
        <img class="auth-avatar" src="${user.photoURL || ""}" alt="" referrerpolicy="no-referrer" />
        <div class="auth-user-text">
          <span class="auth-name">${escapeHtml(user.displayName || user.email || "Signed in")}</span>
          <button type="button" class="auth-signout" id="signOutBtn">Sign out</button>
        </div>
      </div>
      <div class="sync-status" id="syncStatus">Synced</div>`;
    document.getElementById("signOutBtn").addEventListener("click", () => window.CloudSync.signOut());
  } else {
    box.innerHTML = `
      <button class="signin-btn" id="signInBtn" type="button">
        ${GOOGLE_ICON_SVG}
        <span>Sign in with Google</span>
      </button>
      <p class="auth-hint">Sync your progress across devices</p>`;
    document.getElementById("signInBtn").addEventListener("click", () => {
      if (window.CloudSync) window.CloudSync.signIn().catch(err => console.error("Sign-in failed", err));
    });
  }
}

function setSyncStatus(text, cls) {
  const el = document.getElementById("syncStatus");
  if (!el) return;
  el.textContent = text;
  el.className = "sync-status" + (cls ? " " + cls : "");
}

window.addEventListener("cloud-auth", e => {
  const { user, remoteState } = e.detail;
  if (user) {
    if (remoteState) {
      applyState(remoteState);
      persistLocal();
    } else {
      // First time this Google account signs in - seed the cloud with what's local so far.
      window.CloudSync.pushState(state);
    }
  }
  renderAuthBox();
  render();
});

window.addEventListener("cloud-update", e => {
  if (document.querySelector(".notes-editor-panel")) return; // don't yank focus mid-typing
  applyState(e.detail);
  persistLocal();
  render();
});

window.addEventListener("cloud-syncing", () => setSyncStatus("Syncing…"));
window.addEventListener("cloud-saved", () => setSyncStatus("Synced"));
window.addEventListener("cloud-error", () => setSyncStatus("Sync error - retrying", "error"));
window.addEventListener("cloud-signin-error", e => {
  const code = e.detail && e.detail.code;
  const box = document.getElementById("authBox");
  if (box && !box.querySelector(".auth-user")) {
    const msg = code === "auth/unauthorized-domain"
      ? "This domain isn't authorized for sign-in yet."
      : "Sign-in didn't complete - try again.";
    const hint = box.querySelector(".auth-hint");
    if (hint) hint.textContent = msg;
  }
});

/* ---------- Init ---------- */
renderAuthBox();
render();
