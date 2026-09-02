// Board rendering shared by the game, the puzzles and the lesson diagrams.

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

export function pieceHtml(v, extra = '') {
  return `<span class="piece ${PLAYER_NAMES[ownerOf(v)]} ${extra}">${pieceSvg(typeOf(v))}</span>`;
}

// Build a board inside `root`. Returns an object with a render method.
export function createBoard(root, { interactive = false, onCell = null, coords = true } = {}) {
  root.classList.add('board');
  if (!interactive) root.classList.add('diagram');
  root.innerHTML = '';
  const cells = new Array(CELLS);
  const values = new Uint8Array(CELLS);
  // Rank 9 is drawn at the top, rank 1 at the bottom.
  for (let r = SIZE - 1; r >= 0; r--) {
    for (let c = 0; c < SIZE; c++) {
      const i = r * SIZE + c;
      const cell = document.createElement(interactive ? 'button' : 'div');
      cell.className = 'cell';
      if (interactive) cell.type = 'button';
      if ((r + c) % 2 === 1) cell.classList.add('dark');
      if (i === HOME[0]) cell.classList.add('home-blue');
      if (i === HOME[1]) cell.classList.add('home-red');
      cell.dataset.cell = i;
      cell.setAttribute('aria-label', FILES[c] + (r + 1));
      if (coords) {
        if (r === 0) cell.insertAdjacentHTML('beforeend', `<span class="coord file">${FILES[c]}</span>`);
        if (c === 0) cell.insertAdjacentHTML('beforeend', `<span class="coord rank">${r + 1}</span>`);
      }
      cells[i] = cell;
      root.appendChild(cell);
    }
  }
  if (interactive && onCell) {
    root.addEventListener('click', (e) => {
      const cell = e.target.closest('.cell');
      if (cell) onCell(Number(cell.dataset.cell));
    });
  }

  const dynamic = ['selected', 'target', 'capture', 'last', 'ring-odd',
    'mark-ok', 'mark-no', 'mark-path', 'mark-danger', 'mark-goal'];

  function render(board, opts = {}) {
    const {
      selected = -1, targets = [], lastMove = null, rings = null,
      marks = null, labels = null, animate = null, ghosts = null,
    } = opts;
    const targetSet = new Set(targets);
    for (let i = 0; i < CELLS; i++) {
      const cell = cells[i];
      cell.classList.remove(...dynamic);
      const v = board[i];
      if (values[i] !== v) {
        const old = cell.querySelector('.piece');
        if (old) old.remove();
        if (v) cell.insertAdjacentHTML('beforeend', pieceHtml(v));
        values[i] = v;
      }
      if (i === selected) cell.classList.add('selected');
      if (targetSet.has(i)) cell.classList.add(v ? 'capture' : 'target');
      if (lastMove && (i === lastMove.from || i === lastMove.to)) cell.classList.add('last');
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
    if (animate) slide(animate.from, animate.to, animate.capture);
  }

  function slide(from, to, capture) {
    const piece = cells[to].querySelector('.piece:not(.ghost)');
    if (!piece) return;
    const a = cells[from].getBoundingClientRect();
    const b = cells[to].getBoundingClientRect();
    const dx = a.left - b.left;
    const dy = a.top - b.top;
    piece.style.transition = 'none';
    piece.style.transform = `translate(${dx}px, ${dy}px)`;
    // Force layout so the transition runs from the old position.
    piece.getBoundingClientRect();
    piece.style.transition = 'transform 170ms ease';
    piece.style.transform = '';
    piece.addEventListener('transitionend', () => {
      piece.style.transition = '';
    }, { once: true });
    if (capture) {
      cells[to].classList.remove('flash');
      cells[to].getBoundingClientRect();
      cells[to].classList.add('flash');
    }
  }

  return { render, cells, root };
}

export { col, row };
