// Puzzle miner. Generates candidate positions, scores every legal move with
// the engine, and keeps positions with a single winning or saving move.
//
//   node tools/mine.mjs <seed> <minutes> <outfile>

import { writeFileSync } from 'node:fs';
import * as E from '../js/engine.js';
import { search, WIN } from '../js/ai.js';

const seed0 = Number(process.argv[2] || 1);
const minutes = Number(process.argv[3] || 5);
const outfile = process.argv[4] || `tools/mined-${seed0}.json`;
const mode = process.argv[5] || 'mixed'; // mixed | games | runner | defence
const withGames = mode === 'games' || mode === 'mixed-games';
const WIN_T = WIN - 400;
const deadline = Date.now() + minutes * 60000;

let seed = seed0 * 7919 + 17;
function rnd() {
  seed = (seed * 16807) % 2147483647;
  return seed / 2147483647;
}
function rint(n) {
  return Math.floor(rnd() * n);
}
function pick(arr) {
  return arr[rint(arr.length)];
}

function rndCell(pred = () => true) {
  for (let tries = 0; tries < 200; tries++) {
    const c = rint(81);
    if (c === 0 || c === 80) continue;
    if (pred(c)) return c;
  }
  return -1;
}

function randomSparse() {
  const k = 2 + rint(6);
  const board = new Uint8Array(81);
  let placed = 0;
  let guard = 0;
  while (placed < k && guard++ < 200) {
    const c = rndCell((x) => board[x] === 0);
    if (c < 0) break;
    board[c] = E.piece(rint(2), rint(3));
    placed++;
  }
  if (E.pieceCount(board, 0) === 0 || E.pieceCount(board, 1) === 0) return null;
  return { board, turn: rint(2), source: 'sparse' };
}

function runnerScenario(close = false) {
  const D = rint(2);
  const A = 1 - D;
  const home = E.HOME[D];
  const board = new Uint8Array(81);
  const runnerType = rint(3);
  const ringWanted = close ? 2 + rint(3) : 2 + rint(4);
  const rc = rndCell((c) => E.dist(c, home) === ringWanted);
  if (rc < 0) return null;
  board[rc] = E.piece(A, runnerType);
  const nDef = close ? 1 + rint(2) : 1 + rint(3);
  for (let i = 0; i < nDef; i++) {
    const c = rndCell((x) => board[x] === 0 && E.dist(x, home) >= 1 && E.dist(x, home) <= 6 && E.dist(x, rc) >= 1);
    if (c >= 0) board[c] = E.piece(D, rint(3));
  }
  const nSpareA = rint(3);
  for (let i = 0; i < nSpareA; i++) {
    const c = rndCell((x) => board[x] === 0 && E.dist(x, home) >= 5);
    if (c >= 0) board[c] = E.piece(A, rint(3));
  }
  if (rint(2)) {
    const c = rndCell((x) => board[x] === 0 && E.dist(x, home) >= 5 && E.dist(x, E.HOME[A]) >= 3);
    if (c >= 0) board[c] = E.piece(D, rint(3));
  }
  if (E.pieceCount(board, 0) === 0 || E.pieceCount(board, 1) === 0) return null;
  return { board, turn: rint(2), source: 'runner' };
}

function selfPlayPositions() {
  const out = [];
  let g = E.newGame();
  const noise = 10 + rint(60);
  let n = 0;
  while (!g.result && n++ < 160) {
    const opts = { maxDepth: 2 + rint(2), timeMs: 60, noise, random: rnd };
    const r = search(g.board, g.turn, g.sinceCapture, opts);
    if (!r) break;
    g = E.play(g, r.move);
    const total = E.pieceCount(g.board, 0) + E.pieceCount(g.board, 1);
    if (!g.result && n >= 8 && (total <= 14 || rnd() < 0.15)) out.push({ board: new Uint8Array(g.board), turn: g.turn, source: 'game' });
  }
  return out;
}

