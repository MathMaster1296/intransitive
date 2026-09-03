// The strategy guide: table of contents, animated lines, try-it positions,
// quizzes, the ring finder, the position lab and endgame practice.

import * as E from './engine.js';
import { createBoard, pieceHtml } from './board.js';
import { engine } from './analysis.js';
import { sound } from './sound.js';
import { boardFrom, STRATEGY_LINES, TRYITS, QUIZZES, ENDGAMES, LAB_PRESETS } from './lessons.js';

const $ = (id) => document.getElementById(id);
const WIN = 100000;

function cap(s) {
  return s[0].toUpperCase() + s.slice(1);
}

function movesFromText(board, turn, text) {
  const g0 = E.newGame(board, turn);
  const g = E.parseMoves(text, { board, turn });
  return { start: g0, moves: g.moves.map((m) => m.m) };
}

// Animated line -------------------------------------------------------------

function createLine(root, data) {
  const board = boardFrom(data.spec);
  const { moves } = movesFromText(board, data.turn, data.moves);
  const total = moves.length;
  root.classList.add('widget');
  root.innerHTML = `
    <div class="widget-head"><h3>${data.title}</h3><span class="widget-tag">Play the line</span></div>
    <div class="widget-body">
      <div class="line-board"></div>
      <div>
        <div class="line-move"></div>
        <div class="line-caption"></div>
        <div class="line-steps"></div>
        <div class="line-controls">
          <button class="btn small" data-act="first" title="Start"><svg><use href="#i-first"/></svg></button>
          <button class="btn small" data-act="prev" title="Back"><svg><use href="#i-prev"/></svg></button>
          <button class="btn small primary" data-act="play">Play</button>
          <button class="btn small" data-act="next" title="Next"><svg><use href="#i-next"/></svg></button>
        </div>
      </div>
    </div>`;
  const b = createBoard(root.querySelector('.line-board'), { interactive: false });
  let n = 0;
  let timer = null;
  const games = [E.newGame(board, data.turn)];
  for (const m of moves) games.push(E.play(games[games.length - 1], m));

  function render(animate) {
    const g = games[n];
    const last = n > 0 ? { from: E.moveFrom(moves[n - 1]), to: E.moveTo(moves[n - 1]) } : null;
    const captured = n > 0 && games[n - 1].board[last.to] ? games[n - 1].board[last.to] : 0;
    b.render(g.board, {
      lastMove: last,
      rings: data.rings === undefined ? null : data.rings,
      marks: n === 0 && data.marks ? data.marks : null,
      animate: animate && last ? { from: last.from, to: last.to, captured } : null,
    });
    const mv = n > 0 ? games[n - 1].moves.length : 0;
    root.querySelector('.line-move').textContent = n > 0
      ? `${Math.ceil(n / 2)}${n % 2 ? '.' : '...'} ${g.moves[g.moves.length - 1].notation}`
      : 'Starting position';
    root.querySelector('.line-caption').textContent = n === 0 ? data.intro : data.captions[n - 1] || '';
    root.querySelector('.line-steps').innerHTML = moves.map((x, i) => `<i class="${i < n ? 'done' : ''}"></i>`).join('');
    root.querySelector('[data-act="prev"]').disabled = n === 0;
    root.querySelector('[data-act="next"]').disabled = n >= total;
    root.querySelector('[data-act="play"]').textContent = timer ? 'Pause' : n >= total ? 'Replay' : 'Play';
    void mv;
  }

  function stop() {
    clearTimeout(timer);
    timer = null;
  }

  function step(delta, animate = true) {
    n = Math.max(0, Math.min(total, n + delta));
    render(animate);
  }

  function play() {
    if (timer) {
      stop();
      render(false);
      return;
    }
    if (n >= total) n = 0;
    render(false);
    const tick = () => {
      if (n >= total) {
        stop();
        render(false);
        return;
      }
      step(1);
      timer = setTimeout(tick, 1500);
    };
    timer = setTimeout(tick, 900);
  }

  root.querySelector('.line-controls').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const act = btn.dataset.act;
    if (act === 'play') play();
    else {
      stop();
      if (act === 'first') { n = 0; render(false); }
      if (act === 'prev') step(-1, false);
      if (act === 'next') step(1);
    }
  });
  render(false);
}

