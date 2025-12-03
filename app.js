/* =========================
   CONFIG (canonical CSVs + your Forms)
========================= */
const CFG = {
  // ✅ Canonical CSVs you just sent:
  GAMES_CSV: "https://docs.google.com/spreadsheets/d/e/2PACX-1vSTtJwe9XnDHsTV1e4qw5U2vfLsxHu6IpnO4qZNbEYiCrvQFOyJHTJAFQCrpjfKQdQ2vn2ZvtSC6c2t/pub?gid=507907886&single=true&output=csv",
  PLANS_CSV: "https://docs.google.com/spreadsheets/d/e/2PACX-1vSTtJwe9XnDHsTV1e4qw5U2vfLsxHu6IpnO4qZNbEYiCrvQFOyJHTJAFQCrpjfKQdQ2vn2ZvtSC6c2t/pub?gid=1994027599&single=true&output=csv",


  // Your Form IDs (same as before)
  GAMES_FORM_ID: "1FAIpQLSeTgHyFvTRMoA844jux__WUavA38a_a4JqtL49wxsYInamZkg",
  PLANS_FORM_ID: "1FAIpQLSdkqSa-SW6F_Bekgz5gUZBUyhCjEw8zTUus8dqApUTHfX1nrA",

  // Entries (from your prefill links)
  // Games: action, id, name, arsenal, description, interest
  G_ACTION: "entry.1767816850",
  G_ID:     "entry.1759094494",
  G_NAME:   "entry.508087423",
  G_ARS:    "entry.1459332776",
  G_DESC:   "entry.558105026",
  G_INT:    "entry.27841332",

  // Plans: date, note, game_ids_json
  P_DATE: "entry.727761715",
  P_NOTE: "entry.506410526",
  P_JSON: "entry.948769888",

  AUTO_REFRESH_MS: 10_000,
  RECENT_DAYS: 14,
};

/* =========================
   Helpers
========================= */
const $ = (id) => document.getElementById(id);

function toast(kind, msg) {
  const el = $("toast");
  el.textContent = msg;
  el.className =
    "mt-4 text-sm px-3 py-2 rounded-xl border " +
    (kind === "ok" ? "bg-emerald-900/30 text-emerald-200 border-emerald-800" :
     kind === "err" ? "bg-rose-900/30 text-rose-200 border-rose-800" :
     "bg-indigo-900/30 text-indigo-200 border-indigo-800");
  el.classList.remove("hidden");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.add("hidden"), 2600);
}

function cacheBuster(url) {
  const u = new URL(url);
  u.searchParams.set("_ts", String(Date.now()));
  return u.toString();
}

// Robust-ish CSV parser (quotes/newlines/commas)
function parseCSV(text) {
  const rows = [];
  let i = 0, cur = "", row = [], inQuotes = false;

  while (i < text.length) {
    const c = text[i];

    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { cur += '"'; i += 2; continue; }
      if (c === '"') { inQuotes = false; i++; continue; }
      cur += c; i++; continue;
    }

    if (c === '"') { inQuotes = true; i++; continue; }
    if (c === ",") { row.push(cur); cur = ""; i++; continue; }
    if (c === "\r") { i++; continue; }
    if (c === "\n") { row.push(cur); rows.push(row); cur = ""; row = []; i++; continue; }

    cur += c; i++;
  }
  row.push(cur);
  rows.push(row);

  while (rows.length && rows[rows.length - 1].every(x => (x || "").trim() === "")) rows.pop();
  return rows;
}

function normalize(s) { return (s ?? "").toString().trim(); }

