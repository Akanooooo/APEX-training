'use strict';

/* ================= Utils ================= */
const KEY = 'apex-training-v1';
const DAY = 86400000;
const WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const TYPES = {
  ski: { name: 'SkiErg', dists: [500, 1000, 2000, 5000] },
  bike: { name: 'Fahrrad', dists: [5000, 10000, 20000, 40000] }
};

const $ = (s) => document.querySelector(s);
const pad = (n) => String(n).padStart(2, '0');
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Dates are handled as local "YYYY-MM-DD" strings to avoid UTC shifts.
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const todayIso = () => iso(new Date());
const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
const diffDays = (a, b) => Math.round((parse(b) - parse(a)) / DAY);
const fmtDate = (s) => { const d = parse(s); return `${WD[d.getDay()]}, ${d.getDate()}.${d.getMonth() + 1}.`; };
const fmtShort = (s) => { const d = parse(s); return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.`; };

function fmtTime(sec) {
  if (sec == null || !isFinite(sec)) return '–';
  sec = Math.round(sec * 10) / 10;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.round((sec - h * 3600 - m * 60) * 10) / 10;
  if (h) return `${h}:${pad(m)}:${pad(Math.floor(s))}`;
  const whole = Math.floor(s);
  const tenth = Math.round((s - whole) * 10);
  return `${m}:${pad(whole)}${tenth ? '.' + tenth : ''}`;
}
function parseTime(str) {
  if (!str) return null;
  const parts = String(str).trim().replace(',', '.').split(':');
  if (parts.length > 3 || parts.some((p) => p === '' || isNaN(p))) return null;
  const sec = parts.reduce((acc, p) => acc * 60 + parseFloat(p), 0);
  return sec > 0 ? sec : null;
}
const fmtDist = (m) => (m >= 1000 ? `${+(m / 1000).toFixed(2)} km` : `${m} m`);
function paceText(type, dist, sec) {
  if (!dist || !sec) return '';
  if (type === 'ski') return `${fmtTime(sec / (dist / 500))} /500m`;
  return `${((dist / 1000) / (sec / 3600)).toFixed(1)} km/h`;
}

/* ================= State ================= */
function defaults() {
  return {
    settings: { goal: 200, goalDate: `${new Date().getFullYear()}-12-31`, days: [1, 3, 5] },
    tests: [],     // { id, date, max }
    pushups: [],   // { id, date, sets: [n], total, planned }
    cardio: [],    // { id, date, type, dist, time, watts, notes }
    draft: null    // in-progress session { date, sets: [{ t, a, done }] }
  };
}
function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY));
    if (raw && raw.settings) {
      const d = defaults();
      return { ...d, ...raw, settings: { ...d.settings, ...raw.settings } };
    }
  } catch (e) {}
  return defaults();
}
let state = load();
let planCache = null;

function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { toast('Speichern fehlgeschlagen'); }
}
function save() { persist(); planCache = null; render(); }

const sortedTests = () => [...state.tests].sort((a, b) => a.date.localeCompare(b.date));
const latestMax = () => { const t = sortedTests(); return t.length ? t[t.length - 1].max : 0; };
const bestTotal = () => Math.max(0, ...state.pushups.map((p) => p.total), ...state.tests.map((t) => t.max));
const bestSet = () => Math.max(0, ...state.tests.map((t) => t.max), ...state.pushups.flatMap((p) => p.sets));

/* ================= Plan generator =================
   Ziel: <goal> Liegestütze in einer Einheit am <goalDate>.
   - 3 Einheiten/Woche (Tage einstellbar), Volumen steigt linear vom Startniveau
     (≈ 2,2 × Max-Satz) bis ≈ 88 % des Ziels kurz vor dem Finale.
   - Satzgröße ≈ 70 % des (hochgerechneten) Max-Satzes → Anzahl Sätze ergibt sich daraus.
   - Alle 14 Tage Max-Test; jeder neue Test kalibriert alle folgenden Einheiten neu.
   - Jede 4. Woche Deload (−25 %), die letzten 4 Tage vor dem Finale Taper (−45 %). */
function getPlan() { if (!planCache) planCache = buildPlan(); return planCache; }

function buildPlan() {
  const tests = sortedTests();
  if (!tests.length) return [];
  const { goal, goalDate, days } = state.settings;
  const start = tests[0].date;
  const today = todayIso();
  if (start > goalDate) return [];
  const testDates = new Set(tests.map((t) => t.date));
  let nextTest = addDays(tests[tests.length - 1].date, 14);
  const totalDays = Math.max(1, diffDays(start, goalDate));
  const monday = addDays(start, -((parse(start).getDay() + 6) % 7)); // weeks run Mon–Sun
  const out = [];
  let n = 0;
  for (let d = start; d <= goalDate; d = addDays(d, 1)) {
    const dow = parse(d).getDay();
    let type = null;
    if (d === goalDate) type = 'final';
    else if (testDates.has(d)) type = 'test';
    else if (days.includes(dow)) {
      if (d > today && d >= nextTest && diffDays(d, goalDate) > 7) { type = 'test'; nextTest = addDays(d, 14); }
      else type = 'train';
    }
    if (!type) continue;
    n++;
    const week = Math.floor(diffDays(monday, d) / 7) + 1;
    const pAll = diffDays(start, d) / totalDays;
    const phase = pAll < 0.3 ? 'Basis' : pAll < 0.7 ? 'Aufbau' : 'Peak';
    const s = { date: d, n, week, phase, type };
    if (type === 'train') Object.assign(s, trainSession(d, tests, week));
    else if (type === 'test') Object.assign(s, { sets: [], total: 0, label: 'Max-Test', rest: 0 });
    else Object.assign(s, { sets: [], total: goal, label: `${goal}er Challenge`, rest: 0 });
    out.push(s);
  }
  return out;
}

function trainSession(d, tests, week) {
  const { goal, goalDate } = state.settings;
  let t = tests[0];
  for (const x of tests) if (x.date <= d) t = x;
  const m = Math.max(1, t.max);
  const span = Math.max(1, diffDays(t.date, goalDate));
  const p = clamp(diffDays(t.date, d) / span, 0, 1);
  const v0 = clamp(Math.round(m * 2.2), 12, Math.round(goal * 0.85));
  let V = Math.max(v0, v0 + (goal * 0.88 - v0) * p);
  let label = 'Training';
  if (diffDays(d, goalDate) <= 4) { V *= 0.55; label = 'Taper'; }
  else if (week % 4 === 0) { V *= 0.75; label = 'Deload'; }
  V = Math.round(V);
  const cap = Math.max(4, Math.round(m * (1 + 0.5 * p) * 0.7));
  const k = clamp(Math.ceil(V / cap), 4, 14);
  const base = Math.floor(V / k);
  const rem = V % k;
  const sets = Array.from({ length: k }, (_, i) => base + (i < rem ? 1 : 0));
  const rest = k <= 5 ? 90 : k <= 8 ? 60 : 45;
  return { sets, total: V, rest, label };
}

function isDone(s) {
  if (s.type === 'test') return state.tests.some((t) => t.date === s.date);
  return state.pushups.some((p) => p.date === s.date);
}
function setsText(sets) {
  if (!sets.length) return '';
  const counts = {};
  sets.forEach((x) => (counts[x] = (counts[x] || 0) + 1));
  return Object.keys(counts).sort((a, b) => b - a).map((v) => `${counts[v]}×${v}`).join(' · ');
}

/* ================= Render: Home ================= */
function render() {
  renderHeader();
  renderHome();
  renderPlan();
  renderCal();
  renderCardio();
}

function renderHeader() {
  const left = diffDays(todayIso(), state.settings.goalDate);
  $('#countdown').innerHTML = left >= 0 ? `<b>${left}</b> TAGE` : 'ZIEL ERREICHT?';
}

function ringSvg(pct) {
  const r = 64, c = 2 * Math.PI * r;
  return `<svg viewBox="0 0 150 150">
    <circle class="ticks" cx="75" cy="75" r="72" fill="none" stroke-width="3" stroke-dasharray="1 5.2"/>
    <circle class="track" cx="75" cy="75" r="${r}" fill="none" stroke-width="10"/>
    <circle class="bar" cx="75" cy="75" r="${r}" fill="none" stroke-width="10" stroke-linecap="round"
      stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - pct)}"/>
  </svg>`;
}

function renderHome() {
  const el = $('#view-home');
  const { goal, goalDate } = state.settings;
  const today = todayIso();
  const best = bestTotal();
  const plan = getPlan();
  const todays = plan.find((s) => s.date === today);
  const next = plan.find((s) => s.date > today);

  const weekStart = addDays(today, -((parse(today).getDay() + 6) % 7));
  const weekEnd = addDays(weekStart, 6);
  const inWeek = (d) => d >= weekStart && d <= weekEnd;
  const weekReps = state.pushups.filter((p) => inWeek(p.date)).reduce((a, p) => a + p.total, 0);
  const weekPlanned = plan.filter((s) => inWeek(s.date)).length;
  const weekDone = plan.filter((s) => inWeek(s.date) && isDone(s)).length;

  let html = `
  <div class="card">
    <div class="kicker"><span>Mission · ${goal} Liegestütze</span><span>bis ${fmtShort(goalDate)}</span></div>
    <div class="hero">
      <div class="ring">${ringSvg(clamp(best / goal, 0, 1))}
        <div class="ring-center"><div class="ring-val">${best}</div><div class="ring-goal">/ ${goal} BEST</div></div>
      </div>
      <div class="stats">
        <div class="stat"><div class="stat-label">MAX-SATZ</div><div class="stat-val">${latestMax() || '–'} <small>Reps</small></div></div>
        <div class="stat"><div class="stat-label">DIESE WOCHE</div><div class="stat-val">${weekReps} <small>Reps</small></div></div>
        <div class="stat"><div class="stat-label">EINHEITEN</div><div class="stat-val">${weekDone}/${weekPlanned} <small>Woche</small></div></div>
      </div>
    </div>
  </div>`;

  if (!state.tests.length) {
    html += `
    <div class="card gold">
      <div class="kicker"><span>Start-Sequenz</span></div>
      <div class="h1">Max-Test machen</div>
      <p class="muted">Mach so viele saubere Liegestütze wie möglich am Stück (Brust fast am Boden, Körper gerade). Aus dem Ergebnis berechnet APEX deinen Plan bis ${fmtShort(goalDate)}.</p>
      <button class="btn solid block" data-act="test" style="margin-top:10px">Ergebnis eintragen</button>
    </div>`;
  } else if (todays) {
    html += sessionCard(todays, true);
  } else {
    html += `
    <div class="card">
      <div class="kicker"><span>Heute</span><span class="tag deload">Ruhetag</span></div>
      <div class="h1">Regeneration</div>
      <p class="muted">${next ? `Nächste Einheit: <b style="color:var(--text)">${fmtDate(next.date)}</b> · ${next.type === 'train' ? `${next.total} Reps (${setsText(next.sets)})` : next.label}` : 'Kein weiterer Termin im Plan.'}</p>
      <p class="muted small">Zeit für SkiErg oder eine lockere Radrunde.</p>
    </div>`;
  }

  html += `<div class="h2">REKORDE</div><div class="tiles">
    ${recordTile('ski', 2000)}${recordTile('bike', 10000)}
  </div>`;

  const recent = recentActivity(5);
  html += `<div class="h2">LETZTE AKTIVITÄT</div>`;
  html += recent.length ? `<div class="list">${recent.map(activityItem).join('')}</div>` : `<div class="card empty">Noch nichts eingetragen.</div>`;
  el.innerHTML = html;
}

function sessionCard(s, interactive) {
  const done = isDone(s);
  const tagCls = s.type === 'train' ? s.label.toLowerCase() : s.type;
  let html = `<div class="card ${s.type !== 'train' ? 'gold' : ''}">
    <div class="kicker"><span>${s.date === todayIso() ? 'Heute' : fmtDate(s.date)} · #${s.n} · Woche ${s.week}</span><span class="tag ${tagCls}">${s.label}</span></div>`;

  if (done) {
    const log = state.pushups.find((p) => p.date === s.date);
    const t = state.tests.find((x) => x.date === s.date);
    html += `<div class="h1" style="color:var(--ok)">✓ Erledigt</div>
      <p class="muted">${s.type === 'test' && t ? `Max-Satz: <b>${t.max}</b> Reps` : log ? `${log.total} Reps · ${setsText(log.sets)}` : ''}</p></div>`;
    return html;
  }

  if (s.type === 'test') {
    html += `<div class="h1">Max-Test</div>
      <p class="muted">Gut aufwärmen (2 × 10 locker), 3 Min Pause, dann 1 Satz so viele saubere Wiederholungen wie möglich. Das Ergebnis kalibriert die nächsten Wochen.</p>
      ${interactive ? `<button class="btn solid block" data-act="test" data-date="${s.date}" style="margin-top:10px">Ergebnis eintragen</button>` : ''}</div>`;
    return html;
  }
  if (s.type === 'final') {
    html += `<div class="h1">${s.total} Liegestütze</div>
      <p class="muted">Der Tag X. Teile die ${s.total} so auf, wie es sich gut anfühlt – Ziel: in so wenigen Sätzen wie möglich. Trage jeden Satz ein.</p>
      ${interactive ? `<button class="btn solid block" data-act="free" data-date="${s.date}" style="margin-top:10px">Sätze eintragen</button>` : ''}</div>`;
    return html;
  }

  if (!interactive) {
    html += `<div class="h1">${s.total} Reps</div><p class="muted">${s.sets.length} Sätze · ${setsText(s.sets)} · ${s.rest}s Pause</p></div>`;
    return html;
  }

  if (!state.draft || state.draft.date !== s.date) {
    state.draft = { date: s.date, sets: s.sets.map((t) => ({ t, a: t, done: false })) };
    persist();
  }
  const dr = state.draft;
  const doneReps = dr.sets.filter((x) => x.done).reduce((a, x) => a + x.a, 0);
  const nextIdx = dr.sets.findIndex((x) => !x.done);
  html += `<div class="row between"><div class="h1">${s.total} Reps</div><div class="num" style="color:var(--cyan)">${doneReps}/${s.total}</div></div>
    <div class="progress-line"><div style="width:${clamp(doneReps / s.total, 0, 1) * 100}%"></div></div>
    <div class="sets">${dr.sets.map((x, i) => `
      <button class="set ${x.done ? 'done' : ''} ${i === nextIdx ? 'next' : ''} ${i === dr.sets.length - 1 ? 'plus' : ''}" data-act="set" data-i="${i}">
        <div class="n">${x.a}</div><div class="l">Satz ${i + 1}</div>
      </button>`).join('')}
    </div>
    <p class="muted small">Tippen = Satz erledigt (startet ${s.rest}s Pause). Nochmal tippen = Wiederholungen anpassen. Letzter Satz „+“: wenn's geht, mehr machen.</p>
    <div class="row" style="margin-top:10px">
      <button class="btn solid grow" data-act="finish">Einheit speichern</button>
    </div>
  </div>`;
  return html;
}

