// Boot: routing, theme, sound, settings, dialogs, online play, diagrams,
// share links, service worker.

import * as E from './engine.js';
import { createBoard } from './board.js';
import { DIAGRAMS } from './lessons.js';
import { PUZZLE_SET } from './puzzledata.js';
import { createGame, adaptiveParams } from './game.js';
import { createPuzzles } from './puzzles.js';
import { createTutorial } from './tutorial.js';
import { createDemo } from './home.js';
import { createStrategy } from './strategy.js';
import { createOnline } from './online.js';
import { sound } from './sound.js';
import { loadStats, saveStats, LEVEL_RATING, expected, getPlayer } from './stats.js';
import { loadSettings, updateSettings, getSettings, BOARD_THEMES } from './settings.js';

const THEME_KEY = 'intransitive.theme';
const VIEWS = ['home', 'play', 'rules', 'strategy', 'puzzles', 'about'];
const $ = (id) => document.getElementById(id);

function storageGet(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function storageSet(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore
  }
}

// Toasts ------------------------------------------------------------------

let toastTimer = null;

function toast(text, kind = '') {
  const el = $('toast');
  el.textContent = text;
  el.className = `toast show ${kind}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), kind ? 3600 : 2600);
}

function badge(b) {
  if (!b) return;
  sound.play('badge');
  toast(`Badge earned: ${b.name}. ${b.desc}`, 'badge-toast');
  game.refreshStats();
  puzzles.refreshStats();
}

// Theme -------------------------------------------------------------------

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
}

function initTheme() {
  const saved = storageGet(THEME_KEY);
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  applyTheme(saved || (prefersDark ? 'dark' : 'light'));
  $('theme-btn').addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    storageSet(THEME_KEY, next);
  });
}

function renderSoundButton() {
  const btn = $('sound-btn');
  btn.setAttribute('aria-pressed', String(sound.enabled));
  btn.querySelector('use').setAttribute('href', sound.enabled ? '#i-sound' : '#i-mute');
  btn.title = sound.enabled ? 'Sound on' : 'Sound off';
}

function initSound() {
  renderSoundButton();
  $('sound-btn').addEventListener('click', () => {
    sound.enabled = !sound.enabled;
    renderSoundButton();
    if (sound.enabled) sound.play('select');
  });
  document.addEventListener('pointerdown', () => sound.prime(), { once: true });
}

// Settings ----------------------------------------------------------------

const THEME_SWATCH = {
  walnut: ['#f0e4c9', '#d8c39a', '#5b3f27'],
  slate: ['#cfd6e0', '#8d9bb0', '#2c3442'],
  forest: ['#e8e6d5', '#7a9a6d', '#2f4a2a'],
  sand: ['#f6ecd8', '#e2c99a', '#a3763c'],
  ocean: ['#dbe9f2', '#7fa8c9', '#1f3a55'],
};

function initSettings() {
  loadSettings();
  const wrap = $('set-board');
  wrap.innerHTML = Object.entries(BOARD_THEMES).map(([k, name]) => {
    const [a, b, f] = THEME_SWATCH[k];
    return `<button type="button" class="theme-chip" data-board="${k}" title="${name}" style="--ta:${a};--tb:${b};--tf:${f}"></button>`;
  }).join('');
  function sync() {
    const s = getSettings();
    wrap.querySelectorAll('.theme-chip').forEach((c) => c.classList.toggle('active', c.dataset.board === s.board));
    $('set-pieces').querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.pieces === s.pieces));
    $('set-motion').querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.motion === (s.motion ? 'on' : 'off')));
  }
  wrap.addEventListener('click', (e) => {
    const c = e.target.closest('[data-board]');
    if (!c) return;
    updateSettings({ board: c.dataset.board });
    sync();
  });
  $('set-pieces').addEventListener('click', (e) => {
    const b = e.target.closest('[data-pieces]');
    if (!b) return;
    updateSettings({ pieces: b.dataset.pieces });
    sync();
  });
  $('set-motion').addEventListener('click', (e) => {
    const b = e.target.closest('[data-motion]');
    if (!b) return;
    updateSettings({ motion: b.dataset.motion === 'on' });
    sync();
  });
  $('settings-btn').addEventListener('click', () => {
    sync();
    $('dlg-settings').showModal();
  });
  $('settings-close').addEventListener('click', () => $('dlg-settings').close());
}

// Routing -----------------------------------------------------------------

let currentView = null;
let demo = null;

function route() {
  const hash = location.hash.replace('#', '');
  if (hash.startsWith('game=')) {
    try {
      game.loadFromLink(hash.slice(5));
      toast('Shared game loaded. Step through it with the arrows.');
    } catch (err) {
      toast(err.message);
    }
    location.replace('#play');
    return;
  }
  if (hash.startsWith('pos=')) {
    try {
      const { board, turn } = E.decodePosition(hash.slice(4));
      game.loadPosition(board, turn);
      toast('Shared position loaded. Two players, unrated.');
    } catch (err) {
      toast(err.message);
    }
    location.replace('#play');
    return;
  }
  if (hash.startsWith('join=')) {
    openJoin(hash.slice(5));
    location.replace('#play');
    return;
  }
  let view = hash;
  let section = '';
  if (view.startsWith('strategy/')) {
    section = view.slice('strategy/'.length);
    view = 'strategy';
  }
  if (!VIEWS.includes(view)) view = 'home';
  for (const v of VIEWS) $('view-' + v).hidden = v !== view;
  document.querySelectorAll('.tabs a, .bottom-nav a').forEach((a) => {
    a.classList.toggle('active', a.getAttribute('href') === '#' + view);
  });
  if (view === 'puzzles') puzzles.ensure();
  if (view === 'strategy') {
    strategy.ensure();
    if (section) {
      strategy.scrollTo(section);
      currentView = view;
      return;
    }
  }
  if (view === 'play') game.onVisible();
  if (view === 'home') demo.start();
  else demo.stop();
  if (currentView && currentView !== view) window.scrollTo(0, 0);
  currentView = view;
}

// New game dialog ---------------------------------------------------------------

const ng = { mode: 'cpu', color: '0', level: 'medium', style: 'balanced' };

function renderLevelOdds() {
  const stats = loadStats();
  for (const level of ['easy', 'medium', 'hard', 'adaptive']) {
    const el = document.querySelector(`#ng-level [data-level="${level}"] span`);
    if (!el) continue;
    const r = level === 'adaptive' ? adaptiveParams(stats.rating).rating : LEVEL_RATING[level];
    const pct = Math.round(expected(stats.rating, r) * 100);
    el.textContent = `${el.dataset.desc} · rated ${r} · you win about ${pct}%`;
  }
}

