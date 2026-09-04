// Plain-language explanation of a position: material, matchup, runners and
// the ring rule, threats, and the engine's view.

import * as E from './engine.js';

const TYPE = E.TYPE_NAMES;
const SIDE = E.PLAYER_NAMES;
const cap = (s) => s[0].toUpperCase() + s.slice(1);

function plural(n, word) {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

function countsText(c) {
  return `${plural(c[0], 'rock')}, ${plural(c[1], 'paper')} and ${plural(c[2], 'scissors').replace('scissorss', 'scissors')}`;
}

function piecesOf(board, player) {
  const out = [];
  for (let i = 0; i < 81; i++) if (board[i] && E.ownerOf(board[i]) === player) out.push(i);
  return out;
}

// Can `defender` (a cell) stop a runner at `runner` heading for `home`?
// Returns 'capture', 'block' or null, following the ring rule.
function canStop(board, defender, runner, home, defenderToMove) {
  const dt = E.typeOf(board[defender]);
  const rt = E.typeOf(board[runner]);
  if (E.beats(rt, dt)) return null;
  const dd = E.dist(defender, home);
  const dr = E.dist(runner, home);
  const slack = defenderToMove ? 0 : -1;
  if (E.beats(dt, rt)) {
    if (dd <= dr + slack) return 'capture';
    if (dd === dr + slack + 1) {
      const side = (c) => {
        const dc = Math.abs(E.col(c) - E.col(home));
        const dr2 = Math.abs(E.row(c) - E.row(home));
        return dc === dr2 ? 0 : dc > dr2 ? 1 : 2;
      };
      const sd = side(defender);
      const sr = side(runner);
      if (sd === 0 || sr === 0 || sd === sr) return 'capture';
    }
    return null;
  }
  return dd <= dr + slack ? 'block' : null;
}

export function explain({ board, turn, me, evalBlue = null, bestMove = null }) {
  const opp = 1 - me;
  const lines = [];
  const c = E.counts(board);
  const mine = c[me].reduce((a, b) => a + b, 0);
  const theirs = c[opp].reduce((a, b) => a + b, 0);
  const you = me === turn ? 'It is your move.' : `It is ${SIDE[opp]}'s move.`;

  // Material and matchup.
  let mat = `${you} You have ${countsText(c[me])} (${mine}) against ${countsText(c[opp])} (${theirs}).`;
  if (mine > theirs) mat += ` You are ${plural(mine - theirs, 'piece')} up.`;
  else if (theirs > mine) mat += ` You are ${plural(theirs - mine, 'piece')} down.`;
  else mat += ' Material is level.';
  lines.push(mat);

  for (let t = 0; t < 3; t++) {
    const prey = E.prey(t);
    if (c[me][t] === 0 && c[opp][prey] > 0) {
      lines.push(`You have no ${TYPE[t]}, so ${SIDE[opp]}'s ${plural(c[opp][prey], TYPE[prey])} can never be captured. Keep them away from your corner by blocking, since you cannot remove them.`);
    } else if (c[me][t] === 1 && c[opp][prey] >= 2) {
      lines.push(`Your only ${TYPE[t]} has to watch ${plural(c[opp][prey], TYPE[prey])}. Two attacks at once would overload it.`);
    }
    if (c[opp][t] === 0 && c[me][prey] > 0) {
      lines.push(`${cap(SIDE[opp])} has no ${TYPE[t]}, so your ${plural(c[me][prey], TYPE[prey])} ${c[me][prey] === 1 ? 'is' : 'are'} immortal. Walk ${c[me][prey] === 1 ? 'it' : 'them'} forward.`);
    }
  }

  // Their runners against your corner.
  const home = E.HOME[me];
  const goal = E.GOAL[me];
  const theirPieces = piecesOf(board, opp).sort((a, b) => E.dist(a, home) - E.dist(b, home));
  const myPieces = piecesOf(board, me);
  if (theirPieces.length) {
    const r = theirPieces[0];
    const dr = E.dist(r, home);
    if (dr <= 5) {
      const stoppers = myPieces.map((d) => ({ d, how: canStop(board, d, r, home, turn === me) })).filter((x) => x.how);
      let text = `${cap(SIDE[opp])}'s nearest runner is the ${TYPE[E.typeOf(board[r])]} on ${E.cellName(r)}, ${plural(dr, 'move')} from ${E.cellName(home)}.`;
      if (dr === 1 && turn === opp) text += ' It wins next move unless it is blocked or captured right now.';
      if (stoppers.length) {
        const s = stoppers.sort((a, b) => (a.how === 'capture' ? 0 : 1) - (b.how === 'capture' ? 0 : 1) || E.dist(a.d, home) - E.dist(b.d, home))[0];
        text += s.how === 'capture'
          ? ` Your ${TYPE[E.typeOf(board[s.d])]} on ${E.cellName(s.d)} can catch it: it beats it and is close enough by the ring rule.`
          : ` Your ${TYPE[E.typeOf(board[s.d])]} on ${E.cellName(s.d)} (${plural(E.dist(s.d, home), 'move')} from the corner) can get home first and block it.`;
      } else {
        text += ' Nothing of yours can stop it by the ring rule. You need to win faster, or find a capture on the way.';
      }
      lines.push(text);
    }
  }

  // Your runners.
  const myRunner = myPieces.sort((a, b) => E.dist(a, goal) - E.dist(b, goal))[0];
  if (myRunner !== undefined) {
    const dg = E.dist(myRunner, goal);
    if (dg <= 5) {
      const stoppers = theirPieces.map((d) => ({ d, how: canStop(board, d, myRunner, goal, turn === opp) })).filter((x) => x.how);
      let text = `Your ${TYPE[E.typeOf(board[myRunner])]} on ${E.cellName(myRunner)} is ${plural(dg, 'move')} from ${E.cellName(goal)}.`;
      if (!stoppers.length) text += ` ${cap(SIDE[opp])} has nothing that can stop it in time. Run.`;
      else {
        const s = stoppers[0];
        text += ` ${cap(SIDE[opp])}'s ${TYPE[E.typeOf(board[s.d])]} on ${E.cellName(s.d)} can ${s.how === 'capture' ? 'catch it' : 'block the corner in time'}.`;
      }
      lines.push(text);
    }
  }

  // Threats.
  const attacked = E.attackedCells(board);
  const mineAttacked = attacked.filter((i) => E.ownerOf(board[i]) === me);
  const theirsAttacked = attacked.filter((i) => E.ownerOf(board[i]) === opp);
  if (mineAttacked.length) {
    lines.push(`Under attack: ${mineAttacked.map((i) => `your ${TYPE[E.typeOf(board[i])]} on ${E.cellName(i)}`).join(', ')}.${turn === me ? ' Move it, defend it, or make a bigger threat.' : ''}`);
  }
  if (theirsAttacked.length && turn === me) {
    lines.push(`You can capture: ${theirsAttacked.map((i) => `the ${TYPE[E.typeOf(board[i])]} on ${E.cellName(i)}`).join(', ')}. Check what recaptures before you take.`);
  }

  // Engine.
  if (evalBlue !== null) {
    const my = me === E.BLUE ? evalBlue : -evalBlue;
    let verdict;
    if (my >= 90000) verdict = 'The engine sees a forced win for you.';
    else if (my <= -90000) verdict = `The engine sees a forced win for ${SIDE[opp]}.`;
    else if (Math.abs(my) < 40) verdict = 'The engine calls it level.';
    else verdict = `The engine has ${my > 0 ? 'you' : SIDE[opp]} ahead by about ${(Math.abs(my) / 100).toFixed(1)} pieces' worth.`;
    if (bestMove) verdict += ` It suggests ${bestMove}.`;
    lines.push(verdict);
  }
  return lines;
}