function recentActivity(limit) {
  const items = [
    ...state.pushups.map((p) => ({ kind: 'pu', date: p.date, id: p.id, data: p })),
    ...state.tests.map((t) => ({ kind: 'test', date: t.date, id: t.id, data: t })),
    ...state.cardio.map((c) => ({ kind: c.type, date: c.date, id: c.id, data: c }))
  ].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  return limit ? items.slice(0, limit) : items;
}

function activityItem(it, withDelete) {
  const colors = { pu: 'var(--cyan)', test: 'var(--gold)', ski: 'var(--ski)', bike: 'var(--bike)' };
  let title, sub;
  if (it.kind === 'pu') { title = `${it.data.total} Liegestütze`; sub = setsText(it.data.sets); }
  else if (it.kind === 'test') { title = `Max-Test: ${it.data.max}`; sub = 'Liegestütze am Stück'; }
  else {
    const c = it.data;
    const pr = isRecord(c);
    title = `${TYPES[c.type].name} ${fmtDist(c.dist)} · ${fmtTime(c.time)}${pr ? '<span class="pr-badge">PR</span>' : ''}`;
    sub = [paceText(c.type, c.dist, c.time), c.watts ? `${c.watts} W` : '', esc(c.notes)].filter(Boolean).join(' · ');
  }
  return `<div class="item">
    <span class="dot" style="background:${colors[it.kind]};box-shadow:0 0 8px ${colors[it.kind]}"></span>
    <div class="grow"><div class="item-title">${title}</div><div class="item-sub">${fmtDate(it.date)}${sub ? ' · ' + sub : ''}</div></div>
    ${withDelete ? `<button class="icon-btn" data-act="del" data-kind="${it.kind}" data-id="${it.id}" aria-label="Löschen"><svg viewBox="0 0 24 24"><path d="M5 7h14M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg></button>` : ''}
  </div>`;
}

/* ================= Records ================= */
function attempts(type, dist) {
  return state.cardio.filter((c) => c.type === type && c.dist === dist).sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
}
function bestOf(type, dist) {
  const a = attempts(type, dist);
  return a.length ? a.reduce((b, x) => (x.time < b.time ? x : b)) : null;
}
function isRecord(c) { const b = bestOf(c.type, c.dist); return b && b.id === c.id; }

function sparkline(type, dist) {
  const a = attempts(type, dist);
  if (a.length < 2) return '';
  // running best: line only goes up when a new record is set (lower time = higher on chart)
  const times = a.map((x) => x.time);
  const min = Math.min(...times), max = Math.max(...times);
  const W = 120, H = 30;
  const pts = times.map((t, i) => `${(i / (times.length - 1)) * W},${max === min ? H / 2 : 3 + ((t - min) / (max - min)) * (H - 6)}`);
  const col = type === 'ski' ? 'var(--ski)' : 'var(--bike)';
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><polyline points="${pts.join(' ')}" fill="none" stroke="${col}" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round"/></svg>`;
}

