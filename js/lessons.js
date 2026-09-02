// Positions for the rules diagrams, the strategy diagrams and the puzzles.

import { BLUE, RED, parseCell, piece, startingBoard, NEIGHBORS, HOME, dist } from './engine.js';

export function boardFrom(spec) {
  const board = new Uint8Array(81);
  for (const [player, types] of [[BLUE, spec.blue || {}], [RED, spec.red || {}]]) {
    for (const [letter, cells] of Object.entries(types)) {
      const type = 'RPS'.indexOf(letter);
      for (const name of cells) board[parseCell(name)] = piece(player, type);
    }
  }
  return board;
}

function cellsOf(names) {
  return names.map(parseCell);
}

function markMap(entries) {
  const out = {};
  for (const [kind, names] of entries) {
    for (const name of names) out[parseCell(name)] = kind;
  }
  return out;
}

function ringLabels(player) {
  const out = {};
  for (let i = 0; i < 81; i++) out[i] = dist(i, HOME[player]);
  return out;
}

export const DIAGRAMS = {
  start: {
    board: startingBoard(),
    caption: 'This is the opening position. Each side has three rocks, four papers and three scissors, with the scissors out in front.',
  },
  movement: {
    board: boardFrom({ blue: { P: ['e5'] } }),
    targets: cellsOf(['d4', 'd5', 'd6', 'e4', 'e6', 'f4', 'f5', 'f6']),
    caption: 'Every piece moves one square in any of the eight directions, like a chess king.',
  },
  captures: {
    board: boardFrom({ blue: { R: ['e5'] }, red: { S: ['f6'], P: ['d6'], R: ['f4'] } }),
    targets: cellsOf(['d4', 'd5', 'e4', 'e6', 'f5', 'f6']),
    marks: markMap([['no', ['d6', 'f4']]]),
    caption: 'The blue rock can capture the scissors on f6. It cannot move onto the paper or the other rock, so those squares are off limits.',
  },
  goal: {
    board: boardFrom({ blue: { S: ['h8'] }, red: { R: ['b2'] } }),
    marks: markMap([['goal', ['i9', 'a1']]]),
    caption: 'Blue wins by moving any piece onto i9. Red wins on a1. Both are one move away here, and blue moves first.',
  },
  blocked: {
    board: boardFrom({ blue: { P: ['h8'], S: ['g9'] }, red: { P: ['i9'] } }),
    targets: cellsOf(['i9']),
    marks: markMap([['no', ['h8']]]),
    caption: 'A piece parked in its own corner blocks anything it does not lose to. The blue paper on h8 cannot enter, but the blue scissors on g9 can capture into the corner and win.',
  },
  nomoves: {
    board: boardFrom({ blue: { R: ['a1'] }, red: { P: ['a2', 'b1'], R: ['b2'], S: ['g7'] } }),
    caption: 'Blue to move has no legal move, so blue loses on the spot. There is no stalemate.',
  },
  rings: {
    board: boardFrom({ blue: { S: ['b2'] }, red: { P: ['e4'] } }),
    rings: BLUE,
    caption: 'These are the rings counted from blue\'s corner. Every square on a ring is the same number of moves from a1. The red paper is on ring 4 and the blue scissors is on ring 1.',
  },
  matchup: {
    board: boardFrom({
      blue: { R: ['b2', 'c3', 'd2'], P: ['b4', 'c5', 'e2', 'd4'], S: ['e5'] },
      red: { R: ['g7', 'h6'], P: ['f7', 'e8', 'h4'], S: ['e6', 'g5', 'g8'] },
    }),
    caption: 'Both sides have eight pieces and nobody is closer to a corner, yet red is better. Blue has one scissors to answer three red papers.',
  },
  passive: {
    board: boardFrom({ blue: { P: ['a3'], S: ['f3'], R: ['h7'] }, red: { P: ['c3'], R: ['h8'] } }),
    rings: BLUE,
    marks: markMap([['path', ['a2', 'a1']], ['danger', ['b2', 'b1']]]),
    caption: 'The red paper on ring 2 wants a1. Blue\'s paper is also on ring 2, and it is blue\'s move, so a3-a2 gets ahead and reaches the corner first. That is a passive defence, and the red paper can never take a paper sitting in the corner.',
  },
  active: {
    board: boardFrom({ blue: { S: ['c4'], R: ['g2'] }, red: { P: ['c3'], R: ['h8'] } }),
    rings: BLUE,
    targets: cellsOf(['c3']),
    caption: 'The blue scissors captures the attacker outright. That is an active defence, and it beats blocking because the threat is gone for good.',
  },
  sides: {
    board: boardFrom({ blue: { R: ['b6', 'f2'] }, red: { S: ['e2'], P: ['h8'] } }),
    rings: BLUE,
    marks: markMap([['danger', ['d1', 'c1', 'b1']]]),
    caption: 'Both blue rocks are near the red scissors on ring 4. The rock on f2 sits one ring behind but on the same side, so it can shadow the runner along the bottom edge. The rock on b6 is on the other side of the ring and never catches up.',
  },
  trap: {
    board: boardFrom({ blue: { R: ['c6'], P: ['e2'] }, red: { S: ['a7'], R: ['h8'], P: ['i7'] } }),
    targets: cellsOf(['b7']),
    marks: markMap([['danger', ['a6', 'a8', 'b6', 'b8']]]),
    caption: 'After c6-b7 the red scissors has four squares to run to, and the rock covers all of them. That is a trap, and micro position has just turned into material.',
  },
};

