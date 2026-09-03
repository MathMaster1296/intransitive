// Re-verifies every shipped puzzle: the listed solutions must be exactly the
// set of moves that win (or hold) at a deep search. Run before publishing.
//
//   node tools/verify.mjs [depth]

import * as E from '../js/engine.js';
import { search, WIN } from '../js/ai.js';
import { PUZZLE_SET } from '../js/puzzledata.js';

const depth = Number(process.argv[2] || 10);
const WIN_T = WIN - 400;
let bad = 0;
for (const p of PUZZLE_SET) {
  const board = Uint8Array.from(p.board, (c) => Number(c));
  const rows = [];
  for (const m of E.legalMoves(board, p.turn)) {
    const to = E.moveTo(m);
    const next = E.applyMove(board, m);
    let score;
    if (to === E.GOAL[p.turn]) score = WIN;
    else if (E.pieceCount(next, 1 - p.turn) === 0 || !E.hasLegalMove(next, 1 - p.turn)) score = WIN - 1;
    else score = -search(next, 1 - p.turn, 0, { maxDepth: depth, timeMs: 700, noise: 0 }).score;
    rows.push({ n: E.notation(board, m), score });
  }
  rows.sort((a, b) => b.score - a.score);
  const best = rows[0];
  // For immediate wins (capture into the corner, or leaving the other side
  // without a move) only other immediate wins count as alternatives.
  const bar = best.score >= WIN - 1 ? WIN - 1 : WIN_T;
  const winning = rows.filter((r) => r.score >= bar).map((r) => r.n);
  const losing = rows.filter((r) => r.score <= -WIN_T).map((r) => r.n);
  let ok;
  if (best.score >= WIN_T) ok = winning.length === p.solutions.length && p.solutions.every((s) => winning.includes(s));
  else ok = p.solutions.every((s) => !losing.includes(s)) && rows.filter((r) => !losing.includes(r.n)).every((r) => p.solutions.includes(r.n) || r.score < best.score - 60);
  if (!ok) bad++;
  console.log(`${ok ? 'ok  ' : 'BAD '} ${p.id.padEnd(12)} best ${best.n} ${best.score} | listed ${p.solutions.join(',')} | winning ${winning.join(',') || '-'}`);
}
console.log(bad ? `${bad} puzzle(s) failed` : `all ${PUZZLE_SET.length} puzzles verified`);
process.exit(bad ? 1 : 0);
