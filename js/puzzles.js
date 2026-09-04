// Puzzle page: themed sets, filters, daily puzzle, rush mode, specific
// feedback for wrong moves, and play-it-out.

import * as E from './engine.js';
import { createBoard } from './board.js';
import { PUZZLE_SET } from './puzzledata.js';
import { sound } from './sound.js';
import { confetti } from './fx.js';
import { loadStats, recordPuzzle, recordPuzzleAttempt, recordRush, recordStreak, recordDaily, dailyStreak, dayKey, puzzleRating, PROVISIONAL_PUZZLES } from './stats.js';

const $ = (id) => document.getElementById(id);

export const THEMES = {
  race: { name: 'Win the race', desc: 'Get to the far corner first.' },
  block: { name: 'Block the corner', desc: 'Passive defence with the right piece.' },
  stop: { name: 'Stop the runner', desc: 'Active defence: capture the attacker.' },
  corner: { name: 'Capture into the corner', desc: 'The corner is occupied. Take it.' },
  fork: { name: 'Forks', desc: 'Attack two pieces at once.' },
  trap: { name: 'Traps', desc: 'Leave a piece no safe square.' },
  box: { name: 'No moves left', desc: 'Win by leaving the other side unable to move.' },
  capture: { name: 'Win a piece', desc: 'Clean captures.' },
  material: { name: 'Win material', desc: 'Force a gain of material.' },
  only: { name: 'Only move', desc: 'Everything else loses.' },
};

function cap(s) {
  return s[0].toUpperCase() + s.slice(1);
}

export function boardOf(p) {
  return Uint8Array.from(p.board, (ch) => Number(ch));
}

export function dailyIndex() {
  const day = Math.floor(Date.now() / 86400000);
  return day % PUZZLE_SET.length;
}