// Try it --------------------------------------------------------------------

function createTryIt(root, data, ui) {
  root.classList.add('widget');
  root.innerHTML = `
    <div class="widget-head"><h3>${data.title}</h3><span class="widget-tag">Try it</span></div>
    <div class="widget-body">
      <div class="try-board"></div>
      <div>
        <p class="muted small" style="margin:0 0 0.3rem">${cap(E.PLAYER_NAMES[data.turn])} to move. Click a piece, then a square, or drag.</p>
        <p style="margin:0 0 0.6rem">${data.prompt}</p>
        <div class="feedback" aria-live="polite"></div>
        <div class="row" style="margin-top:0.6rem">
          <button class="btn small" data-act="reset">Reset</button>
          <button class="btn small" data-act="show">Show me</button>
        </div>
      </div>
    </div>`;
  const feedback = root.querySelector('.feedback');
  let T;
  const board = createBoard(root.querySelector('.try-board'), {
    interactive: true,
    onCell,
    onDrop: (from, to) => attempt(E.packMove(from, to), false),
    canDrag: (i) => !T.done && E.ownerOf(T.game.board[i]) === T.game.turn,
    targetsFor: (i) => E.targetsFrom(T.game.board, i),
  });

  function reset() {
    T = { game: E.newGame(boardFrom(data.spec), data.turn), selected: -1, done: false };
    feedback.textContent = '';
    feedback.className = 'feedback';
    render();
  }

  function render(animate) {
    const g = T.game;
    board.render(g.board, {
      selected: T.selected,
      targets: T.selected >= 0 ? E.targetsFrom(g.board, T.selected) : [],
      rings: data.rings === undefined ? null : data.rings,
      lastMove: g.moves.length ? { from: E.moveFrom(g.moves.at(-1).m), to: E.moveTo(g.moves.at(-1).m) } : null,
      draggable: (i) => !T.done && E.ownerOf(g.board[i]) === g.turn,
      animate,
    });
  }

  function onCell(i, info = {}) {
    if (T.done) return;
    const g = T.game;
    if (info.dragStart) { T.selected = i; render(); return; }
    if (info.dragCancel) { render(); return; }
    if (T.selected >= 0 && E.canMove(g.board, T.selected, i)) { attempt(E.packMove(T.selected, i), true); return; }
    const v = g.board[i];
    T.selected = v && E.ownerOf(v) === g.turn && T.selected !== i ? i : -1;
    if (T.selected >= 0) sound.play('select');
    render();
  }

  function attempt(m, slide) {
    const g = T.game;
    const text = E.notation(g.board, m);
    const from = E.moveFrom(m);
    const to = E.moveTo(m);
    const captured = g.board[to];
    const before = g;
    T.game = E.play(g, m);
    T.selected = -1;
    render({ from, to, captured, slide });
    if (data.solutions.includes(text)) {
      T.done = true;
      sound.play('win');
      feedback.textContent = `${text}. ${data.success}`;
      feedback.className = 'feedback good';
    } else {
      sound.play('error');
      feedback.textContent = `${text}? ${data.fail}`;
      feedback.className = 'feedback bad';
      T.done = true;
      setTimeout(() => { T.game = before; T.done = false; render(); }, 900);
    }
  }

  root.querySelector('[data-act="reset"]').addEventListener('click', reset);
  root.querySelector('[data-act="show"]').addEventListener('click', () => {
    reset();
    const g = T.game;
    const m = E.legalMoves(g.board, g.turn).find((x) => E.notation(g.board, x) === data.solutions[0]);
    if (m === undefined) return;
    attempt(m, true);
  });
  reset();
  void ui;
}

