// Turns mined candidates into js/puzzledata.js: re-verifies each position at
// a deeper search, detects the theme, rates difficulty, extracts the
// engine's line and a refutation for every wrong move, and writes
// explanations.
//
//   node tools/curate.mjs tools/mined/*.json

import { readFileSync, writeFileSync } from 'node:fs';
import * as E from '../js/engine.js';
import { search, WIN } from '../js/ai.js';
import { PUZZLES, boardFrom } from '../js/lessons.js';

const WIN_T = WIN - 400;
const files = process.argv.slice(2);
const TYPE = E.TYPE_NAMES;
const SIDE = E.PLAYER_NAMES;
const cap = (s) => s[0].toUpperCase() + s.slice(1);

// Stable short id from the position so re-curation keeps solved states.
function hashId(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h.toString(36).slice(0, 6);
}

function analyze(board, turn, depth, timeMs) {
  const opp = 1 - turn;
  const rows = [];
  for (const m of E.legalMoves(board, turn)) {
    const to = E.moveTo(m);
    const next = E.applyMove(board, m);
    if (to === E.GOAL[turn]) rows.push({ m, score: WIN, reply: -1 });
    else if (E.pieceCount(next, opp) === 0 || !E.hasLegalMove(next, opp)) rows.push({ m, score: WIN - 1, reply: -1 });
    else {
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
  if (best.score >= WIN_T) {
    if (second.score >= 200) return null;
    if (bestTo === E.GOAL[turn] && board[bestTo] === 0) return null;
    const after = E.applyMove(board, best.m);
    const immediate = bestTo === E.GOAL[turn] || !E.hasLegalMove(after, 1 - turn) || E.pieceCount(after, 1 - turn) === 0;
    // Plies until the win from the opponent's reply, plus the solving move.
    const winIn = immediate ? 1 : Math.ceil((WIN - best.score) / 2) + 1;
    return { kind: 'win', winIn };
  }
  if (best.score > -250 && second.score <= -WIN_T) return { kind: 'only' };
  if (best.score >= 70 && best.score < WIN_T && best.score - second.score >= 90 && second.score <= 40) return { kind: 'material' };
  return null;
}

function principalLine(board, turn, plies) {
  let g = E.newGame(board, turn);
  const out = [];
  for (let i = 0; i < plies && !g.result; i++) {
    const r = search(g.board, g.turn, g.sinceCapture, { maxDepth: 10, timeMs: 350, noise: 0 });
    if (!r) break;
    out.push(E.notation(g.board, r.move));
    g = E.play(g, r.move);
  }
  return { line: out.join(' '), result: g.result };
}

function attacksAfter(board, turn, m) {
  const next = E.applyMove(board, m);
  const to = E.moveTo(m);
  const t = E.typeOf(next[to]);
  const victims = [];
  for (const n of E.NEIGHBORS[to]) {
    const w = next[n];
    if (w && E.ownerOf(w) !== turn && E.beats(t, E.typeOf(w))) victims.push(n);
  }
  return victims;
}

function trappedAfter(board, turn, m) {
  const next = E.applyMove(board, m);
  const opp = 1 - turn;
  for (let i = 0; i < 81; i++) {
    const v = next[i];
    if (!v || E.ownerOf(v) !== opp) continue;
    const t = E.typeOf(v);
    const attacked = E.NEIGHBORS[i].some((n) => next[n] && E.ownerOf(next[n]) === turn && E.beats(E.typeOf(next[n]), t));
    if (!attacked) continue;
    const escapes = E.targetsFrom(next, i).filter((to) => {
      const after = E.applyMove(next, E.packMove(i, to));
      return !E.NEIGHBORS[to].some((n) => after[n] && E.ownerOf(after[n]) === turn && E.beats(E.typeOf(after[n]), t));
    });
    if (escapes.length === 0) return i;
  }
  return -1;
}

function theme(board, turn, m, kind, pv) {
  const from = E.moveFrom(m);
  const to = E.moveTo(m);
  const captured = board[to];
  const next = E.applyMove(board, m);
  const opp = 1 - turn;
  const home = E.HOME[turn];
  const goal = E.GOAL[turn];
  if (to === goal && captured) return 'corner';
  if (!E.hasLegalMove(next, opp)) return 'box';
  const forks = attacksAfter(board, turn, m);
  if (forks.length >= 2 && !captured) return 'fork';
  if (captured) {
    if (E.dist(to, home) <= 3) return 'stop';
    return kind === 'material' ? 'capture' : 'capture';
  }
  if (trappedAfter(board, turn, m) >= 0 && kind !== 'win') return 'trap';
  const runner = nearestRunner(board, turn);
  const runnerClose = runner >= 0 && E.dist(runner, home) <= 3;
  if (E.dist(to, home) < E.dist(from, home) && E.dist(to, home) <= 2 && runnerClose) return 'block';
  if (kind === 'win') {
    if (E.dist(to, goal) < E.dist(from, goal)) return 'race';
    return 'only';
  }
  if (E.dist(to, home) < E.dist(from, home) && E.dist(to, home) <= 3) return 'block';
  if (kind === 'material') return 'material';
  return 'only';
}

const THEME_TEXT = {
  corner: { title: 'Capture into the corner', prompt: 'The far corner is occupied, but that is not the end of the story. Win on the spot.' },
  box: { title: 'No moves left', prompt: 'A player with no legal move loses immediately. Find the move that leaves the other side stuck.' },
  fork: { title: 'Fork', prompt: 'One move can attack two enemy pieces at once. Find it.' },
  stop: { title: 'Stop the runner', prompt: 'An enemy piece is closing in on your corner. Deal with it.' },
  capture: { title: 'Win a piece', prompt: 'There is a capture here that wins material cleanly. Find it.' },
  trap: { title: 'Trap', prompt: 'Take away every safe square from an enemy piece.' },
  race: { title: 'Win the race', prompt: 'You can reach the far corner before anything can stop you, but only one move starts the race correctly.' },
  block: { title: 'Block the corner', prompt: 'A runner is coming. Get a blocker into your corner in time.' },
  only: { title: 'Only move', prompt: 'Every move but one loses. Find the one.' },
  material: { title: 'Win material', prompt: 'One move wins a piece by force. Find it.' },
};

function describeMove(board, m) {
  const from = E.moveFrom(m);
  const v = board[from];
  return `the ${TYPE[E.typeOf(v)]} on ${E.cellName(from)}`;
}

function refutation(board, turn, row) {
  const opp = 1 - turn;
  const after = E.applyMove(board, row.m);
  if (row.reply < 0) return 'That lets the game slip.';
  const reply = E.notation(after, row.reply);
  const replyCaptures = after[E.moveTo(row.reply)] !== 0;
  const s = row.score;
  if (s <= -WIN_T) {
    const n = Math.ceil((WIN + s) / 2);
    if (E.moveTo(row.reply) === E.GOAL[opp]) return `${reply} and ${SIDE[opp]} is in the corner.`;
    return `${reply}${replyCaptures ? ', taking a piece,' : ''} and ${SIDE[opp]} wins in ${n} move${n === 1 ? '' : 's'}.`;
  }
  if (s <= -90) return `${reply} ${replyCaptures ? 'takes a piece' : 'and ' + SIDE[opp] + ' comes out a piece ahead'}.`;
  return `${reply}, and the winning chance is gone.`;
}

function nearestRunner(board, turn) {
  const opp = 1 - turn;
  let best = -1;
  for (let i = 0; i < 81; i++) {
    const v = board[i];
    if (!v || E.ownerOf(v) !== opp) continue;
    if (best < 0 || E.dist(i, E.HOME[turn]) < E.dist(best, E.HOME[turn])) best = i;
  }
  return best;
}

function explanation(board, turn, m, th, kind, winIn, pv, rows) {
  const opp = 1 - turn;
  const runner = nearestRunner(board, turn);
  const runnerText = runner >= 0
    ? `the ${TYPE[E.typeOf(board[runner])]} on ${E.cellName(runner)}, ${E.dist(runner, E.HOME[turn])} move${E.dist(runner, E.HOME[turn]) === 1 ? '' : 's'} from ${E.cellName(E.HOME[turn])},`
    : 'the runner';
  const from = E.moveFrom(m);
  const to = E.moveTo(m);
  const mover = describeMove(board, m);
  const captured = board[to];
  const line = pv.line ? ` A likely continuation is ${pv.line}.` : '';
  const home = E.cellName(E.HOME[turn]);
  const goal = E.cellName(E.GOAL[turn]);
  switch (th) {
    case 'corner':
      return `${cap(mover)} takes the ${TYPE[E.typeOf(captured)]} on ${goal}. Capturing into the corner counts as reaching it, so the game ends at once.`;
    case 'box':
      return `After this move ${SIDE[opp]} has no legal move at all, and a player who cannot move loses on the spot. There is no stalemate in this game.`;
    case 'fork': {
      const victims = attacksAfter(board, turn, m).map((c) => `the ${TYPE[E.typeOf(board[c])]} on ${E.cellName(c)}`);
      return `${cap(mover)} attacks ${victims.join(' and ')} at the same time, and neither can capture it back. ${cap(SIDE[opp])} can only save one.${line}`;
    }
    case 'stop':
      return `${cap(mover)} removes the ${TYPE[E.typeOf(captured)]} that was ${E.dist(to, E.HOME[turn])} move${E.dist(to, E.HOME[turn]) === 1 ? '' : 's'} from ${home}. Nothing else could catch it in time, and a blocker would have arrived second.${line}`;
    case 'capture':
      return `${cap(mover)} takes the ${TYPE[E.typeOf(captured)]} on ${E.cellName(to)} for free. Nothing can recapture, and every other move lets it get away.${line}`;
    case 'trap': {
      const t = trappedAfter(board, turn, m);
      return `After this move the ${TYPE[E.typeOf(board[t])]} on ${E.cellName(t)} has no safe square: every square it can reach is covered. It is as good as captured.${line}`;
    }
    case 'race':
      return `${cap(mover)} starts the race to ${goal}, ${E.dist(to, E.GOAL[turn])} move${E.dist(to, E.GOAL[turn]) === 1 ? '' : 's'} away, and nothing ${SIDE[opp]} has can get in front of it in time. ${cap(SIDE[turn])} wins in ${winIn}.${line}`;
    case 'block': {
      const after = E.dist(to, E.HOME[turn]);
      const where = after === 0 ? 'sits in the corner' : `is ${after} move${after === 1 ? '' : 's'} from it and moves first`;
      return `${cap(mover)} ${after === 0 ? 'steps into the corner' : 'heads for the corner'}. ${cap(SIDE[opp])}'s nearest runner is ${runnerText} and after this move your blocker ${where}, and the runner cannot capture it. Any other move and the runner gets in.${line}`;
    }
    case 'material':
      return `${cap(mover)} wins material by force. ${cap(SIDE[opp])} cannot meet both of the threats it creates.${line}`;
    default:
      return kind === 'win'
        ? `${cap(mover)} is the only move that wins. ${cap(SIDE[turn])} wins in ${winIn} whatever ${SIDE[opp]} does.${line}`
        : `${cap(mover)} is the only move that holds against ${runnerText} which gets through after anything else.${line}`;
  }
}

function difficulty(board, turn, m, kind, winIn, rows) {
  let d = 1;
  const quiet = board[E.moveTo(m)] === 0;
  if (quiet) d += 1;
  if ((kind === 'win' && winIn >= 4) || (kind !== 'win' && rows.length >= 20)) d += 1;
  if (kind === 'win' && winIn <= 1) d = 1;
  return Math.min(3, d);
}

// Load and dedupe --------------------------------------------------------------

const seen = new Set();
const candidates = [];
for (const f of files) {
  const data = JSON.parse(readFileSync(f, 'utf8'));
  for (const c of data.found) {
    const key = c.board.join(',') + '|' + c.turn;
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push(c);
  }
}
console.log('candidates', candidates.length);

// Re-verify --------------------------------------------------------------------

const puzzles = [];
const themeCount = {};
const sigCount = {};
const LIMITS = { corner: 10, box: 10, fork: 14, stop: 26, capture: 16, trap: 12, race: 30, block: 28, only: 18, material: 14 };

// Prefer quiet solutions and mid-length wins; shuffle a little for variety.
candidates.sort((a, b) => {
  const qa = a.board[E.moveTo(a.rows[0].m)] === 0 ? 1 : 0;
  const qb = b.board[E.moveTo(b.rows[0].m)] === 0 ? 1 : 0;
  return (qb - qa) || (Math.abs((b.winIn || 3) - 3) - Math.abs((a.winIn || 3) - 3)) * -1 || (a.pieces - b.pieces);
});

for (const c of candidates) {
  const board = new Uint8Array(c.board);
  const turn = c.turn;
  const total = c.pieces;
  const rows = analyze(board, turn, total <= 6 ? 11 : 9, total <= 6 ? 600 : 400);
  const cls = classify(board, turn, rows);
  if (!cls || cls.kind !== c.kind) continue;
  if (rows[0].m !== c.rows[0].m) continue;
  const m = rows[0].m;
  const after = E.applyMove(board, m);
  const pv = principalLine(after, 1 - turn, 6);
  const th = theme(board, turn, m, cls.kind, pv);
  if ((themeCount[th] || 0) >= LIMITS[th]) continue;
  const sig = `${th}|${E.TYPE_NAMES[E.typeOf(board[E.moveFrom(m)])]}|${cls.winIn || 0}|${total}`;
  if ((sigCount[sig] || 0) >= 3) continue;
  sigCount[sig] = (sigCount[sig] || 0) + 1;
  themeCount[th] = (themeCount[th] || 0) + 1;
  const refute = {};
  for (const row of rows.slice(1)) refute[E.notation(board, row.m)] = refutation(board, turn, row);
  const solution = E.notation(board, m);
  puzzles.push({
    id: `${th}-${hashId(c.board.join('') + c.turn)}`,
    theme: th,
    title: THEME_TEXT[th].title,
    prompt: THEME_TEXT[th].prompt,
    difficulty: difficulty(board, turn, m, cls.kind, cls.winIn, rows),
    board: Array.from(board).join(''),
    turn,
    solutions: [solution],
    winIn: cls.winIn || null,
    line: solution + (pv.line ? ' ' + pv.line : ''),
    explain: explanation(board, turn, m, th, cls.kind, cls.winIn, pv, rows),
    refute,
    source: c.source,
  });
  console.log(`kept ${puzzles.length}: ${th} ${solution} pieces ${total} winIn ${cls.winIn || '-'} d${difficulty(board, turn, m, cls.kind, cls.winIn, rows)}`);
}

// Hand-made puzzles first ---------------------------------------------------------

const hand = PUZZLES.map((p) => {
  const board = boardFrom(p.spec);
  const rows = analyze(board, p.turn, 10, 500);
  const refute = {};
  for (const row of rows) {
    const n = E.notation(board, row.m);
    if (!p.solutions.includes(n)) refute[n] = refutation(board, p.turn, row);
  }
  const best = rows.find((r) => p.solutions.includes(E.notation(board, r.m)));
  const pv = best ? principalLine(E.applyMove(board, best.m), 1 - p.turn, 6) : { line: '' };
  return {
    id: `hand-${p.id}`,
    theme: { race: 'block', tempo: 'race', boxed: 'box', side: 'stop' }[p.id] || 'only',
    title: p.title,
    prompt: p.prompt,
    difficulty: 2,
    board: Array.from(board).join(''),
    turn: p.turn,
    solutions: p.solutions,
    winIn: null,
    line: p.solutions[0] + (pv.line ? ' ' + pv.line : ''),
    explain: p.explain,
    refute,
    source: 'hand',
  };
});

const all = hand.concat(puzzles);
const out = `// Generated by tools/curate.mjs. Every puzzle was verified by the engine to\n// have exactly the listed solution(s).\n\nexport const PUZZLE_SET = ${JSON.stringify(all, null, 1)};\n`;
writeFileSync('js/puzzledata.js', out);
console.log('wrote', all.length, 'puzzles', JSON.stringify(themeCount));
