// The play page: game state, board interaction, computer opponents, watch
// and online modes, clocks, analysis (evaluation bar and history, hints,
// top moves, move ratings, review report, coach), stats and sharing.

import * as E from './engine.js';
import { createBoard, pieceSvg } from './board.js';
import { engine, scoreToShare, describeScore } from './analysis.js';
import { sound } from './sound.js';
import { confetti } from './fx.js';
import {
  loadStats, saveStats, recordGame, BADGES, LEVEL_RATING, PROVISIONAL_GAMES, expected,
  recordTwoPlayerGame, leaderboard, grantBadge,
} from './stats.js';
import { TIPS } from './lessons.js';
import { explain } from './coach.js';
import { buildReport, renderEvalGraph } from './review.js';

const GAME_KEY = 'intransitive.game.v3';
const PREF_KEY = 'intransitive.prefs.v1';
const LEVEL_NAMES = { easy: 'Easy', medium: 'Medium', hard: 'Hard', adaptive: 'Adaptive' };
const STYLE_NAMES = { balanced: 'Balanced', aggressive: 'Aggressive', defensive: 'Defensive', trader: 'Trader' };
const CLOCKS = { none: null, '3+2': [180000, 2000], '5+5': [300000, 5000], '10+0': [600000, 0], '15+10': [900000, 10000] };
const WIN = 100000;

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