// Quiz ----------------------------------------------------------------------

function createQuiz(root, data) {
  root.classList.add('widget');
  root.innerHTML = `
    <div class="widget-head"><h3>${data.title}</h3><span class="widget-tag quiz">Quick check</span></div>
    <div class="widget-body ${data.spec ? '' : 'single'}">
      ${data.spec ? '<div class="quiz-board"></div>' : ''}
      <div>
        <p style="margin:0 0 0.4rem">${data.question}</p>
        <div class="quiz-options">${data.options.map((o, i) => `<button class="btn" data-i="${i}">${o}</button>`).join('')}</div>
        <div class="quiz-explain"></div>
      </div>
    </div>`;
  if (data.spec) {
    const b = createBoard(root.querySelector('.quiz-board'), { interactive: false });
    b.render(boardFrom(data.spec), { rings: data.rings === undefined ? null : data.rings, marks: data.marks || null });
  }
  root.querySelector('.quiz-options').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-i]');
    if (!btn) return;
    const i = Number(btn.dataset.i);
    root.querySelectorAll('.quiz-options .btn').forEach((x) => x.classList.remove('right', 'wrong'));
    btn.classList.add(i === data.answer ? 'right' : 'wrong');
    if (i !== data.answer) root.querySelector(`[data-i="${data.answer}"]`).classList.add('right');
    sound.play(i === data.answer ? 'select' : 'error');
    root.querySelector('.quiz-explain').textContent = (i === data.answer ? 'Right. ' : 'Not quite. ') + data.explain;
  });
}

// Ring finder ---------------------------------------------------------------

function createRingFinder(root) {
  root.classList.add('widget');
  root.innerHTML = `
    <div class="widget-head"><h3>Ring finder</h3><span class="widget-tag lab">Interactive</span></div>
    <div class="widget-body">
      <div class="ring-board"></div>
      <div>
        <div class="ring-legend">
          <span class="muted small">Count from</span>
          <div class="seg"><button type="button" data-corner="0" class="active">blue's corner</button><button type="button" data-corner="1">red's corner</button></div>
        </div>
        <p class="small" style="margin:0 0 0.5rem">Click any square to light up its whole ring. Every square on the ring is the same number of moves from the corner, no matter how far along the edge it sits.</p>
        <div class="feedback ring-text">Click a square.</div>
      </div>
    </div>`;
  const b = createBoard(root.querySelector('.ring-board'), {
    interactive: true,
    onCell: (i) => { picked = i; render(); },
    canDrag: () => false,
  });
  let corner = 0;
  let picked = -1;
  const empty = new Uint8Array(81);
  function render() {
    const marks = {};
    if (picked >= 0) {
      const d = E.dist(picked, E.HOME[corner]);
      for (let i = 0; i < 81; i++) if (E.dist(i, E.HOME[corner]) === d) marks[i] = 'path';
      marks[picked] = 'goal';
      const other = E.dist(picked, E.HOME[1 - corner]);
      root.querySelector('.ring-text').textContent = `${E.cellName(picked)} is on ring ${d} from ${E.PLAYER_NAMES[corner]}'s corner (${d} move${d === 1 ? '' : 's'} away) and ring ${other} from ${E.PLAYER_NAMES[1 - corner]}'s.`;
    }
    b.render(empty, { rings: corner, marks });
  }
  root.querySelector('.seg').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-corner]');
    if (!btn) return;
    corner = Number(btn.dataset.corner);
    root.querySelectorAll('[data-corner]').forEach((x) => x.classList.toggle('active', x === btn));
    render();
  });
  render();
}

// Position lab --------------------------------------------------------------

