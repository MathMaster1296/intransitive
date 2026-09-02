import * as E from './engine.js';
import { createBoard, pieceSvg } from './board.js';
import { DIAGRAMS, PUZZLES, boardFrom } from './lessons.js';

const GAME_KEY = 'intransitive.game.v1';
const THEME_KEY = 'intransitive.theme';
const VIEWS = ['play', 'rules', 'strategy', 'puzzles', 'about'];

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
    // Storage can be unavailable in private windows. The game still works.
  }
}

// Theme ---------------------------------------------------------------

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

// Routing -------------------------------------------------------------

let currentView = null;

function route() {
  let view = location.hash.replace('#', '');
  if (!VIEWS.includes(view)) view = 'play';
  for (const v of VIEWS) $('view-' + v).hidden = v !== view;
  document.querySelectorAll('.tabs a').forEach((a) => {
    a.classList.toggle('active', a.getAttribute('href') === '#' + view);
  });
  if (view === 'puzzles') ensurePuzzles();
  if (currentView && currentView !== view) window.scrollTo(0, 0);
  currentView = view;
}

// Game ----------------------------------------------------------------

const state = {
  game: E.newGame(),
  mode: 'cpu',
  level: 'medium',
  human: E.BLUE,
  rings: null,
  selected: -1,
  thinking: false,
  reqId: 0,
};

let board;
let worker = null;
let workerBroken = false;
let pending = null;

function levelLabel(level) {
  return level[0].toUpperCase() + level.slice(1);
}

function cap(s) {
  return s[0].toUpperCase() + s.slice(1);
}

function save() {
  const g = state.game;
  const data = {
    mode: state.mode,
    level: state.level,
    human: state.human,
    rings: state.rings,
    moves: g.moves.map((mv) => mv.m),
    resigned: g.result && g.result.reason === 'resign' ? g.result : null,
  };
  storageSet(GAME_KEY, JSON.stringify(data));
}

function load() {
  const raw = storageGet(GAME_KEY);
  if (!raw) return false;
  try {
    const data = JSON.parse(raw);
    let g = E.newGame();
    for (const m of data.moves || []) g = E.play(g, m);
    if (data.resigned) g = { ...g, result: data.resigned };
    state.game = g;
    state.mode = data.mode === 'two' ? 'two' : 'cpu';
    state.level = ['easy', 'medium', 'hard'].includes(data.level) ? data.level : 'medium';
    state.human = data.human === E.RED ? E.RED : E.BLUE;
    state.rings = data.rings === 0 || data.rings === 1 ? data.rings : null;
    return true;
  } catch {
    return false;
  }
}

function lastMoveOf(g) {
  if (!g.moves.length) return null;
  const m = g.moves[g.moves.length - 1].m;
  return { from: E.moveFrom(m), to: E.moveTo(m) };
}

function renderGame(animate) {
  const g = state.game;
  const targets = state.selected >= 0 ? E.targetsFrom(g.board, state.selected) : [];
  board.render(g.board, {
    selected: state.selected,
    targets,
    lastMove: lastMoveOf(g),
    rings: state.rings,
    animate,
  });
  renderStatus();
  renderCounts();
  renderMoves();
}

function renderStatus() {
  const g = state.game;
  const dot = $('turn-dot');
  const text = $('turn-text');
  const overlay = $('overlay');
  if (g.result) {
    const w = g.result.winner;
    dot.className = 'dot ' + (w === null ? 'none' : E.PLAYER_NAMES[w]);
    text.textContent = E.describeResult(g.result);
    $('overlay-text').textContent = E.describeResult(g.result);
    overlay.hidden = false;
  } else {
    dot.className = 'dot ' + E.PLAYER_NAMES[g.turn];
    if (state.mode === 'cpu') {
      text.textContent = g.turn === state.human ? 'Your move' : `${cap(E.PLAYER_NAMES[g.turn])} is thinking`;
    } else {
      text.textContent = `${cap(E.PLAYER_NAMES[g.turn])} to move`;
    }
    overlay.hidden = true;
  }
  if (state.mode === 'cpu') {
    $('mode-text').textContent = `You are ${E.PLAYER_NAMES[state.human]}. The computer plays ${E.PLAYER_NAMES[1 - state.human]} on ${state.level}.`;
  } else {
    $('mode-text').textContent = 'Two players at one screen.';
  }
  $('think-text').hidden = !state.thinking;
  const left = Math.ceil((E.STAGNATION_PLIES - g.sinceCapture) / 2);
  const warn = !g.result && left <= 30;
  $('stagnation-text').hidden = !warn;
  if (warn) $('stagnation-text').textContent = `Draw in ${left} move${left === 1 ? '' : 's'} unless something is captured.`;
  $('undo-btn').disabled = g.moves.length === 0;
  $('resign-btn').disabled = !!g.result;
}