function escapeHtml(s) {
  return (s ?? "").toString().replace(/[&<>"']/g, m => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[m]));
}
function escapeAttr(s) { return escapeHtml(s).replace(/"/g, "&quot;"); }

function mkId() {
  return "g-" + Math.random().toString(36).slice(2, 8) + "-" + Date.now().toString(36).slice(4);
}

function nextSaturdayISO() {
  const d = new Date();
  const day = d.getDay(); // 0..6
  const delta = (6 - day + 7) % 7 || 7;
  d.setDate(d.getDate() + delta);
  return d.toISOString().slice(0, 10);
}

function parseDateLike(str) {
  const s = normalize(str);
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return new Date(s + "T00:00:00");
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : new Date(t);
}

function daysBetween(a, b) {
  const ms = 24 * 3600 * 1000;
  const aa = new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime();
  const bb = new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime();
  return Math.round((bb - aa) / ms);
}

function relDaysLabel(daysAgo) {
  if (daysAgo == null) return "никогда";
  if (daysAgo === 0) return "сегодня";
  if (daysAgo === 1) return "вчера";
  if (daysAgo < 7) return `${daysAgo} дн назад`;
  const w = Math.floor(daysAgo / 7);
  return w === 1 ? "1 нед назад" : `${w} нед назад`;
}

function isoDateKey(s) {
  const d = parseDateLike(s);
  return d ? d.toISOString().slice(0,10) : "";
}

/* =========================
   Silent submit (Forms)
========================= */
function formResponseUrl(formId) {
  return `https://docs.google.com/forms/d/e/${formId}/formResponse`;
}

function silentSubmit(formEl, actionUrl, fieldsMap) {
  formEl.action = actionUrl;
  for (const [inputId, value] of Object.entries(fieldsMap)) {
    const input = $(inputId);
    input.value = value ?? "";
  }
  formEl.submit();
}

/* =========================
   State
========================= */
let DATA = {
  games: [],
  gamesById: new Map(),
  plansByDate: new Map(), // dateIso -> {dateIso, note, ids, updated_at}
  lastPlayed: new Map(),  // gameId -> dateIso
};

let UI = {
  tab: "library",
  planSelectedIds: [],
};

let timer = null;

/* =========================
   Load & Build (CANONICAL)
========================= */
async function fetchCSV(url) {
  const res = await fetch(cacheBuster(url), { cache: "no-store" });
  if (!res.ok) throw new Error(`CSV fetch failed: HTTP ${res.status}`);
  return await res.text();
}

// Canonical Games sheet: game_id,name,arsenal,description,interest,updated_at
function buildGamesFromCanonical(csvText) {
  const rows = parseCSV(csvText);
  if (rows.length < 2) return [];

  const header = rows[0].map(h => normalize(h).toLowerCase());
  const idx = (name, fallback) => {
    const i = header.indexOf(name);
    return i >= 0 ? i : fallback;
  };

  const iId   = idx("game_id", 0);
  const iName = idx("name", 1);
  const iArs  = idx("arsenal", 2);
  const iDesc = idx("description", 3);
  const iInt  = idx("interest", 4);

  const out = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const id = normalize(row[iId]);
    if (!id) continue;

    const interest = parseInt(normalize(row[iInt] ?? ""), 10);
    out.push({
      id,
      name: normalize(row[iName] ?? ""),
      arsenal: normalize(row[iArs] ?? ""),
      description: normalize(row[iDesc] ?? ""),
      interest: Number.isFinite(interest) ? Math.max(1, Math.min(5, interest)) : 3,
    });
  }
  return out;
}

// Canonical Plans sheet: date,note,game_ids_json,updated_at
function buildPlansFromCanonical(csvText) {
  const rows = parseCSV(csvText);
  if (rows.length < 2) return new Map();

  const header = rows[0].map(h => normalize(h).toLowerCase());
  const idx = (name, fallback) => {
    const i = header.indexOf(name);
    return i >= 0 ? i : fallback;
  };

  const iDate = idx("date", 0);
  const iNote = idx("note", 1);
  const iJson = idx("game_ids_json", 2);
  const iUpd  = idx("updated_at", 3);

  const byDate = new Map();
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const dateIso = isoDateKey(row[iDate] ?? "");
    if (!dateIso) continue;

    let ids = [];
    const raw = normalize(row[iJson] ?? "");
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) ids = parsed.map(normalize).filter(Boolean);
      } catch {
        ids = raw.split(",").map(s => normalize(s)).filter(Boolean);
      }
    }

    byDate.set(dateIso, {
      dateIso,
      note: normalize(row[iNote] ?? ""),
      ids,
      updated_at: normalize(row[iUpd] ?? ""),
    });
  }
  return byDate;
}