export const PUZZLES = [
  {
    id: 'race',
    title: 'Get home first',
    spec: { blue: { S: ['a5'], P: ['c2'], R: ['g6', 'a9'] }, red: { S: ['e2'], R: ['i8'] } },
    turn: BLUE,
    prompt: 'The red scissors on e2 is four moves from a1. Blue is ahead on material, so stopping the runner should win the game. Which move holds?',
    hint: 'Count rings. Only a piece the scissors cannot capture can sit in the corner, and it has to stay ahead of the runner.',
    solutions: ['a5-a4', 'a5-b4'],
    explain: 'The scissors on a5 is on ring 4, the same ring as the runner, and it is blue\'s move, so stepping to ring 3 keeps it ahead the whole way. It reaches a1 first and the red scissors can never capture it there. Running the rock on g6 toward i9 instead looks tempting, but red only needs to block with the rock on i8 at the last moment, and by then the red scissors is far ahead of the defender.',
    wrong: 'That lets the red scissors through. Something has to be sitting on a1 before it arrives, and only a piece it cannot capture will do.',
  },
  {
    id: 'tempo',
    title: 'Two moves is a lot',
    spec: { blue: { R: ['f6', 'c8'], P: ['b2'] }, red: { S: ['a9'], R: ['f9'], P: ['c6'] } },
    turn: BLUE,
    prompt: 'Blue\'s rock on c8 has the red scissors cornered on a9, and collecting it takes two moves. Two moves is a lot in this game. Find the win.',
    hint: 'Count moves to i9 for both sides. Who gets there first if blue starts running right now, and who gets there first if blue spends a move on the scissors?',
    solutions: ['f6-g7'],
    explain: 'The rock on f6 is three moves from i9 and the red rock on f9 is also three moves away, so whoever starts first wins the race. f6-g7 starts it now, and nothing red has can capture a rock. Spending a move on the trapped scissors hands red the tempo it needs to park a rock on i9, and the game goes on with blue only slightly better.',
    wrong: 'That gives red a free move, and red uses it to start walking its rock to i9. The trapped scissors is not going anywhere. Start the race instead.',
  },
  {
    id: 'side',
    title: 'One ring behind',
    spec: { blue: { P: ['e4'], R: ['b6'], S: ['a8'] }, red: { R: ['d2'], P: ['h9'] } },
    turn: BLUE,
    prompt: 'The red rock on d2 is on ring 3 and heading for a1. Blue\'s paper is one ring further out. Can it still catch the rock, and how?',
    hint: 'The paper and the rock are on the same side of the ring. Step toward the corner and attack at the same time.',
    solutions: ['e4-d3'],
    explain: 'e4-d3 attacks the rock while stepping onto ring 3. The rock cannot capture a paper, so it has to keep running, but a paper on the same side of the ring shadows it along the bottom edge and takes it before it gets home. The rock on b6 is two rings behind and on the other side of the ring, so it could never arrive in time.',
    wrong: 'The red rock reaches a1 before that piece can do anything about it. The paper is one ring behind but on the same side, which is enough if it attacks right away.',
  },
];