function renderCounts() {
  const c = E.counts(state.game.board);
  const head = '<tr><th></th>' + [0, 1, 2].map((t) => `<th><span class="mini neutral">${pieceSvg(t)}</span></th>`).join('') + '<th>all</th></tr>';
  const rows = [E.BLUE, E.RED].map((p) => {
    const cells = c[p].map((n) => `<td class="${n === 0 ? 'zero' : n === 1 ? 'low' : ''}">${n}</td>`).join('');
    const total = c[p][0] + c[p][1] + c[p][2];
    return `<tr><td><span class="dot ${E.PLAYER_NAMES[p]}"></span> ${cap(E.PLAYER_NAMES[p])}</td>${cells}<td>${total}</td></tr>`;
  }).join('');
  $('counts').innerHTML = head + rows;
}

function renderMoves() {
  const g = state.game;
  const list = $('move-list');
  if (!g.moves.length) {
    list.innerHTML = '<li class="empty">No moves yet.</li>';
    return;
  }
  let html = '';
  g.moves.forEach((mv, i) => {
    if (i % 2 === 0) html += `<li class="num">${i / 2 + 1}.</li>`;
    const cls = ['mv', mv.capture ? 'cap' : '', i === g.moves.length - 1 ? 'current' : ''].join(' ');
    html += `<li class="${cls}">${mv.notation}</li>`;
  });
  if (g.moves.length % 2 === 1) html += '<li class="mv"></li>';
  list.innerHTML = html;
  list.scrollTop = list.scrollHeight;
}

function makeMove(m) {
  const g = state.game;
  const from = E.moveFrom(m);
  const to = E.moveTo(m);
  const capture = g.board[to] !== 0;
  state.game = E.play(g, m);
  state.selected = -1;
  renderGame({ from, to, capture });
  save();
  maybeComputerMove();
}

function onCell(i) {
  const g = state.game;
  if (g.result || state.thinking) return;
  if (state.mode === 'cpu' && g.turn !== state.human) return;
  if (state.selected >= 0 && E.canMove(g.board, state.selected, i)) {
    makeMove(E.packMove(state.selected, i));
    return;
  }
  const v = g.board[i];
  if (v && E.ownerOf(v) === g.turn) {
    state.selected = state.selected === i ? -1 : i;
  } else {
    state.selected = -1;
  }
  renderGame();
}

// Computer opponent ---------------------------------------------------

function getWorker() {
  if (worker || workerBroken) return worker;
  try {
    worker = new Worker('js/worker.js', { type: 'module' });
    worker.onmessage = (e) => onComputerResult(e.data.id, e.data.result);
    worker.onerror = () => {
      workerBroken = true;
      worker.terminate();
      worker = null;
      if (pending) runOnMainThread(pending);
    };
  } catch {
    workerBroken = true;
    worker = null;
  }
  return worker;
}

function runOnMainThread(req) {
  import('./ai.js').then(({ search, LEVELS }) => {
    setTimeout(() => {
      if (!pending || pending.id !== req.id) return;
      const result = search(new Uint8Array(req.board), req.player, req.sinceCapture, LEVELS[req.level]);
      onComputerResult(req.id, result);
    }, 30);
  });
}

function maybeComputerMove() {
  const g = state.game;
  if (g.result || state.mode !== 'cpu' || g.turn === state.human) return;
  state.thinking = true;
  const id = ++state.reqId;
  pending = {
    id,
    started: Date.now(),
    board: g.board,
    player: g.turn,
    sinceCapture: g.sinceCapture,
    level: state.level,
  };
  renderStatus();
  const w = getWorker();
  if (w) w.postMessage(pending);
  else runOnMainThread(pending);
}

