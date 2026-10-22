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
// Bodyweight programs: each gets its own goal, max tests, plan and records.
const EX = {
  pu: {
    name: 'Liegestütze', short: 'LS', color: 'var(--cyan)', defGoal: 200, presets: [100, 200, 300, 500, 1000], step: 10,
    minV: 12, minCap: 4, rest: [90, 60, 45], timeReps: [50, 100, 200], amrap: [60, 120, 300],
    testHint: 'Gut aufwärmen (2 × 10 locker), 3 Min Pause, dann 1 Satz so viele saubere Liegestütze wie möglich.',
    form: 'Körper gerade, Brust bis ~1 Faust über dem Boden, Arme ganz strecken.'
  },
  pull: {
    name: 'Klimmzüge', short: 'KZ', color: 'var(--pull)', defGoal: 50, presets: [20, 30, 50, 75, 100], step: 5,
    minV: 6, minCap: 2, rest: [120, 90, 75], timeReps: [10, 25, 50], amrap: [60, 120, 300],
    testHint: 'Schultern aufwärmen, 2 × 3 locker, 3 Min Pause, dann 1 Satz so viele saubere Klimmzüge wie möglich – aus dem toten Hang, Kinn über die Stange.',
    form: 'Aus dem toten Hang starten, Kinn über die Stange, kein Schwung, kontrolliert runter.'
  }
};
const EX_KEYS = Object.keys(EX);

const $ = (s) => document.querySelector(s);
const pad = (n) => String(n).padStart(2, '0');
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const byDate = (a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id);
const byDateDesc = (a, b) => byDate(b, a);

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
// Stopwatch display, always with tenths and never rounding up to the next second.
function fmtClock(sec) {
  const t = Math.floor(Math.max(0, sec) * 10);
  const m = Math.floor(t / 600);
  const r = t - m * 600;
  return `${m}:${pad(Math.floor(r / 10))}.${r % 10}`;
}
function parseTime(str) {
  if (!str) return null;
  const parts = String(str).trim().replace(',', '.').split(':');
  if (parts.length > 3 || parts.some((p) => p === '' || isNaN(p))) return null;
  const sec = parts.reduce((acc, p) => acc * 60 + parseFloat(p), 0);
  return sec > 0 ? sec : null;
}
const fmtDur = (sec) => (sec % 60 === 0 ? `${sec / 60} Min` : fmtTime(sec));
const fmtDist = (m) => (m >= 1000 ? `${+(m / 1000).toFixed(2)} km` : `${m} m`);
function paceText(type, dist, sec) {
  if (!dist || !sec) return '';
  if (type === 'ski') return `${fmtTime(sec / (dist / 500))} /500m`;
  return `${((dist / 1000) / (sec / 3600)).toFixed(1)} km/h`;
}

/* ================= State ================= */
function defaults() {
  const end = `${new Date().getFullYear()}-12-31`;
  return {
    settings: { days: [1, 3, 5], goals: Object.fromEntries(EX_KEYS.map((k) => [k, { goal: EX[k].defGoal, goalDate: end }])) },
    tests: [],     // { id, date, ex, max }
    pushups: [],   // bodyweight sessions (name kept for old backups): { id, date, ex, sets: [n], total, planned }
    timed: [],     // { id, date, ex, mode, target, value }  mode 'time': target = reps, value = sec · 'amrap': target = sec, value = reps
    cardio: [],    // { id, date, type, dist, time, watts, notes }
    gym: [],       // { id, date, title, exercises: [{ name, sets: [{ reps, kg }] }], notes }
    drafts: {}     // per exercise: in-progress session { date, sets: [{ t, a, done }] }
  };
}
// Older versions only knew push-ups: a single goal in settings and entries without `ex`.
function migrate(raw) {
  const d = defaults();
  const rs = raw.settings || {};
  const s = { ...d, ...raw, settings: { ...d.settings, ...rs } };
  s.settings.goals = { ...d.settings.goals, ...(rs.goals || {}) };
  if (!rs.goals && rs.goal) s.settings.goals.pu = { goal: rs.goal, goalDate: rs.goalDate || d.settings.goals.pu.goalDate };
  delete s.settings.goal;
  delete s.settings.goalDate;
  s.tests = (s.tests || []).map((t) => ({ ex: 'pu', ...t }));
  s.pushups = (s.pushups || []).map((p) => ({ ex: 'pu', ...p }));
  s.timed = s.timed || [];
  s.cardio = s.cardio || [];
  s.gym = s.gym || [];
  s.drafts = s.drafts || {};
  if (raw.draft && !s.drafts.pu) s.drafts.pu = raw.draft;
  delete s.draft;
  return s;
}
function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY));
    if (raw && raw.settings) return migrate(raw);
  } catch (e) {}
  return defaults();
}
let state = load();
let planCache = {};

function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { toast('Speichern fehlgeschlagen'); }
}
function save() { persist(); planCache = {}; render(); }

const goalOf = (ex) => state.settings.goals[ex];
const testsOf = (ex) => state.tests.filter((t) => t.ex === ex).sort(byDate);
const sessOf = (ex) => state.pushups.filter((p) => p.ex === ex).sort(byDate);
const latestMax = (ex) => { const t = testsOf(ex); return t.length ? t[t.length - 1].max : 0; };
const bestTotal = (ex) => Math.max(0, ...sessOf(ex).map((p) => p.total), ...testsOf(ex).map((t) => t.max));
const bestSet = (ex) => Math.max(0, ...testsOf(ex).map((t) => t.max), ...sessOf(ex).flatMap((p) => p.sets));

/* ================= Plan generator =================
   Ziel: <goal> Wiederholungen in einer Einheit am <goalDate> (je Übung).
   - 3 Einheiten/Woche (Tage einstellbar), Volumen steigt linear vom Startniveau
     (≈ 2,2 × Max-Satz) bis ≈ 88 % des Ziels kurz vor dem Finale.
   - Satzgröße ≈ 70 % des (hochgerechneten) Max-Satzes → Anzahl Sätze ergibt sich daraus.
   - Alle 14 Tage Max-Test; jeder neue Test kalibriert alle folgenden Einheiten neu.
   - Jede 4. Woche Deload (−25 %), die letzten 4 Tage vor dem Finale Taper (−45 %). */
function getPlan(ex) { if (!planCache[ex]) planCache[ex] = buildPlan(ex); return planCache[ex]; }

function buildPlan(ex) {
  const tests = testsOf(ex);
  if (!tests.length) return [];
  const { goal, goalDate } = goalOf(ex);
  const { days } = state.settings;
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
    const s = { ex, date: d, n, week, phase, type };
    if (type === 'train') Object.assign(s, trainSession(ex, d, tests, week));
    else if (type === 'test') Object.assign(s, { sets: [], total: 0, label: 'Max-Test', rest: 0 });
    else Object.assign(s, { sets: [], total: goal, label: `${goal}er Challenge`, rest: 0 });
    out.push(s);
  }
  return out;
}

function trainSession(ex, d, tests, week) {
  const cfg = EX[ex];
  const { goal, goalDate } = goalOf(ex);
  let t = tests[0];
  for (const x of tests) if (x.date <= d) t = x;
  const m = Math.max(1, t.max);
  const span = Math.max(1, diffDays(t.date, goalDate));
  const p = clamp(diffDays(t.date, d) / span, 0, 1);
  const v0 = clamp(Math.round(m * 2.2), cfg.minV, Math.round(goal * 0.85));
  let V = Math.max(v0, v0 + (goal * 0.88 - v0) * p);
  let label = 'Training';
  if (diffDays(d, goalDate) <= 4) { V *= 0.55; label = 'Taper'; }
  else if (week % 4 === 0) { V *= 0.75; label = 'Deload'; }
  V = Math.round(V);
  const cap = Math.max(cfg.minCap, Math.round(m * (1 + 0.5 * p) * 0.7));
  const k = clamp(Math.ceil(V / cap), 4, 40);
  const base = Math.floor(V / k);
  const rem = V % k;
  const sets = Array.from({ length: k }, (_, i) => base + (i < rem ? 1 : 0));
  const rest = k <= 5 ? cfg.rest[0] : k <= 8 ? cfg.rest[1] : cfg.rest[2];
  return { sets, total: V, rest, label };
}

function isDone(s) {
  if (s.type === 'test') return state.tests.some((t) => t.ex === s.ex && t.date === s.date);
  return state.pushups.some((p) => p.ex === s.ex && p.date === s.date);
}
function setsText(sets) {
  if (!sets.length) return '';
  const counts = {};
  sets.forEach((x) => (counts[x] = (counts[x] || 0) + 1));
  return Object.keys(counts).sort((a, b) => b - a).map((v) => `${counts[v]}×${v}`).join(' · ');
}