function rebuildDerived() {
  DATA.gamesById = new Map(DATA.games.map(g => [g.id, g]));

  // lastPlayed computed from canonical Plans
  const lastPlayed = new Map();
  for (const [dateIso, plan] of DATA.plansByDate.entries()) {
    for (const id of plan.ids) {
      const prev = lastPlayed.get(id);
      if (!prev || prev < dateIso) lastPlayed.set(id, dateIso);
    }
  }
  DATA.lastPlayed = lastPlayed;
}

function lastPlayedInfo(gameId, refDateIso) {
  const lastIso = DATA.lastPlayed.get(gameId);
  if (!lastIso) return { label: "никогда", daysAgo: null, lastIso: null };

  const last = parseDateLike(lastIso);
  const ref = parseDateLike(refDateIso) || new Date();
  if (!last) return { label: "никогда", daysAgo: null, lastIso: null };

  const days = Math.max(0, daysBetween(last, ref));
  return { label: relDaysLabel(days), daysAgo: days, lastIso };
}

async function refreshAll() {
  try {
    $("netPill").textContent = "loading…";
    $("netPill").className = "text-xs px-2.5 py-1 rounded-full border border-indigo-800 bg-indigo-900/40 text-indigo-200";

    const [gamesCsv, plansCsv] = await Promise.all([
      fetchCSV(CFG.GAMES_CSV),
      fetchCSV(CFG.PLANS_CSV),
    ]);

    DATA.games = buildGamesFromCanonical(gamesCsv);
    DATA.plansByDate = buildPlansFromCanonical(plansCsv);
    rebuildDerived();

    renderAll();

    $("netPill").textContent = "connected";
    $("netPill").className = "text-xs px-2.5 py-1 rounded-full border border-emerald-800 bg-emerald-900/40 text-emerald-200";
  } catch (e) {
    console.error(e);
    $("netPill").textContent = "fetch error";
    $("netPill").className = "text-xs px-2.5 py-1 rounded-full border border-rose-800 bg-rose-900/40 text-rose-200";
    toast("err", "Не получилось прочитать canonical CSV. Проверь: Publish to web + правильные CSV ссылки.");
  }
}

/* =========================
   Rendering
========================= */
function interestBadge(n) {
  const safe = Math.max(1, Math.min(5, n || 3));
  return "🔥".repeat(safe) + "<span class='text-zinc-600'>" + "🔥".repeat(5 - safe) + "</span>";
}