export function createPuzzles(ui) {
  let board = null;
  let index = 0;
  let P = { game: null, selected: -1, solved: false, busy: false, hints: 0 };
  let filter = { theme: 'all', diff: 0 };
  let rush = null;
  let streak = null;
  let stats = loadStats();

  function current() {
    return PUZZLE_SET[index];
  }

  function visibleIndexes() {
    return PUZZLE_SET.map((p, i) => i).filter((i) => {
      const p = PUZZLE_SET[i];
      const themeOk = filter.theme === 'all'
        || (filter.theme === 'forme' ? Math.abs(puzzleRating(p) - stats.puzzleRating) <= 220
          : filter.theme === 'review' ? stats.puzzleAttempts[p.id] === 'loss' && !stats.puzzles[p.id]
            : p.theme === filter.theme);
      return themeOk && (filter.diff === 0 || p.difficulty === filter.diff);
    });
  }

  function canMoveNow() {
    return !P.solved && !P.busy && P.game.turn === current().turn;
  }

  // Setup ---------------------------------------------------------------

  function ensure() {
    if (board) return;
    board = createBoard($('puzzle-board'), {
      interactive: true,
      onCell,
      onDrop: (from, to) => tryMove(E.packMove(from, to), false),
      canDrag: (i) => canMoveNow() && E.ownerOf(P.game.board[i]) === P.game.turn,
      targetsFor: (i) => E.targetsFrom(P.game.board, i),
    });
    buildFilters();
    buildGrid();
    $('puzzle-hint').addEventListener('click', hint);
    $('puzzle-reset').addEventListener('click', () => load(index));
    $('puzzle-solution').addEventListener('click', showSolution);
    $('puzzle-next').addEventListener('click', nextUnsolved);
    $('puzzle-random').addEventListener('click', randomUnsolved);
    $('puzzle-daily-btn').addEventListener('click', () => {
      filter = { theme: 'all', diff: 0 };
      syncFilters();
      load(dailyIndex());
    });
    $('puzzle-play').addEventListener('click', () => {
      const p = current();
      ui.playPosition(boardOf(p), p.turn, p.turn);
    });
    $('puzzle-rush-btn').addEventListener('click', startRush);
    $('puzzle-streak-btn').addEventListener('click', startStreak);
    $('streak-stop').addEventListener('click', () => endStreak());
    $('rush-stop').addEventListener('click', () => endRush(false));
    $('rush-overlay-close').addEventListener('click', () => {
      $('rush-overlay').hidden = true;
      load(index);
    });
    load(dailyIndex());
  }

  function buildFilters() {
    const wrap = $('puzzle-filters');
    const chips = [['all', 'All'], ['forme', 'For my rating'], ['review', 'Review misses']].concat(Object.entries(THEMES).map(([k, v]) => [k, v.name]));
    wrap.innerHTML = chips.map(([k, name]) => `<button type="button" class="chip" data-theme="${k}">${name} <span class="chip-count"></span></button>`).join('');
    wrap.addEventListener('click', (e) => {
      const chip = e.target.closest('[data-theme]');
      if (!chip) return;
      filter.theme = chip.dataset.theme;
      syncFilters();
      buildGrid();
      const vis = visibleIndexes();
      if (vis.length && !vis.includes(index)) load(vis[0]);
    });
    $('puzzle-diff').addEventListener('click', (e) => {
      const b = e.target.closest('[data-diff]');
      if (!b) return;
      filter.diff = Number(b.dataset.diff);
      syncFilters();
      buildGrid();
      const vis = visibleIndexes();
      if (vis.length && !vis.includes(index)) load(vis[0]);
    });
    syncFilters();
  }

  function syncFilters() {
    const counts = {};
    let solvedAll = 0;
    PUZZLE_SET.forEach((p) => {
      counts[p.theme] = counts[p.theme] || { n: 0, s: 0 };
      counts[p.theme].n++;
      if (stats.puzzles[p.id]) {
        counts[p.theme].s++;
        solvedAll++;
      }
    });
    document.querySelectorAll('#puzzle-filters .chip').forEach((chip) => {
      const k = chip.dataset.theme;
      chip.classList.toggle('active', k === filter.theme);
      let c = k === 'all' ? { n: PUZZLE_SET.length, s: solvedAll } : counts[k] || { n: 0, s: 0 };
      if (k === 'forme') {
        const mine = PUZZLE_SET.filter((p) => Math.abs(puzzleRating(p) - stats.puzzleRating) <= 220);
        c = { n: mine.length, s: mine.filter((p) => stats.puzzles[p.id]).length };
      }
      if (k === 'review') {
        const missed = PUZZLE_SET.filter((p) => stats.puzzleAttempts[p.id] === 'loss' && !stats.puzzles[p.id]);
        c = { n: missed.length, s: 0 };
      }
      chip.querySelector('.chip-count').textContent = `${c.s}/${c.n}`;
      chip.hidden = c.n === 0;
    });
    const ds = dailyStreak(stats);
    $('daily-streak').textContent = ds ? `Daily streak ${ds}` : 'No daily streak yet';
    const strip = [];
    for (let k = 6; k >= 0; k--) {
      const key = dayKey(Date.now() - k * 86400000);
      strip.push(`<i class="${stats.daily && stats.daily[key] ? 'done' : ''}" title="${key}"></i>`);
    }
    $('daily-strip').innerHTML = strip.join('');
    $('puzzle-streak-best').textContent = stats.streakBest ? `Streak best: ${stats.streakBest}` : '';
    const prov = stats.puzzleRated < PROVISIONAL_PUZZLES ? '?' : '';
    $('puzzle-rating').textContent = `Puzzle rating ${stats.puzzleRating}${prov}`;
    $('puzzle-rating').title = prov ? `Provisional until ${PROVISIONAL_PUZZLES} rated attempts (${stats.puzzleRated} so far). Peak ${stats.puzzlePeak}.` : `Peak ${stats.puzzlePeak}.`;
    document.querySelectorAll('#puzzle-diff [data-diff]').forEach((b) => b.classList.toggle('active', Number(b.dataset.diff) === filter.diff));
    $('puzzle-progress').style.width = `${(solvedAll / PUZZLE_SET.length) * 100}%`;
    $('puzzle-progress-text').textContent = `${solvedAll} of ${PUZZLE_SET.length} solved`;
    $('puzzle-rush-best').textContent = stats.rushBest ? `Rush best: ${stats.rushBest}` : '';
  }

  function buildGrid() {
    const grid = $('puzzle-grid');
    const vis = visibleIndexes();
    grid.innerHTML = vis.map((i) => {
      const p = PUZZLE_SET[i];
      const solved = !!stats.puzzles[p.id];
      const cls = ['pg', solved ? 'solved' : '', i === index ? 'current' : '', i === dailyIndex() ? 'daily' : ''].join(' ');
      return `<button type="button" class="${cls}" data-i="${i}" title="${p.title} · ${'●'.repeat(p.difficulty)}">${i + 1}</button>`;
    }).join('');
    $('puzzle-count').textContent = `${vis.length}`;
    grid.onclick = (e) => {
      const b = e.target.closest('[data-i]');
      if (b) load(Number(b.dataset.i));
    };
  }

  // Loading and rendering ------------------------------------------------

  function load(i) {
    index = i;
    const p = current();
    P = { game: E.newGame(boardOf(p), p.turn), selected: -1, solved: false, busy: false, hints: 0, failed: false, assisted: false };
    $('puzzle-title').textContent = `${i + 1}. ${p.title}`;
    const attempted = stats.puzzleAttempts[p.id];
    $('puzzle-prating').textContent = `Rated ${puzzleRating(p)}${attempted ? attempted === 'win' ? ' · solved first try' : ' · attempted' : ''}`;
    $('puzzle-theme').textContent = THEMES[p.theme] ? THEMES[p.theme].name : p.theme;
    $('puzzle-diffdots').textContent = '●'.repeat(p.difficulty) + '○'.repeat(3 - p.difficulty);
    $('puzzle-diffdots').title = ['', 'Easy', 'Medium', 'Hard'][p.difficulty];
    $('puzzle-turn').textContent = `${cap(E.PLAYER_NAMES[p.turn])} to move.${p.winIn ? ` Win in ${p.winIn}.` : ''}`;
    $('puzzle-prompt').textContent = p.prompt;
    $('puzzle-daily').hidden = i !== dailyIndex();
    $('puzzle-line').textContent = '';
    setFeedback('', '');
    document.querySelectorAll('#puzzle-grid .pg').forEach((b) => b.classList.toggle('current', Number(b.dataset.i) === i));
    const cur = document.querySelector('#puzzle-grid .pg.current');
    if (cur) cur.scrollIntoView({ block: 'nearest' });
    render();
  }

  function setFeedback(text, kind) {
    const el = $('puzzle-feedback');
    el.textContent = text;
    el.className = 'feedback' + (kind ? ' ' + kind : '');
  }

  function render(animate) {
    const g = P.game;
    const p = current();
    const hintFrom = P.hints >= 1 ? E.parseCell(p.solutions[0].slice(0, 2)) : -1;
    const hintTo = P.hints >= 2 ? E.parseCell(p.solutions[0].slice(3, 5)) : -1;
    board.render(g.board, {
      selected: P.selected,
      targets: P.selected >= 0 ? E.targetsFrom(g.board, P.selected) : [],
      lastMove: g.moves.length ? { from: E.moveFrom(g.moves.at(-1).m), to: E.moveTo(g.moves.at(-1).m) } : null,
      rings: p.turn,
      hint: !P.solved && hintFrom >= 0 ? { from: hintFrom, to: hintTo } : null,
      draggable: (i) => canMoveNow() && E.ownerOf(g.board[i]) === g.turn,
      animate,
    });
  }

  // Interaction -----------------------------------------------------------

  function onCell(i, info = {}) {
    const g = P.game;
    if (!canMoveNow()) return;
    if (info.dragStart) { P.selected = i; render(); return; }
    if (info.dragCancel) { render(); return; }
    if (P.selected >= 0 && E.canMove(g.board, P.selected, i)) {
      tryMove(E.packMove(P.selected, i), true);
      return;
    }
    const v = g.board[i];
    P.selected = v && E.ownerOf(v) === g.turn && P.selected !== i ? i : -1;
    if (P.selected >= 0) sound.play('select');
    render();
  }

  function tryMove(m, slide) {
    const p = current();
    const g = P.game;
    const from = E.moveFrom(m);
    const to = E.moveTo(m);
    const captured = g.board[to];
    const text = E.notation(g.board, m);
    const before = g;
    P.game = E.play(g, m);
    P.selected = -1;
    render({ from, to, captured, slide });
    if (p.solutions.includes(text)) {
      P.solved = true;
      sound.play('win');
      let ratingText = '';
      if (!P.failed && !P.assisted && !rush && !streak) {
        const r = recordPuzzleAttempt(stats, p, true);
        if (r.first) ratingText = ` Rating ${r.delta >= 0 ? '+' : ''}${r.delta} (${r.rating}).`;
        (r.earned || []).forEach((b) => ui.badge(b));
      }
      setFeedback(`${text} is right.${ratingText} ${p.explain}`, 'good');
      $('puzzle-line').textContent = p.line && p.line.split(' ').length > 1 ? `Engine line: ${p.line}` : '';
      const first = !stats.puzzles[p.id];
      const earned = recordPuzzle(stats, p.id, PUZZLE_SET.length);
      earned.forEach((b) => ui.badge(b));
      if (index === dailyIndex()) recordDaily(stats).forEach((b) => ui.badge(b));
      if (first) confetti(undefined, 60);
      syncFilters();
      buildGrid();
      if (streak) streakSolved();
      $('puzzle-prating').textContent = `Rated ${puzzleRating(p)} · solved`;
      if (rush) rushSolved();
    } else {
      P.busy = true;
      sound.play('error');
      const why = p.refute && p.refute[text] ? p.refute[text] : 'That does not work here.';
      let ratingText = '';
      if (!P.failed && !P.assisted && !rush && !streak) {
        const r = recordPuzzleAttempt(stats, p, false);
        if (r.first) ratingText = ` Rating ${r.delta} (${r.rating}).`;
        syncFilters();
      }
      P.failed = true;
      setFeedback(`${text}? ${why}${ratingText}`, 'bad');
      if (rush) rushMissed();
      if (streak) streakMissed();
      setTimeout(() => {
        P.game = before;
        P.busy = false;
        render();
      }, 1000);
    }
  }

  function hint() {
    if (P.solved) return;
    P.assisted = true;
    P.hints = Math.min(2, P.hints + 1);
    const p = current();
    const piece = E.TYPE_NAMES[E.typeOf(boardOf(p)[E.parseCell(p.solutions[0].slice(0, 2))])];
    setFeedback(P.hints === 1 ? `Look at the ${piece} on ${p.solutions[0].slice(0, 2)}.` : `Move it to ${p.solutions[0].slice(3, 5)}.`, '');
    render();
  }

  function showSolution() {
    const p = current();
    if (!P.solved && !P.failed && !P.assisted && !rush && !streak) {
      const r = recordPuzzleAttempt(stats, p, false);
      if (r.first) ui.toast(`Solution viewed: rating ${r.delta} (${r.rating}).`);
      syncFilters();
    }
    load(index);
    P.assisted = true;
    const g = P.game;
    const m = E.legalMoves(g.board, g.turn).find((mv) => E.notation(g.board, mv) === p.solutions[0]);
    if (m === undefined) return;
    const from = E.moveFrom(m);
    const to = E.moveTo(m);
    const captured = g.board[to];
    P.game = E.play(g, m);
    P.solved = true;
    render({ from, to, captured });
    const others = p.solutions.length > 1 ? ` ${p.solutions.slice(1).join(' and ')} also work${p.solutions.length === 2 ? 's' : ''}.` : '';
    setFeedback(`${p.solutions[0]}. ${p.explain}${others}`, 'good');
    $('puzzle-line').textContent = p.line && p.line.split(' ').length > 1 ? `Engine line: ${p.line}` : '';
    if (rush) rushMissed();
    if (streak) streakMissed();
  }

  function nextUnsolved() {
    const vis = visibleIndexes();
    if (!vis.length) return;
    const pos = vis.indexOf(index);
    for (let k = 1; k <= vis.length; k++) {
      const i = vis[(pos + k) % vis.length];
      if (!stats.puzzles[PUZZLE_SET[i].id]) { load(i); return; }
    }
    load(vis[(pos + 1) % vis.length]);
  }

  function randomUnsolved() {
    const vis = visibleIndexes();
    const pool = vis.filter((i) => !stats.puzzles[PUZZLE_SET[i].id] && i !== index);
    const from = pool.length ? pool : vis.filter((i) => i !== index);
    if (!from.length) return;
    load(from[Math.floor(Math.random() * from.length)]);
  }

  // Rush ------------------------------------------------------------------

  function startRush() {
    if (streak) { streak = null; $('streak-bar').hidden = true; }
    const order = PUZZLE_SET.map((p, i) => i).sort(() => Math.random() - 0.5);
    rush = { order, pos: 0, score: 0, strikes: 0, endsAt: Date.now() + 180000, timer: null };
    $('rush-bar').hidden = false;
    $('rush-overlay').hidden = true;
    filter = { theme: 'all', diff: 0 };
    syncFilters();
    buildGrid();
    load(rush.order[0]);
    renderRush();
    rush.timer = setInterval(() => {
      renderRush();
      if (Date.now() >= rush.endsAt) endRush(true);
    }, 250);
    ui.toast('Puzzle rush: you have three minutes and three strikes. Go.');
  }

  function renderRush() {
    if (!rush) return;
    const left = Math.max(0, rush.endsAt - Date.now());
    const m = Math.floor(left / 60000);
    const s = Math.floor((left % 60000) / 1000);
    $('rush-time').textContent = `${m}:${String(s).padStart(2, '0')}`;
    $('rush-score').textContent = rush.score;
    $('rush-strikes').textContent = '✕'.repeat(rush.strikes) + '·'.repeat(3 - rush.strikes);
  }

  function rushSolved() {
    rush.score += 1;
    renderRush();
    setTimeout(() => {
      if (!rush) return;
      rush.pos += 1;
      if (rush.pos >= rush.order.length) endRush(true);
      else load(rush.order[rush.pos]);
    }, 900);
  }

  function rushMissed() {
    rush.strikes += 1;
    renderRush();
    if (rush.strikes >= 3) {
      setTimeout(() => endRush(true), 1000);
      return;
    }
    setTimeout(() => {
      if (!rush) return;
      rush.pos += 1;
      if (rush.pos >= rush.order.length) endRush(true);
      else load(rush.order[rush.pos]);
    }, 1200);
  }

  function endRush(finished) {
    if (!rush) return;
    clearInterval(rush.timer);
    const score = rush.score;
    rush = null;
    $('rush-bar').hidden = true;
    if (!finished) return;
    const record = score > (stats.rushBest || 0);
    recordRush(stats, score).forEach((b) => ui.badge(b));
    const best = stats.rushBest;
    syncFilters();
    $('rush-result').textContent = `${score} solved`;
    $('rush-result-sub').textContent = record ? 'A new personal best.' : `Your best is ${best}.`;
    $('rush-overlay').hidden = false;
    if (record && score > 0) confetti();
    sound.play(score > 0 ? 'win' : 'draw');
  }

  // Streak ------------------------------------------------------------------

  function startStreak() {
    const order = PUZZLE_SET.map((p, i) => ({ i, r: puzzleRating(p) + Math.random() * 150 })).sort((a, b) => a.r - b.r).map((x) => x.i);
    streak = { order, pos: 0, count: 0 };
    $('streak-bar').hidden = false;
    $('rush-overlay').hidden = true;
    filter = { theme: 'all', diff: 0 };
    syncFilters();
    buildGrid();
    load(streak.order[0]);
    renderStreak();
    ui.toast('Streak: puzzles get harder as you go. One miss ends it.');
  }

  function renderStreak() {
    if (!streak) return;
    $('streak-count').textContent = streak.count;
  }

  function streakSolved() {
    streak.count += 1;
    renderStreak();
    setTimeout(() => {
      if (!streak) return;
      streak.pos += 1;
      if (streak.pos >= streak.order.length) endStreak();
      else load(streak.order[streak.pos]);
    }, 900);
  }

  function streakMissed() {
    setTimeout(endStreak, 1000);
  }

  function endStreak() {
    if (!streak) return;
    const count = streak.count;
    streak = null;
    $('streak-bar').hidden = true;
    const record = count > (stats.streakBest || 0);
    recordStreak(stats, count).forEach((b) => ui.badge(b));
    syncFilters();
    $('rush-result').textContent = `Streak of ${count}`;
    $('rush-result-sub').textContent = record ? 'A new personal best.' : `Your best is ${stats.streakBest}.`;
    $('rush-overlay').hidden = false;
    if (record && count > 0) confetti();
    sound.play(count > 0 ? 'win' : 'draw');
  }

  function refreshStats() {
    stats = loadStats();
    if (board) {
      syncFilters();
      buildGrid();
    }
  }

  return { ensure, load, refreshStats, get index() { return index; } };
}
