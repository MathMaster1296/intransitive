// Computer opponent: iterative deepening alpha-beta with a capture-only
// quiescence search. The evaluation follows the game's strategy notes:
// material, matchup (piece distribution), macro position (rings from the
// corners), and a check for runners nobody can stop.

import {
  CELLS, GOAL, HOME, NEIGHBORS, STAGNATION_PLIES,
  ownerOf, typeOf, beats, predator, prey, dist, col, row,
  packMove, moveFrom, moveTo,
} from './engine.js';

export const WIN = 100000;
const RACE_BONUS = 1800;

const DIST_TO_GOAL = [new Int8Array(CELLS), new Int8Array(CELLS)];
for (let i = 0; i < CELLS; i++) {
  DIST_TO_GOAL[0][i] = dist(i, GOAL[0]);
  DIST_TO_GOAL[1][i] = dist(i, GOAL[1]);
}

// Which side of the ring a cell sits on, relative to a corner: 0 for the
// diagonal, 1 when it is further along the files, 2 when further along the
// ranks. Two pieces on the same side can shadow each other; pieces on
// different sides cannot catch up.
function side(i, corner) {
  const dc = Math.abs(col(i) - col(corner));
  const dr = Math.abs(row(i) - row(corner));
  if (dc === dr) return 0;
  return dc > dr ? 1 : 2;
}

// Distance (in the runner's own moves) of the closest piece of `p` that the
// other side cannot stop by blocking the corner or capturing it. Infinity
// when every runner can be answered.
function unstoppableRunner(board, p, pToMove) {
  const goal = GOAL[p];
  const dg = DIST_TO_GOAL[p];
  let best = Infinity;
  for (let i = 0; i < CELLS; i++) {
    const v = board[i];
    if (!v || ownerOf(v) !== p) continue;
    const d = dg[i];
    if (d >= best) continue;
    const t = typeOf(v);
    const runnerSide = side(i, goal);
    let stoppable = false;
    for (let j = 0; j < CELLS && !stoppable; j++) {
      const w = board[j];
      if (!w || ownerOf(w) === p) continue;
      const tw = typeOf(w);
      if (beats(t, tw)) continue;
      let slack = pToMove ? -1 : 0;
      if (tw === predator(t)) {
        const s = side(j, goal);
        if (s === 0 || runnerSide === 0 || s === runnerSide) slack += 1;
      }
      if (dg[j] <= d + slack) stoppable = true;
    }
    if (!stoppable) best = d;
  }
  return best;
}

// Personalities tweak the evaluation. Balanced is the default.
export const STYLES = {
  balanced: { advance: 1, pressure: 1, danger: 1, trade: 0, guard: 0 },
  aggressive: { advance: 1.9, pressure: 1.8, danger: 0.6, trade: 0, guard: 0 },
  defensive: { advance: 0.6, pressure: 0.7, danger: 2, trade: 0, guard: 1 },
  trader: { advance: 1, pressure: 1.2, danger: 1, trade: 1, guard: 0 },
};
let style = STYLES.balanced;

export function setStyle(name) {
  style = STYLES[name] || STYLES.balanced;
}

export function evaluate(board, me) {
  const opp = 1 - me;
  const cnt = [[0, 0, 0], [0, 0, 0]];
  const minD = [9, 9];
  let score = 0;

  for (let i = 0; i < CELLS; i++) {
    const v = board[i];
    if (!v) continue;
    const p = ownerOf(v);
    const t = typeOf(v);
    cnt[p][t]++;
    const d = DIST_TO_GOAL[p][i];
    if (d < minD[p]) minD[p] = d;
    // Every ring closer to the enemy corner is worth a little, and the last
    // few rings are worth a lot more: that is where races are decided.
    let s = 100 + ((8 - d) * 5 + (d <= 3 ? (4 - d) * 10 : 0)) * style.advance;
    // A piece next to an enemy that beats it is in trouble; a piece next to
    // an enemy it beats is applying pressure.
    for (const n of NEIGHBORS[i]) {
      const w = board[n];
      if (!w || ownerOf(w) === p) continue;
      const tw = typeOf(w);
      if (beats(tw, t)) s -= 8 * style.danger;
      else if (beats(t, tw)) s += 9 * style.pressure;
    }
    if (style.guard) s += Math.max(0, 3 - dist(i, HOME[p])) * 6 * style.guard;
    // A trader values enemy pieces a little more than its own, so equal trades
    // look attractive.
    if (style.trade && p !== me) s += 12 * style.trade;
    score += p === me ? s : -s;
  }

  // Matchup: with none of a type, every enemy piece of the type it would
  // capture becomes immortal. With only one, two or more of them overload it.
  for (let p = 0; p < 2; p++) {
    const sign = p === me ? 1 : -1;
    for (let t = 0; t < 3; t++) {
      const mine = cnt[p][t];
      const targets = cnt[1 - p][prey(t)];
      if (!targets) continue;
      if (mine === 0) score -= sign * 45 * targets;
      else if (mine === 1 && targets >= 2) score -= sign * 14 * (targets - 1);
    }
    score += sign * (8 - minD[p]) * 14;
  }

  const myRun = unstoppableRunner(board, me, true);
  const theirRun = unstoppableRunner(board, opp, false);
  if (myRun < Infinity || theirRun < Infinity) {
    if (2 * myRun - 1 < 2 * theirRun) score += RACE_BONUS - 120 * myRun;
    else score -= RACE_BONUS - 120 * theirRun;
  }
  return score;
}