function renderLibrary() {
  const search = normalize($("searchInput").value).toLowerCase();
  const arsenalNeedle = normalize($("arsenalFilter").value).toLowerCase();
  const minInterest = parseInt($("interestFilter").value || "0", 10);
  const sort = $("sortSelect").value;

  const refDateIso = $("planDate").value || nextSaturdayISO();

  let list = DATA.games.slice();

  if (search) {
    list = list.filter(g =>
      (g.name || "").toLowerCase().includes(search) ||
      (g.description || "").toLowerCase().includes(search) ||
      (g.arsenal || "").toLowerCase().includes(search) ||
      g.id.toLowerCase().includes(search)
    );
  }
  if (arsenalNeedle) list = list.filter(g => (g.arsenal || "").toLowerCase().includes(arsenalNeedle));
  if (minInterest) list = list.filter(g => (g.interest || 0) >= minInterest);

  list.sort((a,b) => {
    if (sort === "interest_desc") return (b.interest||0) - (a.interest||0) || (a.name||"").localeCompare(b.name||"");
    if (sort === "name") return (a.name||"").localeCompare(b.name||"");
    if (sort === "last_played_asc") {
      const da = lastPlayedInfo(a.id, refDateIso).daysAgo ?? 10_000;
      const db = lastPlayedInfo(b.id, refDateIso).daysAgo ?? 10_000;
      return db - da; // bigger days first
    }
    if (sort === "last_played_desc") {
      const da = lastPlayedInfo(a.id, refDateIso).daysAgo ?? -1;
      const db = lastPlayedInfo(b.id, refDateIso).daysAgo ?? -1;
      return da - db; // recent first
    }
    return 0;
  });

  $("countTotal").textContent = String(DATA.games.length);
  $("countShown").textContent = String(list.length);

  const grid = $("gamesGrid");
  grid.innerHTML = "";

  for (const g of list) {
    const lp = lastPlayedInfo(g.id, refDateIso);
    const recent = lp.daysAgo != null && lp.daysAgo <= CFG.RECENT_DAYS;
    const inPlan = UI.planSelectedIds.includes(g.id);

    const card = document.createElement("div");
    card.className =
      "rounded-2xl border bg-zinc-950/30 p-4 shadow-sm " +
      (recent ? "border-rose-800/70" : "border-zinc-800");

    card.innerHTML = `
      <div class="flex items-start justify-between gap-2">
        <div class="min-w-0">
          <div class="text-lg font-semibold break-words">${escapeHtml(g.name || "(без названия)")}</div>
          <div class="text-xs text-zinc-500 mt-0.5 break-all">ID: ${escapeHtml(g.id)}</div>
        </div>
        <div class="text-xs px-2 py-1 rounded-full border ${recent ? "border-rose-800 bg-rose-900/30 text-rose-200" : "border-zinc-700 bg-zinc-900/40 text-zinc-300"}">
          ${recent ? "было недавно" : "ок"}
        </div>
      </div>

      <div class="mt-2 text-sm text-zinc-300">
        <div class="text-xs text-zinc-500">Интерес</div>
        <div class="mt-0.5">${interestBadge(g.interest)}</div>
      </div>

      <div class="mt-2 text-sm text-zinc-300">
        <div class="text-xs text-zinc-500">Инвентарь</div>
        <div class="mt-0.5 break-words">${escapeHtml(g.arsenal || "—")}</div>
      </div>

      <div class="mt-2 text-sm text-zinc-300">
        <div class="text-xs text-zinc-500">Описание</div>
        <div class="mt-0.5 break-words">${escapeHtml(g.description || "—")}</div>
      </div>

      <div class="mt-2 text-sm">
        <span class="text-xs text-zinc-500">Последний раз:</span>
        <span class="text-zinc-200">${escapeHtml(lp.label)}</span>
      </div>

      <div class="mt-3 flex flex-wrap gap-2">
        <button class="btnAddPlan px-3 py-2 rounded-xl text-sm font-medium ${inPlan ? "bg-zinc-700 text-zinc-200" : "bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-600 text-white"}"
                data-id="${escapeAttr(g.id)}">
          ${inPlan ? "✓ В плане" : "+ В план"}
        </button>
        <button class="btnEdit px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-800 transition text-sm"
                data-id="${escapeAttr(g.id)}">
          ✏️ Редактировать
        </button>
      </div>
    `;

    grid.appendChild(card);
  }

  grid.querySelectorAll(".btnAddPlan").forEach(btn => btn.addEventListener("click", () => addToPlan(btn.dataset.id)));
  grid.querySelectorAll(".btnEdit").forEach(btn => btn.addEventListener("click", () => openGameDialog(btn.dataset.id)));
}

function renderPlan() {
  const dateIso = $("planDate").value || nextSaturdayISO();
  const listEl = $("planList");
  listEl.innerHTML = "";

  $("planJsonPreview").textContent = JSON.stringify(UI.planSelectedIds);

  if (!UI.planSelectedIds.length) {
    listEl.innerHTML = `<div class="text-sm text-zinc-400">Пока пусто. Добавь игры из каталога или через “Быстро добавить”.</div>`;
  } else {
    for (const id of UI.planSelectedIds) {
      const g = DATA.gamesById.get(id);
      const lp = lastPlayedInfo(id, dateIso);
      const recent = lp.daysAgo != null && lp.daysAgo <= CFG.RECENT_DAYS;

      const wrap = document.createElement("div");
      wrap.className = "rounded-xl border p-3 flex items-start justify-between gap-2 " +
        (recent ? "border-rose-800/70 bg-rose-950/20" : "border-zinc-800 bg-zinc-950/30");

      wrap.innerHTML = `
        <div class="min-w-0">
          <div class="font-semibold break-words">${escapeHtml(g?.name || id)}</div>
          <div class="text-xs text-zinc-500 break-words">Инвентарь: ${escapeHtml(g?.arsenal || "—")}</div>
          <div class="text-xs ${recent ? "text-rose-200" : "text-zinc-400"} mt-1">
            Последний раз: ${escapeHtml(lp.label)}
          </div>
        </div>
        <button class="btnRemove px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-800 transition text-sm" data-id="${escapeAttr(id)}">✕</button>
      `;
      wrap.querySelector(".btnRemove").addEventListener("click", () => removeFromPlan(id));
      listEl.appendChild(wrap);
    }
  }

  renderHints();
  renderQuickAdd();
}