function createLab(root) {
  root.classList.add('widget');
  const palette = [];
  for (const p of [E.BLUE, E.RED]) for (const t of [0, 1, 2]) palette.push(E.piece(p, t));
  root.innerHTML = `
    <div class="widget-head"><h3>Position lab</h3><span class="widget-tag lab">Ask the engine</span></div>
    <div class="widget-body">
      <div class="lab-board"></div>
      <div>
        <p class="small" style="margin:0 0 0.5rem">Pick a piece, click squares to place it, click a piece to remove it. Then ask who wins the race. Blue runs to i9, red runs to a1.</p>
        <div class="lab-palette">
          ${palette.map((v) => `<button type="button" class="pal" data-v="${v}" title="${E.PLAYER_NAMES[E.ownerOf(v)]} ${E.TYPE_NAMES[E.typeOf(v)]}">${pieceHtml(v)}</button>`).join('')}
          <button type="button" class="pal" data-v="0" title="Erase"><svg class="erase" viewBox="0 0 24 24"><path d="M5 5l14 14M19 5L5 19"/></svg></button>
        </div>
        <div class="row" style="margin-bottom:0.5rem">
          <span class="muted small">To move</span>
          <div class="seg"><button type="button" data-turn="0" class="active">blue</button><button type="button" data-turn="1">red</button></div>
          <button class="btn small primary" data-act="ask">Who wins?</button>
          <button class="btn small" data-act="clear">Clear</button>
        </div>
        <div class="lab-verdict">Place a runner and a defender, then ask.</div>
        <div class="lab-presets"></div>
      </div>
    </div>`;
  let board = new Uint8Array(81);
  let brush = palette[3];
  let turn = E.BLUE;
  let seq = 0;
  let arrow = null;
  const b = createBoard(root.querySelector('.lab-board'), {
    interactive: true,
    onCell: (i) => {
      if (board[i]) board[i] = 0;
      else if (brush) board[i] = brush;
      arrow = null;
      render();
      setVerdict('Position changed. Ask again.', '');
    },
    canDrag: () => false,
  });
  const verdictEl = root.querySelector('.lab-verdict');

  function setVerdict(text, cls) {
    verdictEl.textContent = text;
    verdictEl.className = 'lab-verdict ' + cls;
  }

  function render() {
    b.render(board, { lastMove: null });
    b.setArrows(arrow ? [arrow] : []);
    root.querySelectorAll('.pal').forEach((x) => x.classList.toggle('active', Number(x.dataset.v) === brush));
    root.querySelectorAll('[data-turn]').forEach((x) => x.classList.toggle('active', Number(x.dataset.turn) === turn));
  }

  async function ask() {
    const mover = turn;
    if (!E.hasLegalMove(board, mover)) {
      setVerdict(`${cap(E.PLAYER_NAMES[mover])} has no legal move, so ${E.PLAYER_NAMES[mover]} loses immediately.`, E.PLAYER_NAMES[1 - mover]);
      return;
    }
    const id = ++seq;
    setVerdict('Thinking…', '');
    const r = await engine.analyze(board, mover, 0, { maxDepth: 18, timeMs: 2600, noise: 0 });
    if (id !== seq || !r) return;
    const s = r.score;
    const move = E.notation(board, r.move);
    arrow = { from: E.moveFrom(r.move), to: E.moveTo(r.move), cls: 'best' };
    render();
    if (s >= WIN - 200) {
      const n = Math.ceil((WIN - s) / 2);
      setVerdict(`${cap(E.PLAYER_NAMES[mover])} wins by force in ${n} move${n === 1 ? '' : 's'}, starting with ${move}.`, E.PLAYER_NAMES[mover]);
    } else if (s <= -(WIN - 200)) {
      const n = Math.ceil((WIN + s) / 2);
      setVerdict(`${cap(E.PLAYER_NAMES[1 - mover])} wins by force in ${n} move${n === 1 ? '' : 's'} whatever ${E.PLAYER_NAMES[mover]} does. Best try: ${move}.`, E.PLAYER_NAMES[1 - mover]);
    } else {
      const lead = Math.abs(s) < 40 ? 'The position is level' : `${s > 0 ? cap(E.PLAYER_NAMES[mover]) : cap(E.PLAYER_NAMES[1 - mover])} is better`;
      setVerdict(`No forced win within ${r.depth} plies. ${lead}. The engine suggests ${move}.`, '');
    }
  }

  root.querySelector('.lab-palette').addEventListener('click', (e) => {
    const btn = e.target.closest('.pal');
    if (!btn) return;
    brush = Number(btn.dataset.v);
    render();
  });
  root.querySelector('[data-act="ask"]').addEventListener('click', ask);
  root.querySelector('[data-act="clear"]').addEventListener('click', () => {
    board = new Uint8Array(81);
    arrow = null;
    render();
    setVerdict('Board cleared.', '');
  });
  root.querySelectorAll('[data-turn]').forEach((x) => x.addEventListener('click', () => {
    turn = Number(x.dataset.turn);
    arrow = null;
    render();
  }));
  const presets = root.querySelector('.lab-presets');
  LAB_PRESETS.forEach((p) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn small';
    btn.textContent = p.name;
    btn.addEventListener('click', () => {
      board = boardFrom(p.spec);
      turn = p.turn;
      arrow = null;
      render();
      setVerdict(p.note || 'Preset loaded. Ask who wins.', '');
    });
    presets.appendChild(btn);
  });
  render();
}