function recordTile(type, dist) {
  const b = bestOf(type, dist);
  const a = attempts(type, dist);
  let delta = '';
  if (b && a.length > 1) {
    const prevBest = Math.min(...a.filter((x) => x.id !== b.id && x.date <= b.date).map((x) => x.time));
    if (isFinite(prevBest)) delta = `<span class="delta">−${(prevBest - b.time).toFixed(1)}s</span>`;
  }
  return `<button class="tile ${type} ${b ? '' : 'empty'}" data-act="cardio" data-type="${type}" data-dist="${dist}">
    <div class="tile-dist">${TYPES[type].name.toUpperCase()} · ${fmtDist(dist)}</div>
    <div class="tile-time">${b ? fmtTime(b.time) : '--:--'}</div>
    <div class="tile-sub">${b ? `${paceText(type, dist, b.time)} ${delta}` : 'Noch keine Zeit'}</div>
    ${sparkline(type, dist)}
  </button>`;
}

/* ================= Render: Plan ================= */
function renderPlan() {
  const el = $('#view-plan');
  const { goal, goalDate, days } = state.settings;
  const plan = getPlan();
  const today = todayIso();
  const m = latestMax();

  let html = `<div class="card">
    <div class="kicker"><span>Strategie</span><span>${goal} bis ${fmtShort(goalDate)}</span></div>
    <div class="h1">So schaffst du ${goal}</div>
    <p class="muted">Ziel: <b style="color:var(--text)">${goal} Liegestütze in einer Einheit</b> am ${fmtShort(goalDate)} – in so wenigen Sätzen wie möglich. Der Plan rechnet sich aus deinem letzten Max-Test und passt sich bei jedem neuen Test automatisch an.</p>
    <div class="phases" style="margin-top:12px">
      <div class="phase"><div class="bar"></div><div><b>1 · BASIS</b><p class="muted small">Technik sauber, Volumen ≈ 2× dein Max-Satz pro Einheit, Sätze bei ~70 % vom Max. 90 s Pause.</p></div></div>
      <div class="phase"><div class="bar"></div><div><b>2 · AUFBAU</b><p class="muted small">Volumen steigt jede Einheit ein Stück, Sätze werden größer, Pausen kürzer (60 s). Alle 2 Wochen Max-Test.</p></div></div>
      <div class="phase"><div class="bar"></div><div><b>3 · PEAK</b><p class="muted small">Einheiten nahe 170–180 Reps als Generalprobe, dann 4 Tage Taper (weniger Volumen) und am Ziel-Tag: ${goal}.</p></div></div>
    </div>
    <ul class="rules muted small">
      <li>3 Einheiten pro Woche, mindestens 1 Ruhetag dazwischen.</li>
      <li>Jede 4. Woche Deload (−25 %) – da wirst du stärker, nicht schwächer.</li>
      <li>Saubere Wiederholung: Körper gerade, Brust bis ~1 Faust über dem Boden, Arme ganz strecken.</li>
      <li>Satz nicht geschafft? Kurz pausieren, Rest auffüllen und im nächsten Satz weiter. Schmerzen im Gelenk → Pause.</li>
      <li>Schaffst du die Einheiten locker → Max-Test vorziehen, dann steigt der Plan.</li>
    </ul>
    ${m ? `<p class="muted small" style="margin-top:10px">Ehrlich gesagt: Bei Max-Satz <b style="color:var(--text)">${m}</b> und ${Math.max(0, diffDays(today, goalDate))} Tagen ist das ${m >= 45 ? 'gut machbar' : m >= 25 ? 'ambitioniert, aber realistisch mit Disziplin' : 'sehr sportlich – bleib dran, jeder Test zählt'}.</p>` : ''}
  </div>`;

  html += `<div class="h2">EINHEITEN</div>`;
  if (!plan.length) {
    html += `<div class="card empty">Mach zuerst einen Max-Test, dann erscheint hier dein Plan.<br><br><button class="btn solid" data-act="test">Max-Test eintragen</button></div>`;
  } else {
    const weeks = {};
    plan.forEach((s) => (weeks[s.week] = weeks[s.week] || []).push(s));
    for (const w of Object.keys(weeks)) {
      const list = weeks[w];
      const cur = list.some((s) => s.date >= addDays(today, -6) && s.date <= today) && list[list.length - 1].date >= today;
      html += `<div class="week ${cur ? 'current' : ''}">
        <div class="week-head"><span class="week-title">WOCHE ${w} · ${list[0].phase.toUpperCase()}</span><span class="week-sub">${list.filter((s) => s.type === 'train').reduce((a, s) => a + s.total, 0)} Reps geplant</span></div>
        <div class="card plan-card">${list.map((s) => planRow(s, today)).join('')}</div>
      </div>`;
    }
  }

  html += `<div class="h2">EINSTELLUNGEN</div>
  <div class="card">
    <div class="field"><label>Trainingstage</label>
      <div class="days">${[1, 2, 3, 4, 5, 6, 0].map((d) => `<button class="day-tog ${days.includes(d) ? 'on' : ''}" data-act="day" data-d="${d}">${WD[d]}</button>`).join('')}</div>
    </div>
    <div class="row">
      <div class="field grow"><label>Ziel (Reps)</label><input class="input" type="number" inputmode="numeric" id="setGoal" value="${goal}"></div>
      <div class="field grow"><label>Ziel-Datum</label><input class="input" type="date" id="setGoalDate" value="${goalDate}"></div>
    </div>
    <div class="row wrap">
      <button class="btn ghost sm" data-act="export">Backup exportieren</button>
      <button class="btn ghost sm" data-act="import">Backup laden</button>
      <button class="btn danger sm" data-act="reset">Alles löschen</button>
    </div>
  </div>`;
  el.innerHTML = html;
}