function renderHints() {
  const dateIso = $("planDate").value || nextSaturdayISO();
  const ref = parseDateLike(dateIso) || new Date();

  const all = DATA.games.map(g => {
    const lpIso = DATA.lastPlayed.get(g.id);
    const lpD = lpIso ? parseDateLike(lpIso) : null;
    const days = lpD ? daysBetween(lpD, ref) : null;
    return { g, daysAgo: days };
  });

  const stale = all.slice().sort((a,b) => (b.daysAgo ?? 999999) - (a.daysAgo ?? 999999)).slice(0, 8);
  const recent = all.filter(x => x.daysAgo != null && x.daysAgo <= CFG.RECENT_DAYS)
                    .sort((a,b) => (a.daysAgo ?? 0) - (b.daysAgo ?? 0))
                    .slice(0, 12);

  const staleEl = $("staleList");
  const recentEl = $("recentList");
  staleEl.innerHTML = "";
  recentEl.innerHTML = "";

  const item = (x, cls) => {
    const div = document.createElement("div");
    div.className = "flex items-center justify-between gap-2 text-sm " + cls;
    const label = x.daysAgo == null ? "никогда" : relDaysLabel(x.daysAgo);
    div.innerHTML = `
      <div class="min-w-0">
        <span class="text-zinc-200 font-medium">${escapeHtml(x.g.name || x.g.id)}</span>
        <span class="text-xs text-zinc-500">(${escapeHtml(label)})</span>
      </div>
      <button class="px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-600 transition text-xs font-medium"
              data-id="${escapeAttr(x.g.id)}">+ в план</button>
    `;
    div.querySelector("button").addEventListener("click", () => addToPlan(x.g.id));
    return div;
  };

  stale.length ? stale.forEach(x => staleEl.appendChild(item(x, "text-emerald-200")))
               : (staleEl.innerHTML = `<div class="text-sm text-zinc-400">Нет данных.</div>`);

  recent.length ? recent.forEach(x => recentEl.appendChild(item(x, "text-rose-200")))
                : (recentEl.innerHTML = `<div class="text-sm text-zinc-400">Нет.</div>`);
}

function renderQuickAdd() {
  const q = normalize($("quickAddSearch").value).toLowerCase();
  const wrap = $("quickAddResults");
  wrap.innerHTML = "";

  let list = DATA.games.slice();
  if (q) {
    list = list.filter(g =>
      (g.name||"").toLowerCase().includes(q) ||
      (g.arsenal||"").toLowerCase().includes(q) ||
      (g.description||"").toLowerCase().includes(q) ||
      g.id.toLowerCase().includes(q)
    );
  }
  list = list.slice(0, 25);

  if (!list.length) {
    wrap.innerHTML = `<div class="text-sm text-zinc-400">Ничего не найдено.</div>`;
    return;
  }

  for (const g of list) {
    const row = document.createElement("div");
    row.className = "flex items-center justify-between gap-2 rounded-xl border border-zinc-800 bg-zinc-950/30 p-2";
    row.innerHTML = `
      <div class="min-w-0">
        <div class="text-sm font-medium truncate">${escapeHtml(g.name || g.id)}</div>
        <div class="text-xs text-zinc-500 truncate">${escapeHtml(g.arsenal || "")}</div>
      </div>
      <button class="px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-600 transition text-xs font-medium">+ добавить</button>
    `;
    row.querySelector("button").addEventListener("click", () => addToPlan(g.id));
    wrap.appendChild(row);
  }
}

