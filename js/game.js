// The play page: game state, board interaction, the computer opponent,
// analysis (evaluation bar, hints, move ratings), review, stats and sharing.

import * as E from './engine.js';
import { createBoard, pieceSvg } from './board.js';
import { engine, scoreToShare, describeScore } from './analysis.js';
import { sound } from './sound.js';
import { confetti } from './fx.js';
import { loadStats, saveStats, recordGame, BADGES, LEVEL_RATING, PROVISIONAL_GAMES, expected, getPlayer, recordTwoPlayerGame, leaderboard } from './stats.js';
import { TIPS } from './lessons.js';

const GAME_KEY = 'intransitive.game.v2';
const PREF_KEY = 'intransitive.prefs.v1';
const LEVEL_NAMES = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };

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

export function createGame(ui) {
  const S = {
    game: E.newGame(),
    mode: 'cpu',
    level: 'medium',
    human: E.BLUE,
    custom: false,
    names: { blue: '', red: '' },
    selected: -1,
    thinking: false,
    seq: 0,
    view: null,
    flip: false,
    rings: null,
    threats: false,
    hint: null,
    quality: {},
    assisted: false,
    recorded: false,
    overlayDismissed: false,
    evalBlue: 0,
    analysisSeq: 0,
    lastBest: null,
    maxDeficit: 0,
    tip: 0,
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
      mode: S.mode,
      level: S.level,
      human: S.human,
      custom: S.custom,
      names: S.names,
      start: S.custom ? { board: Array.from(g.start.board), turn: g.start.turn } : null,
      moves: g.moves.map((mv) => mv.m),
      resigned: g.result && g.result.reason === 'resign' ? g.result : null,
      quality: S.quality,
      assisted: S.assisted,
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
      S.mode = data.mode === 'two' ? 'two' : 'cpu';
      S.level = LEVEL_NAMES[data.level] ? data.level : 'medium';
      S.human = data.human === E.RED ? E.RED : E.BLUE;
      S.custom = !!data.custom;
      S.names = data.names && typeof data.names === 'object' ? { blue: String(data.names.blue || ''), red: String(data.names.red || '') } : { blue: '', red: '' };
      S.quality = data.quality || {};
      S.assisted = !!data.assisted;
      S.recorded = !!data.recorded;
      S.flip = !!data.flip;
      S.overlayDismissed = !!data.overlayDismissed;
      S.maxDeficit = data.maxDeficit || 0;
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
    if (S.mode === 'cpu' && g.turn !== S.human) return false;
    return true;
  }

  function shownPly() {
    return isLive() ? S.game.moves.length : S.view;
  }

  function shownBoard() {
    return E.boardAt(S.game, shownPly());
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
    if (S.mode === 'two') return playerName(player) || cap(E.PLAYER_NAMES[player]);
    return player === S.human ? 'You' : `Computer`;
  }

  function twoRated() {
    return S.mode === 'two' && !S.custom && !S.assisted && !!playerName(E.BLUE) && !!playerName(E.RED)
      && playerName(E.BLUE).toLowerCase() !== playerName(E.RED).toLowerCase();
  }

  // Rendering -----------------------------------------------------------

  function render(animate) {
    const g = S.game;
    const b = shownBoard();
    const live = isLive();
    const targets = live && S.selected >= 0 ? E.targetsFrom(g.board, S.selected) : [];
    let attacked = null;
    let threats = null;
    if (S.threats && live && !g.result) {
      const all = E.attackedCells(g.board);
      const mine = S.mode === 'cpu' ? S.human : g.turn;
      attacked = all.filter((i) => E.ownerOf(g.board[i]) === mine);
      threats = all.filter((i) => E.ownerOf(g.board[i]) !== mine);
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
    board.setArrows(live && S.hint ? [{ from: S.hint.from, to: S.hint.to, cls: 'best' }] : []);
    renderStatus();
    renderPlayers();
    renderMoves();
    renderReview();
    renderStats();
    renderEval();
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
      if (S.mode === 'cpu') {
        text.textContent = g.turn === S.human ? 'Your move' : 'Computer is thinking';
      } else {
        text.textContent = `${cap(E.PLAYER_NAMES[g.turn])} to move`;
      }
      sub.textContent = S.mode === 'cpu'
        ? `${LEVEL_NAMES[S.level]} computer${S.custom ? ', from a puzzle position' : ''}${S.assisted ? ', unrated' : ''}`
        : (twoRated() ? 'Rated game between two players' : 'Two players at one screen');
    }
    const left = Math.ceil((E.STAGNATION_PLIES - g.sinceCapture) / 2);
    const warn = !g.result && left <= 30;
    $('status-stagnation').hidden = !warn;
    if (warn) $('status-stagnation').textContent = `Draw in ${left} move${left === 1 ? '' : 's'} unless something is captured.`;

    const cpuLabel = ` · ${LEVEL_NAMES[S.level]} (${LEVEL_RATING[S.level]})`;
    const youLabel = S.mode === 'cpu' ? ` (${stats.rating})` : '';
    const twoLabel = (player) => {
      const name = playerName(player);
      if (!name) return '';
      const pl = getPlayer(stats, name);
      return pl ? ` (${pl.rating})` : '';
    };
    $('mu-blue').textContent = humanName(E.BLUE) + (S.mode === 'cpu' ? (S.human !== E.BLUE ? cpuLabel : youLabel) : twoLabel(E.BLUE));
    $('mu-red').textContent = humanName(E.RED) + (S.mode === 'cpu' ? (S.human !== E.RED ? cpuLabel : youLabel) : twoLabel(E.RED));
    $('mu-rated').textContent = S.mode === 'cpu'
      ? (S.custom ? 'Unrated' : S.assisted ? 'Unrated (undo or hint used)' : 'Rated')
      : (twoRated() ? 'Rated' : S.assisted ? 'Unrated (undo used)' : playerName(E.BLUE) && playerName(E.RED) ? 'Unrated' : 'Unrated (add names for a rated game)');

    $('btn-undo').disabled = g.moves.length === 0 || !isLive();
    $('btn-resign').disabled = !!g.result || !isLive();
    $('btn-hint').disabled = !humanCanMoveNow();
    $('btn-threats').setAttribute('aria-pressed', String(S.threats));
    $('btn-rings').setAttribute('aria-pressed', String(S.rings !== null));
    $('btn-rings').lastChild.textContent = S.rings === null ? 'Rings' : S.rings === E.BLUE ? 'Rings: blue' : 'Rings: red';
    $('prow-blue').classList.toggle('active', !g.result && g.turn === E.BLUE);
    $('prow-red').classList.toggle('active', !g.result && g.turn === E.RED);
  }

  function resultHeadline() {
    const r = S.game.result;
    if (!r) return '';
    if (r.winner === null) return 'Draw';
    if (S.mode === 'cpu') return r.winner === S.human ? 'You win' : 'You lose';
    return `${cap(E.PLAYER_NAMES[r.winner])} wins`;
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
    $('st-puzzle').textContent = `Puzzle rating ${stats.puzzleRating}${stats.puzzleRated < 20 ? '?' : ''}${stats.rushBest ? ` · rush best ${stats.rushBest}` : ''}`;
    const series = [1000].concat((stats.history || []).filter((h) => h.rating !== undefined).map((h) => h.rating)).slice(-30);
    sparkline(series);
    const lb = leaderboard(stats);
    const card = $('leaderboard-card');
    if (card) {
      card.hidden = lb.length === 0;
      $('leaderboard').innerHTML = lb.map((pl, i) => `<li><span class="lb-rank">${i + 1}</span><span class="lb-name">${escapeHtml(pl.name)}</span><span class="lb-rec muted">${pl.wins}-${pl.losses}${pl.draws ? '-' + pl.draws : ''}</span><strong>${pl.rating}${pl.games < PROVISIONAL_GAMES ? '?' : ''}</strong></li>`).join('');
    }
    const html = BADGES.map((b) => {
      const earned = !!stats.badges[b.id];
      return `<span class="badge ${earned ? 'earned' : ''}" title="${b.desc}"><svg><use href="#i-star"/></svg>${b.name}</span>`;
    }).join('');
    $('badges').innerHTML = html;
  }

  function renderEval() {
    if (S.game.result && isLive()) {
      const w = S.game.result.winner;
      board.setEval(w === null ? 0.5 : w === E.BLUE ? 0.98 : 0.02);
      $('eval-text').textContent = '';
      return;
    }
    board.setEval(scoreToShare(S.evalBlue));
    $('eval-text').textContent = `Engine: ${describeScore(S.evalBlue)}`;
  }

  function renderTip() {
    $('tip-text').textContent = TIPS[S.tip % TIPS.length];
  }

  // Analysis ------------------------------------------------------------

  function humanEvalNow() {
    // Evaluate the live position for the bar, and remember the best move for
    // whoever is about to move so their move can be rated afterwards.
    const g = S.game;
    if (g.result) return;
    const seq = ++S.analysisSeq;
    const ply = g.moves.length;
    engine.analyze(g.board, g.turn, g.sinceCapture).then((r) => {
      if (seq !== S.analysisSeq || !r) return;
      const blueScore = g.turn === E.BLUE ? r.score : -r.score;
      S.evalBlue = blueScore;
      S.lastBest = { ply, move: r.move, score: r.score, notation: E.notation(g.board, r.move) };
      renderEval();
    });
  }

  function rateMove(prevBest, moveIndex, movedPlayer) {
    // prevBest is the analysis of the position before the move, from the
    // mover's point of view. Compare it with the position after the move.
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

  // Moves ---------------------------------------------------------------

  function playMove(m, { slide = true } = {}) {
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
    sound.play(captured ? 'capture' : 'move');
    trackDeficit();
    render({ from, to, captured, slide });
    const shouldRate = S.mode === 'two' || mover === S.human;
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

  function maybeComputerMove() {
    const g = S.game;
    if (g.result || S.mode !== 'cpu' || g.turn === S.human || !isLive()) return;
    S.thinking = true;
    const seq = ++S.seq;
    const started = Date.now();
    renderStatus();
    engine.bestMove(g.board, g.turn, g.sinceCapture, S.level).then((r) => {
      if (seq !== S.seq) return;
      const wait = Math.max(0, 420 - (Date.now() - started));
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

  function startGame({ mode = S.mode, level = S.level, human = S.human, board: b = null, turn = E.BLUE, custom = false, names = null } = {}) {
    cancelThinking();
    S.mode = mode;
    S.names = names ? { blue: String(names.blue || ''), red: String(names.red || '') } : (mode === 'two' ? S.names : { blue: '', red: '' });
    S.level = level;
    S.human = human;
    S.custom = custom;
    S.game = b ? E.newGame(b, turn) : E.newGame();
    S.selected = -1;
    S.hint = null;
    S.quality = {};
    S.assisted = false;
    S.recorded = false;
    S.overlayDismissed = false;
    S.view = null;
    S.maxDeficit = 0;
    S.evalBlue = 0;
    S.lastBest = null;
    S.tip = Math.floor(Math.random() * TIPS.length);
    setFlip(mode === 'cpu' && human === E.RED);
    renderTip();
    render();
    humanEvalNow();
    save();
    maybeComputerMove();
  }

  function onGameOver() {
    const r = S.game.result;
    let sub = E.describeResult(r);
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
        });
        if (!S.assisted) {
          sub += ` Rating ${delta >= 0 ? '+' : ''}${delta}, now ${stats.rating}.`;
          setTimeout(() => ui.toast(`Rating ${delta >= 0 ? '+' : ''}${delta}: ${stats.rating}`), 600);
        }
        earned.forEach((b, i) => setTimeout(() => ui.badge(b), 900 + i * 1400));
      }
    }
    if (S.mode === 'two' && !S.recorded && playerName(E.BLUE) && playerName(E.RED)) {
      S.recorded = true;
      const rated = twoRated();
      const res = recordTwoPlayerGame(stats, playerName(E.BLUE), playerName(E.RED), r.winner, rated);
      if (res && rated) {
        const fmt = (d) => `${d >= 0 ? '+' : ''}${d}`;
        sub += ` ${playerName(E.BLUE)} ${fmt(res.blue)} (${res.blueRating}), ${playerName(E.RED)} ${fmt(res.red)} (${res.redRating}).`;
      }
    }
    if (r.winner === null) sound.play('draw');
    else if (S.mode === 'two' || r.winner === S.human) {
      sound.play('win');
      setTimeout(() => confetti(), 150);
    } else sound.play('lose');
    $('overlay-title').textContent = resultHeadline();
    $('overlay-sub').textContent = sub;
    render();
    save();
  }

  function undo() {
    const g = S.game;
    if (!g.moves.length || !isLive()) return;
    cancelThinking();
    let next = E.undo(g);
    if (S.mode === 'cpu' && next.turn !== S.human && next.moves.length) next = E.undo(next);
    delete S.quality[next.moves.length];
    delete S.quality[next.moves.length + 1];
    S.game = next;
    S.selected = -1;
    S.hint = null;
    S.assisted = true;
    S.overlayDismissed = false;
    render();
    humanEvalNow();
    save();
    maybeComputerMove();
  }

  function resign() {
    const g = S.game;
    if (g.result || !isLive()) return;
    const who = S.mode === 'cpu' ? S.human : g.turn;
    if (!window.confirm(`${S.mode === 'cpu' ? 'Resign this game' : cap(E.PLAYER_NAMES[who]) + ' resigns'}?`)) return;
    cancelThinking();
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

  async function share() {
    if (S.custom) {
      ui.toast('Games that start from a puzzle position cannot be shared as a link yet.');
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
    try {
      await navigator.clipboard.writeText(url);
      ui.toast('Link copied. Anyone can open it and replay the game.');
    } catch {
      window.prompt('Copy this link:', url);
    }
  }

  function loadFromLink(code) {
    const g = E.decodeMoves(code);
    cancelThinking();
    S.mode = 'two';
    S.custom = false;
    S.game = g;
    S.selected = -1;
    S.hint = null;
    S.quality = {};
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

  function loadMovesText(text) {
    const g = E.parseMoves(text);
    cancelThinking();
    S.game = g;
    S.custom = false;
    S.selected = -1;
    S.hint = null;
    S.quality = {};
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
    $('btn-moves').addEventListener('click', () => ui.openMoves(E.movesText(S.game)));
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
      if (!window.confirm('Reset your rating, record and badges?')) return;
      stats = loadStats();
      Object.assign(stats, { games: 0, wins: 0, losses: 0, draws: 0, streak: 0, bestStreak: 0, rating: 1000, ratedGames: 0, badges: {}, history: [] });
      stats.byLevel = { easy: { w: 0, l: 0, d: 0 }, medium: { w: 0, l: 0, d: 0 }, hard: { w: 0, l: 0, d: 0 } };
      stats.players = {};
      stats.peak = 1000;
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
    return false;
  }

  return {
    init, startGame, keydown, loadFromLink, loadMovesText, movesText: () => E.movesText(S.game),
    get state() { return S; },
    get stats() { return stats; },
    refreshStats() { stats = loadStats(); renderStats(); },
    onVisible() { render(); },
  };
}
