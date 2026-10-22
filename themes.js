'use strict';
// Design themes. Loaded in <head> so the saved theme is applied before the first paint.
(function () {
  const KEY = 'apex-theme';
  const THEMES = [
    {
      id: 'apex', name: 'APEX', tag: 'Cyan HUD · Original',
      hud: 'Orbitron', hudSpec: 'Orbitron:wght@500;700;900', body: 'Rajdhani', bodySpec: 'Rajdhani:wght@500;600;700',
      vars: { cyan: '#3df5ff', bg: '#05080f', panel: 'rgba(12, 20, 36, 0.72)', 'panel-2': 'rgba(20, 32, 56, 0.6)', 'sheet-bg': '#0a1220', 'bar-bg': 'rgba(5, 8, 15, .88)', text: '#e6f6ff', muted: '#7d93ad', dim: '#46586f', glow1: '#0b6cff', glow2: '#7a2dff', 'on-acc': '#021018' }
    },
    {
      id: 'synthwave', name: 'Synthwave', tag: 'Neon-Pink · 80s Retro',
      hud: 'Audiowide', hudSpec: 'Audiowide', body: 'Exo 2', bodySpec: 'Exo 2:wght@500;600;700',
      vars: { cyan: '#ff2bd6', bg: '#0d0221', panel: 'rgba(30, 8, 52, 0.72)', 'panel-2': 'rgba(48, 14, 78, 0.6)', 'sheet-bg': '#160535', 'bar-bg': 'rgba(13, 2, 33, .9)', text: '#fbe9ff', muted: '#a98bc4', dim: '#5e4677', glow1: '#ff2bd6', glow2: '#ff8a00', 'on-acc': '#1a0016', gym: '#00e5ff' }
    },
    {
      id: 'terminal', name: 'Terminal', tag: 'Matrix-Grün · Code',
      hud: 'Share Tech Mono', hudSpec: 'Share Tech Mono', body: 'JetBrains Mono', bodySpec: 'JetBrains Mono:wght@500;700',
      vars: { cyan: '#39ff14', bg: '#010702', panel: 'rgba(4, 20, 8, 0.75)', 'panel-2': 'rgba(8, 32, 14, 0.6)', 'sheet-bg': '#031007', 'bar-bg': 'rgba(1, 7, 2, .92)', text: '#d6ffd0', muted: '#6fa56a', dim: '#2f5a2c', glow1: '#0f7a1a', glow2: '#004d2a', 'on-acc': '#001400', pull: '#00e0ff', fs: '15px' }
    },
    {
      id: 'redalert', name: 'Red Alert', tag: 'Alarmrot · Militär',
      hud: 'Russo One', hudSpec: 'Russo One', body: 'Chakra Petch', bodySpec: 'Chakra Petch:wght@500;600;700',
      vars: { cyan: '#ff3b3b', bg: '#0c0303', panel: 'rgba(34, 8, 8, 0.72)', 'panel-2': 'rgba(52, 14, 14, 0.6)', 'sheet-bg': '#170606', 'bar-bg': 'rgba(12, 3, 3, .9)', text: '#ffe9e6', muted: '#b3807a', dim: '#6a3c37', glow1: '#ff2d2d', glow2: '#ff8a00', 'on-acc': '#200000', ski: '#ffc23d' }
    },
    {
      id: 'arktis', name: 'Arktis', tag: 'Eisblau · Clean',
      hud: 'Michroma', hudSpec: 'Michroma', body: 'Saira', bodySpec: 'Saira:wght@500;600;700',
      vars: { cyan: '#a8e8ff', bg: '#060b12', panel: 'rgba(18, 30, 44, 0.7)', 'panel-2': 'rgba(30, 46, 66, 0.6)', 'sheet-bg': '#0c1622', 'bar-bg': 'rgba(6, 11, 18, .9)', text: '#f2fbff', muted: '#8aa3b8', dim: '#4a6075', glow1: '#3aa0ff', glow2: '#9be7ff', 'on-acc': '#04121c' }
    },
    {
      id: 'gold', name: 'Gold', tag: 'Schwarz-Gold · Premium',
      hud: 'Syncopate', hudSpec: 'Syncopate:wght@400;700', body: 'Space Grotesk', bodySpec: 'Space Grotesk:wght@500;600;700',
      vars: { cyan: '#ffc94a', bg: '#090705', panel: 'rgba(28, 22, 12, 0.75)', 'panel-2': 'rgba(44, 34, 18, 0.6)', 'sheet-bg': '#14100a', 'bar-bg': 'rgba(9, 7, 5, .92)', text: '#fff6e2', muted: '#b09e7c', dim: '#615641', glow1: '#c88a12', glow2: '#6b3d00', 'on-acc': '#1c1200', gold: '#fff1b8' }
    },
    {
      id: 'biohazard', name: 'Biohazard', tag: 'Giftgelb · Toxic',
      hud: 'Tektur', hudSpec: 'Tektur:wght@500;700;900', body: 'Oxanium', bodySpec: 'Oxanium:wght@500;600;700',
      vars: { cyan: '#d4ff00', bg: '#070900', panel: 'rgba(22, 28, 4, 0.75)', 'panel-2': 'rgba(34, 44, 6, 0.6)', 'sheet-bg': '#0e1203', 'bar-bg': 'rgba(7, 9, 0, .92)', text: '#f6ffd6', muted: '#9aa86a', dim: '#535c32', glow1: '#7aa800', glow2: '#00a86b', 'on-acc': '#141a00', pull: '#00ffc8' }
    },
    {
      id: 'ultraviolett', name: 'Ultraviolett', tag: 'Violett · Cyberpunk',
      hud: 'Oxanium', hudSpec: 'Oxanium:wght@500;700;800', body: 'Exo 2', bodySpec: 'Exo 2:wght@500;600;700',
      vars: { cyan: '#b388ff', bg: '#07030f', panel: 'rgba(22, 12, 40, 0.74)', 'panel-2': 'rgba(36, 20, 64, 0.6)', 'sheet-bg': '#110824', 'bar-bg': 'rgba(7, 3, 15, .9)', text: '#f1eaff', muted: '#9c8cbf', dim: '#54487a', glow1: '#6a1bff', glow2: '#ff2bd6', 'on-acc': '#12002e', bike: '#4dd2ff' }
    },
    {
      id: 'bladerunner', name: 'Blade Runner', tag: 'Orange & Teal · Noir',
      hud: 'Quantico', hudSpec: 'Quantico:wght@400;700', body: 'Saira', bodySpec: 'Saira:wght@500;600;700',
      vars: { cyan: '#ff8a3d', bg: '#0a0a12', panel: 'rgba(26, 20, 30, 0.74)', 'panel-2': 'rgba(42, 30, 44, 0.6)', 'sheet-bg': '#141020', 'bar-bg': 'rgba(10, 10, 18, .9)', text: '#fff0e6', muted: '#b39a8f', dim: '#5f5058', glow1: '#ff5e3a', glow2: '#00b3b3', 'on-acc': '#1f0a00', ski: '#00e0d0' }
    },
    {
      id: 'stealth', name: 'Stealth', tag: 'Schwarz-Weiß · Minimal',
      hud: 'Space Mono', hudSpec: 'Space Mono:wght@400;700', body: 'Space Grotesk', bodySpec: 'Space Grotesk:wght@500;600;700',
      vars: { cyan: '#f0f0f0', bg: '#000000', panel: 'rgba(18, 18, 18, 0.8)', 'panel-2': 'rgba(30, 30, 30, 0.7)', 'sheet-bg': '#0d0d0d', 'bar-bg': 'rgba(0, 0, 0, .92)', text: '#f5f5f5', muted: '#8c8c8c', dim: '#4a4a4a', glow1: '#333333', glow2: '#1a1a1a', 'on-acc': '#000000' }
    }
  ];
  const OVERRIDABLE = ['pull', 'ski', 'bike', 'gym', 'gold', 'fs'];

  const fontUrl = (specs) => 'https://fonts.googleapis.com/css2?' + specs.map((s) => 'family=' + s.replace(/ /g, '+')).join('&') + '&display=swap';
  function loadFonts(id, specs) {
    if (document.getElementById(id)) return;
    const l = document.createElement('link');
    l.id = id;
    l.rel = 'stylesheet';
    l.href = fontUrl(specs);
    document.head.appendChild(l);
  }

  function apply(id) {
    const t = THEMES.find((x) => x.id === id) || THEMES[0];
    const root = document.documentElement;
    Object.entries(t.vars).forEach(([k, v]) => root.style.setProperty('--' + k, v));
    OVERRIDABLE.forEach((k) => { if (!(k in t.vars)) root.style.removeProperty('--' + k); });
    root.style.setProperty('--font-hud', `'${t.hud}', system-ui, sans-serif`);
    root.style.setProperty('--font', `'${t.body}', system-ui, sans-serif`);
    loadFonts('font-' + t.id, [t.hudSpec, t.bodySpec]);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = t.vars.bg;
    root.dataset.theme = t.id;
    return t;
  }
  function current() {
    try { return localStorage.getItem(KEY) || 'apex'; } catch (e) { return 'apex'; }
  }
  function set(id) {
    try { localStorage.setItem(KEY, id); } catch (e) {}
    return apply(id);
  }
  // For the picker: every theme previews in its own fonts.
  function loadAll() { loadFonts('font-all', [...new Set(THEMES.flatMap((t) => [t.hudSpec, t.bodySpec]))]); }

  window.APEX_THEMES = { list: THEMES, apply, set, current, loadAll };
  apply(current());
})();