function onComputerResult(id, result) {
  if (!pending || id !== pending.id || id !== state.reqId) return;
  const wait = Math.max(0, 380 - (Date.now() - pending.started));
  setTimeout(() => {
    if (id !== state.reqId) return;
    pending = null;
    state.thinking = false;
    if (result && result.move !== undefined) {
      makeMove(result.move);
    } else {
      renderGame();
    }
  }, wait);
}

function cancelThinking() {
  state.reqId++;
  state.thinking = false;
  pending = null;
}

// Controls ------------------------------------------------------------

function newGame() {
  cancelThinking();
  state.mode = document.querySelector('.seg button.active').dataset.mode;
  state.level = $('level-select').value;
  state.human = Number($('color-select').value);
  state.game = E.newGame();
  state.selected = -1;
  renderGame();
  save();
  maybeComputerMove();
}

function undo() {
  const g = state.game;
  if (!g.moves.length) return;
  cancelThinking();
  let next = E.undo(g);
  if (state.mode === 'cpu' && next.turn !== state.human && next.moves.length) next = E.undo(next);
  state.game = next;
  state.selected = -1;
  renderGame();
  save();
  maybeComputerMove();
}

function resignGame() {
  const g = state.game;
  if (g.result) return;
  const who = state.mode === 'cpu' ? state.human : g.turn;
  if (!window.confirm(`${cap(E.PLAYER_NAMES[who])} resigns?`)) return;
  cancelThinking();
  state.game = E.resign(g, who);
  state.selected = -1;
  renderGame();
  save();
}

function copyMoves() {
  const text = E.movesText(state.game) || '(no moves)';
  const btn = $('copy-btn');
  const done = () => {
    btn.textContent = 'Copied';
    setTimeout(() => { btn.textContent = 'Copy moves'; }, 1200);
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(done, () => window.prompt('Copy the moves:', text));
  } else {
    window.prompt('Copy the moves:', text);
  }
}

function openLoad() {
  $('load-error').textContent = '';
  $('load-text').value = '';
  $('load-dialog').showModal();
  $('load-text').focus();
}

function confirmLoad() {
  try {
    const g = E.parseMoves($('load-text').value);
    cancelThinking();
    state.game = g;
    state.selected = -1;
    $('load-dialog').close();
    renderGame();
    save();
    maybeComputerMove();
  } catch (err) {
    $('load-error').textContent = err.message;
  }
}

function syncSettingsControls() {
  document.querySelectorAll('.seg button').forEach((b) => {
    b.classList.toggle('active', b.dataset.mode === state.mode);
  });
  $('cpu-options').hidden = state.mode !== 'cpu';
  $('level-select').value = state.level;
  $('color-select').value = String(state.human);
  $('rings-select').value = state.rings === null ? 'off' : String(state.rings);
}

function initPlay() {
  board = createBoard($('board'), { interactive: true, onCell });
  load();
  syncSettingsControls();

  document.querySelectorAll('.seg button').forEach((b) => {
    b.addEventListener('click', () => {
      document.querySelectorAll('.seg button').forEach((x) => x.classList.toggle('active', x === b));
      $('cpu-options').hidden = b.dataset.mode !== 'cpu';
    });
  });
  $('new-game').addEventListener('click', newGame);
  $('overlay-new').addEventListener('click', newGame);
  $('undo-btn').addEventListener('click', undo);
  $('resign-btn').addEventListener('click', resignGame);
  $('copy-btn').addEventListener('click', copyMoves);
  $('load-btn').addEventListener('click', openLoad);
  $('load-cancel').addEventListener('click', () => $('load-dialog').close());
  $('load-confirm').addEventListener('click', confirmLoad);
  $('rings-select').addEventListener('change', (e) => {
    state.rings = e.target.value === 'off' ? null : Number(e.target.value);
    renderGame();
    save();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && state.selected >= 0 && currentView === 'play') {
      state.selected = -1;
      renderGame();
    }
  });

  renderGame();
  maybeComputerMove();
}

// Diagrams ------------------------------------------------------------