class Searcher {
  constructor(board, deadline) {
    this.board = new Uint8Array(board);
    this.deadline = deadline;
    this.nodes = 0;
    this.aborted = false;
  }

  checkTime() {
    if ((this.nodes & 1023) === 0 && Date.now() > this.deadline) {
      this.aborted = true;
    }
  }

  generate(player, capturesOnly) {
    const board = this.board;
    const out = [];
    for (let from = 0; from < CELLS; from++) {
      const v = board[from];
      if (!v || ownerOf(v) !== player) continue;
      const t = typeOf(v);
      for (const to of NEIGHBORS[from]) {
        const w = board[to];
        if (w === 0) {
          if (!capturesOnly || to === GOAL[player]) out.push(packMove(from, to));
        } else if (ownerOf(w) !== player && beats(t, typeOf(w))) {
          out.push(packMove(from, to));
        }
      }
    }
    return out;
  }

  order(moves, player, first) {
    const board = this.board;
    const dg = DIST_TO_GOAL[player];
    const scored = moves.map((m) => {
      const from = moveFrom(m);
      const to = moveTo(m);
      let s = 0;
      if (m === first) s += 100000;
      if (to === GOAL[player]) s += 50000;
      if (board[to]) s += 1000;
      s += (dg[from] - dg[to]) * 10;
      return { m, s };
    });
    scored.sort((a, b) => b.s - a.s);
    return scored.map((x) => x.m);
  }

  quiesce(alpha, beta, player, ply, depth) {
    this.nodes++;
    this.checkTime();
    const stand = evaluate(this.board, player);
    if (depth === 0 || stand >= beta) return stand;
    let best = stand;
    if (stand > alpha) alpha = stand;
    const moves = this.generate(player, true);
    for (const m of moves) {
      const from = moveFrom(m);
      const to = moveTo(m);
      if (to === GOAL[player]) return WIN - ply;
      const board = this.board;
      const captured = board[to];
      board[to] = board[from];
      board[from] = 0;
      const score = -this.quiesce(-beta, -alpha, 1 - player, ply + 1, depth - 1);
      board[from] = board[to];
      board[to] = captured;
      if (this.aborted) return best;
      if (score > best) best = score;
      if (score >= beta) return score;
      if (score > alpha) alpha = score;
    }
    return best;
  }

  negamax(depth, alpha, beta, player, ply, sinceCapture, first) {
    this.nodes++;
    this.checkTime();
    if (sinceCapture >= STAGNATION_PLIES) return 0;
    const moves = this.generate(player, false);
    if (moves.length === 0) return -(WIN - ply);
    if (depth <= 0) return this.quiesce(alpha, beta, player, ply, 4);

    const ordered = this.order(moves, player, first);
    let best = -Infinity;
    let bestMove = ordered[0];
    const board = this.board;
    for (const m of ordered) {
      const from = moveFrom(m);
      const to = moveTo(m);
      let score;
      if (to === GOAL[player]) {
        score = WIN - ply;
      } else {
        const captured = board[to];
        board[to] = board[from];
        board[from] = 0;
        score = -this.negamax(
          depth - 1, -beta, -alpha, 1 - player, ply + 1,
          captured ? 0 : sinceCapture + 1, 0,
        );
        board[from] = board[to];
        board[to] = captured;
      }
      if (this.aborted) return best === -Infinity ? alpha : best;
      if (score > best) {
        best = score;
        bestMove = m;
      }
      if (score > alpha) alpha = score;
      if (alpha >= beta) break;
    }
    if (ply === 0) this.rootBest = bestMove;
    return best;
  }
}

