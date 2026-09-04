// Board rendering shared by the game, the puzzles, the tutorial and the
// diagrams. Supports click-to-move, drag and drop, board flipping, arrows,
// and small animations.

import {
  CELLS, SIZE, FILES, HOME, PLAYER_NAMES, TYPE_NAMES,
  col, row, ownerOf, typeOf, dist,
} from './engine.js';

const GLYPHS = {
  rock: '<path d="M6 14 8 8 14 5 19 9 18 16 12 19 7 18Z"/><path d="M8 8l5 4 5 4M13 12l-1 7"/>',
  paper: '<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4M10 12h5M10 16h5"/>',
  scissors: '<circle cx="7.5" cy="17.5" r="2.5"/><circle cx="16.5" cy="17.5" r="2.5"/><path d="M9.3 15.6 17 4M14.7 15.6 7 4"/>',
};

export function pieceSvg(type) {
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${GLYPHS[TYPE_NAMES[type]]}</svg>`;
}

const LETTERS = ['R', 'P', 'S'];

export function pieceHtml(v, extra = '') {
  return `<div class="piece ${PLAYER_NAMES[ownerOf(v)]} ${TYPE_NAMES[typeOf(v)]} ${extra}" data-letter="${LETTERS[typeOf(v)]}">${pieceSvg(typeOf(v))}</div>`;
}

const DYNAMIC = ['selected', 'target', 'capture', 'last', 'ring-odd', 'attacked', 'threat',
  'hint-from', 'hint-to', 'drop-hover', 'draggable',
  'mark-ok', 'mark-no', 'mark-path', 'mark-danger', 'mark-goal'];

// Build a board inside `root`. Options:
//   interactive  cells respond to clicks and drags
//   compact      no coordinates or evaluation bar (diagrams)
//   onCell(i)    a cell was clicked
//   onDrop(from, to)  a piece was dragged and released on a legal target
//   canDrag(i)   may the piece on cell i be dragged right now
//   targetsFor(i) legal targets for the piece on cell i (used while dragging)
export function createBoard(root, options = {}) {
  const {
    interactive = false, compact = false,
    onCell = null, onDrop = null, canDrag = null, targetsFor = null,
  } = options;

  root.classList.add('board-frame');
  if (compact) root.classList.add('compact');
  root.innerHTML = `
    <div class="eval-bar" hidden><div class="fill"></div><div class="mid"></div></div>
    <div class="ranks" aria-hidden="true"></div>
    <div class="board-area">
      <div class="board ${interactive ? '' : 'diagram'}" role="grid" aria-label="Board"></div>
      <svg class="arrows" viewBox="0 0 9 9" aria-hidden="true"></svg>
      <div class="drag-layer"></div>
    </div>
    <div class="files" aria-hidden="true"></div>`;

  const grid = root.querySelector('.board');
  const area = root.querySelector('.board-area');
  const arrows = root.querySelector('.arrows');
  const dragLayer = root.querySelector('.drag-layer');
  const ranks = root.querySelector('.ranks');
  const files = root.querySelector('.files');
  const evalBar = root.querySelector('.eval-bar');

  const cells = new Array(CELLS);
  const values = new Uint8Array(CELLS);
  let flipped = false;
  let lastState = {};

  for (let i = 0; i < CELLS; i++) {
    const cell = document.createElement(interactive ? 'button' : 'div');
    cell.className = 'cell';
    if (interactive) cell.type = 'button';
    if ((row(i) + col(i)) % 2 === 1) cell.classList.add('dark');
    if (i === HOME[0]) cell.classList.add('home-blue');
    if (i === HOME[1]) cell.classList.add('home-red');
    cell.dataset.cell = i;
    cell.setAttribute('aria-label', FILES[col(i)] + (row(i) + 1));
    cells[i] = cell;
    grid.appendChild(cell);
  }

  // Display position (0..8 from the top-left) for a cell, honouring the flip.
  function displayCol(i) {
    return flipped ? SIZE - 1 - col(i) : col(i);
  }

  function displayRow(i) {
    return flipped ? row(i) : SIZE - 1 - row(i);
  }

  function layout() {
    for (let i = 0; i < CELLS; i++) {
      cells[i].style.order = displayRow(i) * SIZE + displayCol(i);
    }
    const rankOrder = [];
    const fileOrder = [];
    for (let k = 0; k < SIZE; k++) {
      rankOrder.push(flipped ? k + 1 : SIZE - k);
      fileOrder.push(FILES[flipped ? SIZE - 1 - k : k]);
    }
    ranks.innerHTML = rankOrder.map((r) => `<span>${r}</span>`).join('');
    files.innerHTML = fileOrder.map((f) => `<span>${f}</span>`).join('');
  }

  layout();

  function setFlip(value) {
    if (flipped === !!value) return;
    flipped = !!value;
    layout();
    redrawArrows();
  }

  function cellAt(clientX, clientY) {
    const r = grid.getBoundingClientRect();
    const x = (clientX - r.left) / r.width;
    const y = (clientY - r.top) / r.height;
    if (x < 0 || x >= 1 || y < 0 || y >= 1) return -1;
    const dc = Math.floor(x * SIZE);
    const dr = Math.floor(y * SIZE);
    const c = flipped ? SIZE - 1 - dc : dc;
    const rr = flipped ? dr : SIZE - 1 - dr;
    return rr * SIZE + c;
  }

  // Rendering ---------------------------------------------------------

  function render(board, state = {}) {
    lastState = state;
    const {
      selected = -1, targets = [], lastMove = null, rings = null,
      marks = null, labels = null, animate = null, ghosts = null,
      attacked = null, threats = null, hint = null, draggable = null,
    } = state;
    const targetSet = new Set(targets);
    const attackedSet = new Set(attacked || []);
    const threatSet = new Set(threats || []);
    for (let i = 0; i < CELLS; i++) {
      const cell = cells[i];
      cell.classList.remove(...DYNAMIC);
      const v = board[i];
      if (values[i] !== v) {
        const old = cell.querySelector('.piece:not(.captured-anim)');
        if (old) old.remove();
        if (v) cell.insertAdjacentHTML('beforeend', pieceHtml(v));
        values[i] = v;
      }
      if (i === selected) cell.classList.add('selected');
      if (targetSet.has(i)) cell.classList.add(v ? 'capture' : 'target');
      if (lastMove && (i === lastMove.from || i === lastMove.to)) cell.classList.add('last');
      if (attackedSet.has(i)) cell.classList.add('attacked');
      if (threatSet.has(i)) cell.classList.add('threat');
      if (hint && i === hint.from) cell.classList.add('hint-from');
      if (hint && i === hint.to) cell.classList.add('hint-to');
      if (draggable && v && draggable(i)) cell.classList.add('draggable');
      let ringEl = cell.querySelector('.ringno');
      if (rings !== null && rings !== undefined) {
        const d = dist(i, HOME[rings]);
        if (!ringEl) {
          ringEl = document.createElement('span');
          ringEl.className = 'ringno';
          cell.appendChild(ringEl);
        }
        ringEl.textContent = d;
        if (d % 2 === 1) cell.classList.add('ring-odd');
      } else if (ringEl) {
        ringEl.remove();
      }
      if (marks && marks[i]) cell.classList.add('mark-' + marks[i]);
      let labelEl = cell.querySelector('.label');
      if (labels && labels[i] !== undefined) {
        if (!labelEl) {
          labelEl = document.createElement('span');
          labelEl.className = 'label';
          cell.appendChild(labelEl);
        }
        labelEl.textContent = labels[i];
      } else if (labelEl) {
        labelEl.remove();
      }
      const ghost = cell.querySelector('.piece.ghost');
      if (ghost) ghost.remove();
      if (ghosts && ghosts[i] && !v) cell.insertAdjacentHTML('beforeend', pieceHtml(ghosts[i], 'ghost'));
    }
    if (animate) animateMove(animate);
  }

  function animateMove({ from, to, captured = 0, slide = true }) {
    const piece = cells[to].querySelector('.piece:not(.ghost):not(.captured-anim)');
    if (captured) {
      const gone = document.createElement('div');
      gone.innerHTML = pieceHtml(captured, 'captured-anim');
      const el = gone.firstElementChild;
      cells[to].appendChild(el);
      setTimeout(() => el.remove(), 450);
      cells[to].classList.remove('flash');
      cells[to].getBoundingClientRect();
      cells[to].classList.add('flash');
    }
    if (!piece || !slide) return;
    const a = cells[from].getBoundingClientRect();
    const b = cells[to].getBoundingClientRect();
    const dx = a.left - b.left;
    const dy = a.top - b.top;
    piece.style.transition = 'none';
    piece.style.transform = `translate(${dx}px, ${dy}px)`;
    piece.getBoundingClientRect();
    piece.style.transition = 'transform 180ms cubic-bezier(0.2, 0.8, 0.2, 1)';
    piece.style.transform = '';
    piece.addEventListener('transitionend', () => {
      piece.style.transition = '';
    }, { once: true });
  }

  // Arrows -----------------------------------------------------------

  let arrowList = [];

  function center(i) {
    return [displayCol(i) + 0.5, displayRow(i) + 0.5];
  }

  function redrawArrows() {
    arrows.innerHTML = '';
    for (const { from, to, cls } of arrowList) {
      const [x1, y1] = center(from);
      const [x2, y2] = center(to);
      const dx = x2 - x1;
      const dy = y2 - y1;
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len;
      const uy = dy / len;
      const headLen = 0.32;
      const ex = x2 - ux * 0.22;
      const ey = y2 - uy * 0.22;
      const sx = x1 + ux * 0.28;
      const sy = y1 + uy * 0.28;
      const bx = ex - ux * headLen;
      const by = ey - uy * headLen;
      const px = -uy * 0.2;
      const py = ux * 0.2;
      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      if (cls) g.setAttribute('class', cls);
      g.innerHTML = `<path d="M${sx} ${sy} L${bx} ${by}"/>`
        + `<path class="head" d="M${ex} ${ey} L${bx + px} ${by + py} L${bx - px} ${by - py} Z"/>`;
      arrows.appendChild(g);
    }
  }

  function setArrows(list) {
    arrowList = list || [];
    redrawArrows();
  }

  // Evaluation bar ---------------------------------------------------

  function setEval(blueShare) {
    if (blueShare === null || blueShare === undefined) {
      evalBar.hidden = true;
      return;
    }
    evalBar.hidden = false;
    evalBar.querySelector('.fill').style.height = `${Math.round(blueShare * 100)}%`;
  }

  // Interaction ------------------------------------------------------

  if (interactive) {
    let drag = null;

    grid.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      const cell = e.target.closest('.cell');
      if (!cell) return;
      const i = Number(cell.dataset.cell);
      if (!(canDrag && canDrag(i)) || !values[i]) return;
      const pieceEl = cell.querySelector('.piece');
      if (!pieceEl) return;
      drag = {
        from: i,
        startX: e.clientX,
        startY: e.clientY,
        moved: false,
        pointerId: e.pointerId,
        targets: new Set(targetsFor ? targetsFor(i) : []),
        ghost: null,
        pieceEl,
        hover: -1,
      };
      try {
        grid.setPointerCapture(e.pointerId);
      } catch {
        // Pointer capture is optional.
      }
      e.preventDefault();
    });

    grid.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.pointerId) return;
      const dx = e.clientX - drag.startX;
      const dy = e.clientY - drag.startY;
      if (!drag.moved) {
        if (Math.hypot(dx, dy) < 5) return;
        drag.moved = true;
        grid.classList.add('dragging');
        drag.pieceEl.classList.add('lifted');
        const ghost = document.createElement('div');
        ghost.className = 'drag-ghost';
        ghost.innerHTML = pieceHtml(values[drag.from]);
        const size = cells[drag.from].getBoundingClientRect().width;
        ghost.style.width = `${size}px`;
        ghost.style.height = `${size}px`;
        ghost.firstElementChild.style.width = '80%';
        ghost.firstElementChild.style.height = '80%';
        ghost.style.display = 'grid';
        ghost.style.placeItems = 'center';
        dragLayer.appendChild(ghost);
        drag.ghost = ghost;
        if (onCell) onCell(drag.from, { dragStart: true });
      }
      const r = area.getBoundingClientRect();
      drag.ghost.style.left = `${e.clientX - r.left}px`;
      drag.ghost.style.top = `${e.clientY - r.top}px`;
      const over = cellAt(e.clientX, e.clientY);
      if (over !== drag.hover) {
        if (drag.hover >= 0) cells[drag.hover].classList.remove('drop-hover');
        drag.hover = over;
        if (over >= 0 && drag.targets.has(over)) cells[over].classList.add('drop-hover');
      }
    });

    function endDrag(e, cancelled) {
      if (!drag || (e && e.pointerId !== drag.pointerId)) return;
      const d = drag;
      drag = null;
      grid.classList.remove('dragging');
      if (d.hover >= 0) cells[d.hover].classList.remove('drop-hover');
      if (d.ghost) d.ghost.remove();
      d.pieceEl.classList.remove('lifted');
      try {
        grid.releasePointerCapture(d.pointerId);
      } catch {
        // Nothing to release.
      }
      if (!d.moved) {
        if (!cancelled && onCell) onCell(d.from, { click: true });
        return;
      }
      const over = cancelled || !e ? -1 : cellAt(e.clientX, e.clientY);
      if (over >= 0 && d.targets.has(over) && onDrop) {
        onDrop(d.from, over);
      } else if (onCell) {
        onCell(d.from, { dragCancel: true });
      }
    }

    // The browser fires a click right after the pointerup that already
    // handled a piece; remember it so that click is not processed twice.
    let handled = { cell: -1, at: 0 };

    grid.addEventListener('pointerup', (e) => {
      const wasDrag = drag ? drag.from : -1;
      endDrag(e, false);
      if (wasDrag >= 0) handled = { cell: wasDrag, at: Date.now() };
    });
    grid.addEventListener('pointercancel', (e) => endDrag(e, true));

    // Clicks on cells that were not handled by the pointer path: empty
    // squares, enemy pieces, and keyboard activation of any cell.
    grid.addEventListener('click', (e) => {
      const cell = e.target.closest('.cell');
      if (!cell) return;
      const i = Number(cell.dataset.cell);
      if (i === handled.cell && Date.now() - handled.at < 400) return;
      if (onCell) onCell(i, { click: true });
    });

    grid.addEventListener('keydown', (e) => {
      const cell = e.target.closest('.cell');
      if (!cell) return;
      const i = Number(cell.dataset.cell);
      const c = col(i);
      const r = row(i);
      let next = -1;
      const h = flipped ? -1 : 1;
      if (e.key === 'ArrowLeft') next = c - h >= 0 && c - h < SIZE ? i - h : -1;
      if (e.key === 'ArrowRight') next = c + h >= 0 && c + h < SIZE ? i + h : -1;
      if (e.key === 'ArrowUp') next = r + h >= 0 && r + h < SIZE ? i + h * SIZE : -1;
      if (e.key === 'ArrowDown') next = r - h >= 0 && r - h < SIZE ? i - h * SIZE : -1;
      if (next >= 0) {
        e.preventDefault();
        cells[next].focus();
      }
    });
  }

  return {
    render, setFlip, setArrows, setEval, cells, root, grid,
    get flipped() { return flipped; },
    get state() { return lastState; },
  };
}
