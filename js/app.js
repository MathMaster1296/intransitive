// Boot: routing, theme, sound, dialogs, diagrams, share links, service worker.

import * as E from './engine.js';
import { createBoard } from './board.js';
import { DIAGRAMS } from './lessons.js';
import { PUZZLE_SET } from './puzzledata.js';
import { createGame } from './game.js';
import { createPuzzles } from './puzzles.js';
import { createTutorial } from './tutorial.js';
import { createDemo } from './home.js';
import { createStrategy } from './strategy.js';
import { sound } from './sound.js';
import { loadStats, saveStats, LEVEL_RATING, expected } from './stats.js';

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

// Dialogs ------------------------------------------------------------------

const ng = { mode: 'cpu', color: '0', level: 'medium' };

function initNewGameDialog() {
  const dlg = $('dlg-new');
  $('ng-mode').querySelectorAll('button').forEach((b) => {
    b.addEventListener('click', () => {
      ng.mode = b.dataset.mode;
      $('ng-mode').querySelectorAll('button').forEach((x) => x.classList.toggle('active', x === b));
      $('ng-color-field').hidden = ng.mode !== 'cpu';
      $('ng-level-field').hidden = ng.mode !== 'cpu';
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
  $('ng-cancel').addEventListener('click', () => dlg.close());
  $('ng-start').addEventListener('click', () => {
    dlg.close();
    const human = ng.color === 'random' ? (Math.random() < 0.5 ? E.BLUE : E.RED) : Number(ng.color);
    game.startGame({ mode: ng.mode, level: ng.level, human });
    if (location.hash !== '#play') location.hash = '#play';
  });
}

function renderLevelOdds() {
  const stats = loadStats();
  for (const level of ['easy', 'medium', 'hard']) {
    const el = document.querySelector(`#ng-level [data-level="${level}"] span`);
    if (!el) continue;
    const pct = Math.round(expected(stats.rating, LEVEL_RATING[level]) * 100);
    el.textContent = `${el.dataset.desc} · rated ${LEVEL_RATING[level]} · you win about ${pct}%`;
  }
}

function openNewGame() {
  renderLevelOdds();
  const s = game.state;
  ng.mode = s.mode;
  ng.level = s.level;
  ng.color = String(s.human);
  $('ng-mode').querySelectorAll('button').forEach((x) => x.classList.toggle('active', x.dataset.mode === ng.mode));
  $('ng-color').querySelectorAll('.choice').forEach((x) => x.classList.toggle('active', x.dataset.color === ng.color));
  $('ng-level').querySelectorAll('.choice').forEach((x) => x.classList.toggle('active', x.dataset.level === ng.level));
  $('ng-color-field').hidden = ng.mode !== 'cpu';
  $('ng-level-field').hidden = ng.mode !== 'cpu';
  $('dlg-new').showModal();
}

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
    if (tag === 'input' || tag === 'textarea' || e.target.isContentEditable) return;
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

const ui = {
  toast,
  badge,
  openNewGame,
  openMoves,
  playPosition(board, turn, human, level = 'medium') {
    game.startGame({ mode: 'cpu', level, human, board, turn, custom: true });
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
initNewGameDialog();
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
