// Home page: a looping replay of a computer versus computer game.

import * as E from './engine.js';
import { createBoard } from './board.js';
import { DEMO_MOVES } from './lessons.js';

export function createDemo(root, caption) {
  const board = createBoard(root, { interactive: false });
  let full;
  try {
    full = E.parseMoves(DEMO_MOVES);
  } catch {
    full = E.newGame();
  }
  const total = full.moves.length;
  let n = 0;
  let timer = null;
  let active = false;

  function frame() {
    const b = E.boardAt(full, n);
    const last = n > 0 ? { from: E.moveFrom(full.moves[n - 1].m), to: E.moveTo(full.moves[n - 1].m) } : null;
    const captured = n > 0 && full.moves[n - 1].capture ? E.boardAt(full, n - 1)[last.to] : 0;
    board.render(b, { lastMove: last, animate: last ? { from: last.from, to: last.to, captured } : null });
    if (caption) {
      caption.textContent = n === 0
        ? 'The computer playing itself'
        : n >= total && full.result
          ? E.describeResult(full.result)
          : `Move ${Math.ceil(n / 2)} of ${Math.ceil(total / 2)}`;
    }
  }

  function tick() {
    n = n >= total ? 0 : n + 1;
    frame();
    timer = setTimeout(tick, n === 0 ? 1600 : n >= total ? 2600 : 800);
  }

  function start() {
    if (active) return;
    active = true;
    frame();
    timer = setTimeout(tick, 1200);
  }

  function stop() {
    active = false;
    clearTimeout(timer);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) clearTimeout(timer);
    else if (active) timer = setTimeout(tick, 600);
  });

  return { start, stop };
}