export const LEVELS = {
  easy: { maxDepth: 2, timeMs: 400, noise: 90 },
  medium: { maxDepth: 4, timeMs: 900, noise: 12 },
  hard: { maxDepth: 9, timeMs: 1800, noise: 0 },
};

// Pick a move for `player`. Returns null when there is no legal move.
export function search(board, player, sinceCapture = 0, options = {}) {
  const { maxDepth = 4, timeMs = 1000, noise = 0, random = Math.random, style: styleName = 'balanced' } = options;
  setStyle(styleName);
  const start = Date.now();
  const s = new Searcher(board, start + timeMs);
  const rootMoves = s.generate(player, false);
  if (rootMoves.length === 0) return null;

  // Immediate win: take it.
  for (const m of rootMoves) {
    if (moveTo(m) === GOAL[player]) {
      return { move: m, score: WIN, depth: 1, nodes: 1, ms: 0 };
    }
  }

  const jitter = new Map();
  for (const m of rootMoves) jitter.set(m, noise ? (random() * 2 - 1) * noise : 0);

  let best = rootMoves[0];
  let bestScore = -Infinity;
  let completed = 0;
  const board2 = s.board;

  for (let depth = 1; depth <= maxDepth; depth++) {
    const ordered = s.order(rootMoves, player, best);
    // `alpha` tracks the best exact score so far. Moves are searched with a
    // window widened by the noise, so any move that could still win the
    // jittered comparison gets an exact score rather than a bound.
    let alpha = -Infinity;
    let iterBest = null;
    let iterScore = -Infinity;
    for (const m of ordered) {
      const from = moveFrom(m);
      const to = moveTo(m);
      const captured = board2[to];
      board2[to] = board2[from];
      board2[from] = 0;
      const beta = alpha === -Infinity ? Infinity : -(alpha - 2 * noise - 1);
      const raw = -s.negamax(depth - 1, -Infinity, beta, 1 - player, 1, captured ? 0 : sinceCapture + 1, 0);
      board2[from] = board2[to];
      board2[to] = captured;
      if (s.aborted) break;
      if (raw > alpha) alpha = raw;
      const score = raw + jitter.get(m);
      if (score > iterScore) {
        iterScore = score;
        iterBest = m;
      }
    }
    if (s.aborted) break;
    best = iterBest;
    bestScore = iterScore;
    completed = depth;
    // A forced result has been found; deeper search cannot change it.
    if (Math.abs(bestScore) > WIN - 100) break;
  }
  return { move: best, score: bestScore, depth: completed, nodes: s.nodes, ms: Date.now() - start };
}

// Score every legal move for `player` and return them best first. Used for
// the top-moves overlay and the review report.
export function rankMoves(board, player, sinceCapture = 0, options = {}) {
  const { maxDepth = 3, timeMs = 120, top = 40, style: styleName = 'balanced' } = options;
  const opp = 1 - player;
  const rows = [];
  for (const m of legalMovesOf(board, player)) {
    const to = moveTo(m);
    if (to === GOAL[player]) {
      rows.push({ move: m, score: WIN });
      continue;
    }
    const next = new Uint8Array(board);
    next[to] = next[moveFrom(m)];
    next[moveFrom(m)] = 0;
    const r = search(next, opp, board[to] ? 0 : sinceCapture + 1, { maxDepth, timeMs, noise: 0, style: styleName });
    rows.push({ move: m, score: r ? -r.score : WIN });
  }
  rows.sort((a, b) => b.score - a.score);
  return rows.slice(0, top);
}

function legalMovesOf(board, player) {
  const out = [];
  for (let from = 0; from < CELLS; from++) {
    const v = board[from];
    if (!v || ownerOf(v) !== player) continue;
    const t = typeOf(v);
    for (const to of NEIGHBORS[from]) {
      const w = board[to];
      if (w === 0 || (ownerOf(w) !== player && beats(t, typeOf(w)))) out.push(packMove(from, to));
    }
  }
  return out;
}