function planRow(s, today) {
  const done = isDone(s);
  const past = s.date < today;
  const st = done ? '<span class="st ok">✓</span>' : past ? '<span class="st miss">✕</span>' : '<span class="st"></span>';
  let what;
  if (s.type === 'train') what = `<span>${setsText(s.sets)}${s.label !== 'Training' ? ` <span class="tag ${s.label.toLowerCase()}">${s.label}</span>` : ''}</span>`;
  else what = `<span class="tag ${s.type}">${s.label}</span>`;
  return `<div class="prow ${s.date === today ? 'today' : ''} ${past && !done ? 'past' : ''}">
    <span class="d">${WD[parse(s.date).getDay()]} ${fmtShort(s.date)}</span>${what}
    <span class="t">${s.type === 'test' ? 'MAX' : s.total}</span>${st}</div>`;
}

/* ================= Render: Calendar ================= */
let calMonth = (() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); })();
let calSel = todayIso();

function renderCal() {
  const el = $('#view-cal');
  const plan = getPlan();
  const planBy = Object.fromEntries(plan.map((s) => [s.date, s]));
  const today = todayIso();
  const y = calMonth.getFullYear(), mo = calMonth.getMonth();
  const first = new Date(y, mo, 1);
  const startOffset = (first.getDay() + 6) % 7;
  const gridStart = iso(new Date(y, mo, 1 - startOffset));

  let cells = '';
  for (let i = 0; i < 42; i++) {
    const d = addDays(gridStart, i);
    const dd = parse(d);
    if (i >= 35 && dd.getMonth() !== mo) break;
    const dots = [];
    const ps = planBy[d];
    if (state.pushups.some((p) => p.date === d)) dots.push('pu');
    else if (ps && ps.type === 'train') dots.push('pu-plan');
    if (state.tests.some((t) => t.date === d) || (ps && ps.type === 'test' && !isDone(ps))) dots.push('test');
    if (state.cardio.some((c) => c.date === d && c.type === 'ski')) dots.push('ski');
    if (state.cardio.some((c) => c.date === d && c.type === 'bike')) dots.push('bike');
    const cls = ['cal-day', dd.getMonth() !== mo ? 'out' : '', d === today ? 'today' : '', d === calSel ? 'sel' : '', d === state.settings.goalDate ? 'goal' : ''].join(' ');
    cells += `<button class="${cls}" data-act="cal-day" data-date="${d}">${dd.getDate()}<span class="dots">${dots.map((c) => `<i class="${c}"></i>`).join('')}</span></button>`;
  }

  let html = `<div class="card">
    <div class="cal-head">
      <button class="icon-btn" data-act="cal-prev" aria-label="Voriger Monat"><svg viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6"/></svg></button>
      <div class="cal-title">${MONTHS[mo].toUpperCase()} ${y}</div>
      <button class="icon-btn" data-act="cal-next" aria-label="Nächster Monat"><svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg></button>
    </div>
    <div class="cal-grid">${['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map((w) => `<div class="cal-wd">${w}</div>`).join('')}${cells}</div>
    <div class="legend">
      <span><span class="dots"><i class="pu-plan"></i></span>geplant</span>
      <span><span class="dots"><i class="pu"></i></span>Liegestütze</span>
      <span><span class="dots"><i class="test"></i></span>Max-Test</span>
      <span><span class="dots"><i class="ski"></i></span>SkiErg</span>
      <span><span class="dots"><i class="bike"></i></span>Rad</span>
    </div>
  </div>`;

  html += `<div class="h2">${fmtDate(calSel).toUpperCase()}</div>`;
  const ps = planBy[calSel];
  if (ps) html += sessionCard(ps, calSel === today);
  const items = recentActivity().filter((it) => it.date === calSel);
  if (items.length) html += `<div class="list">${items.map((it) => activityItem(it, true)).join('')}</div>`;
  if (!ps && !items.length) html += `<div class="card empty">Nichts geplant oder eingetragen.</div>`;
  html += `<button class="btn ghost block" data-act="add" data-date="${calSel}" style="margin-top:12px">+ Eintrag für diesen Tag</button>`;
  el.innerHTML = html;
}