/* ================= Timed challenges ================= */
const timedBetter = (mode, a, b) => (mode === 'time' ? a < b : a > b);
function timedAttempts(ex, mode, target) {
  return state.timed.filter((t) => t.ex === ex && t.mode === mode && t.target === target).sort(byDate);
}
function bestTimed(ex, mode, target) {
  return timedAttempts(ex, mode, target).reduce((b, x) => (!b || timedBetter(mode, x.value, b.value) ? x : b), null);
}
function isTimedRecord(t) { const b = bestTimed(t.ex, t.mode, t.target); return b && b.id === t.id; }
const timedLabel = (ex, mode, target) => (mode === 'time' ? `${target} ${EX[ex].name} auf Zeit` : `${EX[ex].name} max in ${fmtDur(target)}`);
const timedValue = (t) => (t.mode === 'time' ? fmtTime(t.value) : `${t.value} Wdh.`);
function rateText(t) {
  const perMin = t.mode === 'time' ? t.target / (t.value / 60) : t.value / (t.target / 60);
  return `${perMin.toFixed(1).replace('.', ',')} Wdh./Min`;
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
  const today = todayIso();
  const dates = EX_KEYS.map((k) => goalOf(k).goalDate).filter((d) => d >= today).sort();
  $('#countdown').innerHTML = dates.length ? `<b>${diffDays(today, dates[0])}</b> TAGE` : 'NEUES ZIEL?';
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

function sparkSvg(vals, color, higherBetter) {
  if (vals.length < 2) return '';
  const min = Math.min(...vals), max = Math.max(...vals), W = 120, H = 30;
  const y = (v) => {
    if (max === min) return H / 2;
    const f = (v - min) / (max - min);
    return higherBetter ? H - 3 - f * (H - 6) : 3 + f * (H - 6);
  };
  const pts = vals.map((v, i) => `${(i / (vals.length - 1)) * W},${y(v)}`);
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><polyline points="${pts.join(' ')}" fill="none" stroke="${color}" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round"/></svg>`;
}

function renderHome() {
  const el = $('#view-home');
  const today = todayIso();
  const weekStart = addDays(today, -((parse(today).getDay() + 6) % 7));
  const weekEnd = addDays(weekStart, 6);
  const inWeek = (d) => d >= weekStart && d <= weekEnd;
  const planned = EX_KEYS.flatMap((k) => getPlan(k).filter((s) => inWeek(s.date)));

  let html = `
  <div class="card">
    <div class="kicker"><span>Mission</span><span>${EX_KEYS.map((k) => `${goalOf(k).goal} ${EX[k].short}`).join(' · ')}</span></div>
    <div class="duo">${EX_KEYS.map((k) => {
      const { goal, goalDate } = goalOf(k);
      const best = bestTotal(k);
      return `<button class="duo-item" data-act="goto-plan" data-ex="${k}" style="--accent:${EX[k].color}">
        <div class="ring">${ringSvg(clamp(best / goal, 0, 1))}
          <div class="ring-center"><div class="ring-val">${best}</div><div class="ring-goal">/ ${goal}</div></div>
        </div>
        <div class="duo-name">${EX[k].name.toUpperCase()}</div>
        <div class="duo-sub">Max-Satz ${latestMax(k) || '–'} · bis ${fmtShort(goalDate)}</div>
      </button>`;
    }).join('')}</div>
    <div class="week-strip"><span class="stat-label">DIESE WOCHE</span>
      ${EX_KEYS.map((k) => `<span><b style="color:${EX[k].color}">${sessOf(k).filter((p) => inWeek(p.date)).reduce((a, p) => a + p.total, 0)}</b> ${EX[k].name}</span>`).join('')}
      <span><b>${planned.filter(isDone).length}/${planned.length}</b> Einheiten</span>
    </div>
  </div>`;

  for (const k of EX_KEYS) {
    const { goal } = goalOf(k);
    const best = bestTotal(k);
    if (best >= goal) {
      html += `
      <div class="card gold">
        <div class="kicker"><span>Ziel erreicht · ${EX[k].name}</span><span>${best} / ${goal}</span></div>
        <div class="h1">Zeit für mehr?</div>
        <p class="muted">Du hast ${goal} ${EX[k].name} geschafft. Setz dir ein neues Ziel – der Plan rechnet sich sofort neu.</p>
        <button class="btn solid block" data-act="settings" style="margin-top:10px">⚙ Ziel erhöhen</button>
      </div>`;
    }
  }

  let anyToday = false;
  const nexts = [];
  for (const k of EX_KEYS) {
    if (!testsOf(k).length) {
      anyToday = true;
      html += `
      <div class="card gold">
        <div class="kicker"><span>${EX[k].name} · Start-Sequenz</span></div>
        <div class="h1">Max-Test machen</div>
        <p class="muted">${EX[k].testHint} Aus dem Ergebnis berechnet APEX deinen ${EX[k].name}-Plan bis ${fmtShort(goalOf(k).goalDate)}</p>
        <button class="btn ${k} solid block" data-act="test" data-ex="${k}" style="margin-top:10px">Ergebnis eintragen</button>
      </div>`;
      continue;
    }
    const plan = getPlan(k);
    const t = plan.find((s) => s.date === today);
    if (t) { anyToday = true; html += sessionCard(t, true); }
    else { const n = plan.find((s) => s.date > today); if (n) nexts.push(n); }
  }
  if (!anyToday) {
    html += `
    <div class="card">
      <div class="kicker"><span>Heute</span><span class="tag deload">Ruhetag</span></div>
      <div class="h1">Regeneration</div>
      ${nexts.length ? nexts.map((n) => `<p class="muted">Nächste ${EX[n.ex].name}: <b style="color:var(--text)">${fmtDate(n.date)}</b> · ${n.type === 'train' ? `${n.total} Reps (${setsText(n.sets)})` : n.label}</p>`).join('') : '<p class="muted">Kein weiterer Termin im Plan.</p>'}
      <p class="muted small">Zeit für SkiErg, Rad oder Gym.</p>
    </div>`;
  }

  html += `<div class="h2">REKORDE</div><div class="tiles">
    ${EX_KEYS.map((k) => maxTile(k, 'data-act="ctype" data-type="body" data-goto="1"')).join('')}
    ${recordTile('ski', 2000)}${recordTile('bike', 10000)}
  </div>`;

  const recent = recentActivity(5);
  html += `<div class="h2">LETZTE AKTIVITÄT</div>`;
  html += recent.length ? `<div class="list">${recent.map((it) => activityItem(it)).join('')}</div>` : `<div class="card empty">Noch nichts eingetragen.</div>`;
  el.innerHTML = html;
}

function maxTile(ex, attrs, label) {
  const best = bestSet(ex);
  return `<button class="tile ${ex} ${best ? '' : 'empty'}" ${attrs}>
    <div class="tile-dist">${label || `${EX[ex].name.toUpperCase()} · AM STÜCK`}</div>
    <div class="tile-time">${best || '–'}<small> Wdh.</small></div>
    <div class="tile-sub">${best ? `Beste Einheit: ${bestTotal(ex)}` : 'Noch kein Max-Test'}</div>
    ${sparkSvg(testsOf(ex).map((t) => t.max), EX[ex].color, true)}
  </button>`;
}

function sessionCard(s, interactive) {
  const ex = s.ex, cfg = EX[ex];
  const done = isDone(s);
  const tagCls = s.type === 'train' ? s.label.toLowerCase() : s.type;
  let html = `<div class="card ${s.type !== 'train' ? 'gold' : ''}" ${s.type === 'train' ? `style="--accent:${cfg.color}"` : ''}>
    <div class="kicker"><span>${cfg.name} · ${s.date === todayIso() ? 'Heute' : fmtDate(s.date)} · Wo ${s.week}</span><span class="tag ${tagCls}">${s.label}</span></div>`;

  if (done) {
    const log = state.pushups.find((p) => p.ex === ex && p.date === s.date);
    const t = state.tests.find((x) => x.ex === ex && x.date === s.date);
    html += `<div class="h1" style="color:var(--ok)">✓ Erledigt</div>
      <p class="muted">${s.type === 'test' && t ? `Max-Satz: <b>${t.max}</b> ${cfg.name}` : log ? `${log.total} ${cfg.name} · ${setsText(log.sets)}` : ''}</p></div>`;
    return html;
  }

  if (s.type === 'test') {
    html += `<div class="h1">Max-Test ${cfg.name}</div>
      <p class="muted">${cfg.testHint} Das Ergebnis kalibriert die nächsten Wochen.</p>
      ${interactive ? `<button class="btn solid block" data-act="test" data-ex="${ex}" data-date="${s.date}" style="margin-top:10px">Ergebnis eintragen</button>` : ''}</div>`;
    return html;
  }
  if (s.type === 'final') {
    html += `<div class="h1">${s.total} ${cfg.name}</div>
      <p class="muted">Der Tag X. Teile die ${s.total} so auf, wie es sich gut anfühlt – Ziel: in so wenigen Sätzen wie möglich. Trage jeden Satz ein.</p>
      ${interactive ? `<button class="btn solid block" data-act="free" data-ex="${ex}" data-date="${s.date}" style="margin-top:10px">Sätze eintragen</button>` : ''}</div>`;
    return html;
  }

  if (!interactive) {
    html += `<div class="h1">${s.total} Reps</div><p class="muted">${s.sets.length} Sätze · ${setsText(s.sets)} · ${s.rest}s Pause</p></div>`;
    return html;
  }

  let dr = state.drafts[ex];
  if (!dr || dr.date !== s.date) {
    dr = state.drafts[ex] = { date: s.date, sets: s.sets.map((t) => ({ t, a: t, done: false })) };
    persist();
  }
  const doneReps = dr.sets.filter((x) => x.done).reduce((a, x) => a + x.a, 0);
  const nextIdx = dr.sets.findIndex((x) => !x.done);
  html += `<div class="row between"><div class="h1">${s.total} Reps</div><div class="num" style="color:var(--accent)">${doneReps}/${s.total}</div></div>
    <div class="progress-line"><div style="width:${clamp(doneReps / s.total, 0, 1) * 100}%"></div></div>
    <div class="sets">${dr.sets.map((x, i) => `
      <button class="set ${x.done ? 'done' : ''} ${i === nextIdx ? 'next' : ''} ${i === dr.sets.length - 1 ? 'plus' : ''}" data-act="set" data-ex="${ex}" data-i="${i}">
        <div class="n">${x.a}</div><div class="l">Satz ${i + 1}</div>
      </button>`).join('')}
    </div>
    <p class="muted small">Tippen = Satz erledigt (startet ${s.rest}s Pause). Nochmal tippen = Wiederholungen anpassen. Letzter Satz „+“: wenn's geht, mehr machen.</p>
    <div class="row" style="margin-top:10px">
      <button class="btn ${ex} solid grow" data-act="finish" data-ex="${ex}">Einheit speichern</button>
    </div>
  </div>`;
  return html;
}

function recentActivity(limit) {
  const items = [
    ...state.pushups.map((p) => ({ kind: 'sess', date: p.date, id: p.id, data: p })),
    ...state.tests.map((t) => ({ kind: 'test', date: t.date, id: t.id, data: t })),
    ...state.timed.map((t) => ({ kind: 'timed', date: t.date, id: t.id, data: t })),
    ...state.cardio.map((c) => ({ kind: c.type, date: c.date, id: c.id, data: c })),
    ...state.gym.map((g) => ({ kind: 'gym', date: g.date, id: g.id, data: g }))
  ].sort(byDateDesc);
  return limit ? items.slice(0, limit) : items;
}

function activityItem(it, withDelete) {
  const colors = { test: 'var(--gold)', ski: 'var(--ski)', bike: 'var(--bike)', gym: 'var(--gym)' };
  const color = it.kind === 'sess' || it.kind === 'timed' ? EX[it.data.ex].color : colors[it.kind];
  let title, sub;
  if (it.kind === 'sess') { title = `${it.data.total} ${EX[it.data.ex].name}`; sub = setsText(it.data.sets); }
  else if (it.kind === 'test') { title = `Max-Test ${EX[it.data.ex].name}: ${it.data.max}`; sub = 'am Stück'; }
  else if (it.kind === 'timed') {
    const t = it.data;
    title = `${timedLabel(t.ex, t.mode, t.target)} · ${timedValue(t)}${isTimedRecord(t) ? '<span class="pr-badge">PR</span>' : ''}`;
    sub = rateText(t);
  }
  else if (it.kind === 'gym') {
    const g = it.data;
    const prs = gymPRsIn(g);
    title = `Gym · ${esc(g.title || 'Session')}${prs ? `<span class="pr-badge">${prs} PR</span>` : ''}`;
    sub = `${g.exercises.length} Übungen · ${Math.round(gymVolume(g)).toLocaleString('de-DE')} kg Volumen`;
    if (withDelete) sub += `<div class="gym-lines">${g.exercises.map((e) => `<div><b>${esc(e.name)}</b> ${e.sets.map((x) => x.kg ? `${x.reps}×${fmtKg(x.kg)}` : `${x.reps}`).join(' · ')}</div>`).join('')}</div>`;
  }
  else {
    const c = it.data;
    const pr = isRecord(c);
    title = `${TYPES[c.type].name} ${fmtDist(c.dist)} · ${fmtTime(c.time)}${pr ? '<span class="pr-badge">PR</span>' : ''}`;
    sub = [paceText(c.type, c.dist, c.time), c.watts ? `${c.watts} W` : '', esc(c.notes)].filter(Boolean).join(' · ');
  }
  return `<div class="item">
    <span class="dot" style="background:${color};box-shadow:0 0 8px ${color}"></span>
    <div class="grow"><div class="item-title">${title}</div><div class="item-sub">${fmtDate(it.date)}${sub ? ' · ' + sub : ''}</div></div>
    ${withDelete ? `<button class="icon-btn" data-act="del" data-kind="${it.kind}" data-id="${it.id}" aria-label="Löschen"><svg viewBox="0 0 24 24"><path d="M5 7h14M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg></button>` : ''}
  </div>`;
}

/* ================= Records ================= */
function attempts(type, dist) {
  return state.cardio.filter((c) => c.type === type && c.dist === dist).sort(byDate);
}
function bestOf(type, dist) {
  const a = attempts(type, dist);
  return a.length ? a.reduce((b, x) => (x.time < b.time ? x : b)) : null;
}
function isRecord(c) { const b = bestOf(c.type, c.dist); return b && b.id === c.id; }

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
    ${sparkSvg(a.map((x) => x.time), type === 'ski' ? 'var(--ski)' : 'var(--bike)', false)}
  </button>`;
}

function timedTile(ex, mode, target) {
  const b = bestTimed(ex, mode, target);
  const a = timedAttempts(ex, mode, target);
  return `<button class="tile ${ex} ${b ? '' : 'empty'}" data-act="timed" data-ex="${ex}" data-mode="${mode}" data-target="${target}">
    <div class="tile-dist">${mode === 'time' ? `${target} AUF ZEIT` : `MAX IN ${fmtDur(target).toUpperCase()}`}</div>
    <div class="tile-time">${b ? (mode === 'time' ? fmtTime(b.value) : `${b.value}<small> Wdh.</small>`) : (mode === 'time' ? '--:--' : '–')}</div>
    <div class="tile-sub">${b ? `${rateText(b)} · ${fmtShort(b.date)}` : 'Noch kein Versuch'}</div>
    ${sparkSvg(a.map((x) => x.value), EX[ex].color, mode !== 'time')}
  </button>`;
}

function renderBodyRecords() {
  let html = '';
  for (const k of EX_KEYS) {
    const cfg = EX[k];
    const targets = (mode, std) => [...new Set([...std, ...state.timed.filter((t) => t.ex === k && t.mode === mode).map((t) => t.target)])].sort((a, b) => a - b);
    const { goal, goalDate } = goalOf(k);
    const best = bestTotal(k);
    html += `<div class="h2" style="color:${cfg.color}">${cfg.name.toUpperCase()}</div>
    <div class="tiles">
      ${maxTile(k, `data-act="test" data-ex="${k}"`, 'MAX AM STÜCK')}
      <button class="tile ${k} ${best ? '' : 'empty'}" data-act="goto-plan" data-ex="${k}">
        <div class="tile-dist">BESTE EINHEIT</div>
        <div class="tile-time">${best || '–'}<small> / ${goal}</small></div>
        <div class="tile-sub">Ziel bis ${fmtShort(goalDate)}</div>
        ${sparkSvg(sessOf(k).map((p) => p.total), cfg.color, true)}
      </button>
      ${targets('time', cfg.timeReps).map((r) => timedTile(k, 'time', r)).join('')}
      ${targets('amrap', cfg.amrap).map((s) => timedTile(k, 'amrap', s)).join('')}
    </div>`;
  }
  const hist = [...state.timed].sort(byDateDesc);
  html += `<button class="btn solid block" data-act="timed" style="margin-top:14px">⏱ Neue Challenge auf Zeit</button>
    <div class="h2">VERLAUF AUF ZEIT</div>
    ${hist.length ? `<div class="list">${hist.map((t) => activityItem({ kind: 'timed', date: t.date, id: t.id, data: t }, true)).join('')}</div>` : `<div class="card empty">Noch keine Challenge auf Zeit. Tipp auf eine Kachel oben, um loszulegen.</div>`}`;
  return html;
}

/* ================= Render: Plan ================= */
let planEx = 'pu';
function renderPlan() {
  const el = $('#view-plan');
  const ex = planEx, cfg = EX[ex];
  const { goal, goalDate } = goalOf(ex);
  const plan = getPlan(ex);
  const today = todayIso();
  const m = latestMax(ex);
  const ratio = m / goal;

  let html = `<div class="seg">${EX_KEYS.map((k) => `<button class="${k === ex ? 'on ' + k : ''}" data-act="plan-ex" data-ex="${k}">${EX[k].name.toUpperCase()}</button>`).join('')}</div>
  <div class="card" style="--accent:${cfg.color}">
    <div class="kicker"><span>Strategie · ${cfg.name}</span><span>${goal} bis ${fmtShort(goalDate)}</span></div>
    <div class="h1">So schaffst du ${goal}</div>
    <p class="muted">Ziel: <b style="color:var(--text)">${goal} ${cfg.name} in einer Einheit</b> am ${fmtShort(goalDate)} – in so wenigen Sätzen wie möglich. Der Plan rechnet sich aus deinem letzten Max-Test und passt sich bei jedem neuen Test automatisch an.</p>
    <div class="phases" style="margin-top:12px">
      <div class="phase"><div class="bar"></div><div><b>1 · BASIS</b><p class="muted small">Technik sauber, Volumen ≈ 2× dein Max-Satz pro Einheit, Sätze bei ~70 % vom Max. ${cfg.rest[0]} s Pause.</p></div></div>
      <div class="phase"><div class="bar"></div><div><b>2 · AUFBAU</b><p class="muted small">Volumen steigt jede Einheit ein Stück, Sätze werden größer, Pausen kürzer (${cfg.rest[1]} s). Alle 2 Wochen Max-Test.</p></div></div>
      <div class="phase"><div class="bar"></div><div><b>3 · PEAK</b><p class="muted small">Einheiten nahe ${Math.round(goal * 0.85)}–${Math.round(goal * 0.9)} Reps als Generalprobe, dann 4 Tage Taper (weniger Volumen) und am Ziel-Tag: ${goal}.</p></div></div>
    </div>
    <ul class="rules muted small">
      <li>3 Einheiten pro Woche, mindestens 1 Ruhetag dazwischen.</li>
      <li>Jede 4. Woche Deload (−25 %) – da wirst du stärker, nicht schwächer.</li>
      <li>Saubere Wiederholung: ${cfg.form}</li>
      ${ex === 'pull' ? '<li>Weniger als 5 am Stück? Am Ende jeder Einheit 3 × 3 Negative (5 s langsam ablassen) und 2 × so lange wie möglich hängen – das baut am schnellsten Kraft auf.</li>' : ''}
      <li>Satz nicht geschafft? Kurz pausieren, Rest auffüllen und im nächsten Satz weiter. Schmerzen im Gelenk → Pause.</li>
      <li>Schaffst du die Einheiten locker → Max-Test vorziehen, dann steigt der Plan.</li>
    </ul>
    ${m ? `<p class="muted small" style="margin-top:10px">Ehrlich gesagt: Bei Max-Satz <b style="color:var(--text)">${m}</b> und ${Math.max(0, diffDays(today, goalDate))} Tagen ist das ${ratio >= 0.22 ? 'gut machbar' : ratio >= 0.12 ? 'ambitioniert, aber realistisch mit Disziplin' : 'sehr sportlich – bleib dran, jeder Test zählt'}.</p>` : ''}
  </div>`;

  html += `<div class="h2">EINHEITEN</div>`;
  if (!plan.length) {
    html += `<div class="card empty">Mach zuerst einen ${cfg.name}-Max-Test, dann erscheint hier dein Plan.<br><br><button class="btn ${ex} solid" data-act="test" data-ex="${ex}">Max-Test eintragen</button></div>`;
  } else {
    const weeks = {};
    plan.forEach((s) => (weeks[s.week] = weeks[s.week] || []).push(s));
    for (const w of Object.keys(weeks)) {
      const list = weeks[w];
      const cur = list.some((s) => s.date >= addDays(today, -6) && s.date <= today) && list[list.length - 1].date >= today;
      html += `<div class="week ${cur ? 'current' : ''}">
        <div class="week-head"><span class="week-title">WOCHE ${w} · ${list[0].phase.toUpperCase()}</span><span class="week-sub">${list.filter((s) => s.type === 'train').reduce((a, s) => a + s.total, 0)} Reps geplant</span></div>
        <div class="card plan-card" style="--accent:${cfg.color}">${list.map((s) => planRow(s, today)).join('')}</div>
      </div>`;
    }
  }

  html += `<button class="btn ghost block" data-act="settings" style="margin-top:6px">⚙ Ziele &amp; Trainingstage ändern</button>`;
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
  const planBy = {};
  EX_KEYS.forEach((k) => getPlan(k).forEach((s) => (planBy[s.date] = planBy[s.date] || []).push(s)));
  const today = todayIso();
  const goalDates = new Set(EX_KEYS.map((k) => goalOf(k).goalDate));
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
    const ps = planBy[d] || [];
    for (const k of EX_KEYS) {
      if (state.pushups.some((p) => p.ex === k && p.date === d)) dots.push(k);
      else if (ps.some((s) => s.ex === k && s.type === 'train')) dots.push(`${k}-plan`);
    }
    if (state.tests.some((t) => t.date === d) || ps.some((s) => s.type === 'test' && !isDone(s))) dots.push('test');
    if (state.timed.some((t) => t.date === d)) dots.push('timed');
    if (state.cardio.some((c) => c.date === d && c.type === 'ski')) dots.push('ski');
    if (state.cardio.some((c) => c.date === d && c.type === 'bike')) dots.push('bike');
    if (state.gym.some((g) => g.date === d)) dots.push('gym');
    const cls = ['cal-day', dd.getMonth() !== mo ? 'out' : '', d === today ? 'today' : '', d === calSel ? 'sel' : '', goalDates.has(d) ? 'goal' : ''].join(' ');
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
      <span><span class="dots"><i class="pull"></i></span>Klimmzüge</span>
      <span><span class="dots"><i class="test"></i></span>Max-Test</span>
      <span><span class="dots"><i class="timed"></i></span>Auf Zeit</span>
      <span><span class="dots"><i class="ski"></i></span>SkiErg</span>
      <span><span class="dots"><i class="bike"></i></span>Rad</span>
      <span><span class="dots"><i class="gym"></i></span>Gym</span>
    </div>
  </div>`;

  html += `<div class="h2">${fmtDate(calSel).toUpperCase()}</div>`;
  const ps = planBy[calSel] || [];
  ps.forEach((s) => (html += sessionCard(s, calSel === today)));
  const items = recentActivity().filter((it) => it.date === calSel);
  if (items.length) html += `<div class="list">${items.map((it) => activityItem(it, true)).join('')}</div>`;
  if (!ps.length && !items.length) html += `<div class="card empty">Nichts geplant oder eingetragen.</div>`;
  html += `<button class="btn ghost block" data-act="add" data-date="${calSel}" style="margin-top:12px">+ Eintrag für diesen Tag</button>`;
  el.innerHTML = html;
}

/* ================= Render: Records ================= */
let cardioType = 'ski';
function renderCardio() {
  const el = $('#view-cardio');
  const segHtml = `<div class="seg four">
      <button class="${cardioType === 'ski' ? 'on ski' : ''}" data-act="ctype" data-type="ski">SKIERG</button>
      <button class="${cardioType === 'bike' ? 'on bike' : ''}" data-act="ctype" data-type="bike">RAD</button>
      <button class="${cardioType === 'gym' ? 'on gym' : ''}" data-act="ctype" data-type="gym">GYM</button>
      <button class="${cardioType === 'body' ? 'on' : ''}" data-act="ctype" data-type="body">KÖRPER</button>
    </div>`;
  if (cardioType === 'gym') { el.innerHTML = segHtml + renderGymRecords(); return; }
  if (cardioType === 'body') { el.innerHTML = segHtml + renderBodyRecords(); return; }
  const t = TYPES[cardioType];
  const extra = [...new Set(state.cardio.filter((c) => c.type === cardioType && !t.dists.includes(c.dist)).map((c) => c.dist))].sort((a, b) => a - b);
  const hist = state.cardio.filter((c) => c.type === cardioType).sort(byDateDesc);

  el.innerHTML = `${segHtml}
    <div class="tiles">${[...t.dists, ...extra].map((d) => recordTile(cardioType, d)).join('')}</div>
    <button class="btn ${cardioType} solid block" data-act="cardio" data-type="${cardioType}" style="margin-top:14px">+ Neue ${t.name}-Zeit</button>
    <div class="h2">VERLAUF</div>
    ${hist.length ? `<div class="list">${hist.map((c) => activityItem({ kind: c.type, date: c.date, id: c.id, data: c }, true)).join('')}</div>` : `<div class="card empty">Noch keine ${t.name}-Einträge.</div>`}
  `;
}

/* ================= Sheets / forms ================= */
function openSheet(html) { $('#sheetPanel').innerHTML = html; $('#sheet').classList.remove('hidden'); }
function closeSheet() { swReset(); $('#sheet').classList.add('hidden'); $('#sheetPanel').innerHTML = ''; }

const exSeg = (act, ex, date) => `<div class="seg">${EX_KEYS.map((k) => `<button class="${k === ex ? 'on ' + k : ''}" data-act="${act}" data-ex="${k}" data-date="${date}">${EX[k].name.toUpperCase()}</button>`).join('')}</div>`;

function sheetAdd(date) {
  const d = date || todayIso();
  openSheet(`<div class="kicker"><span>Neuer Eintrag</span><span>${fmtDate(d)}</span></div>
    <div class="menu">
      <button data-act="free" data-ex="pu" data-date="${d}"><span class="mi" style="background:rgba(61,245,255,.15);color:var(--cyan)">LS</span><div><b>Liegestütze</b><span>Sätze frei eintragen</span></div></button>
      <button data-act="free" data-ex="pull" data-date="${d}"><span class="mi" style="background:rgba(182,255,61,.15);color:var(--pull)">KZ</span><div><b>Klimmzüge</b><span>Sätze frei eintragen</span></div></button>
      <button data-act="test" data-date="${d}"><span class="mi" style="background:rgba(255,213,74,.15);color:var(--gold)">MAX</span><div><b>Max-Test</b><span>So viele wie möglich am Stück</span></div></button>
      <button data-act="timed" data-date="${d}"><span class="mi" style="background:rgba(255,255,255,.08);color:var(--text)">⏱</span><div><b>Auf Zeit</b><span>Liegestütze / Klimmzüge mit Stoppuhr</span></div></button>
      <button data-act="cardio" data-type="ski" data-date="${d}"><span class="mi" style="background:rgba(255,138,61,.15);color:var(--ski)">SKI</span><div><b>SkiErg</b><span>Zeit über eine Distanz</span></div></button>
      <button data-act="cardio" data-type="bike" data-date="${d}"><span class="mi" style="background:rgba(167,123,255,.15);color:var(--bike)">BIKE</span><div><b>Fahrrad</b><span>Zeit über eine Distanz</span></div></button>
      <button data-act="gym" data-date="${d}"><span class="mi" style="background:rgba(255,79,163,.15);color:var(--gym)">GYM</span><div><b>Gym-Session</b><span>Übungen, Sätze, Gewicht</span></div></button>
    </div>`);
}

function sheetTest(ex, date) {
  ex = ex || 'pu';
  const d = date || todayIso();
  openSheet(`<div class="kicker"><span>Max-Test</span></div>
    ${exSeg('test', ex, d)}
    <input type="hidden" id="testEx" value="${ex}">
    <div class="h1">Wie viele ${EX[ex].name} am Stück?</div>
    <p class="muted small">Nur saubere Wiederholungen zählen.</p>
    <div class="field" style="margin-top:14px"><div class="stepper">
      <button data-act="step" data-t="#testMax" data-v="-1">−</button>
      <input class="input big" id="testMax" type="number" inputmode="numeric" value="${latestMax(ex) || (ex === 'pull' ? 5 : 20)}">
      <button data-act="step" data-t="#testMax" data-v="1">+</button>
    </div></div>
    <div class="field"><label>Datum</label><input class="input" type="date" id="testDate" value="${d}"></div>
    <button class="btn ${ex} solid block" data-act="save-test">Speichern</button>`);
}

function sheetFree(ex, date) {
  ex = ex || 'pu';
  const d = date || todayIso();
  openSheet(`<div class="kicker"><span>Sätze eintragen</span></div>
    ${exSeg('free', ex, d)}
    <input type="hidden" id="freeEx" value="${ex}">
    <div class="h1">${EX[ex].name}</div>
    <p class="muted small">Wiederholungen pro Satz, mit Leerzeichen oder Komma getrennt.</p>
    <div class="field" style="margin-top:14px"><label>Sätze</label><input class="input big" id="freeSets" inputmode="text" placeholder="${ex === 'pull' ? '8 6 6 5' : '25 20 20 15'}"></div>
    <div class="preview" id="freePreview"></div>
    <div class="field" style="margin-top:12px"><label>Datum</label><input class="input" type="date" id="freeDate" value="${d}"></div>
    <button class="btn ${ex} solid block" data-act="save-free">Speichern</button>`);
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

function sheetEditSet(ex, i) {
  const x = state.drafts[ex].sets[i];
  openSheet(`<div class="kicker"><span>${EX[ex].name} · Satz ${i + 1}</span><span>Ziel: ${x.t}</span></div>
    <div class="h1">Wie viele geschafft?</div>
    <div class="field" style="margin-top:14px"><div class="stepper">
      <button data-act="step" data-t="#setReps" data-v="-1">−</button>
      <input class="input big" id="setReps" type="number" inputmode="numeric" value="${x.a}">
      <button data-act="step" data-t="#setReps" data-v="1">+</button>
    </div></div>
    <div class="row">
      <button class="btn ghost grow" data-act="set-undo" data-ex="${ex}" data-i="${i}">Nicht erledigt</button>
      <button class="btn ${ex} solid grow" data-act="set-save" data-ex="${ex}" data-i="${i}">Übernehmen</button>
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

/* ================= Timed sheet + stopwatch ================= */
let timedForm = null;
const sw = { running: false, t0: 0, acc: 0, int: null };
const swElapsed = () => sw.acc + (sw.running ? (Date.now() - sw.t0) / 1000 : 0);
function swText() {
  if (timedForm && timedForm.mode === 'amrap') return fmtClock(Math.max(0, timedForm.target - swElapsed()));
  return fmtClock(swElapsed());
}
function swUpdateUi() {
  const d = $('#swDisplay');
  if (d) { d.textContent = swText(); d.classList.toggle('running', sw.running); }
  const b = $('#swBtn');
  if (b) b.textContent = sw.running ? 'Stopp' : sw.acc > 0 && timedForm && timedForm.mode === 'time' ? 'Weiter' : 'Start';
}
function swTick() {
  if (timedForm && timedForm.mode === 'amrap' && sw.running && swElapsed() >= timedForm.target) {
    sw.acc = timedForm.target;
    sw.running = false;
    clearInterval(sw.int);
    swUpdateUi();
    try { navigator.vibrate && navigator.vibrate([300, 100, 300]); } catch (e) {}
    toast('Zeit! Jetzt Wiederholungen eintragen');
    const v = $('#tValue');
    if (v) v.focus();
    return;
  }
  swUpdateUi();
}
function swStart() {
  if (sw.running) return;
  if (timedForm && timedForm.mode === 'amrap' && sw.acc >= timedForm.target) sw.acc = 0;
  sw.running = true;
  sw.t0 = Date.now();
  clearInterval(sw.int);
  sw.int = setInterval(swTick, 100);
  swUpdateUi();
}
function swStop() {
  if (!sw.running) return;
  sw.acc += (Date.now() - sw.t0) / 1000;
  sw.running = false;
  clearInterval(sw.int);
  if (timedForm && timedForm.mode === 'time') {
    timedForm.value = fmtTime(Math.round(sw.acc * 10) / 10);
    const inp = $('#tValue');
    if (inp) inp.value = timedForm.value;
    updateTimedPreview();
  }
  swUpdateUi();
}
function swReset() { sw.running = false; sw.acc = 0; clearInterval(sw.int); swUpdateUi(); }

function sheetTimed(ex, mode, target, date) {
  ex = ex || 'pu';
  mode = mode || 'time';
  timedForm = { ex, mode, target: target || (mode === 'time' ? EX[ex].timeReps[0] : EX[ex].amrap[0]), date: date || todayIso(), value: '' };
  swReset();
  renderTimedSheet();
}
function renderTimedSheet(focusSel) {
  const f = timedForm, cfg = EX[f.ex];
  const std = f.mode === 'time' ? cfg.timeReps : cfg.amrap;
  const isStd = std.includes(f.target);
  const b = f.target ? bestTimed(f.ex, f.mode, f.target) : null;
  openSheet(`<div class="kicker"><span>⏱ Auf Zeit</span><span id="tBest">${b ? `Rekord: ${timedValue(b)}` : 'Noch kein Rekord'}</span></div>
    <div class="seg">${EX_KEYS.map((k) => `<button class="${k === f.ex ? 'on ' + k : ''}" data-act="t-ex" data-ex="${k}">${EX[k].name.toUpperCase()}</button>`).join('')}</div>
    <div class="seg">
      <button class="${f.mode === 'time' ? 'on ' + f.ex : ''}" data-act="t-mode" data-mode="time">X WDH. AUF ZEIT</button>
      <button class="${f.mode === 'amrap' ? 'on ' + f.ex : ''}" data-act="t-mode" data-mode="amrap">MAX IN ZEIT</button>
    </div>
    <div class="field"><label>${f.mode === 'time' ? 'Wiederholungen' : 'Zeitlimit'}</label>
      <div class="chips">${std.map((v) => `<button class="chip ${v === f.target ? 'on ' + f.ex : ''}" data-act="t-target" data-v="${v}">${f.mode === 'time' ? v : fmtDur(v)}</button>`).join('')}
        <button class="chip ${!isStd ? 'on ' + f.ex : ''}" data-act="t-target" data-v="custom">Andere</button></div>
      <input class="input ${isStd ? 'hidden' : ''}" id="tCustom" inputmode="${f.mode === 'time' ? 'numeric' : 'decimal'}" placeholder="${f.mode === 'time' ? 'Wdh., z. B. 75' : 'Zeit, z. B. 3:00'}" value="${isStd || !f.target ? '' : f.mode === 'time' ? f.target : fmtTime(f.target)}" style="margin-top:8px">
    </div>
    <div class="stopwatch" style="--accent:${cfg.color}">
      <div class="sw-display" id="swDisplay">${swText()}</div>
      <div class="sw-hint">${f.mode === 'time' ? 'Start → Wiederholungen machen → Stopp. Die Zeit wird automatisch übernommen.' : 'Start drücken, los geht’s. Bei 0:00 vibriert das Handy – dann Wiederholungen eintragen.'}</div>
      <div class="row"><button class="btn ghost grow" data-act="sw-reset">Reset</button><button class="btn ${f.ex} solid grow" id="swBtn" data-act="sw-toggle">Start</button></div>
    </div>
    ${f.mode === 'time'
      ? `<div class="field"><label>Zeit (m:ss)</label><input class="input big" id="tValue" inputmode="decimal" placeholder="2:15.0" value="${esc(f.value)}"></div>`
      : `<div class="field"><label>Geschafft (Wdh.)</label><div class="stepper"><button data-act="step" data-t="#tValue" data-v="-1">−</button><input class="input big" id="tValue" type="number" inputmode="numeric" value="${esc(f.value)}" placeholder="0"><button data-act="step" data-t="#tValue" data-v="1">+</button></div></div>`}
    <div class="preview" id="tPreview"></div>
    <div class="field" style="margin-top:12px"><label>Datum</label><input class="input" type="date" id="tDate" value="${f.date}"></div>
    <button class="btn ${f.ex} solid block" data-act="save-timed">Speichern</button>`);
  swUpdateUi();
  updateTimedPreview();
  if (focusSel) { const el = $(focusSel); if (el) el.focus(); }
}
function updateTimedPreview() {
  const f = timedForm;
  const p = $('#tPreview');
  if (!f || !p) return;
  const best = $('#tBest');
  const b = f.target ? bestTimed(f.ex, f.mode, f.target) : null;
  if (best) best.textContent = b ? `Rekord: ${timedValue(b)}` : 'Noch kein Rekord';
  const raw = $('#tValue') ? $('#tValue').value : '';
  const val = f.mode === 'time' ? parseTime(raw) : Math.round(+raw);
  if (!val || !f.target) { p.textContent = ''; return; }
  let txt = rateText({ mode: f.mode, target: f.target, value: val });
  let gold = false;
  if (b) {
    if (timedBetter(f.mode, val, b.value)) { txt += ' · NEUER REKORD'; gold = true; }
    else if (val === b.value) txt += ' · Rekord eingestellt';
    else txt += f.mode === 'time' ? ` · +${(val - b.value).toFixed(1)}s zum Rekord` : ` · ${b.value - val} Wdh. zum Rekord`;
  }
  p.textContent = txt;
  p.style.color = gold ? 'var(--gold)' : '';
}
function saveTimed() {
  const f = timedForm;
  const raw = $('#tValue').value;
  const value = f.mode === 'time' ? parseTime(raw) : Math.round(+raw);
  if (!f.target || f.target <= 0) return toast(f.mode === 'time' ? 'Wiederholungen wählen' : 'Zeitlimit wählen');
  if (!value || value <= 0) return toast(f.mode === 'time' ? 'Zeit im Format m:ss eingeben' : 'Wiederholungen eintragen');
  const prev = bestTimed(f.ex, f.mode, f.target);
  const entry = { id: uid(), date: $('#tDate').value || todayIso(), ex: f.ex, mode: f.mode, target: f.target, value };
  state.timed.push(entry);
  timedForm = null;
  closeSheet();
  cardioType = 'body';
  save();
  if (!prev || timedBetter(entry.mode, value, prev.value)) {
    const diff = prev ? (entry.mode === 'time' ? ` · −${(prev.value - value).toFixed(1)}s` : ` · +${value - prev.value}`) : ' · erster Rekord';
    showPR(timedValue(entry), `${timedLabel(entry.ex, entry.mode, entry.target)}${diff}`);
  } else toast(`Gespeichert · ${timedValue(entry)}`);
}

/* ================= Gym ================= */
const GYM_TITLES = ['Push', 'Pull', 'Beine', 'Oberkörper', 'Ganzkörper'];
let gymForm = null;
const fmtKg = (kg) => `${+(+kg).toFixed(2)}`.replace('.', ',');
const exKey = (n) => n.trim().toLowerCase();
const e1rm = (kg, reps) => (reps <= 1 ? kg : kg * (1 + reps / 30));
const gymVolume = (g) => g.exercises.reduce((a, e) => a + e.sets.reduce((b, x) => b + x.reps * (x.kg || 0), 0), 0);
// Better set = heavier, then more reps at the same weight.
const betterSet = (a, b) => !b || a.kg > b.kg || (a.kg === b.kg && a.reps > b.reps);
const bestSetOf = (sets) => sets.reduce((b, x) => (betterSet(x, b) ? x : b), null);

function exerciseNames() {
  const seen = new Map();
  [...state.gym].sort((a, b) => b.date.localeCompare(a.date))
    .forEach((g) => g.exercises.forEach((e) => { if (!seen.has(exKey(e.name))) seen.set(exKey(e.name), e.name); }));
  return [...seen.values()];
}

// Per exercise: best set over all sessions, plus each session's best set for the chart.
function gymRecords() {
  const map = new Map();
  const sessions = [...state.gym].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  for (const g of sessions) {
    for (const e of g.exercises) {
      const k = exKey(e.name);
      if (!map.has(k)) map.set(k, { name: e.name, best: null, bestDate: null, bestId: null, history: [], prIds: new Set() });
      const r = map.get(k);
      const sb = bestSetOf(e.sets);
      if (!sb) continue;
      r.history.push({ date: g.date, kg: sb.kg, reps: sb.reps, e1rm: e1rm(sb.kg, sb.reps) });
      if (betterSet(sb, r.best)) {
        if (r.best) r.prIds.add(g.id); // only counts as PR when it beats an earlier session
        r.best = sb; r.bestDate = g.date; r.bestId = g.id;
      }
    }
  }
  return [...map.values()];
}
function gymPRsIn(g) { return gymRecords().filter((r) => r.prIds.has(g.id)).length; }

function renderGymRecords() {
  const recs = gymRecords().sort((a, b) => a.name.localeCompare(b.name, 'de'));
  const hist = [...state.gym].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  const tiles = recs.map((r) => {
    const h = r.history;
    let spark = '';
    if (h.length > 1) {
      const vals = h.map((x) => x.e1rm || x.reps);
      const min = Math.min(...vals), max = Math.max(...vals), W = 120, H = 30;
      const pts = vals.map((v, i) => `${(i / (vals.length - 1)) * W},${max === min ? H / 2 : H - 3 - ((v - min) / (max - min)) * (H - 6)}`);
      spark = `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><polyline points="${pts.join(' ')}" fill="none" stroke="var(--gym)" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round"/></svg>`;
    }
    const b = r.best;
    return `<div class="tile gym">
      <div class="tile-dist">${esc(r.name).toUpperCase()}</div>
      <div class="tile-time">${b.kg ? `${fmtKg(b.kg)}<small> kg × ${b.reps}</small>` : `${b.reps}<small> Reps</small>`}</div>
      <div class="tile-sub">${b.kg && b.reps > 1 ? `1RM ≈ ${Math.round(e1rm(b.kg, b.reps))} kg · ` : ''}${fmtShort(r.bestDate)}</div>
      ${spark}
    </div>`;
  }).join('');
  return `${recs.length ? `<div class="tiles">${tiles}</div>` : `<div class="card empty">Noch keine Gym-Sessions. Trag deine erste ein – jede Übung bekommt automatisch ihren Rekord.</div>`}
    <button class="btn gym solid block" data-act="gym" style="margin-top:14px">+ Neue Gym-Session</button>
    <div class="h2">VERLAUF</div>
    ${hist.length ? `<div class="list">${hist.map((g) => activityItem({ kind: 'gym', date: g.date, id: g.id, data: g }, true)).join('')}</div>` : `<div class="card empty">Noch keine Einträge.</div>`}`;
}

function sheetGym(date) {
  gymForm = { date: date || todayIso(), title: '', notes: '', exercises: [{ name: '', sets: [{ reps: '', kg: '' }] }] };
  renderGymSheet();
}
function lastGymWithTitle(title) {
  const t = exKey(title || '');
  if (!t) return null;
  return [...state.gym].sort((a, b) => b.date.localeCompare(a.date)).find((g) => exKey(g.title || '') === t) || null;
}
function updateGymCopyBtn() {
  const btn = $('#gCopy');
  if (!btn) return;
  const last = lastGymWithTitle(gymForm.title);
  btn.classList.toggle('hidden', !last);
  if (last) btn.textContent = `Letzte „${last.title}“ (${fmtShort(last.date)}) übernehmen`;
}
function copyLastGym() {
  const last = lastGymWithTitle(gymForm.title);
  if (!last) return;
  gymForm.exercises = last.exercises.map((e) => ({ name: e.name, sets: e.sets.map((x) => ({ reps: String(x.reps), kg: x.kg ? String(x.kg) : '' })) }));
  renderGymSheet();
  toast('Übernommen – Werte anpassen und speichern');
}
function renderGymSheet(focusSel) {
  const f = gymForm;
  const prevBest = new Map(gymRecords().map((r) => [exKey(r.name), r.best]));
  const scroll = $('#sheetPanel').scrollTop;
  openSheet(`<div class="kicker"><span>Gym-Session</span><span>${fmtDate(f.date)}</span></div>
    <div class="field"><label>Training</label>
      <div class="chips" style="margin-bottom:8px">${GYM_TITLES.map((t) => `<button class="chip ${f.title === t ? 'on gym' : ''}" data-act="g-title" data-v="${t}">${t}</button>`).join('')}</div>
      <input class="input" data-g="title" value="${esc(f.title)}" placeholder="z. B. Push, Beine …">
    </div>
    <button class="btn ghost block sm hidden" id="gCopy" data-act="g-copy" style="margin-bottom:14px"></button>
    <datalist id="exNames">${exerciseNames().map((n) => `<option value="${esc(n)}">`).join('')}</datalist>
    ${f.exercises.map((e, ei) => {
      const pb = prevBest.get(exKey(e.name));
      return `<div class="ex-card">
        <div class="row">
          <input class="input grow" list="exNames" data-g="ex-name" data-e="${ei}" value="${esc(e.name)}" placeholder="Übung, z. B. Bankdrücken">
          <button class="icon-btn" data-act="g-del-ex" data-e="${ei}" aria-label="Übung entfernen"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
        </div>
        ${pb ? `<div class="ex-pb">Rekord: ${pb.kg ? `${fmtKg(pb.kg)} kg × ${pb.reps}` : `${pb.reps} Reps`}</div>` : ''}
        <div class="set-head"><span>Satz</span><span>Wdh.</span><span>kg</span><span></span></div>
        ${e.sets.map((x, si) => `<div class="set-row">
          <span class="num">${si + 1}</span>
          <input class="input" type="number" inputmode="numeric" data-g="reps" data-e="${ei}" data-s="${si}" value="${esc(x.reps)}" placeholder="10">
          <input class="input" type="number" inputmode="decimal" step="0.5" data-g="kg" data-e="${ei}" data-s="${si}" value="${esc(x.kg)}" placeholder="–">
          <button class="icon-btn" data-act="g-del-set" data-e="${ei}" data-s="${si}" aria-label="Satz entfernen"><svg viewBox="0 0 24 24"><path d="M6 12h12"/></svg></button>
        </div>`).join('')}
        <button class="btn ghost sm" data-act="g-add-set" data-e="${ei}" style="margin-top:6px">+ Satz</button>
      </div>`;
    }).join('')}
    <button class="btn gym block" data-act="g-add-ex" style="margin-bottom:14px">+ Übung</button>
    <div class="field"><label>Datum</label><input class="input" type="date" data-g="date" value="${f.date}"></div>
    <div class="field"><label>Notiz</label><input class="input" data-g="notes" value="${esc(f.notes)}" placeholder="optional"></div>
    <button class="btn gym solid block" data-act="save-gym">Session speichern</button>`);
  $('#sheetPanel').scrollTop = scroll;
  updateGymCopyBtn();
  if (focusSel) { const el = document.querySelector(focusSel); if (el) { el.focus(); el.scrollIntoView({ block: 'center' }); } }
}

function saveGym() {
  const f = gymForm;
  const exercises = f.exercises
    .map((e) => ({
      name: e.name.trim(),
      sets: e.sets
        .map((x) => ({ reps: Math.round(+x.reps || 0), kg: Math.max(0, +String(x.kg).replace(',', '.') || 0) }))
        .filter((x) => x.reps > 0)
    }))
    .filter((e) => e.name && e.sets.length);
  if (!exercises.length) return toast('Mindestens eine Übung mit Satz eintragen');
  const before = new Map(gymRecords().map((r) => [exKey(r.name), r.best]));
  const entry = { id: uid(), date: f.date || todayIso(), title: f.title.trim(), exercises, notes: f.notes.trim() };
  state.gym.push(entry);
  gymForm = null;
  closeSheet();
  cardioType = 'gym';
  save();
  const prs = exercises.filter((e) => before.has(exKey(e.name)) && betterSet(bestSetOf(e.sets), before.get(exKey(e.name))));
  if (prs.length) {
    const top = bestSetOf(prs[0].sets);
    showPR(top.kg ? `${fmtKg(top.kg)} kg × ${top.reps}` : `${top.reps} Reps`, `${prs[0].name}${prs.length > 1 ? ` + ${prs.length - 1} weitere Rekorde` : ''}`);
  } else toast(`Session gespeichert · ${Math.round(gymVolume(entry)).toLocaleString('de-DE')} kg Volumen`);
}

/* ================= Settings (gear) ================= */
let settingsForm = null; // unsaved goal edits while the sheet is open

function sheetSettings() {
  if (!settingsForm) settingsForm = Object.fromEntries(EX_KEYS.map((k) => [k, { ...goalOf(k) }]));
  const st = state.settings;
  const scroll = $('#sheetPanel').scrollTop;
  openSheet(`<div class="kicker"><span>⚙ Einstellungen</span></div>
    <div class="h2" style="margin-top:4px">ZIELE</div>
    ${EX_KEYS.map((k) => {
      const f = settingsForm[k], cfg = EX[k], cur = goalOf(k);
      return `<div class="card" style="--accent:${cfg.color}">
        <div class="field"><label>${cfg.name} in einer Einheit</label>
          <div class="stepper">
            <button data-act="goal-step" data-ex="${k}" data-v="-${cfg.step}">−</button>
            <input class="input big" id="sGoal-${k}" data-goal-ex="${k}" type="number" inputmode="numeric" value="${f.goal}">
            <button data-act="goal-step" data-ex="${k}" data-v="${cfg.step}">+</button>
          </div>
        </div>
        <div class="chips" style="margin-bottom:14px">${cfg.presets.map((v) => `<button class="chip ${f.goal === v ? 'on ' + k : ''}" data-act="goal-preset" data-ex="${k}" data-v="${v}">${v}</button>`).join('')}</div>
        <div class="field"><label>Bis wann</label><input class="input" type="date" id="sGoalDate-${k}" data-goaldate-ex="${k}" value="${f.goalDate}"></div>
        <div class="preview" id="goalPreview-${k}"></div>
        <p class="muted small" style="margin-top:6px">Aktuell: ${cur.goal} bis ${fmtShort(cur.goalDate)}</p>
      </div>`;
    }).join('')}
    <button class="btn solid block" data-act="save-goal">Ziele übernehmen</button>
    <p class="muted small" style="margin-top:8px">Deine Einträge bleiben erhalten, nur die Pläne werden neu berechnet.</p>
    <div class="h2">TRAINING</div>
    <div class="card">
      <div class="field" style="margin:0"><label>Trainingstage (Liegestütze &amp; Klimmzüge)</label>
        <div class="days">${[1, 2, 3, 4, 5, 6, 0].map((d) => `<button class="day-tog ${st.days.includes(d) ? 'on' : ''}" data-act="day" data-d="${d}">${WD[d]}</button>`).join('')}</div>
      </div>
    </div>
    <div class="h2">DATEN</div>
    <div class="card">
      <div class="row wrap">
        <button class="btn ghost sm" data-act="export">Backup exportieren</button>
        <button class="btn ghost sm" data-act="import">Backup laden</button>
        <button class="btn danger sm" data-act="reset">Alles löschen</button>
      </div>
    </div>`);
  $('#sheetPanel').scrollTop = scroll;
  EX_KEYS.forEach(updateGoalPreview);
}

function updateGoalPreview(ex) {
  const f = settingsForm[ex];
  const el = $(`#goalPreview-${ex}`);
  if (!el) return;
  const days = f.goalDate ? diffDays(todayIso(), f.goalDate) : NaN;
  if (!(f.goal > 0) || !(days > 0)) { el.textContent = 'Ziel und ein Datum in der Zukunft wählen'; el.style.color = 'var(--bad)'; return; }
  const m = latestMax(ex);
  let txt = `${days} Tage · Generalprobe ≈ ${Math.round(f.goal * 0.88)} Reps pro Einheit`;
  // Rough sanity check: start volume is ~2.2× max set; much more than ~+60 %/week of that is a stretch.
  if (m && f.goal > m * 2.2 * (1 + (days / 7) * 0.6)) txt += ' · sehr ambitioniert';
  el.textContent = txt;
  el.style.color = '';
}

function saveGoal() {
  for (const k of EX_KEYS) {
    const f = settingsForm[k];
    if (!(Math.round(+f.goal) >= 5)) return toast(`${EX[k].name}: Ziel muss mindestens 5 sein`);
    if (!f.goalDate || f.goalDate <= todayIso()) return toast(`${EX[k].name}: Datum muss in der Zukunft liegen`);
  }
  const changed = [];
  for (const k of EX_KEYS) {
    const f = settingsForm[k];
    const goal = Math.round(+f.goal);
    const cur = goalOf(k);
    if (goal !== cur.goal || f.goalDate !== cur.goalDate) {
      changed.push(`${goal} ${EX[k].name}`);
      state.settings.goals[k] = { goal, goalDate: f.goalDate };
      delete state.drafts[k];
    }
  }
  settingsForm = null;
  closeSheet();
  save();
  toast(changed.length ? `Neues Ziel: ${changed.join(' · ')} · Plan neu berechnet` : 'Ziele unverändert');
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
  const ex = $('#testEx').value;
  const rawMax = $('#testMax').value;
  const max = Math.round(+rawMax);
  const date = $('#testDate').value || todayIso();
  if (rawMax === '' || !(max >= 0)) return toast('Zahl eingeben');
  const prevBest = bestSet(ex);
  const first = !testsOf(ex).length;
  state.tests = state.tests.filter((t) => !(t.ex === ex && t.date === date));
  state.tests.push({ id: uid(), date, ex, max });
  if (state.drafts[ex] && state.drafts[ex].date >= date) delete state.drafts[ex];
  closeSheet();
  save();
  if (prevBest && max > prevBest) showPR(`${max}`, `${EX[ex].name} am Stück · +${max - prevBest}`);
  else toast(first ? `${EX[ex].name}-Plan erstellt – schau in den Plan-Tab` : 'Max-Test gespeichert · Plan angepasst');
}

function saveSets(ex, date, sets, planned) {
  const total = sets.reduce((a, b) => a + b, 0);
  const prevBest = bestTotal(ex);
  const { goal } = goalOf(ex);
  const existing = state.pushups.find((p) => p.ex === ex && p.date === date);
  if (existing) { existing.sets = existing.sets.concat(sets); existing.total += total; }
  else state.pushups.push({ id: uid(), date, ex, sets, total, planned });
  const newTotal = existing ? existing.total : total;
  save();
  if (newTotal >= goal && prevBest < goal) showPR(`${newTotal}`, `${EX[ex].name}: ZIEL ERREICHT. Respekt.`);
  else if (prevBest && newTotal > prevBest) showPR(`${newTotal}`, `${EX[ex].name} in einer Einheit`);
  else toast(`${total} ${EX[ex].name} gespeichert`);
}

function deleteEntry(kind, id) {
  if (!confirm('Eintrag löschen?')) return;
  if (kind === 'sess') state.pushups = state.pushups.filter((x) => x.id !== id);
  else if (kind === 'test') state.tests = state.tests.filter((x) => x.id !== id);
  else if (kind === 'timed') state.timed = state.timed.filter((x) => x.id !== id);
  else if (kind === 'gym') state.gym = state.gym.filter((x) => x.id !== id);
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
  const { act, ex } = b.dataset;

  switch (act) {
    case 'close': closeSheet(); break;
    case 'add': sheetAdd(b.dataset.date); break;
    case 'test': sheetTest(ex, b.dataset.date); break;
    case 'free': sheetFree(ex, b.dataset.date); break;
    case 'cardio': sheetCardio(b.dataset.type, b.dataset.dist ? +b.dataset.dist : null, b.dataset.date); break;
    case 'step': {
      const inp = $(b.dataset.t);
      inp.value = Math.max(0, (+inp.value || 0) + +b.dataset.v);
      inp.dispatchEvent(new Event('input', { bubbles: true }));
      break;
    }
    case 'save-test': saveTest(); break;
    case 'save-free': {
      const fx = $('#freeEx').value;
      const sets = ($('#freeSets').value.match(/\d+/g) || []).map(Number).filter((n) => n > 0);
      if (!sets.length) return toast('Mindestens einen Satz eingeben');
      const date = $('#freeDate').value || todayIso();
      closeSheet();
      saveSets(fx, date, sets, getPlan(fx).some((s) => s.date === date));
      break;
    }
    case 'c-switch': sheetCardio(b.dataset.type, null, $('#cDate').value); break;
    case 'c-dist': {
      const type = $('#cType').value;
      document.querySelectorAll('#cChips .chip').forEach((c) => (c.className = 'chip'));
      b.className = `chip on ${type}`;
      const custom = b.dataset.dist === 'custom';
      $('#cCustom').classList.toggle('hidden', !custom);
      if (custom) { $('#cDist').value = $('#cCustom').value || ''; $('#cCustom').focus(); }
      else $('#cDist').value = b.dataset.dist;
      updateCardioPreview();
      break;
    }
    case 'save-cardio': saveCardio(); break;

    case 'timed': sheetTimed(ex, b.dataset.mode, b.dataset.target ? +b.dataset.target : null, b.dataset.date); break;
    case 't-ex': {
      const f = timedForm;
      const std = f.mode === 'time' ? EX[ex].timeReps : EX[ex].amrap;
      f.ex = ex;
      if (f.mode === 'time') f.target = std[0]; // rep targets differ per exercise; time limits are shared
      f.date = $('#tDate').value || f.date;
      swReset();
      renderTimedSheet();
      break;
    }
    case 't-mode': {
      const f = timedForm;
      f.mode = b.dataset.mode;
      f.target = (f.mode === 'time' ? EX[f.ex].timeReps : EX[f.ex].amrap)[0];
      f.value = '';
      f.date = $('#tDate').value || f.date;
      swReset();
      renderTimedSheet();
      break;
    }
    case 't-target': {
      const f = timedForm;
      f.date = $('#tDate').value || f.date;
      if (b.dataset.v === 'custom') { f.target = 0; swReset(); renderTimedSheet('#tCustom'); }
      else { f.target = +b.dataset.v; swReset(); renderTimedSheet(); }
      break;
    }
    case 'sw-toggle': if (sw.running) swStop(); else swStart(); break;
    case 'sw-reset': swReset(); break;
    case 'save-timed': saveTimed(); break;

    case 'gym': sheetGym(b.dataset.date); break;
    case 'g-title': gymForm.title = b.dataset.v; renderGymSheet(); break;
    case 'g-copy': copyLastGym(); break;
    case 'g-add-ex':
      gymForm.exercises.push({ name: '', sets: [{ reps: '', kg: '' }] });
      renderGymSheet(`[data-g="ex-name"][data-e="${gymForm.exercises.length - 1}"]`);
      break;
    case 'g-del-ex': gymForm.exercises.splice(+b.dataset.e, 1); renderGymSheet(); break;
    case 'g-add-set': {
      const gx = gymForm.exercises[+b.dataset.e];
      const last = gx.sets[gx.sets.length - 1];
      gx.sets.push({ reps: last ? last.reps : '', kg: last ? last.kg : '' });
      renderGymSheet();
      break;
    }
    case 'g-del-set': {
      const gx = gymForm.exercises[+b.dataset.e];
      gx.sets.splice(+b.dataset.s, 1);
      if (!gx.sets.length) gx.sets.push({ reps: '', kg: '' });
      renderGymSheet();
      break;
    }
    case 'save-gym': saveGym(); break;

    case 'settings': settingsForm = null; sheetSettings(); break;
    case 'goal-step':
      settingsForm[ex].goal = Math.max(5, (Math.round(+$(`#sGoal-${ex}`).value) || 0) + +b.dataset.v);
      sheetSettings();
      break;
    case 'goal-preset': settingsForm[ex].goal = +b.dataset.v; sheetSettings(); break;
    case 'save-goal': saveGoal(); break;

    case 'set': {
      const i = +b.dataset.i;
      const dr = state.drafts[ex];
      const x = dr.sets[i];
      if (x.done) return sheetEditSet(ex, i);
      x.done = true;
      persist();
      const s = getPlan(ex).find((p) => p.date === dr.date);
      renderHome();
      renderCal();
      if (dr.sets.every((y) => y.done)) { stopRest(); toast('Alle Sätze geschafft – jetzt speichern!'); }
      else if (s) startRest(s.rest);
      break;
    }
    case 'set-save': {
      const x = state.drafts[ex].sets[+b.dataset.i];
      x.a = Math.max(0, Math.round(+$('#setReps').value || 0));
      x.done = true;
      persist(); closeSheet(); renderHome(); renderCal();
      break;
    }
    case 'set-undo': {
      state.drafts[ex].sets[+b.dataset.i].done = false;
      persist(); closeSheet(); renderHome(); renderCal();
      break;
    }
    case 'finish': {
      const dr = state.drafts[ex];
      const sets = dr.sets.filter((x) => x.done && x.a > 0).map((x) => x.a);
      if (!sets.length) return toast('Noch kein Satz erledigt');
      if (sets.length < dr.sets.length && !confirm(`Erst ${sets.length} von ${dr.sets.length} Sätzen erledigt. Trotzdem speichern?`)) return;
      const date = dr.date;
      delete state.drafts[ex];
      stopRest();
      saveSets(ex, date, sets, true);
      break;
    }
    case 'rest-add': restEnd += 15000; restTotal += 15; tickRest(); break;
    case 'rest-skip': stopRest(); break;
    case 'del': deleteEntry(b.dataset.kind, b.dataset.id); break;
    case 'cal-prev': calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() - 1, 1); renderCal(); break;
    case 'cal-next': calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 1); renderCal(); break;
    case 'cal-day': calSel = b.dataset.date; renderCal(); break;
    case 'ctype':
      cardioType = b.dataset.type;
      renderCardio();
      if (b.dataset.goto) switchTab('cardio');
      break;
    case 'goto-plan': planEx = ex; renderPlan(); switchTab('plan'); break;
    case 'plan-ex': planEx = ex; renderPlan(); break;
    case 'day': {
      const d = +b.dataset.d;
      const days = state.settings.days;
      state.settings.days = days.includes(d) ? days.filter((x) => x !== d) : [...days, d];
      save();
      sheetSettings();
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
      if (confirm('Wirklich ALLE Daten löschen? (Vorher Backup exportieren!)')) { state = defaults(); closeSheet(); save(); }
      break;
  }
});