function renderHistory() {
  const grid = $("historyGrid");
  grid.innerHTML = "";

  const dates = [...DATA.plansByDate.keys()].sort((a,b) => b.localeCompare(a));
  if (!dates.length) {
    grid.innerHTML = `<div class="text-sm text-zinc-400">Пока нет сохранённых планов.</div>`;
    return;
  }

  for (const dateIso of dates) {
    const p = DATA.plansByDate.get(dateIso);
    const d = parseDateLike(dateIso);
    const title = d ? d.toLocaleDateString() : dateIso;

    const card = document.createElement("div");
    card.className = "rounded-2xl border border-zinc-800 bg-zinc-950/30 p-4";
    card.innerHTML = `
      <div class="flex items-start justify-between gap-2">
        <div>
          <div class="text-lg font-semibold">${escapeHtml(title)}</div>
          <div class="text-xs text-zinc-500 mt-0.5">Игр: ${p.ids.length}${p.note ? " • " + escapeHtml(p.note) : ""}</div>
        </div>
        <button class="btnLoad px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-800 transition text-sm" data-date="${escapeAttr(dateIso)}">
          ⤓ В план
        </button>
      </div>
      <div class="mt-3 space-y-1">
        ${p.ids.slice(0, 12).map(id => {
          const g = DATA.gamesById.get(id);
          return `<div class="text-sm text-zinc-200">• ${escapeHtml(g?.name || id)}</div>`;
        }).join("")}
        ${p.ids.length > 12 ? `<div class="text-xs text-zinc-500">…и ещё ${p.ids.length - 12}</div>` : ""}
      </div>
    `;

    card.querySelector(".btnLoad").addEventListener("click", () => {
      switchTab("plan");
      $("planDate").value = dateIso;
      $("btnLoadPlan").click();
    });

    grid.appendChild(card);
  }
}

function renderSettings() {
  $("cfgGamesCsv").textContent = CFG.GAMES_CSV;
  $("cfgPlansCsv").textContent = CFG.PLANS_CSV;
  $("cfgGamesPost").textContent = formResponseUrl(CFG.GAMES_FORM_ID);
  $("cfgPlansPost").textContent = formResponseUrl(CFG.PLANS_FORM_ID);
}

function renderAll() {
  renderLibrary();
  renderPlan();
  renderHistory();
  renderSettings();
}

/* =========================
   Plan actions
========================= */
function addToPlan(id) {
  if (!id) return;
  if (!UI.planSelectedIds.includes(id)) UI.planSelectedIds.push(id);
  renderPlan();
  renderLibrary();
}
function removeFromPlan(id) {
  UI.planSelectedIds = UI.planSelectedIds.filter(x => x !== id);
  renderPlan();
  renderLibrary();
}
function loadPlanForDate(dateIso) {
  const p = DATA.plansByDate.get(dateIso);
  if (!p) return toast("err", "Для этой даты плана нет.");
  UI.planSelectedIds = p.ids.slice();
  $("planNote").value = p.note || "";
  renderPlan();
  toast("ok", "План загружен.");
}

/* =========================
   Game dialog (UPSERT / DELETE -> Forms -> Trigger -> Canonical)
========================= */
function openGameDialog(gameId = null) {
  const dlg = $("gameDialog");
  const isEdit = !!gameId;

  $("dlgTitle").textContent = isEdit ? "Редактировать игру" : "Новая игра";
  $("dlgDelete").classList.toggle("hidden", !isEdit);

  if (isEdit) {
    const g = DATA.gamesById.get(gameId);
    $("dlg_id").value = g?.id || gameId;
    $("dlg_name").value = g?.name || "";
    $("dlg_arsenal").value = g?.arsenal || "";
    $("dlg_desc").value = g?.description || "";
    $("dlg_interest").value = String(g?.interest || 3);
    $("dlg_id").disabled = true;
  } else {
    $("dlg_id").value = mkId();
    $("dlg_name").value = "";
    $("dlg_arsenal").value = "";
    $("dlg_desc").value = "";
    $("dlg_interest").value = "3";
    $("dlg_id").disabled = false;
  }

  dlg.showModal();
}
function closeGameDialog() { $("gameDialog").close(); }

function submitGameUpsert() {
  const id = normalize($("dlg_id").value);
  const name = normalize($("dlg_name").value);
  if (!id) return toast("err", "Нужен ID.");
  if (!name) return toast("err", "Нужно название.");

  const fields = {
    g_action: "UPSERT",
    g_id: id,
    g_name: name,
    g_ars: normalize($("dlg_arsenal").value),
    g_desc: normalize($("dlg_desc").value),
    g_int: normalize($("dlg_interest").value) || "3",
  };

  silentSubmit($("hiddenGamesForm"), formResponseUrl(CFG.GAMES_FORM_ID), fields);
  toast("ok", "UPSERT отправлен. Каноническая таблица обновится триггером…");
  setTimeout(refreshAll, 1400);
  closeGameDialog();
}