function syncModeFields() {
  $('ng-color-field').hidden = ng.mode !== 'cpu';
  $('ng-level-field').hidden = ng.mode !== 'cpu';
  $('ng-style-field').hidden = ng.mode !== 'cpu' && ng.mode !== 'watch';
  $('ng-names-field').hidden = ng.mode !== 'two';
  $('ng-clock-field').hidden = ng.mode !== 'two' && ng.mode !== 'online';
  $('ng-online-field').hidden = ng.mode !== 'online';
  $('ng-watch-field').hidden = ng.mode !== 'watch';
  $('ng-start').hidden = ng.mode === 'online';
}

function initNewGameDialog() {
  const dlg = $('dlg-new');
  $('ng-mode').querySelectorAll('button').forEach((b) => {
    b.addEventListener('click', () => {
      ng.mode = b.dataset.mode;
      $('ng-mode').querySelectorAll('button').forEach((x) => x.classList.toggle('active', x === b));
      syncModeFields();
    });
  });
  $('ng-color').querySelectorAll('.choice').forEach((b) => {
    b.addEventListener('click', () => {
      ng.color = b.dataset.color;
      $('ng-color').querySelectorAll('.choice').forEach((x) => x.classList.toggle('active', x === b));
    });
  });
  $('ng-level').querySelectorAll('.choice').forEach((b) => {
    b.addEventListener('click', () => {
      ng.level = b.dataset.level;
      $('ng-level').querySelectorAll('.choice').forEach((x) => x.classList.toggle('active', x === b));
    });
  });
  $('ng-style').querySelectorAll('button').forEach((b) => {
    b.addEventListener('click', () => {
      ng.style = b.dataset.style;
      $('ng-style').querySelectorAll('button').forEach((x) => x.classList.toggle('active', x === b));
    });
  });
  $('ng-cancel').addEventListener('click', () => dlg.close());
  $('ng-start').addEventListener('click', () => {
    dlg.close();
    const human = ng.color === 'random' ? (Math.random() < 0.5 ? E.BLUE : E.RED) : Number(ng.color);
    const names = { blue: $('ng-name-blue').value.trim().slice(0, 18), red: $('ng-name-red').value.trim().slice(0, 18) };
    const clock = $('ng-clock').value;
    if (ng.mode === 'watch') {
      game.startGame({ mode: 'watch', style: ng.style, watchLevels: { blue: $('ng-watch-blue').value, red: $('ng-watch-red').value } });
    } else if (ng.mode === 'two') {
      game.startGame({ mode: 'two', names, clock });
    } else {
      game.startGame({ mode: 'cpu', level: ng.level, style: ng.style, human, names: { blue: '', red: '' } });
    }
    if (location.hash !== '#play') location.hash = '#play';
  });
  $('ng-swap').addEventListener('click', () => {
    const a = $('ng-name-blue').value;
    $('ng-name-blue').value = $('ng-name-red').value;
    $('ng-name-red').value = a;
  });
  $('ng-create-link').addEventListener('click', createOnlineLink);
  $('ng-link-copy').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText($('ng-link').value);
      toast('Link copied. Send it to your friend.');
    } catch {
      $('ng-link').select();
    }
  });
}

