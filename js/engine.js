// Rules engine for Intransitive.
//
// The board is 9x9. Files run a to i from left to right and ranks 1 to 9 from
// bottom to top, so blue's home corner a1 is index 0 and red's home corner i9
// is index 80. Blue wins by reaching i9, red by reaching a1.
//
// Cell values: 0 is empty, 1 to 3 are blue rock, paper, scissors and 4 to 6 are
// red rock, paper, scissors. Moves are packed as from * 81 + to.

export const SIZE = 9;
export const CELLS = 81;
export const FILES = 'abcdefghi';

export const BLUE = 0;
export const RED = 1;
export const ROCK = 0;
export const PAPER = 1;
export const SCISSORS = 2;

export const PLAYER_NAMES = ['blue', 'red'];
export const TYPE_NAMES = ['rock', 'paper', 'scissors'];
export const TYPE_LETTERS = ['R', 'P', 'S'];

export const HOME = [0, 80];
export const GOAL = [80, 0];
export const STAGNATION_PLIES = 200;

export const EMPTY = 0;

export function piece(player, type) {
  return 1 + player * 3 + type;
}

export function ownerOf(v) {
  return v === 0 ? -1 : ((v - 1) / 3) | 0;
}

export function typeOf(v) {
  return (v - 1) % 3;
}

// Does type a capture type b? Rock beats scissors, paper beats rock,
// scissors beats paper.
export function beats(a, b) {
  return (a - b + 3) % 3 === 1;
}

// The type that captures t.
export function predator(t) {
  return (t + 1) % 3;
}

// The type that t captures.
export function prey(t) {
  return (t + 2) % 3;
}

export function col(i) {
  return i % SIZE;
}

export function row(i) {
  return (i / SIZE) | 0;
}

export function index(c, r) {
  return r * SIZE + c;
}

export function cellName(i) {
  return FILES[col(i)] + (row(i) + 1);
}

export function parseCell(s) {
  if (typeof s !== 'string' || s.length !== 2) return -1;
  const c = FILES.indexOf(s[0].toLowerCase());
  const r = Number(s[1]) - 1;
  if (c < 0 || !(r >= 0 && r < SIZE)) return -1;
  return index(c, r);
}

// Chebyshev distance: the number of king moves between two cells.
export function dist(i, j) {
  return Math.max(Math.abs(col(i) - col(j)), Math.abs(row(i) - row(j)));
}

// Ring number of a cell measured from a player's own corner.
export function ring(i, player) {
  return dist(i, HOME[player]);
}

export const NEIGHBORS = (() => {
  const out = [];
  for (let i = 0; i < CELLS; i++) {
    const c = col(i);
    const r = row(i);
    const list = [];
    for (let dc = -1; dc <= 1; dc++) {
      for (let dr = -1; dr <= 1; dr++) {
        if (dc === 0 && dr === 0) continue;
        const cc = c + dc;
        const rr = r + dr;
        if (cc < 0 || cc >= SIZE || rr < 0 || rr >= SIZE) continue;
        list.push(index(cc, rr));
      }
    }
    out.push(list);
  }
  return out;
})();

// Blue's opening setup. Red's is the same shape reflected across the long
// diagonal that runs from a9 to i1, so a cell (c, r) maps to (8 - r, 8 - c).
export const SETUP = {
  R: ['b4', 'c3', 'd2'],
  P: ['b5', 'c4', 'd3', 'e2'],
  S: ['c5', 'd4', 'e3'],
};

export function mirror(i) {
  return index(SIZE - 1 - row(i), SIZE - 1 - col(i));
}

export function startingBoard() {
  const board = new Uint8Array(CELLS);
  TYPE_LETTERS.forEach((letter, type) => {
    for (const name of SETUP[letter]) {
      const i = parseCell(name);
      board[i] = piece(BLUE, type);
      board[mirror(i)] = piece(RED, type);
    }
  });
  return board;
}

export function packMove(from, to) {
  return from * CELLS + to;
}

export function moveFrom(m) {
  return (m / CELLS) | 0;
}

export function moveTo(m) {
  return m % CELLS;
}

// Can the piece on `from` legally move to `to`?
export function canMove(board, from, to) {
  const v = board[from];
  if (!v || dist(from, to) !== 1) return false;
  const w = board[to];
  if (w === 0) return true;
  if (ownerOf(w) === ownerOf(v)) return false;
  return beats(typeOf(v), typeOf(w));
}