function submitGameDelete() {
  const id = normalize($("dlg_id").value);
  if (!id) return;
  if (!confirm("Удалить игру? Это отправит DELETE и триггер удалит строку в canonical Games.")) return;

  const fields = { g_action: "DELETE", g_id: id, g_name: "", g_ars: "", g_desc: "", g_int: "" };
  silentSubmit($("hiddenGamesForm"), formResponseUrl(CFG.GAMES_FORM_ID), fields);

  UI.planSelectedIds = UI.planSelectedIds.filter(x => x !== id);
  toast("ok", "DELETE отправлен. Обновляю…");
  setTimeout(refreshAll, 1400);
  closeGameDialog();
}

/* =========================
   Plan submit
========================= */
function submitPlanSave() {
  const dateIso = $("planDate").value;
  if (!dateIso) return toast("err", "Выбери дату.");

  const note = normalize($("planNote").value);
  const json = JSON.stringify(UI.planSelectedIds);

  const fields = { p_date: dateIso, p_note: note, p_json: json };
  silentSubmit($("hiddenPlansForm"), formResponseUrl(CFG.PLANS_FORM_ID), fields);

  toast("ok", "План отправлен. Каноническая Plans обновится триггером…");
  setTimeout(refreshAll, 1400);
}

/* =========================
   Tabs + Init
========================= */
function switchTab(tab) {
  UI.tab = tab;

  document.querySelectorAll(".tabPanel").forEach(el => el.classList.add("hidden"));
  $(`tab-${tab}`).classList.remove("hidden");

  document.querySelectorAll(".tabBtn").forEach(btn => {
    const isActive = btn.dataset.tab === tab;
    btn.className =
      "tabBtn px-3 py-2 rounded-xl text-sm " +
      (isActive ? "bg-emerald-600 text-white font-medium" : "bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-800 transition");
  });
}

function wireUI() {
  document.querySelectorAll(".tabBtn").forEach(btn => btn.addEventListener("click", () => switchTab(btn.dataset.tab)));

  ["searchInput","arsenalFilter","interestFilter","sortSelect"].forEach(id => {
    $(id).addEventListener("input", renderLibrary);
    $(id).addEventListener("change", renderLibrary);
  });

  $("planDate").value = nextSaturdayISO();
  $("planDate").addEventListener("change", () => { renderPlan(); renderLibrary(); });
  $("planNote").addEventListener("input", renderPlan);

  $("btnLoadPlan").addEventListener("click", () => loadPlanForDate($("planDate").value));
  $("btnSavePlan").addEventListener("click", submitPlanSave);
  $("btnPickNextSat").addEventListener("click", () => {
    $("planDate").value = nextSaturdayISO();
    renderPlan(); renderLibrary();
  });

  $("quickAddSearch").addEventListener("input", renderQuickAdd);
  $("btnNewGame").addEventListener("click", () => openGameDialog(null));

  $("dlgClose").addEventListener("click", closeGameDialog);
  $("dlgSave").addEventListener("click", submitGameUpsert);
  $("dlgDelete").addEventListener("click", submitGameDelete);

  $("btnRefresh").addEventListener("click", refreshAll);
  $("autoToggle").addEventListener("change", (e) => {
    if (e.target.checked) timer = setInterval(refreshAll, CFG.AUTO_REFRESH_MS);
    else { clearInterval(timer); timer = null; }
  });

  $("btnExportJson").addEventListener("click", () => {
    const out = {};
    for (const [dateIso, p] of DATA.plansByDate.entries()) out[dateIso] = p;
    const blob = new Blob([JSON.stringify(out, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "plans_export.json";
    a.click();
    URL.revokeObjectURL(a.href);
  });

  renderSettings();
}

window.addEventListener("DOMContentLoaded", async () => {
  wireUI();
  await refreshAll();
  timer = setInterval(refreshAll, CFG.AUTO_REFRESH_MS);
  switchTab("library");
});