function openNewGame() {
  renderLevelOdds();
  const s = game.state;
  ng.mode = s.mode === 'online' ? 'cpu' : s.mode;
  ng.level = s.level;
  ng.style = s.style;
  ng.color = String(s.human);
  $('ng-mode').querySelectorAll('button').forEach((x) => x.classList.toggle('active', x.dataset.mode === ng.mode));
  $('ng-color').querySelectorAll('.choice').forEach((x) => x.classList.toggle('active', x.dataset.color === ng.color));
  $('ng-level').querySelectorAll('.choice').forEach((x) => x.classList.toggle('active', x.dataset.level === ng.level));
  $('ng-style').querySelectorAll('button').forEach((x) => x.classList.toggle('active', x.dataset.style === ng.style));
  syncModeFields();
  const stats = loadStats();
  const known = Object.keys(stats.players || {});
  $('ng-names-list').innerHTML = known.map((n) => `<option value="${n.replace(/"/g, '&quot;')}"></option>`).join('');
  $('ng-name-blue').value = s.names && s.names.blue ? s.names.blue : (stats.lastNames ? stats.lastNames.blue : '') || '';
  $('ng-name-red').value = s.names && s.names.red ? s.names.red : (stats.lastNames ? stats.lastNames.red : '') || '';
  $('ng-online-name').value = storageGet('intransitive.online.name') || (stats.lastNames ? stats.lastNames.blue : '') || '';
  $('ng-link-row').hidden = true;
  $('ng-online-status').textContent = '';
  $('dlg-new').showModal();
}

// Online --------------------------------------------------------------------

function myRating(name) {
  const stats = loadStats();
  const pl = name ? getPlayer(stats, name) : null;
  if (pl) saveStats(stats);
  return pl ? pl.rating : 1200;
}

function wireOnlineHandlers(myName) {
  online.on({
    status: (text) => {
      $('online-status').textContent = text;
      $('ng-online-status').textContent = text;
      $('join-status').textContent = text;
    },
    start: ({ color, opponent, clock }) => {
      $('dlg-new').close();
      $('dlg-join').close();
      game.startOnline({ color, opponent, clock, myName });
      $('online-link').hidden = true;
      $('online-copy').hidden = true;
      if (location.hash !== '#play') location.hash = '#play';
      toast(`Connected to ${opponent.name}. Good luck.`);
    },
    move: (m, ply) => game.remoteMove(m, ply),
    resign: () => game.remoteResign(),
    drawOffer: () => game.remoteDrawOffer(),
    drawAccept: () => game.remoteDrawAccept(),
    close: () => game.remoteLeft(),
  });
}

async function createOnlineLink() {
  const name = $('ng-online-name').value.trim().slice(0, 18) || 'Host';
  storageSet('intransitive.online.name', name);
  $('ng-create-link').disabled = true;
  $('ng-online-status').textContent = 'Creating link…';
  wireOnlineHandlers(name);
  try {
    const link = await online.host({ name, rating: myRating(name), color: $('ng-online-color').value, clock: $('ng-clock').value === 'none' ? null : $('ng-clock').value });
    $('ng-link').value = link;
    $('ng-link-row').hidden = false;
    $('online-link').value = link;
    $('online-link').hidden = false;
    $('online-copy').hidden = false;
    $('online-card').hidden = false;
    $('online-status').textContent = 'Waiting for your opponent to open the link. You can close this dialog.';
  } catch (err) {
    $('ng-online-status').textContent = `Could not create a link (${err.message || err.type || 'unknown error'}). Check your connection and try again.`;
  }
  $('ng-create-link').disabled = false;
}

function openJoin(id) {
  const stats = loadStats();
  $('join-name').value = storageGet('intransitive.online.name') || (stats.lastNames ? stats.lastNames.blue : '') || '';
  $('join-status').textContent = '';
  $('dlg-join').dataset.id = id;
  $('dlg-join').showModal();
}

function initOnline() {
  $('join-cancel').addEventListener('click', () => $('dlg-join').close());
  $('join-go').addEventListener('click', async () => {
    const id = $('dlg-join').dataset.id;
    const name = $('join-name').value.trim().slice(0, 18) || 'Guest';
    storageSet('intransitive.online.name', name);
    $('join-go').disabled = true;
    wireOnlineHandlers(name);
    try {
      await online.join(id, { name, rating: myRating(name) });
    } catch (err) {
      $('join-status').textContent = `Could not connect (${err.message || err.type || 'unknown error'}).`;
    }
    $('join-go').disabled = false;
  });
  $('online-copy').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText($('online-link').value);
      toast('Link copied.');
    } catch {
      $('online-link').select();
    }
  });
  $('online-leave').addEventListener('click', () => {
    if (game.state.mode === 'online' && !game.state.game.result && !window.confirm('Leaving counts as resigning this game. Leave?')) return;
    game.leaveOnline();
    online.leave();
    $('online-card').hidden = true;
    toast('Left the online game.');
  });
}

