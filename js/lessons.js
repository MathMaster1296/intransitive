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
    id: 'boxed',
    title: 'Box it in',
    spec: { blue: { R: ['a8', 'b9', 'c8'] }, red: { R: ['a9'] } },
    turn: BLUE,
    prompt: 'Red is down to one piece, a rock in the top-left corner, and blue has no paper to capture it with. Win right now.',
    hint: 'A rock cannot move onto a rock. What happens to a player who has no legal move at all?',
    solutions: ['c8-b8'],
    explain: 'After c8-b8 the red rock has nowhere to go: a8, b8 and b9 are all blue rocks. There is no stalemate in this game, so a player with no legal move loses on the spot. Walking a rock to i9 would win too, but four moves later.',
    wrong: 'That wins eventually, but there is a one-move win. Take away the red rock\'s last square.',
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

// Guided tutorial played on a small board inside a dialog.
export const TUTORIAL = [
  {
    title: 'Move a piece',
    text: 'Every piece moves one square in any direction, like a king in chess. Click the blue paper and then a highlighted square, or just drag it.',
    spec: { blue: { P: ['d4'] }, red: { R: ['h8'] } },
    turn: BLUE,
    accept: 'any',
    done: 'That is the only way anything moves. No jumping, no sliding.',
  },
  {
    title: 'Capture',
    text: 'Rock beats scissors, scissors beats paper, paper beats rock. Take the red scissors on e5 with your rock.',
    spec: { blue: { R: ['d4'] }, red: { S: ['e5'], P: ['h8'] } },
    turn: BLUE,
    accept: ['d4xe5'],
    done: 'Captured. A piece can only ever be taken by the one type that beats it.',
  },
  {
    title: 'Walls',
    text: 'Paper cannot take paper, so the red paper on i9 is a wall for your paper on h8. Your scissors on h9 is another story. Win the game.',
    spec: { blue: { P: ['h8'], S: ['h9'] }, red: { P: ['i9'], R: ['b2'] } },
    turn: BLUE,
    accept: ['h9xi9'],
    done: 'That is a win. Any piece reaching the far corner ends the game on the spot, and capturing into it counts.',
  },
  {
    title: 'Defend your corner',
    text: 'Now the other way round. Red\'s paper on b2 is one step from your corner. Put your own paper on a1 so it has nowhere to go.',
    spec: { blue: { P: ['a2'], R: ['g7'] }, red: { P: ['b2'], S: ['h9'] } },
    turn: BLUE,
    accept: ['a2-a1'],
    done: 'Blocked. A piece in its own corner stops everything it does not lose to. That idea, and counting how far each runner is from the corner, is most of the strategy.',
  },
  {
    title: 'You are ready',
    text: 'That is the whole game. Blue moves first, no legal moves means you lose, and 100 moves without a capture is a draw. Go play the computer, and turn on Threats if you want the board to show you what is under attack.',
    spec: null,
    finish: true,
  },
];

// Tips shown on the play page.
export const TIPS = [
  'Count the pieces on both sides every few moves. One scissors against three enemy papers is losing even when material is equal.',
  'Every square on a ring is the same number of moves from the corner. A defender has to stay ahead of the runner in rings, or it arrives second.',
  'Two moves is a lot. A trapped piece can wait; an attack on the corner cannot.',
  'You start with four papers and only three rocks and three scissors, so losing a paper hurts least.',
  'A piece sitting in your own corner blocks two of the three enemy types. Only the type that beats it can get through.',
  'An active defence captures the runner. A passive defence only blocks it. Capture when you can.',
  'A defender one ring behind can still catch a runner if both are on the same side of the ring.',
  'Trading into an endgame favours whoever is already closer to the enemy corner.',
  'Scattered pieces get picked off one at a time. When you are spread thin, retreat and regroup first.',
  'If the enemy has no scissors left, your papers can never be captured. Sometimes a sacrifice is worth that.',
  'A piece that attacks two enemy pieces it beats will usually win one of them. Look for forks.',
  'Before accepting a trade, picture the piece counts afterwards. Balanced beats lopsided.',
];

// A computer versus computer game replayed on the home page.
export const DEMO_MOVES = '1. d4-d5 e7-d7 2. c3-d4 d7-c6 3. c5-b6 f8-e7 4. b4-c5 c6xb5 5. c5xb5 e7-e6 6. d4-e5 e6xd5 7. e5xf6 f7xf6 8. c4xd5 g5-f5 9. d2-c3 e8-e7 10. c3-d4 f6-e5 11. d4-c4 f5-e6 12. b6-c5 e7-f7 13. c5-d6 g7-f6 14. b5-c6 h6-g7 15. c6-d7 e6xd5 16. c4xd5 f7-e7 17. e3-d4 e7xd7 18. d3-e4 e5xd5 19. e4-e5 d5-c4 20. d4xc4 f6-e6 21. e5xe6 g7-h7 22. e6-f7 g6-g7 23. f7-g8 g7-h8 24. g8xh7 d7-c6 25. d6-e5 c6-b5 26. e5-f6 b5-a4 27. f6-g7 h8-i7 28. g7-h8 h5-i5 29. h8-i9 1-0';