/* ================= Render: Cardio ================= */
let cardioType = 'ski';
function renderCardio() {
  const el = $('#view-cardio');
  const t = TYPES[cardioType];
  const extra = [...new Set(state.cardio.filter((c) => c.type === cardioType && !t.dists.includes(c.dist)).map((c) => c.dist))].sort((a, b) => a - b);
  const hist = state.cardio.filter((c) => c.type === cardioType).sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));

  el.innerHTML = `
    <div class="seg">
      <button class="${cardioType === 'ski' ? 'on ski' : ''}" data-act="ctype" data-type="ski">SKIERG</button>
      <button class="${cardioType === 'bike' ? 'on bike' : ''}" data-act="ctype" data-type="bike">FAHRRAD</button>
    </div>
    <div class="tiles">${[...t.dists, ...extra].map((d) => recordTile(cardioType, d)).join('')}</div>
    <button class="btn ${cardioType} solid block" data-act="cardio" data-type="${cardioType}" style="margin-top:14px">+ Neue ${t.name}-Zeit</button>
    <div class="h2">VERLAUF</div>
    ${hist.length ? `<div class="list">${hist.map((c) => activityItem({ kind: c.type, date: c.date, id: c.id, data: c }, true)).join('')}</div>` : `<div class="card empty">Noch keine ${t.name}-Einträge.</div>`}
  `;
}

