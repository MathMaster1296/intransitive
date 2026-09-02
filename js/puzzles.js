// Puzzle page: navigation, daily puzzle, feedback, progress, play it out.

import * as E from './engine.js';
import { createBoard } from './board.js';
import { PUZZLES, boardFrom } from './lessons.js';
import { sound } from './sound.js';
import { loadStats, recordPuzzle } from './stats.js';

const $ = (id) => document.getElementById(id);

function cap(s) {
  return s[0].toUpperCase() + s.slice(1);
}

export function dailyIndex() {
  const day = Math.floor(Date.now() / 86400000);
  return day % PUZZLES.length;
}

export function createPuzzles(ui) {
  let board = null;
  let index = 0;
  let P = { game: null, selected: -1, solved: false, busy: false };

  function puzzleGame(p) {
    return E.newGame(boardFrom(p.spec), p.turn);
  }

  function canMoveNow() {
    return !P.solved && !P.busy && P.game.turn === PUZZLES[index].turn;
  }

  function ensure() {
    if (board) return;
    board = createBoard($('puzzle-board'), {
      interactive: true,
      onCell,
      onDrop: (from, to) => tryMove(E.packMove(from, to), false),
      canDrag: (i) => canMoveNow() && E.ownerOf(P.game.board[i]) === P.game.turn,
      targetsFor: (i) => E.targetsFrom(P.game.board, i),
    });
    const nav = $('puzzle-nav');
    PUZZLES.forEach((p, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn';
      b.textContent = String(i + 1);
      b.title = p.title;
      b.addEventListener('click', () => load(i));
      nav.appendChild(b);
    });
    $('puzzle-hint').addEventListener('click', () => setFeedback(PUZZLES[index].hint, ''));
    $('puzzle-reset').addEventListener('click', () => load(index));
    $('puzzle-solution').addEventListener('click', showSolution);
    $('puzzle-next').addEventListener('click', () => load((index + 1) % PUZZLES.length));
    $('puzzle-play').addEventListener('click', () => {
      const p = PUZZLES[index];
      ui.playPosition(boardFrom(p.spec), p.turn, p.turn);
    });
    load(dailyIndex());
  }

  function setFeedback(text, kind) {
    const el = $('puzzle-feedback');
    el.textContent = text;
    el.className = 'feedback' + (kind ? ' ' + kind : '');
  }

  function renderProgress() {
    const stats = loadStats();
    const solved = PUZZLES.filter((p) => stats.puzzles[p.id]).length;
    $('puzzle-progress').style.width = `${(solved / PUZZLES.length) * 100}%`;
    $('puzzle-progress-text').textContent = `${solved} of ${PUZZLES.length} solved`;
    document.querySelectorAll('#puzzle-nav .btn').forEach((b, j) => {
      b.classList.toggle('active', j === index);
      b.classList.toggle('solved', !!stats.puzzles[PUZZLES[j].id]);
    });
  }

  function load(i) {
    index = i;
    const p = PUZZLES[i];
    P = { game: puzzleGame(p), selected: -1, solved: false, busy: false };
    $('puzzle-title').textContent = `${i + 1}. ${p.title}`;
    $('puzzle-turn').textContent = `${cap(E.PLAYER_NAMES[p.turn])} to move.`;
    $('puzzle-prompt').textContent = p.prompt;
    $('puzzle-daily').hidden = i !== dailyIndex();
    setFeedback('', '');
    renderProgress();
    render();
  }

  function render(animate) {
    const g = P.game;
    const targets = P.selected >= 0 ? E.targetsFrom(g.board, P.selected) : [];
    board.render(g.board, {
      selected: P.selected,
      targets,
      lastMove: g.moves.length ? { from: E.moveFrom(g.moves.at(-1).m), to: E.moveTo(g.moves.at(-1).m) } : null,
      rings: PUZZLES[index].turn,
      draggable: (i) => canMoveNow() && E.ownerOf(g.board[i]) === g.turn,
      animate,
    });
  }

  function onCell(i, info = {}) {
    const g = P.game;
    if (!canMoveNow()) return;
    if (info.dragStart) {
      P.selected = i;
      render();
      return;
    }
    if (info.dragCancel) {
      render();
      return;
    }
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
    const p = PUZZLES[index];
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
      setFeedback(`${text} is right. ${p.explain}`, 'good');
      const earned = recordPuzzle(loadStats(), p.id, PUZZLES.length);
      earned.forEach((b) => ui.badge(b));
      renderProgress();
    } else {
      P.busy = true;
      sound.play('error');
      setFeedback(`${text}? ${p.wrong}`, 'bad');
      setTimeout(() => {
        P.game = before;
        P.busy = false;
        render();
      }, 900);
    }
  }

  function showSolution() {
    const p = PUZZLES[index];
    load(index);
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
  }

  return { ensure, load, get index() { return index; } };
}