// Legal destination cells for the piece on `from`.
export function targetsFrom(board, from) {
  const v = board[from];
  const out = [];
  if (!v) return out;
  const owner = ownerOf(v);
  const type = typeOf(v);
  for (const to of NEIGHBORS[from]) {
    const w = board[to];
    if (w === 0) {
      out.push(to);
    } else if (ownerOf(w) !== owner && beats(type, typeOf(w))) {
      out.push(to);
    }
  }
  return out;
}

export function legalMoves(board, player) {
  const out = [];
  for (let from = 0; from < CELLS; from++) {
    const v = board[from];
    if (!v || ownerOf(v) !== player) continue;
    const type = typeOf(v);
    for (const to of NEIGHBORS[from]) {
      const w = board[to];
      if (w === 0 || (ownerOf(w) !== player && beats(type, typeOf(w)))) {
        out.push(packMove(from, to));
      }
    }
  }
  return out;
}

export function hasLegalMove(board, player) {
  for (let from = 0; from < CELLS; from++) {
    const v = board[from];
    if (!v || ownerOf(v) !== player) continue;
    const type = typeOf(v);
    for (const to of NEIGHBORS[from]) {
      const w = board[to];
      if (w === 0 || (ownerOf(w) !== player && beats(type, typeOf(w)))) {
        return true;
      }
    }
  }
  return false;
}

export function pieceCount(board, player) {
  let n = 0;
  for (let i = 0; i < CELLS; i++) {
    if (board[i] && ownerOf(board[i]) === player) n++;
  }
  return n;
}

// Piece counts as [[rocks, papers, scissors] for blue, same for red].
export function counts(board) {
  const out = [[0, 0, 0], [0, 0, 0]];
  for (let i = 0; i < CELLS; i++) {
    const v = board[i];
    if (v) out[ownerOf(v)][typeOf(v)]++;
  }
  return out;
}

export function applyMove(board, m) {
  const next = new Uint8Array(board);
  const from = moveFrom(m);
  const to = moveTo(m);
  next[to] = next[from];
  next[from] = 0;
  return next;
}

export function notation(board, m) {
  const from = moveFrom(m);
  const to = moveTo(m);
  return cellName(from) + (board[to] ? 'x' : '-') + cellName(to);
}

// A game is an immutable record. `play` returns a new game. A game can start
// from any position, which the puzzles and the tutorial use.
export function newGame(board = startingBoard(), turn = BLUE) {
  return {
    start: { board: new Uint8Array(board), turn },
    board: new Uint8Array(board),
    turn,
    moves: [],
    boards: [],
    sinceCapture: 0,
    result: null,
  };
}

// Board after the first `n` plies of the game (n = moves.length is the
// current board).
export function boardAt(game, n) {
  if (n >= game.moves.length) return game.board;
  return game.boards[n].board;
}

// Which pieces are attacked: a piece is attacked when an adjacent enemy piece
// beats it. Returns an array of cell indexes.
export function attackedCells(board) {
  const out = [];
  for (let i = 0; i < CELLS; i++) {
    const v = board[i];
    if (!v) continue;
    const owner = ownerOf(v);
    const type = typeOf(v);
    for (const n of NEIGHBORS[i]) {
      const w = board[n];
      if (w && ownerOf(w) !== owner && beats(typeOf(w), type)) {
        out.push(i);
        break;
      }
    }
  }
  return out;
}

export function play(game, m) {
  if (game.result) throw new Error('The game is over.');
  const from = moveFrom(m);
  const to = moveTo(m);
  const v = game.board[from];
  if (!v || ownerOf(v) !== game.turn) throw new Error('Not your piece.');
  if (!canMove(game.board, from, to)) throw new Error('Illegal move.');

  const capture = game.board[to] !== 0;
  const board = applyMove(game.board, m);
  const player = game.turn;
  const opponent = 1 - player;
  const sinceCapture = capture ? 0 : game.sinceCapture + 1;

  let result = null;
  if (to === GOAL[player]) {
    result = { winner: player, reason: 'corner' };
  } else if (pieceCount(board, opponent) === 0) {
    result = { winner: player, reason: 'no_pieces' };
  } else if (!hasLegalMove(board, opponent)) {
    result = { winner: player, reason: 'no_moves' };
  } else if (sinceCapture >= STAGNATION_PLIES) {
    result = { winner: null, reason: 'stagnation' };
  }

  return {
    start: game.start,
    board,
    turn: opponent,
    moves: game.moves.concat([{ m, capture, notation: notation(game.board, m), player }]),
    boards: game.boards.concat([{ board: game.board, sinceCapture: game.sinceCapture }]),
    sinceCapture,
    result,
  };
}