/* ================= Sheets / forms ================= */
function openSheet(html) { $('#sheetPanel').innerHTML = html; $('#sheet').classList.remove('hidden'); }
function closeSheet() { $('#sheet').classList.add('hidden'); $('#sheetPanel').innerHTML = ''; }

function sheetAdd(date) {
  const d = date || todayIso();
  openSheet(`<div class="kicker"><span>Neuer Eintrag</span><span>${fmtDate(d)}</span></div>
    <div class="menu">
      <button data-act="free" data-date="${d}"><span class="mi" style="background:rgba(61,245,255,.15);color:var(--cyan)">PU</span><div><b>Liegestütze</b><span>Sätze frei eintragen</span></div></button>
      <button data-act="test" data-date="${d}"><span class="mi" style="background:rgba(255,213,74,.15);color:var(--gold)">MAX</span><div><b>Max-Test</b><span>So viele wie möglich am Stück</span></div></button>
      <button data-act="cardio" data-type="ski" data-date="${d}"><span class="mi" style="background:rgba(255,138,61,.15);color:var(--ski)">SKI</span><div><b>SkiErg</b><span>Zeit über eine Distanz</span></div></button>
      <button data-act="cardio" data-type="bike" data-date="${d}"><span class="mi" style="background:rgba(167,123,255,.15);color:var(--bike)">BIKE</span><div><b>Fahrrad</b><span>Zeit über eine Distanz</span></div></button>
    </div>`);
}

function sheetTest(date) {
  const d = date || todayIso();
  openSheet(`<div class="kicker"><span>Max-Test</span></div>
    <div class="h1">Wie viele am Stück?</div>
    <p class="muted small">Nur saubere Wiederholungen zählen.</p>
    <div class="field" style="margin-top:14px"><div class="stepper">
      <button data-act="step" data-t="#testMax" data-v="-1">−</button>
      <input class="input big" id="testMax" type="number" inputmode="numeric" value="${latestMax() || 20}">
      <button data-act="step" data-t="#testMax" data-v="1">+</button>
    </div></div>
    <div class="field"><label>Datum</label><input class="input" type="date" id="testDate" value="${d}"></div>
    <button class="btn solid block" data-act="save-test">Speichern</button>`);
}

function sheetFree(date) {
  const d = date || todayIso();
  openSheet(`<div class="kicker"><span>Liegestütze</span></div>
    <div class="h1">Sätze eintragen</div>
    <p class="muted small">Wiederholungen pro Satz, mit Leerzeichen oder Komma getrennt.</p>
    <div class="field" style="margin-top:14px"><label>Sätze</label><input class="input big" id="freeSets" inputmode="text" placeholder="25 20 20 15"></div>
    <div class="preview" id="freePreview"></div>
    <div class="field" style="margin-top:12px"><label>Datum</label><input class="input" type="date" id="freeDate" value="${d}"></div>
    <button class="btn solid block" data-act="save-free">Speichern</button>`);
}

function sheetCardio(type, dist, date) {
  type = type || 'ski';
  const t = TYPES[type];
  const d = date || todayIso();
  dist = dist || (type === 'ski' ? 2000 : 10000);
  const isStd = t.dists.includes(dist);
  const b = bestOf(type, dist);
  openSheet(`<div class="kicker"><span>${t.name}</span><span id="cBest">${b ? `Rekord: ${fmtTime(b.time)}` : ''}</span></div>
    <div class="seg">
      <button class="${type === 'ski' ? 'on ski' : ''}" data-act="c-switch" data-type="ski">SKIERG</button>
      <button class="${type === 'bike' ? 'on bike' : ''}" data-act="c-switch" data-type="bike">FAHRRAD</button>
    </div>
    <input type="hidden" id="cType" value="${type}">
    <div class="field"><label>Distanz</label>
      <div class="chips" id="cChips">${t.dists.map((x) => `<button class="chip ${x === dist ? 'on ' + type : ''}" data-act="c-dist" data-dist="${x}">${fmtDist(x)}</button>`).join('')}
        <button class="chip ${!isStd ? 'on ' + type : ''}" data-act="c-dist" data-dist="custom">Andere</button></div>
      <input class="input ${isStd ? 'hidden' : ''}" id="cCustom" type="number" inputmode="numeric" placeholder="Meter, z. B. 3000" value="${isStd ? '' : dist}" style="margin-top:8px">
      <input type="hidden" id="cDist" value="${dist}">
    </div>
    <div class="field"><label>Zeit (m:ss oder h:mm:ss)</label><input class="input big" id="cTime" inputmode="decimal" placeholder="${type === 'ski' ? '7:45.3' : '22:30'}"></div>
    <div class="preview" id="cPreview"></div>
    <div class="row" style="margin-top:12px">
      <div class="field grow"><label>Datum</label><input class="input" type="date" id="cDate" value="${d}"></div>
      <div class="field" style="width:110px"><label>Ø Watt</label><input class="input" type="number" inputmode="numeric" id="cWatts" placeholder="opt."></div>
    </div>
    <div class="field"><label>Notiz</label><input class="input" id="cNotes" placeholder="optional"></div>
    <button class="btn ${type} solid block" data-act="save-cardio">Speichern</button>`);
}

