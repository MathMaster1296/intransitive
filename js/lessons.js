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

// Strategy guide: animated lines. Every line is validated by the tests.
export const STRATEGY_LINES = {
  passive: {
    title: 'A passive block, step by step',
    spec: { blue: { P: ['a3'], S: ['f3'] }, red: { P: ['c3'], S: ['h9'] } },
    turn: BLUE,
    rings: BLUE,
    intro: 'The red paper on c3 is two moves from a1. Blue\'s paper on a3 is also two moves from a1, and it is blue\'s move.',
    moves: 'a3-a2 c3-b2 a2-a1 b2-b3 f3-e3',
    captions: [
      'Blue\'s paper steps onto ring 1 first. Both pieces started on ring 2, and blue was on move, so blue stays a ring ahead.',
      'The runner reaches ring 1 a move too late.',
      'The corner is taken. A paper in the corner cannot be captured by a paper, so the runner is stuck outside.',
      'Red has nothing better than to back off.',
      'Now blue\'s scissors comes to hunt the paper. The block bought all the time blue needed.',
    ],
  },
  active: {
    title: 'An active defence',
    spec: { blue: { S: ['c4'], R: ['g2'] }, red: { P: ['c3'], R: ['h8'] } },
    turn: BLUE,
    rings: BLUE,
    intro: 'The same runner, but this time blue has a scissors right next to it.',
    moves: 'c4xc3',
    captions: [
      'The scissors takes the runner. The threat is gone for good and blue is a piece up. When you can capture the runner, do.',
    ],
  },
  sides: {
    title: 'One ring behind, same side',
    spec: { blue: { R: ['f4'] }, red: { S: ['e2'], R: ['i8'] } },
    turn: BLUE,
    rings: BLUE,
    intro: 'The red scissors on e2 is four moves from a1. Blue\'s rock on f4 is five moves away, one ring behind, but it sits on the same side of the ring as the runner.',
    moves: 'f4-e3 e2-d1 e3-d2 d1-c1 d2xc1',
    captions: [
      'The rock cuts across into the runner\'s path instead of racing it to the corner.',
      'The scissors keeps running along the edge.',
      'The rock shadows it. Every square the scissors can reach from d1 touches d2.',
      'Nowhere safe to go.',
      'Caught. From the other side of the ring the rock could never have got here in time.',
    ],
  },
  otherside: {
    title: 'One ring behind, wrong side',
    spec: { blue: { R: ['b6'] }, red: { S: ['e2'], R: ['i8'] } },
    turn: BLUE,
    rings: BLUE,
    intro: 'The same runner, but now blue\'s rock starts on b6: still ring 5, still one ring behind, but on the north side of the ring while the scissors runs along the south edge.',
    moves: 'b6-c5 e2-d1 c5-d4 d1-c1 d4-c3 c1-b1 c3-b2 b1-a1',
    captions: [
      'The rock heads for the runner as fast as it can.',
      'The scissors keeps going.',
      'Closer, but always a step behind.',
      'Ring 2.',
      'The rock reaches ring 2 too, but it is not touching anything.',
      'Ring 1.',
      'One move late.',
      'Red wins. Same ring, same speed, wrong side.',
    ],
  },
  overload: {
    title: 'Two runners, one blocker',
    spec: { blue: { S: ['a2'], R: ['h2'] }, red: { P: ['e2'], R: ['d1'] } },
    turn: RED,
    rings: BLUE,
    intro: 'Red has a paper and a rock heading for a1. Blue\'s scissors on a2 would stop the paper, but a rock eats scissors. Red to move.',
    moves: 'd1-c2 a2-a1 c2-b2 h2-g3 b2xa1',
    captions: [
      'Red brings the rock, not the paper.',
      'Blue blocks the corner anyway. There is nothing better.',
      'The rock arrives next to the corner.',
      'Blue has no answer.',
      'Rock takes scissors on a1 and the game is over. Two runners of different types need a blocker that beats neither, and blue did not have one.',
    ],
  },
  fork: {
    title: 'A fork',
    spec: { blue: { P: ['d3'] }, red: { R: ['c5', 'e5'], S: ['h8'] } },
    turn: BLUE,
    intro: 'Two red rocks have wandered forward. Blue\'s paper is one step from touching both.',
    moves: 'd3-d4 c5-b6 d4xe5',
    captions: [
      'The paper steps between the two rocks. It attacks both, and a rock cannot capture a paper.',
      'Red saves one rock.',
      'And loses the other. Forks work on any pair of pieces your piece beats.',
    ],
  },
  trap: {
    title: 'A trap',
    spec: { blue: { R: ['c6'], P: ['e2'] }, red: { S: ['a7'], R: ['h8'], P: ['i7'] } },
    turn: BLUE,
    intro: 'A red scissors has strayed to the edge of the board with no friends nearby. Blue\'s rock is two squares away.',
    moves: 'c6-b7 a7-a8 b7xa8',
    captions: [
      'The rock steps to b7, which touches a6, a8, b6 and b8: every square the scissors could run to.',
      'The scissors runs anyway. Any square would have done the same.',
      'Taken. A piece with no safe square is as good as captured, and you can collect it whenever you like.',
    ],
  },
  tempo: {
    title: 'Two moves is a lot',
    spec: { blue: { R: ['f6', 'c8'], P: ['b2'] }, red: { S: ['a9'], R: ['f9'], P: ['c6'] } },
    turn: BLUE,
    intro: 'Blue\'s rock on c8 has the red scissors trapped on a9, and collecting it would take two moves. Blue\'s other rock on f6 is three moves from i9. So is red\'s rock on f9.',
    moves: 'f6-g7 f9-g9 g7-h8 g9-h9 h8-i9',
    captions: [
      'Blue ignores the trapped scissors and starts the race.',
      'Red\'s rock races for the corner too, but it moved second.',
      'Two moves away.',
      'Red is one move behind at every step.',
      'Blue arrives first and wins. The trapped scissors was never going anywhere; the race was the only thing that mattered.',
    ],
  },
};