export function undo(game) {
  if (!game.moves.length) return game;
  const prev = game.boards[game.boards.length - 1];
  return {
    start: game.start,
    board: prev.board,
    turn: 1 - game.turn,
    moves: game.moves.slice(0, -1),
    boards: game.boards.slice(0, -1),
    sinceCapture: prev.sinceCapture,
    result: null,
  };
}

export function resign(game, player) {
  if (game.result) return game;
  return { ...game, result: { winner: 1 - player, reason: 'resign' } };
}

export function resultToken(result) {
  if (!result) return '';
  if (result.winner === BLUE) return '1-0';
  if (result.winner === RED) return '0-1';
  return '0-0';
}

// Move list in chess-style notation, such as
// "1. c5-d6 e7-d6 2. d4xd5 ...".
export function movesText(game) {
  const parts = [];
  game.moves.forEach((mv, i) => {
    if (i % 2 === 0) parts.push(`${i / 2 + 1}.`);
    parts.push(mv.notation);
  });
  const token = resultToken(game.result);
  if (token) parts.push(token);
  return parts.join(' ');
}

const MOVE_RE = /^([a-i][1-9])([-x])([a-i][1-9])$/i;
const NUMBER_RE = /^\d+\.$/;
const RESULT_RE = /^(1-0|0-1|0-0)\.?$/;

// Rebuild a game from pasted move text. Throws with a readable message on the
// first token that does not work.
export function parseMoves(text, start = null) {
  const tokens = String(text || '').trim().split(/\s+/).filter(Boolean);
  let game = start ? newGame(start.board, start.turn) : newGame();
  for (const raw of tokens) {
    if (NUMBER_RE.test(raw) || RESULT_RE.test(raw) || raw === '.') continue;
    const mt = MOVE_RE.exec(raw);
    if (!mt) throw new Error(`"${raw}" is not a move.`);
    if (game.result) throw new Error(`The game already ended before "${raw}".`);
    const from = parseCell(mt[1]);
    const to = parseCell(mt[3]);
    const v = game.board[from];
    if (!v || ownerOf(v) !== game.turn || !canMove(game.board, from, to)) {
      throw new Error(`"${raw}" is not legal at that point.`);
    }
    game = play(game, packMove(from, to));
  }
  return game;
}

export function describeResult(result) {
  if (!result) return '';
  const who = result.winner === null ? null : PLAYER_NAMES[result.winner];
  const cap = who ? who[0].toUpperCase() + who.slice(1) : '';
  switch (result.reason) {
    case 'corner':
      return `${cap} wins by reaching the corner.`;
    case 'no_pieces':
      return `${cap} wins. The other side has no pieces left.`;
    case 'no_moves':
      return `${cap} wins. The other side has no legal moves.`;
    case 'stagnation':
      return 'Draw by stagnation: 100 moves with no captures.';
    case 'resign':
      return `${cap} wins by resignation.`;
    default:
      return 'Game over.';
  }
}

// Compact move encoding for share links: two lowercase letters per ply. The
// first letter pair encodes the origin cell and the direction of the step.
const LETTERS = 'abcdefghijklmnopqrstuvwxyz';
const DIRS = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];

export function encodeMoves(game) {
  let out = '';
  for (const mv of game.moves) {
    const from = moveFrom(mv.m);
    const to = moveTo(mv.m);
    const dc = col(to) - col(from);
    const dr = row(to) - row(from);
    const dir = DIRS.findIndex(([a, b]) => a === dc && b === dr);
    const code = from * 8 + dir;
    out += LETTERS[(code / 26) | 0] + LETTERS[code % 26];
  }
  return out;
}

// Replays an encoded move string from the standard opening. Throws when the
// string does not describe a legal game.
export function decodeMoves(text) {
  const s = String(text || '');
  if (s.length % 2 !== 0) throw new Error('That link is not a valid game.');
  let game = newGame();
  for (let i = 0; i < s.length; i += 2) {
    const a = LETTERS.indexOf(s[i]);
    const b = LETTERS.indexOf(s[i + 1]);
    if (a < 0 || b < 0) throw new Error('That link is not a valid game.');
    const code = a * 26 + b;
    const from = (code / 8) | 0;
    const [dc, dr] = DIRS[code % 8];
    const c = col(from) + dc;
    const r = row(from) + dr;
    if (from >= CELLS || c < 0 || c >= SIZE || r < 0 || r >= SIZE) throw new Error('That link is not a valid game.');
    const to = index(c, r);
    if (game.result) throw new Error('That link has moves after the game ended.');
    const v = game.board[from];
    if (!v || ownerOf(v) !== game.turn || !canMove(game.board, from, to)) {
      throw new Error('That link contains an illegal move.');
    }
    game = play(game, packMove(from, to));
  }
  return game;
}