function sheetEditSet(i) {
  const x = state.draft.sets[i];
  openSheet(`<div class="kicker"><span>Satz ${i + 1}</span><span>Ziel: ${x.t}</span></div>
    <div class="h1">Wie viele geschafft?</div>
    <div class="field" style="margin-top:14px"><div class="stepper">
      <button data-act="step" data-t="#setReps" data-v="-1">−</button>
      <input class="input big" id="setReps" type="number" inputmode="numeric" value="${x.a}">
      <button data-act="step" data-t="#setReps" data-v="1">+</button>
    </div></div>
    <div class="row">
      <button class="btn ghost grow" data-act="set-undo" data-i="${i}">Nicht erledigt</button>
      <button class="btn solid grow" data-act="set-save" data-i="${i}">Übernehmen</button>
    </div>`);
}

function updateCardioPreview() {
  const type = $('#cType').value;
  const dist = +$('#cDist').value;
  const sec = parseTime($('#cTime').value);
  const p = $('#cPreview');
  if (!sec || !dist) { p.textContent = ''; return; }
  const b = bestOf(type, dist);
  let txt = paceText(type, dist, sec);
  if (b) txt += sec < b.time ? ` · REKORD −${(b.time - sec).toFixed(1)}s` : ` · +${(sec - b.time).toFixed(1)}s zum Rekord`;
  p.textContent = txt;
  p.style.color = b && sec < b.time ? 'var(--gold)' : '';
  $('#cBest').textContent = b ? `Rekord: ${fmtTime(b.time)}` : 'Erster Eintrag';
}

/* ================= Actions ================= */
function saveCardio() {
  const type = $('#cType').value;
  const dist = Math.round(+$('#cDist').value);
  const time = parseTime($('#cTime').value);
  const date = $('#cDate').value || todayIso();
  if (!dist || dist <= 0) return toast('Distanz fehlt');
  if (!time) return toast('Zeit im Format m:ss eingeben');
  const prev = bestOf(type, dist);
  const entry = { id: uid(), date, type, dist, time, watts: +$('#cWatts').value || null, notes: $('#cNotes').value.trim() };
  state.cardio.push(entry);
  closeSheet();
  cardioType = type;
  save();
  if (!prev || time < prev.time) {
    showPR(fmtTime(time), `${TYPES[type].name} · ${fmtDist(dist)}${prev ? ` · −${(prev.time - time).toFixed(1)}s` : ' · erster Rekord'}`);
  } else toast(`Gespeichert · ${fmtTime(time)}`);
}

function saveTest() {
  const max = Math.round(+$('#testMax').value);
  const date = $('#testDate').value || todayIso();
  if (!max || max < 1) return toast('Zahl eingeben');
  const prevBest = bestSet();
  state.tests = state.tests.filter((t) => t.date !== date);
  state.tests.push({ id: uid(), date, max });
  if (state.draft && state.draft.date >= date) state.draft = null;
  closeSheet();
  save();
  if (prevBest && max > prevBest) showPR(`${max}`, `Liegestütze am Stück · +${max - prevBest}`);
  else toast(state.tests.length === 1 ? 'Plan erstellt – schau in den Plan-Tab' : 'Max-Test gespeichert · Plan angepasst');
}

function savePushups(date, sets, planned) {
  const total = sets.reduce((a, b) => a + b, 0);
  const prevBest = bestTotal();
  const existing = state.pushups.find((p) => p.date === date);
  if (existing) { existing.sets = existing.sets.concat(sets); existing.total += total; }
  else state.pushups.push({ id: uid(), date, sets, total, planned });
  const newTotal = existing ? existing.total : total;
  save();
  if (newTotal >= state.settings.goal && prevBest < state.settings.goal) showPR(`${newTotal}`, 'ZIEL ERREICHT. Respekt.');
  else if (prevBest && newTotal > prevBest) showPR(`${newTotal}`, 'Liegestütze in einer Einheit');
  else toast(`${total} Liegestütze gespeichert`);
}

function deleteEntry(kind, id) {
  if (!confirm('Eintrag löschen?')) return;
  if (kind === 'pu') state.pushups = state.pushups.filter((x) => x.id !== id);
  else if (kind === 'test') state.tests = state.tests.filter((x) => x.id !== id);
  else state.cardio = state.cardio.filter((x) => x.id !== id);
  save();
}

/* ================= Rest timer ================= */
let restEnd = 0, restTotal = 0, restInt = null;
function startRest(sec) {
  restTotal = sec; restEnd = Date.now() + sec * 1000;
  $('#rest').classList.remove('hidden');
  clearInterval(restInt);
  tickRest();
  restInt = setInterval(tickRest, 250);
}
function tickRest() {
  const left = Math.max(0, Math.ceil((restEnd - Date.now()) / 1000));
  $('#restTime').textContent = `${Math.floor(left / 60)}:${pad(left % 60)}`;
  $('#restBar').style.width = `${(left / restTotal) * 100}%`;
  if (left <= 0) {
    stopRest();
    try { navigator.vibrate && navigator.vibrate([200, 100, 200]); } catch (e) {}
    toast('Nächster Satz!');
  }
}
function stopRest() { clearInterval(restInt); restInt = null; $('#rest').classList.add('hidden'); }

/* ================= Feedback ================= */
let toastT;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove('show'), 2200);
}
function showPR(value, sub) {
  $('#prValue').textContent = value;
  $('#prSub').textContent = sub;
  $('#pr').classList.remove('hidden');
  try { navigator.vibrate && navigator.vibrate([80, 60, 80, 60, 200]); } catch (e) {}
  setTimeout(() => $('#pr').classList.add('hidden'), 2800);
}

/* ================= Events ================= */
function switchTab(tab) {
  document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.view').forEach((v) => v.classList.toggle('active', v.id === `view-${tab}`));
  window.scrollTo(0, 0);
}

