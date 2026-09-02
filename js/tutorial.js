// A one-minute guided tutorial played on a board inside a dialog.

import * as E from './engine.js';
import { createBoard } from './board.js';
import { TUTORIAL, boardFrom } from './lessons.js';
import { sound } from './sound.js';
import { loadStats, saveStats } from './stats.js';

const $ = (id) => document.getElementById(id);

export function createTutorial(ui) {
  let board = null;
  let step = 0;
  let T = { game: null, selected: -1, done: false };

  function ensure() {
    if (board) return;
    board = createBoard($('tut-board'), {
      interactive: true,
      onCell,
      onDrop: (from, to) => tryMove(E.packMove(from, to), false),
      canDrag: (i) => !T.done && T.game && E.ownerOf(T.game.board[i]) === T.game.turn,
      targetsFor: (i) => E.targetsFrom(T.game.board, i),
    });
    $('tut-next').addEventListener('click', next);
    $('tut-skip').addEventListener('click', close);
  }

  function open() {
    ensure();
    step = 0;
    show();
    $('dlg-tutorial').showModal();
  }

  function close() {
    $('dlg-tutorial').close();
  }

  function finish() {
    const stats = loadStats();
    stats.tutorialDone = true;
    saveStats(stats);
    close();
    ui.tutorialDone();
  }

  function show() {
    const s = TUTORIAL[step];
    $('tut-progress').innerHTML = TUTORIAL.map((x, i) => `<i class="${i <= step ? 'done' : ''}"></i>`).join('');
    $('tut-title').textContent = `${step + 1}. ${s.title}`;
    $('tut-text').textContent = s.text;
    $('tut-feedback').textContent = '';
    $('tut-feedback').className = 'feedback';
    $('tut-next').textContent = s.finish ? 'Play the computer' : 'Next';
    $('tut-next').hidden = !s.finish;
    if (s.spec) {
      T = { game: E.newGame(boardFrom(s.spec), s.turn), selected: -1, done: false };
      $('tut-board').hidden = false;
      render();
    } else {
      T = { game: E.newGame(), selected: -1, done: true };
      render();
    }
  }

  function render(animate) {
    const g = T.game;
    const targets = T.selected >= 0 ? E.targetsFrom(g.board, T.selected) : [];
    board.render(g.board, {
      selected: T.selected,
      targets,
      draggable: (i) => !T.done && E.ownerOf(g.board[i]) === g.turn,
      animate,
    });
  }

  function onCell(i, info = {}) {
    if (T.done) return;
    const g = T.game;
    if (info.dragStart) {
      T.selected = i;
      render();
      return;
    }
    if (info.dragCancel) {
      render();
      return;
    }
    if (T.selected >= 0 && E.canMove(g.board, T.selected, i)) {
      tryMove(E.packMove(T.selected, i), true);
      return;
    }
    const v = g.board[i];
    T.selected = v && E.ownerOf(v) === g.turn && T.selected !== i ? i : -1;
    if (T.selected >= 0) sound.play('select');
    render();
  }

  function tryMove(m, slide) {
    const s = TUTORIAL[step];
    const g = T.game;
    const from = E.moveFrom(m);
    const to = E.moveTo(m);
    const captured = g.board[to];
    const text = E.notation(g.board, m);
    const ok = s.accept === 'any' || s.accept.includes(text);
    if (!ok) {
      sound.play('error');
      $('tut-feedback').textContent = 'Not that one. Read the instruction again and try another move.';
      $('tut-feedback').className = 'feedback bad';
      T.selected = -1;
      render();
      return;
    }
    T.game = E.play(g, m);
    T.selected = -1;
    T.done = true;
    sound.play(captured ? 'capture' : 'move');
    render({ from, to, captured, slide });
    $('tut-feedback').textContent = s.done;
    $('tut-feedback').className = 'feedback good';
    $('tut-next').hidden = false;
  }

  function next() {
    const s = TUTORIAL[step];
    if (s.finish) {
      finish();
      return;
    }
    step += 1;
    show();
  }

  return { open };
}