function cap(s) {
  return s[0].toUpperCase() + s.slice(1);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function fmtClock(ms) {
  const s = Math.max(0, ms) / 1000;
  if (s < 10) return s.toFixed(1);
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}

export function adaptiveParams(rating) {
  if (rating < 950) return { maxDepth: 2, timeMs: 400, noise: 70, rating: 900 };
  if (rating < 1150) return { maxDepth: 3, timeMs: 600, noise: 30, rating: 1050 };
  if (rating < 1350) return { maxDepth: 4, timeMs: 900, noise: 12, rating: 1200 };
  if (rating < 1550) return { maxDepth: 6, timeMs: 1400, noise: 4, rating: 1400 };
  return { maxDepth: 9, timeMs: 1800, noise: 0, rating: 1550 };
}

const FIXED = {
  easy: { maxDepth: 2, timeMs: 400, noise: 90, rating: 900 },
  medium: { maxDepth: 4, timeMs: 900, noise: 12, rating: 1200 },
  hard: { maxDepth: 9, timeMs: 1800, noise: 0, rating: 1500 },
};

export function createGame(ui) {
  const S = {
    game: E.newGame(),
    mode: 'cpu',
    level: 'medium',
    style: 'balanced',
    human: E.BLUE,
    custom: false,
    names: { blue: '', red: '' },
    watchLevels: { blue: 'medium', red: 'medium' },
    clock: null,
    selected: -1,
    thinking: false,
    seq: 0,
    view: null,
    flip: false,
    rings: null,
    threats: false,
    hint: null,
    topMoves: null,
    quality: {},
    evals: [],
    assisted: false,
    recorded: false,
    overlayDismissed: false,
    evalBlue: 0,
    analysisSeq: 0,
    lastBest: null,
    maxDeficit: 0,
    tip: 0,
    paused: false,
    online: null,
    drawOffered: false,
  };
  let stats = loadStats();
  const prefs = { threats: false, rings: null };
  try {
    Object.assign(prefs, JSON.parse(storageGet(PREF_KEY) || '{}'));
  } catch {
    // ignore
  }
  S.threats = !!prefs.threats;
  S.rings = prefs.rings === 0 || prefs.rings === 1 ? prefs.rings : null;

  const board = createBoard($('board-frame'), {
    interactive: true,
    onCell,
    onDrop,
    canDrag: (i) => humanCanMoveNow() && E.ownerOf(S.game.board[i]) === S.game.turn,
    targetsFor: (i) => E.targetsFrom(S.game.board, i),
  });

  // Persistence ---------------------------------------------------------

  function savePrefs() {
    storageSet(PREF_KEY, JSON.stringify({ threats: S.threats, rings: S.rings }));
  }

  function save() {
    const g = S.game;
    const data = {
      mode: S.mode === 'online' ? 'two' : S.mode,
      level: S.level,
      style: S.style,
      human: S.human,
      custom: S.custom,
      names: S.names,
      watchLevels: S.watchLevels,
      clock: S.clock,
      start: S.custom ? { board: Array.from(g.start.board), turn: g.start.turn } : null,
      moves: g.moves.map((mv) => mv.m),
      resigned: g.result && ['resign', 'timeout', 'abandon', 'draw'].includes(g.result.reason) ? g.result : null,
      quality: S.quality,
      evals: S.evals,
      assisted: S.assisted || S.mode === 'online',
      recorded: S.recorded,
      flip: S.flip,
      overlayDismissed: S.overlayDismissed,
      maxDeficit: S.maxDeficit,
    };
    storageSet(GAME_KEY, JSON.stringify(data));
  }

  function load() {
    const raw = storageGet(GAME_KEY);
    if (!raw) return false;
    try {
      const data = JSON.parse(raw);
      let g = data.start ? E.newGame(new Uint8Array(data.start.board), data.start.turn) : E.newGame();
      for (const m of data.moves || []) g = E.play(g, m);
      if (data.resigned) g = { ...g, result: data.resigned };
      S.game = g;
      S.mode = ['two', 'watch'].includes(data.mode) ? data.mode : 'cpu';
      S.level = LEVEL_NAMES[data.level] ? data.level : 'medium';
      S.style = STYLE_NAMES[data.style] ? data.style : 'balanced';
      S.human = data.human === E.RED ? E.RED : E.BLUE;
      S.custom = !!data.custom;
      S.names = data.names && typeof data.names === 'object' ? { blue: String(data.names.blue || ''), red: String(data.names.red || '') } : { blue: '', red: '' };
      S.watchLevels = data.watchLevels && data.watchLevels.blue ? data.watchLevels : { blue: 'medium', red: 'medium' };
      S.clock = data.clock && typeof data.clock === 'object' ? data.clock : null;
      S.quality = data.quality || {};
      S.evals = Array.isArray(data.evals) ? data.evals : [];
      S.assisted = !!data.assisted;
      S.recorded = !!data.recorded;
      S.flip = !!data.flip;
      S.overlayDismissed = !!data.overlayDismissed;
      S.maxDeficit = data.maxDeficit || 0;
      if (S.mode === 'watch') S.paused = true;
      return true;
    } catch {
      return false;
    }
  }

  // Helpers -------------------------------------------------------------

  function isLive() {
    return S.view === null;
  }

  function humanCanMoveNow() {
    const g = S.game;
    if (g.result || S.thinking || !isLive()) return false;
    if (S.mode === 'watch') return false;
    if (S.mode === 'cpu' || S.mode === 'online') return g.turn === S.human;
    return true;
  }

  function shownPly() {
    return isLive() ? S.game.moves.length : S.view;
  }

  function shownBoard() {
    return E.boardAt(S.game, shownPly());
  }

  function turnAt(ply) {
    return (S.game.start.turn + ply) % 2;
  }

  function lastMoveAt(n) {
    if (n <= 0) return null;
    const m = S.game.moves[n - 1].m;
    return { from: E.moveFrom(m), to: E.moveTo(m) };
  }

  function playerName(player) {
    const n = player === E.BLUE ? S.names.blue : S.names.red;
    return n && n.trim() ? n.trim() : '';
  }

  function humanName(player) {
    if (S.mode === 'two' || S.mode === 'online') return playerName(player) || cap(E.PLAYER_NAMES[player]);
    if (S.mode === 'watch') return `Computer · ${LEVEL_NAMES[S.watchLevels[E.PLAYER_NAMES[player]]] || 'Medium'}`;
    return player === S.human ? 'You' : 'Computer';
  }

  function twoRated() {
    return (S.mode === 'two' || S.mode === 'online') && !S.custom && !S.assisted && !!playerName(E.BLUE) && !!playerName(E.RED)
      && playerName(E.BLUE).toLowerCase() !== playerName(E.RED).toLowerCase();
  }

  function levelParams(level) {
    const base = level === 'adaptive' ? adaptiveParams(stats.rating) : (FIXED[level] || FIXED.medium);
    return { ...base, style: S.style };
  }

  function opponentRating() {
    return levelParams(S.level).rating;
  }

  // Rendering -----------------------------------------------------------

  function render(animate) {
    const g = S.game;
    const b = shownBoard();
    const live = isLive();
    const targets = live && S.selected >= 0 ? E.targetsFrom(g.board, S.selected) : [];
    let attacked = null;
    let threats = null;
    if (S.threats && !g.result) {
      const all = E.attackedCells(b);
      const mine = S.mode === 'cpu' || S.mode === 'online' ? S.human : turnAt(shownPly());
      attacked = all.filter((i) => E.ownerOf(b[i]) === mine);
      threats = all.filter((i) => E.ownerOf(b[i]) !== mine);
    }
    board.render(b, {
      selected: live ? S.selected : -1,
      targets,
      lastMove: lastMoveAt(shownPly()),
      rings: S.rings,
      attacked,
      threats,
      hint: live ? S.hint : null,
      draggable: (i) => humanCanMoveNow() && E.ownerOf(g.board[i]) === g.turn,
      animate,
    });
    const arrows = [];
    if (live && S.hint) arrows.push({ from: S.hint.from, to: S.hint.to, cls: 'best' });
    if (S.topMoves && S.topMoves.ply === shownPly()) {
      S.topMoves.list.forEach((t, i) => arrows.push({ from: t.from, to: t.to, cls: i === 0 ? 'best' : 'alt' }));
    }
    board.setArrows(arrows);
    renderStatus();
    renderPlayers();
    renderMoves();
    renderReview();
    renderStats();
    renderEval();
    renderTopList();
    renderClocks();
    if (!$('report-card').hidden) renderReport();
  }

  function renderStatus() {
    const g = S.game;
    const dot = $('status-dot');
    const text = $('status-text');
    const sub = $('status-sub');
    if (g.result) {
      const w = g.result.winner;
      dot.className = 'dot ' + (w === null ? 'none' : E.PLAYER_NAMES[w]);
      text.textContent = resultHeadline();
      sub.textContent = E.describeResult(g.result);
    } else {
      dot.className = 'dot ' + E.PLAYER_NAMES[g.turn] + (S.thinking ? ' thinking' : '');
      if (S.mode === 'cpu') text.textContent = g.turn === S.human ? 'Your move' : 'Computer is thinking';
      else if (S.mode === 'online') text.textContent = g.turn === S.human ? 'Your move' : `Waiting for ${humanName(1 - S.human)}`;
      else if (S.mode === 'watch') text.textContent = S.paused ? 'Paused' : `${cap(E.PLAYER_NAMES[g.turn])} is thinking`;
      else text.textContent = `${cap(E.PLAYER_NAMES[g.turn])} to move`;
      if (S.mode === 'cpu') {
        sub.textContent = `${LEVEL_NAMES[S.level]} computer${S.level === 'adaptive' ? ` (rated ${opponentRating()})` : ''}${S.style !== 'balanced' ? `, ${STYLE_NAMES[S.style].toLowerCase()} style` : ''}${S.custom ? ', from a set position' : ''}${S.assisted ? ', unrated' : ''}`;
      } else if (S.mode === 'watch') {
        sub.textContent = `Computer versus computer${S.style !== 'balanced' ? `, ${STYLE_NAMES[S.style].toLowerCase()} style` : ''}. Press pause to stop the clock.`;
      } else if (S.mode === 'online') {
        sub.textContent = twoRated() ? 'Rated online game' : 'Online game';
      } else {
        sub.textContent = twoRated() ? 'Rated game between two players' : 'Two players at one screen';
      }
    }
    const left = Math.ceil((E.STAGNATION_PLIES - g.sinceCapture) / 2);
    const warn = !g.result && left <= 30;
    $('status-stagnation').hidden = !warn;
    if (warn) $('status-stagnation').textContent = `Draw in ${left} move${left === 1 ? '' : 's'} unless something is captured.`;

    const cpuLabel = ` · ${LEVEL_NAMES[S.level]} (${opponentRating()})`;
    const youLabel = S.mode === 'cpu' ? ` (${stats.rating})` : '';
    const twoLabel = (player) => {
      const name = playerName(player);
      if (!name) return '';
      const pl = stats.players && stats.players[name];
      return ` (${pl ? pl.rating : 1200})`;
    };
    const label = (player) => {
      if (S.mode === 'cpu') return S.human !== player ? cpuLabel : youLabel;
      if (S.mode === 'watch') return '';
      return twoLabel(player);
    };
    $('mu-blue').textContent = humanName(E.BLUE) + label(E.BLUE);
    $('mu-red').textContent = humanName(E.RED) + label(E.RED);
    let rated = '';
    if (S.mode === 'cpu') rated = S.custom ? 'Unrated' : S.assisted ? 'Unrated (undo or hint used)' : 'Rated';
    else if (S.mode === 'watch') rated = 'Watching';
    else rated = twoRated() ? 'Rated' : S.assisted ? 'Unrated (undo or hint used)' : playerName(E.BLUE) && playerName(E.RED) ? 'Unrated' : 'Unrated (add names for a rated game)';
    $('mu-rated').textContent = rated;

    $('btn-undo').disabled = g.moves.length === 0 || !isLive() || S.mode === 'online' || S.mode === 'watch';
    $('btn-resign').disabled = !!g.result || !isLive() || S.mode === 'watch';
    $('btn-hint').disabled = !humanCanMoveNow();
    $('btn-threats').setAttribute('aria-pressed', String(S.threats));
    $('btn-rings').setAttribute('aria-pressed', String(S.rings !== null));
    $('btn-rings').lastChild.textContent = S.rings === null ? 'Rings' : S.rings === E.BLUE ? 'Rings: blue' : 'Rings: red';
    $('btn-pause').hidden = S.mode !== 'watch' || !!g.result;
    $('btn-pause').textContent = S.paused ? 'Resume' : 'Pause';
    $('btn-draw').hidden = S.mode !== 'online' || !!g.result;
    $('prow-blue').classList.toggle('active', !g.result && g.turn === E.BLUE);
    $('prow-red').classList.toggle('active', !g.result && g.turn === E.RED);
    $('online-card').hidden = S.mode !== 'online' && !S.online;
  }

  function resultHeadline() {
    const r = S.game.result;
    if (!r) return '';
    if (r.winner === null) return 'Draw';
    if (S.mode === 'cpu' || S.mode === 'online') return r.winner === S.human ? 'You win' : 'You lose';
    return `${humanName(r.winner)} wins`;
  }

  function countsHtml(player, c) {
    return [0, 1, 2].map((t) => {
      const n = c[player][t];
      const cls = n === 0 ? 'zero' : n === 1 ? 'low' : '';
      return `<span class="${cls}"><i class="mini ${E.PLAYER_NAMES[player]}">${pieceSvg(t)}</i>${n}</span>`;
    }).join('');
  }

  function renderPlayers() {
    const c = E.counts(shownBoard());
    $('pname-blue').textContent = humanName(E.BLUE);
    $('pname-red').textContent = humanName(E.RED);
    $('pcounts-blue').innerHTML = countsHtml(E.BLUE, c);
    $('pcounts-red').innerHTML = countsHtml(E.RED, c);
  }

  function renderClocks() {
    const cb = $('clock-blue');
    const cr = $('clock-red');
    if (!S.clock) {
      cb.hidden = true;
      cr.hidden = true;
      return;
    }
    cb.hidden = false;
    cr.hidden = false;
    cb.textContent = fmtClock(S.clock.blue);
    cr.textContent = fmtClock(S.clock.red);
    const g = S.game;
    cb.classList.toggle('running', !g.result && S.clock.running && g.turn === E.BLUE);
    cr.classList.toggle('running', !g.result && S.clock.running && g.turn === E.RED);
    cb.classList.toggle('low', S.clock.blue < 20000);
    cr.classList.toggle('low', S.clock.red < 20000);
  }

  function qualityBadge(i) {
    const q = S.quality[i];
    if (!q) return '';
    const names = { best: 'best', good: 'good', inacc: 'inaccuracy', mistake: 'mistake', blunder: 'blunder' };
    const title = q.best && q.label !== 'best' ? ` title="Better was ${q.best}"` : '';
    return `<span class="q ${q.label}"${title}>${names[q.label][0]}</span>`;
  }

  function renderMoves() {
    const g = S.game;
    const list = $('move-list');
    $('move-count').textContent = g.moves.length ? `${Math.ceil(g.moves.length / 2)}` : '';
    if (!g.moves.length) {
      list.innerHTML = '<li class="empty">No moves yet. Blue moves first.</li>';
      return;
    }
    const current = shownPly();
    let html = '';
    g.moves.forEach((mv, i) => {
      if (i % 2 === 0) html += `<li class="num">${i / 2 + 1}.</li>`;
      const cls = ['mv', mv.capture ? 'cap' : '', i + 1 === current ? 'current' : ''].join(' ');
      html += `<li><button class="${cls}" type="button" data-ply="${i + 1}">${mv.notation}${qualityBadge(i)}</button></li>`;
    });
    if (g.moves.length % 2 === 1) html += '<li></li>';
    list.innerHTML = html;
    const cur = list.querySelector('.current');
    if (cur) cur.scrollIntoView({ block: 'nearest' });
  }

  function renderReview() {
    const n = S.game.moves.length;
    const at = shownPly();
    $('rv-first').disabled = at === 0;
    $('rv-prev').disabled = at === 0;
    $('rv-next').disabled = isLive();
    $('rv-last').disabled = isLive();
    const status = $('rv-status');
    if (isLive()) {
      status.textContent = n ? 'Live position. Click a move or use the arrows to review.' : '';
    } else {
      const mv = at > 0 ? S.game.moves[at - 1] : null;
      status.textContent = mv
        ? `Reviewing ${Math.ceil(at / 2)}${at % 2 ? '.' : '...'} ${mv.notation}. Press End to return to the game.`
        : 'Starting position. Press End to return to the game.';
    }
    const overlay = $('overlay');
    const show = !!S.game.result && isLive() && !S.overlayDismissed;
    overlay.hidden = !show;
    $('board-frame').classList.toggle('board-dim', show);
  }

  function sparkline(values) {
    const svg = $('rating-spark');
    if (!svg) return;
    if (values.length < 2) {
      svg.innerHTML = '';
      svg.hidden = true;
      return;
    }
    svg.hidden = false;
    const w = 200;
    const h = 44;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = Math.max(40, max - min);
    const pts = values.map((v, i) => `${(i / (values.length - 1)) * w},${h - 4 - ((v - min) / span) * (h - 8)}`);
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    svg.innerHTML = `<polyline points="${pts.join(' ')}"/>`
      + `<circle cx="${pts.at(-1).split(',')[0]}" cy="${pts.at(-1).split(',')[1]}" r="3"/>`;
  }

  function renderStats() {
    const prov = stats.ratedGames < PROVISIONAL_GAMES;
    $('st-rating').textContent = `${stats.rating}${prov ? '?' : ''}`;
    $('st-rating').title = prov ? `Provisional until ${PROVISIONAL_GAMES} rated games (${stats.ratedGames} so far)` : `Peak ${stats.peak || stats.rating}`;
    $('st-peak').textContent = stats.peak && stats.peak !== stats.rating ? `peak ${stats.peak}` : prov ? `${stats.ratedGames}/${PROVISIONAL_GAMES} rated` : '';
    $('st-record').textContent = `${stats.wins} - ${stats.losses}`;
    $('st-streak').textContent = stats.streak;
    $('st-puzzle').textContent = `Puzzle rating ${stats.puzzleRating}${stats.puzzleRated < 20 ? '?' : ''}${stats.rushBest ? ` · rush best ${stats.rushBest}` : ''}${stats.streakBest ? ` · streak best ${stats.streakBest}` : ''}`;
    const html = BADGES.map((b) => {
      const earned = !!stats.badges[b.id];
      return `<span class="badge ${earned ? 'earned' : ''}" title="${b.desc}"><svg><use href="#i-star"/></svg>${b.name}</span>`;
    }).join('');
    $('badges').innerHTML = html;
    const series = [1000].concat((stats.history || []).filter((h) => h.rating !== undefined).map((h) => h.rating)).slice(-30);
    sparkline(series);
    const lb = leaderboard(stats);
    const card = $('leaderboard-card');
    if (card) {
      card.hidden = lb.length === 0;
      $('leaderboard').innerHTML = lb.map((pl, i) => `<li><span class="lb-rank">${i + 1}</span><span class="lb-name">${escapeHtml(pl.name)}</span><span class="lb-rec muted">${pl.wins}-${pl.losses}${pl.draws ? '-' + pl.draws : ''}</span><strong>${pl.rating}${pl.games < PROVISIONAL_GAMES ? '?' : ''}</strong></li>`).join('');
    }
  }

  function renderEval() {
    const ply = shownPly();
    if (S.game.result && isLive()) {
      const w = S.game.result.winner;
      board.setEval(w === null ? 0.5 : w === E.BLUE ? 0.98 : 0.02);
      $('eval-text').textContent = '';
      return;
    }
    const v = isLive() ? S.evalBlue : (S.evals[ply] !== undefined ? S.evals[ply] : null);
    if (v === null) {
      board.setEval(0.5);
      $('eval-text').textContent = '';
      return;
    }
    board.setEval(scoreToShare(v));
    $('eval-text').textContent = `Engine: ${describeScore(v)}`;
  }

  function renderTopList() {
    const el = $('top-list');
    if (!S.topMoves || S.topMoves.ply !== shownPly()) {
      el.hidden = true;
      return;
    }
    el.hidden = false;
    el.innerHTML = S.topMoves.list.map((t, i) => `<span class="${i === 0 ? 'best' : ''}">${i + 1}. ${t.notation} <em>${describeScore(t.blue)}</em></span>`).join('');
  }

  function renderTip() {
    $('tip-text').textContent = TIPS[S.tip % TIPS.length];
  }

  function renderReport() {
    const card = $('report-card');
    const g = S.game;
    const rep = buildReport(g, S.quality, S.evals);
    const side = (p) => {
      const acc = rep.accuracy[p];
      const c = rep.counts[p];
      return `<div class="rep-side"><span class="dot ${E.PLAYER_NAMES[p]}"></span><strong>${escapeHtml(humanName(p))}</strong>`
        + (acc === null ? '<span class="muted">not rated</span>' : `<span class="rep-acc">${acc}% accuracy</span><span class="muted small">${c.blunder} blunder${c.blunder === 1 ? '' : 's'}, ${c.mistake} mistake${c.mistake === 1 ? '' : 's'}, ${c.inacc} inaccurac${c.inacc === 1 ? 'y' : 'ies'}</span>`)
        + '</div>';
    };
    let turning = '';
    if (rep.turning) {
      const t = rep.turning;
      turning = `<div class="rep-turn"><strong>Turning point:</strong> move ${Math.ceil(t.ply / 2)}${t.ply % 2 ? '.' : '...'} ${t.move} by ${escapeHtml(humanName(t.player))} swung the evaluation by ${(t.drop / 100).toFixed(1)} pieces${t.better ? `. Better was ${t.better}` : ''}. <button class="btn small" type="button" data-goto="${t.ply - 1}">Show</button></div>`;
    }
    $('report-body').innerHTML = side(E.BLUE) + side(E.RED) + turning;
    renderEvalGraph($('eval-graph'), S.evals.slice(0, g.moves.length + 1), shownPly(), (ply) => setView(ply));
    card.querySelectorAll('[data-goto]').forEach((b) => b.addEventListener('click', () => {
      setView(Number(b.dataset.goto));
      showTopMoves();
    }));
  }

  // Analysis ------------------------------------------------------------

  function humanEvalNow() {
    const g = S.game;
    if (g.result) return;
    const seq = ++S.analysisSeq;
    const ply = g.moves.length;
    engine.analyze(g.board, g.turn, g.sinceCapture).then((r) => {
      if (seq !== S.analysisSeq || !r) return;
      const blueScore = g.turn === E.BLUE ? r.score : -r.score;
      S.evalBlue = blueScore;
      S.evals[ply] = blueScore;
      S.lastBest = { ply, move: r.move, score: r.score, notation: E.notation(g.board, r.move) };
      renderEval();
      save();
    });
  }

  function rateMove(prevBest, moveIndex, movedPlayer) {
    const g = S.game;
    if (!prevBest || prevBest.ply !== moveIndex) return;
    const played = g.moves[moveIndex];
    const after = { board: g.board, turn: g.turn, since: g.sinceCapture };
    if (played.m === prevBest.move) {
      S.quality[moveIndex] = { label: 'best', best: null, loss: 0 };
      renderMoves();
      save();
      return;
    }
    if (g.result) {
      S.quality[moveIndex] = { label: g.result.winner === movedPlayer ? 'best' : 'blunder', best: prevBest.notation, loss: 0 };
      renderMoves();
      save();
      return;
    }
    engine.analyze(after.board, after.turn, after.since).then((r) => {
      if (!r) return;
      const moverScore = -r.score;
      const loss = prevBest.score - moverScore;
      let label = 'good';
      if (loss >= 150) label = 'blunder';
      else if (loss >= 60) label = 'mistake';
      else if (loss >= 25) label = 'inacc';
      else if (loss <= 5) label = 'best';
      S.quality[moveIndex] = { label, best: label === 'best' ? null : prevBest.notation, loss };
      renderMoves();
      save();
    });
  }

  function showTopMoves() {
    const ply = shownPly();
    const b = shownBoard();
    const turn = turnAt(ply);
    if (S.game.result && isLive()) return;
    if (isLive() && humanCanMoveNow() && (S.mode === 'cpu' || twoRated())) S.assisted = true;
    $('btn-top').disabled = true;
    const since = isLive() ? S.game.sinceCapture : 0;
    engine.rank(b, turn, since, { maxDepth: 3, timeMs: 110, top: 3, style: 'balanced' }).then((rows) => {
      $('btn-top').disabled = false;
      if (!rows || shownPly() !== ply) return;
      S.topMoves = {
        ply,
        list: rows.map((r) => ({
          from: E.moveFrom(r.move), to: E.moveTo(r.move), notation: E.notation(b, r.move), blue: turn === E.BLUE ? r.score : -r.score,
        })),
      };
      render();
    });
  }

  function coach() {
    const ply = shownPly();
    const b = shownBoard();
    const turn = turnAt(ply);
    const me = S.mode === 'cpu' || S.mode === 'online' ? S.human : turn;
    const evalBlue = isLive() ? S.evalBlue : (S.evals[ply] !== undefined ? S.evals[ply] : null);
    const best = isLive() && S.lastBest && S.lastBest.ply === ply && humanCanMoveNow() ? S.lastBest.notation : null;
    if (best && (S.mode === 'cpu' || twoRated())) S.assisted = true;
    const lines = explain({ board: b, turn, me, evalBlue, bestMove: best });
    $('coach-card').hidden = false;
    $('coach-text').innerHTML = lines.map((l) => `<li>${escapeHtml(l)}</li>`).join('');
    renderStatus();
    save();
  }

  function toggleReport() {
    const card = $('report-card');
    card.hidden = !card.hidden;
    if (!card.hidden) {
      renderReport();
      card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }

  // Clock ---------------------------------------------------------------

  let clockTimer = null;

  function startClockTicker() {
    if (clockTimer) return;
    clockTimer = setInterval(tickClock, 200);
  }

  function tickClock() {
    const c = S.clock;
    const g = S.game;
    if (!c || !c.running || g.result) return;
    const now = Date.now();
    const elapsed = now - c.last;
    c.last = now;
    const side = E.PLAYER_NAMES[g.turn];
    c[side] -= elapsed;
    if (c[side] <= 0) {
      c[side] = 0;
      c.running = false;
      cancelThinking();
      S.game = { ...g, result: { winner: 1 - g.turn, reason: 'timeout' } };
      S.selected = -1;
      onGameOver();
      return;
    }
    renderClocks();
    if (Math.floor(c[side] / 1000) < 10 && Math.floor(c[side] / 1000) !== Math.floor((c[side] + elapsed) / 1000)) sound.play('tick');
  }

  function clockAfterMove(mover) {
    const c = S.clock;
    if (!c) return;
    const now = Date.now();
    if (c.running) {
      c[E.PLAYER_NAMES[mover]] += c.inc;
    } else {
      c.running = true;
    }
    c.last = now;
  }

  // Moves ---------------------------------------------------------------

  function playMove(m, { slide = true, remote = false } = {}) {
    const g = S.game;
    const from = E.moveFrom(m);
    const to = E.moveTo(m);
    const captured = g.board[to];
    const mover = g.turn;
    const prevBest = S.lastBest;
    const moveIndex = g.moves.length;
    S.game = E.play(g, m);
    S.selected = -1;
    S.hint = null;
    S.topMoves = null;
    S.drawOffered = false;
    clockAfterMove(mover);
    sound.play(captured ? 'capture' : 'move');
    trackDeficit();
    if (S.mode === 'online' && !remote && ui.onlineSend) ui.onlineSend({ type: 'move', m, ply: moveIndex });
    render({ from, to, captured, slide });
    const shouldRate = S.mode === 'two' || S.mode === 'online' || S.mode === 'watch' || mover === S.human;
    if (shouldRate) rateMove(prevBest, moveIndex, mover);
    if (S.game.result) {
      onGameOver();
    } else {
      humanEvalNow();
      maybeComputerMove();
    }
    save();
  }

  function trackDeficit() {
    if (S.mode !== 'cpu') return;
    const c = E.counts(S.game.board);
    const mine = c[S.human].reduce((a, b) => a + b, 0);
    const theirs = c[1 - S.human].reduce((a, b) => a + b, 0);
    S.maxDeficit = Math.max(S.maxDeficit, theirs - mine);
  }

  function onCell(i, info = {}) {
    if (!isLive()) {
      goLive();
      return;
    }
    const g = S.game;
    if (!humanCanMoveNow()) return;
    if (info.dragStart) {
      S.selected = i;
      render();
      return;
    }
    if (info.dragCancel) {
      render();
      return;
    }
    if (S.selected >= 0 && E.canMove(g.board, S.selected, i)) {
      playMove(E.packMove(S.selected, i));
      return;
    }
    const v = g.board[i];
    if (v && E.ownerOf(v) === g.turn) {
      const next = S.selected === i ? -1 : i;
      if (next >= 0) sound.play('select');
      S.selected = next;
    } else {
      if (S.selected >= 0 && v === 0) sound.play('error');
      S.selected = -1;
    }
    render();
  }

  function onDrop(from, to) {
    if (!humanCanMoveNow()) return;
    if (!E.canMove(S.game.board, from, to)) return;
    playMove(E.packMove(from, to), { slide: false });
  }

  function computerTurn() {
    const g = S.game;
    if (g.result || !isLive()) return false;
    if (S.mode === 'cpu') return g.turn !== S.human;
    if (S.mode === 'watch') return !S.paused;
    return false;
  }

  function maybeComputerMove() {
    const g = S.game;
    if (!computerTurn() || S.thinking) return;
    S.thinking = true;
    const seq = ++S.seq;
    const started = Date.now();
    renderStatus();
    const params = S.mode === 'watch' ? levelParams(S.watchLevels[E.PLAYER_NAMES[g.turn]]) : levelParams(S.level);
    engine.bestMove(g.board, g.turn, g.sinceCapture, { maxDepth: params.maxDepth, timeMs: params.timeMs, noise: params.noise, style: S.style }).then((r) => {
      if (seq !== S.seq) return;
      const wait = Math.max(0, (S.mode === 'watch' ? 700 : 420) - (Date.now() - started));
      setTimeout(() => {
        if (seq !== S.seq) return;
        S.thinking = false;
        if (r && r.move !== undefined) playMove(r.move);
        else render();
      }, wait);
    });
  }

  function cancelThinking() {
    S.seq++;
    S.thinking = false;
  }

  // Game lifecycle ------------------------------------------------------

  function startGame({
    mode = S.mode, level = S.level, style = S.style, human = S.human, board: b = null, turn = E.BLUE,
    custom = false, names = null, watchLevels = null, clock = null, online = null,
  } = {}) {
    cancelThinking();
    S.mode = mode;
    S.level = LEVEL_NAMES[level] ? level : 'medium';
    S.style = STYLE_NAMES[style] ? style : 'balanced';
    S.human = human;
    S.custom = custom;
    S.names = names ? { blue: String(names.blue || ''), red: String(names.red || '') } : (mode === 'two' ? S.names : { blue: '', red: '' });
    S.watchLevels = watchLevels || S.watchLevels;
    S.clock = clock && CLOCKS[clock] ? { initial: CLOCKS[clock][0], inc: CLOCKS[clock][1], blue: CLOCKS[clock][0], red: CLOCKS[clock][0], last: Date.now(), running: false, label: clock } : null;
    S.online = online;
    S.game = b ? E.newGame(b, turn) : E.newGame();
    S.selected = -1;
    S.hint = null;
    S.topMoves = null;
    S.quality = {};
    S.evals = [];
    S.assisted = false;
    S.recorded = false;
    S.overlayDismissed = false;
    S.view = null;
    S.maxDeficit = 0;
    S.evalBlue = 0;
    S.lastBest = null;
    S.paused = false;
    S.drawOffered = false;
    S.tip = Math.floor(Math.random() * TIPS.length);
    $('coach-card').hidden = true;
    $('report-card').hidden = true;
    setFlip((mode === 'cpu' || mode === 'online') && human === E.RED);
    if (S.clock) startClockTicker();
    renderTip();
    render();
    humanEvalNow();
    save();
    maybeComputerMove();
  }

  function onGameOver() {
    const r = S.game.result;
    let sub = E.describeResult(r);
    if (S.clock) S.clock.running = false;
    S.evals[S.game.moves.length] = r.winner === null ? 0 : r.winner === E.BLUE ? WIN : -WIN;
    if (S.mode === 'cpu' && !S.recorded) {
      S.recorded = true;
      if (!S.custom) {
        const outcome = r.winner === null ? 'draw' : r.winner === S.human ? 'win' : 'loss';
        const c = E.counts(S.game.board);
        const { earned, delta } = recordGame(stats, {
          level: S.level,
          outcome,
          moves: Math.ceil(S.game.moves.length / 2),
          rated: !S.assisted,
          piecesLost: 10 - c[S.human].reduce((a, b) => a + b, 0),
          maxDeficit: S.maxDeficit,
          opponentScissorsOut: c[1 - S.human][E.SCISSORS] === 0,
          opponentRating: opponentRating(),
        });
        if (!S.assisted) {
          sub += ` Rating ${delta >= 0 ? '+' : ''}${delta}, now ${stats.rating}.`;
          setTimeout(() => ui.toast(`Rating ${delta >= 0 ? '+' : ''}${delta}: ${stats.rating}`), 600);
        }
        earned.forEach((b, i) => setTimeout(() => ui.badge(b), 900 + i * 1400));
      }
    }
    if ((S.mode === 'two' || S.mode === 'online') && !S.recorded && playerName(E.BLUE) && playerName(E.RED)) {
      S.recorded = true;
      const rated = twoRated();
      const res = recordTwoPlayerGame(stats, playerName(E.BLUE), playerName(E.RED), r.winner, rated);
      if (res && rated) {
        const fmt = (d) => `${d >= 0 ? '+' : ''}${d}`;
        sub += ` ${playerName(E.BLUE)} ${fmt(res.blue)} (${res.blueRating}), ${playerName(E.RED)} ${fmt(res.red)} (${res.redRating}).`;
      }
      if (S.mode === 'online' && r.winner === S.human) grantBadge(stats, 'online-win').forEach((b) => setTimeout(() => ui.badge(b), 900));
    }
    if (r.winner === null) sound.play('draw');
    else if (S.mode === 'two' || S.mode === 'watch' || r.winner === S.human) {
      sound.play('win');
      if (S.mode !== 'watch') setTimeout(() => confetti(), 150);
    } else sound.play('lose');
    $('overlay-title').textContent = resultHeadline();
    $('overlay-sub').textContent = sub;
    render();
    save();
  }

  function undo() {
    const g = S.game;
    if (!g.moves.length || !isLive() || S.mode === 'online' || S.mode === 'watch') return;
    cancelThinking();
    let next = E.undo(g);
    if (S.mode === 'cpu' && next.turn !== S.human && next.moves.length) next = E.undo(next);
    delete S.quality[next.moves.length];
    delete S.quality[next.moves.length + 1];
    S.evals = S.evals.slice(0, next.moves.length + 1);
    S.game = next;
    S.selected = -1;
    S.hint = null;
    S.topMoves = null;
    S.assisted = true;
    S.overlayDismissed = false;
    if (S.clock) {
      S.clock.running = next.moves.length > 0;
      S.clock.last = Date.now();
    }
    render();
    humanEvalNow();
    save();
    maybeComputerMove();
  }

  function resign() {
    const g = S.game;
    if (g.result || !isLive() || S.mode === 'watch') return;
    const who = S.mode === 'cpu' || S.mode === 'online' ? S.human : g.turn;
    if (!window.confirm(`${S.mode === 'two' ? humanName(who) + ' resigns' : 'Resign this game'}?`)) return;
    cancelThinking();
    if (S.mode === 'online' && ui.onlineSend) ui.onlineSend({ type: 'resign' });
    S.game = E.resign(g, who);
    S.selected = -1;
    S.hint = null;
    onGameOver();
  }

  function hint() {
    if (!humanCanMoveNow()) return;
    const g = S.game;
    S.assisted = true;
    $('btn-hint').disabled = true;
    const ply = g.moves.length;
    engine.hint(g.board, g.turn, g.sinceCapture).then((r) => {
      if (!r || S.game.moves.length !== ply || !isLive()) return;
      S.hint = { from: E.moveFrom(r.move), to: E.moveTo(r.move) };
      S.selected = -1;
      render();
      ui.toast(`Engine suggests ${E.notation(g.board, r.move)}`);
      save();
    });
  }

  function togglePause() {
    if (S.mode !== 'watch') return;
    S.paused = !S.paused;
    if (S.paused) cancelThinking();
    render();
    maybeComputerMove();
  }

  // Online -------------------------------------------------------------

  function startOnline({ color, opponent, clock, myName }) {
    const names = color === E.BLUE ? { blue: myName, red: opponent.name } : { blue: opponent.name, red: myName };
    startGame({ mode: 'online', human: color, names, clock: clock || null, online: { opponent } });
    $('online-status').textContent = `Playing ${opponent.name}. You are ${E.PLAYER_NAMES[color]}.`;
  }

  function remoteMove(m, ply) {
    const g = S.game;
    if (S.mode !== 'online' || g.result || g.turn === S.human) return;
    if (ply !== g.moves.length) return;
    const v = g.board[E.moveFrom(m)];
    if (!v || E.ownerOf(v) !== g.turn || !E.canMove(g.board, E.moveFrom(m), E.moveTo(m))) return;
    if (!isLive()) S.view = null;
    playMove(m, { remote: true });
  }

  function remoteResign() {
    const g = S.game;
    if (S.mode !== 'online' || g.result) return;
    S.game = E.resign(g, 1 - S.human);
    onGameOver();
  }

  function remoteLeft() {
    const g = S.game;
    if (S.mode !== 'online') return;
    if (!g.result) {
      S.game = { ...g, result: { winner: S.human, reason: 'abandon' } };
      onGameOver();
    }
    $('online-status').textContent = 'Your opponent left.';
  }

  // Leaving an unfinished online game counts as resigning it.
  function leaveOnline() {
    const g = S.game;
    if (S.mode !== 'online') return;
    if (!g.result) {
      if (ui.onlineSend) ui.onlineSend({ type: 'resign' });
      S.game = E.resign(g, S.human);
      onGameOver();
    }
    $('online-status').textContent = 'You left the game.';
  }

  function offerDraw() {
    if (S.mode !== 'online' || S.game.result || !ui.onlineSend) return;
    S.drawOffered = true;
    ui.onlineSend({ type: 'draw-offer' });
    ui.toast('Draw offered.');
  }

  function remoteDrawOffer() {
    if (S.mode !== 'online' || S.game.result) return;
    if (window.confirm(`${humanName(1 - S.human)} offers a draw. Accept?`)) {
      if (ui.onlineSend) ui.onlineSend({ type: 'draw-accept' });
      S.game = { ...S.game, result: { winner: null, reason: 'draw' } };
      onGameOver();
    }
  }

  function remoteDrawAccept() {
    if (S.mode !== 'online' || S.game.result || !S.drawOffered) return;
    S.game = { ...S.game, result: { winner: null, reason: 'draw' } };
    onGameOver();
  }

  // Review ---------------------------------------------------------------

  function setView(n) {
    const total = S.game.moves.length;
    if (n === null || n >= total) {
      S.view = null;
    } else {
      S.view = Math.max(0, n);
      S.selected = -1;
      S.hint = null;
    }
    S.topMoves = null;
    render();
  }

  function goLive() {
    setView(null);
  }

  function step(delta) {
    const total = S.game.moves.length;
    const at = shownPly();
    setView(at + delta >= total ? null : at + delta);
  }

  // Toggles --------------------------------------------------------------

  function setFlip(value) {
    S.flip = !!value;
    board.setFlip(S.flip);
    $('board-frame').querySelector('.eval-bar').style.transform = S.flip ? 'scaleY(-1)' : '';
  }

  function toggleFlip() {
    setFlip(!S.flip);
    save();
    render();
  }

  function toggleThreats() {
    S.threats = !S.threats;
    savePrefs();
    render();
  }

  function cycleRings() {
    S.rings = S.rings === null ? E.BLUE : S.rings === E.BLUE ? E.RED : null;
    savePrefs();
    render();
  }

  // Sharing ---------------------------------------------------------------

  function shareLink() {
    const base = `${location.origin}${location.pathname}`;
    return `${base}#game=${E.encodeMoves(S.game)}`;
  }

  function positionLink() {
    const base = `${location.origin}${location.pathname}`;
    return `${base}#pos=${E.encodePosition(shownBoard(), turnAt(shownPly()))}`;
  }

  async function copyText(text, done) {
    try {
      await navigator.clipboard.writeText(text);
      ui.toast(done);
    } catch {
      window.prompt('Copy this:', text);
    }
  }

  async function share() {
    if (S.custom) {
      await copyText(positionLink(), 'Position link copied. Anyone can open it and play from here.');
      return;
    }
    const url = shareLink();
    const text = S.game.result ? `${resultHeadline()} in ${Math.ceil(S.game.moves.length / 2)} moves at Intransitive.` : 'A game of Intransitive in progress.';
    if (navigator.share && /Mobi|Android/i.test(navigator.userAgent)) {
      try {
        await navigator.share({ title: 'Intransitive', text, url });
        return;
      } catch {
        // fall through to the clipboard
      }
    }
    await copyText(url, 'Link copied. Anyone can open it and replay the game.');
  }

  function loadFromLink(code) {
    const g = E.decodeMoves(code);
    cancelThinking();
    S.mode = 'two';
    S.custom = false;
    S.names = { blue: '', red: '' };
    S.clock = null;
    S.game = g;
    S.selected = -1;
    S.hint = null;
    S.topMoves = null;
    S.quality = {};
    S.evals = [];
    S.assisted = false;
    S.recorded = true;
    S.overlayDismissed = true;
    S.view = g.moves.length ? 0 : null;
    S.maxDeficit = 0;
    setFlip(false);
    renderTip();
    render();
    humanEvalNow();
    save();
  }

  function loadPosition(b, turn) {
    startGame({ mode: 'two', board: b, turn, custom: true, names: { blue: '', red: '' } });
  }

  function loadMovesText(text) {
    const g = E.parseMoves(text);
    cancelThinking();
    S.game = g;
    S.custom = false;
    S.clock = null;
    S.selected = -1;
    S.hint = null;
    S.topMoves = null;
    S.quality = {};
    S.evals = [];
    S.assisted = true;
    S.recorded = !!g.result;
    S.overlayDismissed = false;
    S.view = null;
    render();
    humanEvalNow();
    save();
    if (g.result) onGameOver();
    else maybeComputerMove();
  }

  // Wiring ----------------------------------------------------------------

  function wire() {
    $('btn-new').addEventListener('click', () => ui.openNewGame());
    $('overlay-new').addEventListener('click', () => ui.openNewGame());
    $('overlay-review').addEventListener('click', () => {
      S.overlayDismissed = true;
      setView(0);
      $('report-card').hidden = false;
      renderReport();
      save();
    });
    $('overlay-share').addEventListener('click', share);
    $('btn-undo').addEventListener('click', undo);
    $('btn-resign').addEventListener('click', resign);
    $('btn-hint').addEventListener('click', hint);
    $('btn-flip').addEventListener('click', toggleFlip);
    $('btn-threats').addEventListener('click', toggleThreats);
    $('btn-rings').addEventListener('click', cycleRings);
    $('btn-share').addEventListener('click', share);
    $('btn-moves').addEventListener('click', () => ui.openMoves(E.movesText(S.game), positionLink()));
    $('btn-top').addEventListener('click', showTopMoves);
    $('btn-coach').addEventListener('click', coach);
    $('btn-report').addEventListener('click', toggleReport);
    $('btn-pause').addEventListener('click', togglePause);
    $('btn-draw').addEventListener('click', offerDraw);
    $('coach-close').addEventListener('click', () => { $('coach-card').hidden = true; });
    $('report-close').addEventListener('click', () => { $('report-card').hidden = true; });
    $('rv-first').addEventListener('click', () => setView(0));
    $('rv-prev').addEventListener('click', () => step(-1));
    $('rv-next').addEventListener('click', () => step(1));
    $('rv-last').addEventListener('click', goLive);
    $('move-list').addEventListener('click', (e) => {
      const b = e.target.closest('[data-ply]');
      if (b) setView(Number(b.dataset.ply));
    });
    $('tip-next').addEventListener('click', () => {
      S.tip += 1;
      renderTip();
    });
    $('btn-reset-stats').addEventListener('click', () => {
      if (!window.confirm('Reset your ratings, records, badges and leaderboard?')) return;
      stats = loadStats();
      Object.assign(stats, {
        games: 0, wins: 0, losses: 0, draws: 0, streak: 0, bestStreak: 0, rating: 1000, ratedGames: 0, peak: 1000,
        badges: {}, history: [], players: {}, puzzleRating: 1200, puzzleRated: 0, puzzlePeak: 1200, puzzleAttempts: {}, puzzleHistory: [],
        rushBest: 0, streakBest: 0, daily: {},
      });
      stats.byLevel = { easy: { w: 0, l: 0, d: 0 }, medium: { w: 0, l: 0, d: 0 }, hard: { w: 0, l: 0, d: 0 } };
      saveStats(stats);
      renderStats();
      ui.toast('Stats reset.');
    });
  }

  function init() {
    wire();
    const restored = load();
    if (!restored) S.tip = Math.floor(Math.random() * TIPS.length);
    setFlip(S.flip);
    if (S.clock) startClockTicker();
    renderTip();
    render();
    humanEvalNow();
    maybeComputerMove();
  }

  function keydown(e) {
    const k = e.key;
    if (k === 'Escape') {
      if (S.selected >= 0) {
        S.selected = -1;
        render();
      }
      return true;
    }
    if (k === 'ArrowLeft') { step(-1); return true; }
    if (k === 'ArrowRight') { step(1); return true; }
    if (k === 'Home') { setView(0); return true; }
    if (k === 'End') { goLive(); return true; }
    const lower = k.toLowerCase();
    if (lower === 'u') { undo(); return true; }
    if (lower === 'h') { hint(); return true; }
    if (lower === 'f') { toggleFlip(); return true; }
    if (lower === 't') { toggleThreats(); return true; }
    if (lower === 'r') { cycleRings(); return true; }
    if (lower === 'n') { ui.openNewGame(); return true; }
    if (lower === 'b') { showTopMoves(); return true; }
    if (lower === 'c') { coach(); return true; }
    if (lower === 'p') { togglePause(); return true; }
    return false;
  }

  return {
    init, startGame, keydown, loadFromLink, loadMovesText, loadPosition, startOnline, remoteMove, remoteResign, remoteLeft,
    remoteDrawOffer, remoteDrawAccept, leaveOnline, movesText: () => E.movesText(S.game), positionLink,
    get state() { return S; },
    get stats() { return stats; },
    refreshStats() { stats = loadStats(); renderStats(); },
    onVisible() { render(); },
  };
}