document.addEventListener('click', (e) => {
  const tabBtn = e.target.closest('[data-tab]');
  if (tabBtn) return switchTab(tabBtn.dataset.tab);
  if (e.target.closest('#pr')) return $('#pr').classList.add('hidden');
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const { act } = b.dataset;
  const plan = getPlan();

  switch (act) {
    case 'close': closeSheet(); break;
    case 'add': sheetAdd(b.dataset.date); break;
    case 'test': sheetTest(b.dataset.date); break;
    case 'free': sheetFree(b.dataset.date); break;
    case 'cardio': sheetCardio(b.dataset.type, b.dataset.dist ? +b.dataset.dist : null, b.dataset.date); break;
    case 'step': {
      const inp = $(b.dataset.t);
      inp.value = Math.max(0, (+inp.value || 0) + +b.dataset.v);
      break;
    }
    case 'save-test': saveTest(); break;
    case 'save-free': {
      const sets = ($('#freeSets').value.match(/\d+/g) || []).map(Number).filter((n) => n > 0);
      if (!sets.length) return toast('Mindestens einen Satz eingeben');
      const date = $('#freeDate').value || todayIso();
      closeSheet();
      savePushups(date, sets, plan.some((s) => s.date === date));
      break;
    }
    case 'c-switch': {
      const date = $('#cDate').value;
      sheetCardio(b.dataset.type, null, date);
      break;
    }
    case 'c-dist': {
      const type = $('#cType').value;
      document.querySelectorAll('#cChips .chip').forEach((c) => c.className = 'chip');
      b.className = `chip on ${type}`;
      const custom = b.dataset.dist === 'custom';
      $('#cCustom').classList.toggle('hidden', !custom);
      if (custom) { $('#cDist').value = $('#cCustom').value || ''; $('#cCustom').focus(); }
      else $('#cDist').value = b.dataset.dist;
      updateCardioPreview();
      break;
    }
    case 'save-cardio': saveCardio(); break;
    case 'set': {
      const i = +b.dataset.i;
      const x = state.draft.sets[i];
      if (x.done) return sheetEditSet(i);
      x.done = true;
      persist();
      const s = plan.find((p) => p.date === state.draft.date);
      renderHome();
      if (state.draft.sets.every((y) => y.done)) { stopRest(); toast('Alle Sätze geschafft – jetzt speichern!'); }
      else if (s) startRest(s.rest);
      renderCal();
      break;
    }
    case 'set-save': {
      const x = state.draft.sets[+b.dataset.i];
      x.a = Math.max(0, Math.round(+$('#setReps').value || 0));
      x.done = true;
      persist(); closeSheet(); renderHome(); renderCal();
      break;
    }
    case 'set-undo': {
      state.draft.sets[+b.dataset.i].done = false;
      persist(); closeSheet(); renderHome(); renderCal();
      break;
    }
    case 'finish': {
      const dr = state.draft;
      const sets = dr.sets.filter((x) => x.done && x.a > 0).map((x) => x.a);
      if (!sets.length) return toast('Noch kein Satz erledigt');
      if (sets.length < dr.sets.length && !confirm(`Erst ${sets.length} von ${dr.sets.length} Sätzen erledigt. Trotzdem speichern?`)) return;
      const date = dr.date;
      state.draft = null;
      stopRest();
      savePushups(date, sets, true);
      break;
    }
    case 'rest-add': restEnd += 15000; restTotal += 15; tickRest(); break;
    case 'rest-skip': stopRest(); break;
    case 'del': deleteEntry(b.dataset.kind, b.dataset.id); break;
    case 'cal-prev': calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() - 1, 1); renderCal(); break;
    case 'cal-next': calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 1); renderCal(); break;
    case 'cal-day': calSel = b.dataset.date; renderCal(); break;
    case 'ctype': cardioType = b.dataset.type; renderCardio(); break;
    case 'day': {
      const d = +b.dataset.d;
      const days = state.settings.days;
      state.settings.days = days.includes(d) ? days.filter((x) => x !== d) : [...days, d];
      save();
      break;
    }
    case 'export': {
      const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `apex-backup-${todayIso()}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      break;
    }
    case 'import': $('#importFile').click(); break;
    case 'reset':
      if (confirm('Wirklich ALLE Daten löschen? (Vorher Backup exportieren!)')) { state = defaults(); save(); }
      break;
  }
});

document.addEventListener('input', (e) => {
  if (e.target.id === 'cTime') updateCardioPreview();
  if (e.target.id === 'cCustom') { $('#cDist').value = e.target.value; updateCardioPreview(); }
  if (e.target.id === 'freeSets') {
    const sets = (e.target.value.match(/\d+/g) || []).map(Number);
    $('#freePreview').textContent = sets.length ? `${sets.length} Sätze · ${sets.reduce((a, b) => a + b, 0)} Reps` : '';
  }
});

document.addEventListener('change', (e) => {
  if (e.target.id === 'setGoal') {
    const v = Math.round(+e.target.value);
    if (v > 0) { state.settings.goal = v; save(); }
  }
  if (e.target.id === 'setGoalDate' && e.target.value) { state.settings.goalDate = e.target.value; save(); }
  if (e.target.id === 'importFile') {
    const f = e.target.files[0];
    if (!f) return;
    f.text().then((txt) => {
      const data = JSON.parse(txt);
      if (!data.settings || !Array.isArray(data.cardio)) throw new Error('bad');
      if (!confirm('Backup laden? Aktuelle Daten werden ersetzt.')) return;
      state = { ...defaults(), ...data };
      save();
      toast('Backup geladen');
    }).catch(() => toast('Datei ist kein gültiges APEX-Backup'));
    e.target.value = '';
  }
});

// Refresh when the app comes back to the foreground on a new day.
let lastDay = todayIso();
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && todayIso() !== lastDay) { lastDay = todayIso(); planCache = null; render(); }
});

render();