document.addEventListener('input', (e) => {
  const t = e.target;
  if (t.dataset.goalEx && settingsForm) { settingsForm[t.dataset.goalEx].goal = Math.round(+t.value) || 0; updateGoalPreview(t.dataset.goalEx); return; }
  if (t.dataset.goaldateEx && settingsForm) { settingsForm[t.dataset.goaldateEx].goalDate = t.value; updateGoalPreview(t.dataset.goaldateEx); return; }
  const g = t.dataset.g;
  if (g && gymForm) {
    const v = t.value;
    if (g === 'title' || g === 'notes' || g === 'date') gymForm[g] = v;
    else if (g === 'ex-name') gymForm.exercises[+t.dataset.e].name = v;
    else gymForm.exercises[+t.dataset.e].sets[+t.dataset.s][g] = v;
    if (g === 'title') updateGymCopyBtn();
    return;
  }
  if (timedForm) {
    if (t.id === 'tValue') { timedForm.value = t.value; updateTimedPreview(); return; }
    if (t.id === 'tCustom') {
      timedForm.target = timedForm.mode === 'time' ? Math.round(+t.value) || 0 : Math.round(parseTime(t.value) || 0);
      swReset();
      updateTimedPreview();
      return;
    }
  }
  if (t.id === 'cTime') updateCardioPreview();
  if (t.id === 'cCustom') { $('#cDist').value = t.value; updateCardioPreview(); }
  if (t.id === 'freeSets') {
    const sets = (t.value.match(/\d+/g) || []).map(Number);
    $('#freePreview').textContent = sets.length ? `${sets.length} Sätze · ${sets.reduce((a, b) => a + b, 0)} Reps` : '';
  }
});

document.addEventListener('change', (e) => {
  if (e.target.id === 'importFile') {
    const f = e.target.files[0];
    if (!f) return;
    f.text().then((txt) => {
      const data = JSON.parse(txt);
      if (!data.settings || !Array.isArray(data.cardio)) throw new Error('bad');
      if (!confirm('Backup laden? Aktuelle Daten werden ersetzt.')) return;
      state = migrate(data);
      closeSheet();
      save();
      toast('Backup geladen');
    }).catch(() => toast('Datei ist kein gültiges APEX-Backup'));
    e.target.value = '';
  }
});

// Refresh when the app comes back to the foreground on a new day.
let lastDay = todayIso();
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && todayIso() !== lastDay) { lastDay = todayIso(); planCache = {}; render(); }
});

render();