// Endgame practice ------------------------------------------------------------

function createEndgames(root, ui) {
  root.classList.add('endgames');
  ENDGAMES.forEach((e) => {
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `<div class="eg-board"></div><h4>${e.title}</h4><p>${e.text}</p><button class="btn small primary" type="button">Play it against the computer</button>`;
    const b = createBoard(card.querySelector('.eg-board'), { interactive: false, compact: true });
    b.render(boardFrom(e.spec));
    card.querySelector('button').addEventListener('click', () => ui.playPosition(boardFrom(e.spec), e.turn, e.turn, e.level || 'medium'));
    root.appendChild(card);
  });
}

// Guide ---------------------------------------------------------------------

export function createStrategy(ui) {
  let ready = false;
  let observer = null;

  function ensure() {
    if (ready) return;
    ready = true;
    const view = $('view-strategy');
    view.querySelectorAll('[data-line]').forEach((el) => createLine(el, STRATEGY_LINES[el.dataset.line]));
    view.querySelectorAll('[data-tryit]').forEach((el) => createTryIt(el, TRYITS[el.dataset.tryit], ui));
    view.querySelectorAll('[data-quiz]').forEach((el) => createQuiz(el, QUIZZES[el.dataset.quiz]));
    const rf = $('ring-finder');
    if (rf) createRingFinder(rf);
    const lab = $('position-lab');
    if (lab) createLab(lab);
    const eg = $('endgame-practice');
    if (eg) createEndgames(eg, ui);

    const links = [...view.querySelectorAll('.toc a')];
    observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((x) => x.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (!visible.length) return;
      const id = visible[0].target.id;
      links.forEach((a) => a.classList.toggle('active', a.getAttribute('href') === `#strategy/${id.replace(/^s-/, '')}`));
    }, { rootMargin: '-20% 0px -60% 0px', threshold: 0 });
    view.querySelectorAll('.chapter').forEach((c) => observer.observe(c));
  }

  let scrolledOnce = false;

  function scrollTo(section) {
    ensure();
    const el = $('s-' + section);
    if (!el) return;
    $('view-strategy').querySelectorAll('.toc a').forEach((a) => {
      a.classList.toggle('active', a.getAttribute('href') === `#strategy/${section}`);
    });
    // The first jump happens while boards are still laying out, so make it
    // instant and let layout settle first.
    const behavior = scrolledOnce ? 'smooth' : 'instant';
    scrolledOnce = true;
    setTimeout(() => el.scrollIntoView({ behavior, block: 'start' }), 60);
  }

  return { ensure, scrollTo };
}