// Strategy guide: inline try-it positions, reusing the checked puzzles.
export const TRYITS = Object.fromEntries(PUZZLES.map((p) => [p.id, {
  title: p.title,
  spec: p.spec,
  turn: p.turn,
  rings: p.turn,
  prompt: p.prompt,
  solutions: p.solutions,
  success: p.explain,
  fail: p.wrong,
}]));

// Strategy guide: quick checks.
export const QUIZZES = {
  material: {
    title: 'Who is better?',
    question: 'Blue has three rocks, four papers and one scissors. Red has two rocks, three papers and three scissors. Eight pieces each, and nobody is closer to a corner.',
    options: ['Blue, with more papers', 'Red, because blue has only one scissors', 'Nobody, the material is equal'],
    answer: 1,
    explain: 'Blue\'s single scissors has to answer three red papers, and one piece can only be in one place. Red attacks with two papers at once and one of them gets through.',
  },
  ring: {
    title: 'Can the block arrive in time?',
    spec: { blue: { S: ['a5'], P: ['i1'] }, red: { S: ['e2'] } },
    turn: BLUE,
    rings: BLUE,
    question: 'Blue to move. The red scissors on e2 is on ring 4. Blue\'s scissors on a5 is also on ring 4. Can it reach a1 first?',
    options: ['Yes, if it steps to ring 3 right now', 'No, it is already a move too late', 'Only by capturing the runner'],
    answer: 0,
    explain: 'Both are on ring 4 and blue moves first. Step to ring 3 now, then ring 2 when the runner reaches ring 3, and blue arrives a move ahead. If red were on move here, the block would fail.',
  },
  block: {
    title: 'Which blocker?',
    question: 'A red rock is running for your corner. Which of your pieces can sit on a1 and stop it?',
    options: ['A scissors', 'A rock or a paper', 'Only a paper'],
    answer: 1,
    explain: 'The blocker has to be something the runner cannot capture: the same type, or the type that beats it. Rock beats scissors, so a scissors in the corner would just be captured, corner and all.',
  },
  trade: {
    title: 'Take or leave it?',
    question: 'Your scissors can capture a red paper, but a red rock recaptures. Afterwards you would have three rocks, four papers and two scissors; red would have three rocks, three papers and three scissors. Good trade?',
    options: ['Yes, a piece for a piece is fair', 'No, it leaves you short of scissors', 'Only if the rock is far from your corner'],
    answer: 1,
    explain: 'Scissors are your only answer to papers, and red still has three papers after the trade. Equal material, worse distribution. Trades are judged by the counts afterwards, not by the piece you take.',
  },
  tempo: {
    title: 'Piece or race?',
    question: 'You can spend two moves collecting a trapped enemy piece, or start a race for the corner that you win by one move. Which?',
    options: ['Take the piece first, then race', 'Race now; the trapped piece can wait'],
    answer: 1,
    explain: 'Two moves is a lot. The trapped piece is not going anywhere, and spending two moves on it hands your opponent the time to get a blocker into the corner.',
  },
};