// Moves dialog ---------------------------------------------------------------

function initMovesDialog() {
  const dlg = $('dlg-moves');
  $('moves-close').addEventListener('click', () => dlg.close());
  $('moves-copy').addEventListener('click', async () => {
    const text = $('moves-text').value.trim() || '(no moves)';
    try {
      await navigator.clipboard.writeText(text);
      toast('Move list copied.');
    } catch {
      $('moves-text').select();
    }
  });
  $('moves-poslink').addEventListener('click', async () => {
    const link = game.positionLink();
    try {
      await navigator.clipboard.writeText(link);
      toast('Position link copied.');
    } catch {
      window.prompt('Copy this link:', link);
    }
  });
  $('moves-load').addEventListener('click', () => {
    try {
      game.loadMovesText($('moves-text').value);
      dlg.close();
      toast('Game loaded.');
    } catch (err) {
      $('moves-error').textContent = err.message;
    }
  });
}

function openMoves(text) {
  $('moves-text').value = text;
  $('moves-error').textContent = '';
  $('dlg-moves').showModal();
}

function initKeysDialog() {
  $('keys-btn').addEventListener('click', () => $('dlg-keys').showModal());
  $('keys-close').addEventListener('click', () => $('dlg-keys').close());
}

// Diagrams -----------------------------------------------------------------

function initDiagrams() {
  document.querySelectorAll('[data-diagram]').forEach((el) => {
    const spec = DIAGRAMS[el.dataset.diagram];
    if (!spec) return;
    const b = createBoard(el, { interactive: false, compact: true });
    b.render(spec.board, {
      targets: spec.targets || [],
      rings: spec.rings === undefined ? null : spec.rings,
      marks: spec.marks || null,
      labels: spec.labels || null,
    });
    const cap = el.parentElement.querySelector('figcaption');
    if (cap && !cap.textContent.trim()) cap.textContent = spec.caption;
  });
}

// Tutorial banner -----------------------------------------------------------

function refreshTutorialBanner() {
  const stats = loadStats();
  const dismissed = storageGet('intransitive.tutorial.dismissed') === '1';
  $('tutorial-banner').hidden = stats.tutorialDone || dismissed;
}

// Keyboard ------------------------------------------------------------------

function initKeyboard() {
  document.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable) return;
    if (document.querySelector('dialog[open]')) return;
    if (e.key.toLowerCase() === 'm') {
      sound.enabled = !sound.enabled;
      renderSoundButton();
      toast(sound.enabled ? 'Sound on' : 'Sound off');
      e.preventDefault();
      return;
    }
    if (e.key === '?') {
      $('dlg-keys').showModal();
      return;
    }
    if (currentView !== 'play') return;
    if (game.keydown(e)) e.preventDefault();
  });
}

// Boot ------------------------------------------------------------------------

const online = createOnline();

const ui = {
  toast,
  badge,
  openNewGame,
  openMoves,
  onlineSend: (msg) => online.send(msg),
  playPosition(board, turn, human, level = 'medium') {
    game.startGame({ mode: 'cpu', level, human, board, turn, custom: true, names: { blue: '', red: '' } });
    location.hash = '#play';
    toast(`Playing this position against the ${level} computer.`);
  },
  tutorialDone() {
    refreshTutorialBanner();
    if (location.hash !== '#play') location.hash = '#play';
    toast('Nice. Now try the computer on easy.');
  },
};

const game = createGame(ui);
const puzzles = createPuzzles(ui);
const tutorial = createTutorial(ui);
const strategy = createStrategy(ui);

initTheme();
initSound();
initSettings();
initNewGameDialog();
initOnline();
initMovesDialog();
initKeysDialog();
initDiagrams();
initKeyboard();
demo = createDemo($('demo-board'), $('demo-caption'));
$('home-puzzle-count').textContent = PUZZLE_SET.length;
game.init();
refreshTutorialBanner();

$('btn-tutorial').addEventListener('click', () => tutorial.open());
$('home-tutorial').addEventListener('click', () => tutorial.open());
document.querySelectorAll('[data-tutorial]').forEach((b) => b.addEventListener('click', () => tutorial.open()));
$('btn-tutorial-dismiss').addEventListener('click', () => {
  storageSet('intransitive.tutorial.dismissed', '1');
  refreshTutorialBanner();
});

window.addEventListener('hashchange', route);
route();

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}