function initDiagrams() {
  document.querySelectorAll('[data-diagram]').forEach((el) => {
    const spec = DIAGRAMS[el.dataset.diagram];
    if (!spec) return;
    const b = createBoard(el, { interactive: false });
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

// Puzzles -------------------------------------------------------------

let puzzleBoard = null;
let puzzleIndex = 0;
let puzzle = { game: null, selected: -1, solved: false, busy: false };

function ensurePuzzles() {
  if (puzzleBoard) return;
  puzzleBoard = createBoard($('puzzle-board'), { interactive: true, onCell: onPuzzleCell });
  const nav = $('puzzle-nav');
  PUZZLES.forEach((p, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = String(i + 1);
    b.addEventListener('click', () => loadPuzzle(i));
    nav.appendChild(b);
  });
  $('puzzle-hint').addEventListener('click', () => setFeedback(PUZZLES[puzzleIndex].hint, ''));
  $('puzzle-reset').addEventListener('click', () => loadPuzzle(puzzleIndex));
  $('puzzle-solution').addEventListener('click', showSolution);
  $('puzzle-next').addEventListener('click', () => loadPuzzle((puzzleIndex + 1) % PUZZLES.length));
  loadPuzzle(0);
}

function puzzleGame(p) {
  return { board: boardFrom(p.spec), turn: p.turn, moves: [], boards: [], sinceCapture: 0, result: null };
}

function setFeedback(text, kind) {
  const el = $('puzzle-feedback');
  el.textContent = text;
  el.className = 'feedback' + (kind ? ' ' + kind : '');
}

function loadPuzzle(i) {
  puzzleIndex = i;
  const p = PUZZLES[i];
  puzzle = { game: puzzleGame(p), selected: -1, solved: false, busy: false };
  $('puzzle-title').textContent = `${i + 1}. ${p.title}`;
  $('puzzle-turn').textContent = `${cap(E.PLAYER_NAMES[p.turn])} to move.`;
  $('puzzle-prompt').textContent = p.prompt;
  setFeedback('', '');
  document.querySelectorAll('#puzzle-nav button').forEach((b, j) => b.classList.toggle('active', j === i));
  renderPuzzle();
}

function renderPuzzle(animate) {
  const g = puzzle.game;
  const targets = puzzle.selected >= 0 ? E.targetsFrom(g.board, puzzle.selected) : [];
  puzzleBoard.render(g.board, {
    selected: puzzle.selected,
    targets,
    lastMove: lastMoveOf(g),
    rings: PUZZLES[puzzleIndex].turn,
    animate,
  });
}

function onPuzzleCell(i) {
  const g = puzzle.game;
  if (puzzle.solved || puzzle.busy || g.turn !== PUZZLES[puzzleIndex].turn) return;
  if (puzzle.selected >= 0 && E.canMove(g.board, puzzle.selected, i)) {
    tryPuzzleMove(E.packMove(puzzle.selected, i));
    return;
  }
  const v = g.board[i];
  puzzle.selected = v && E.ownerOf(v) === g.turn && puzzle.selected !== i ? i : -1;
  renderPuzzle();
}

function tryPuzzleMove(m) {
  const p = PUZZLES[puzzleIndex];
  const g = puzzle.game;
  const from = E.moveFrom(m);
  const to = E.moveTo(m);
  const capture = g.board[to] !== 0;
  const text = E.notation(g.board, m);
  const before = g;
  puzzle.game = E.play(g, m);
  puzzle.selected = -1;
  renderPuzzle({ from, to, capture });
  if (p.solutions.includes(text)) {
    puzzle.solved = true;
    setFeedback(`${text} is right. ${p.explain}`, 'good');
  } else {
    puzzle.busy = true;
    setFeedback(`${text}? ${p.wrong}`, 'bad');
    setTimeout(() => {
      puzzle.game = before;
      puzzle.busy = false;
      renderPuzzle();
    }, 900);
  }
}

function showSolution() {
  const p = PUZZLES[puzzleIndex];
  loadPuzzle(puzzleIndex);
  const g = puzzle.game;
  const m = E.legalMoves(g.board, g.turn).find((mv) => E.notation(g.board, mv) === p.solutions[0]);
  if (m === undefined) return;
  const from = E.moveFrom(m);
  const to = E.moveTo(m);
  const capture = g.board[to] !== 0;
  puzzle.game = E.play(g, m);
  puzzle.solved = true;
  renderPuzzle({ from, to, capture });
  const others = p.solutions.length > 1 ? ` ${p.solutions.slice(1).join(' and ')} also work${p.solutions.length === 2 ? 's' : ''}.` : '';
  setFeedback(`${p.solutions[0]}. ${p.explain}${others}`, 'good');
}

// Boot ----------------------------------------------------------------

initTheme();
initPlay();
initDiagrams();
window.addEventListener('hashchange', route);
route();