// Strategy guide: endgame positions to play out against the computer.
export const ENDGAMES = [
  {
    id: 'three',
    title: 'One of each against two rocks',
    spec: { blue: { R: ['c3'], P: ['d4'], S: ['e4'] }, red: { R: ['f7', 'g6'], P: ['f6'] } },
    turn: BLUE,
    text: 'Rock, paper and scissors against two rocks and a paper. Park a piece in your corner, count rings, and walk the other two forward together.',
  },
  {
    id: 'immortal',
    title: 'The immortal paper',
    spec: { blue: { P: ['d3'], R: ['b2'] }, red: { R: ['f6', 'g7'], P: ['e8'] } },
    turn: BLUE,
    text: 'Red has no scissors, so your paper can never be captured. Use it to escort the rock, and never let a red rock near a1.',
  },
  {
    id: 'overload',
    title: 'Overload the defender',
    spec: { blue: { P: ['c5', 'e3'], R: ['b2'] }, red: { S: ['f7'], R: ['h6'], P: ['g8'] } },
    turn: BLUE,
    text: 'Red\'s only scissors has to watch both of your papers. Make two threats at once and one of them lands.',
  },
  {
    id: 'hold',
    title: 'Hold the fort',
    spec: { blue: { S: ['b3'], R: ['c2'], P: ['d2'] }, red: { S: ['f4'], P: ['g5'], R: ['h6'] } },
    turn: BLUE,
    text: 'Red is coming down the board. Before every move, count rings and decide between blocking and capturing.',
  },
];

// Strategy guide: presets for the position lab.
export const LAB_PRESETS = [
  { name: 'Block in time', spec: { blue: { S: ['a5'], P: ['i1'] }, red: { S: ['e1'] } }, turn: BLUE, note: 'Runner and blocker both on ring 4, blue to move. The block should hold.' },
  { name: 'One move too late', spec: { blue: { S: ['a5'], P: ['i1'] }, red: { S: ['e1'] } }, turn: RED, note: 'The same position with red to move. Now the runner gets there first.' },
  { name: 'Same side, one ring behind', spec: { blue: { R: ['f4'] }, red: { S: ['e2'], R: ['i8'] } }, turn: BLUE, note: 'The rock is one ring behind on the same side of the ring.' },
  { name: 'Wrong side', spec: { blue: { R: ['b6'] }, red: { S: ['e2'], R: ['i8'] } }, turn: BLUE, note: 'Same distance, other side of the ring.' },
  { name: 'Two runners', spec: { blue: { S: ['a2'], R: ['h2'] }, red: { P: ['e2'], R: ['d1'] } }, turn: RED, note: 'A paper and a rock against one scissors blocker.' },
];

DIAGRAMS.opening = {
  board: startingBoard(),
  targets: cellsOf(['f3', 'f4', 'e5']),
  marks: markMap([['no', ['e4', 'd5', 'c6']]]),
  caption: 'The engine\'s favourite first moves for blue are scissors moves to f3, f4 or e5. The crossed squares are where a paper would step in front of its own scissors, the moves the engine rates worst.',
};