function analyze(board, turn, depth, timeMs) {
  const opp = 1 - turn;
  const rows = [];
  for (const m of E.legalMoves(board, turn)) {
    const to = E.moveTo(m);
    const next = E.applyMove(board, m);
    if (to === E.GOAL[turn]) {
      rows.push({ m, score: WIN, reply: -1 });
    } else if (E.pieceCount(next, opp) === 0 || !E.hasLegalMove(next, opp)) {
      rows.push({ m, score: WIN - 1, reply: -1 });
    } else {
      const r = search(next, opp, 0, { maxDepth: depth, timeMs, noise: 0 });
      rows.push({ m, score: -r.score, reply: r.move });
    }
  }
  rows.sort((a, b) => b.score - a.score);
  return rows;
}

function classify(board, turn, rows) {
  if (rows.length < 3) return null;
  const best = rows[0];
  const second = rows[1];
  const bestTo = E.moveTo(best.m);
  const bestCapture = board[bestTo] !== 0;
  if (best.score >= WIN_T) {
    if (second.score >= 200) return null;
    if (bestTo === E.GOAL[turn] && !bestCapture) return null; // walking into an empty corner
    return { kind: 'win', winIn: Math.ceil((WIN - best.score) / 2) };
  }
  if (best.score > -250 && second.score <= -WIN_T) {
    return { kind: 'only' };
  }
  if (best.score >= 70 && best.score < WIN_T && best.score - second.score >= 90 && second.score <= 40) {
    return { kind: 'material' };
  }
  return null;
}

const found = [];
const seen = new Set();
let examined = 0;
let queue = [];

function refill() {
  const batch = [];
  if (mode === 'games') {
    batch.push(...selfPlayPositions());
  } else if (mode === 'defence') {
    for (let i = 0; i < 24; i++) {
      const s = runnerScenario(true);
      if (s) batch.push(s);
    }
  } else {
    for (let i = 0; i < 12; i++) {
      const s = randomSparse();
      if (s) batch.push(s);
    }
    for (let i = 0; i < 12; i++) {
      const s = runnerScenario();
      if (s) batch.push(s);
    }
    if (withGames && rnd() < 0.6) batch.push(...selfPlayPositions());
  }
  queue.push(...batch);
}

while (Date.now() < deadline) {
  if (!queue.length) refill();
  const pos = queue.shift();
  if (!pos) continue;
  const key = Array.from(pos.board).join(',') + '|' + pos.turn;
  if (seen.has(key)) continue;
  seen.add(key);
  examined++;
  const total = E.pieceCount(pos.board, 0) + E.pieceCount(pos.board, 1);
  if (total > 14) continue;
  if (!E.hasLegalMove(pos.board, pos.turn)) continue;
  // Skip positions where the side to move can simply walk into the corner.
  const legal = E.legalMoves(pos.board, pos.turn);
  if (legal.some((m) => E.moveTo(m) === E.GOAL[pos.turn] && pos.board[E.moveTo(m)] === 0)) continue;
  const depth = total <= 6 ? 8 : 6;
  const rows = analyze(pos.board, pos.turn, depth, total <= 6 ? 110 : 90);
  const cls = classify(pos.board, pos.turn, rows);
  if (!cls) continue;
  found.push({
    board: Array.from(pos.board),
    turn: pos.turn,
    source: pos.source,
    kind: cls.kind,
    winIn: cls.winIn || null,
    pieces: total,
    rows: rows.map((r) => ({ m: r.m, s: Math.round(r.score), reply: r.reply })),
  });
  if (found.length % 10 === 0) {
    writeFileSync(outfile, JSON.stringify({ examined, found }));
    console.log(`seed ${seed0}: examined ${examined}, found ${found.length}`);
  }
}
writeFileSync(outfile, JSON.stringify({ examined, found }));
console.log(`seed ${seed0} done: examined ${examined}, found ${found.length}`);
