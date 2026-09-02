import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BLUE, RED, ROCK, PAPER, SCISSORS, HOME, GOAL, STAGNATION_PLIES,
  piece, ownerOf, typeOf, beats, predator, prey, parseCell, cellName, dist, ring,
  mirror, startingBoard, counts, legalMoves, targetsFrom, canMove, packMove,
  newGame, play, undo, movesText, parseMoves, notation, describeResult, resign,
} from '../js/engine.js';
import { search, evaluate, WIN } from '../js/ai.js';

function boardFrom(spec) {
  const board = new Uint8Array(81);
  for (const [player, types] of [[BLUE, spec.blue || {}], [RED, spec.red || {}]]) {
    for (const [letter, cells] of Object.entries(types)) {
      const type = 'RPS'.indexOf(letter);
      for (const name of cells) board[parseCell(name)] = piece(player, type);
    }
  }
  return board;
}

function gameFrom(spec, turn = BLUE, sinceCapture = 0) {
  return { board: boardFrom(spec), turn, moves: [], boards: [], sinceCapture, result: null };
}

test('piece encoding round trips', () => {
  for (let p = 0; p < 2; p++) {
    for (let t = 0; t < 3; t++) {
      const v = piece(p, t);
      assert.equal(ownerOf(v), p);
      assert.equal(typeOf(v), t);
    }
  }
  assert.equal(ownerOf(0), -1);
});

test('rock beats scissors, scissors beats paper, paper beats rock', () => {
  assert.ok(beats(ROCK, SCISSORS));
  assert.ok(beats(SCISSORS, PAPER));
  assert.ok(beats(PAPER, ROCK));
  assert.ok(!beats(SCISSORS, ROCK));
  assert.ok(!beats(PAPER, SCISSORS));
  assert.ok(!beats(ROCK, PAPER));
  assert.ok(!beats(ROCK, ROCK));
  assert.equal(predator(ROCK), PAPER);
  assert.equal(prey(ROCK), SCISSORS);
});

test('cell names and distances', () => {
  assert.equal(parseCell('a1'), 0);
  assert.equal(parseCell('i9'), 80);
  assert.equal(cellName(parseCell('e5')), 'e5');
  assert.equal(parseCell('j1'), -1);
  assert.equal(parseCell('a0'), -1);
  assert.equal(dist(parseCell('a1'), parseCell('i9')), 8);
  assert.equal(dist(parseCell('c3'), parseCell('d5')), 2);
  assert.equal(ring(parseCell('e2'), BLUE), 4);
  assert.equal(ring(parseCell('e2'), RED), 7);
  assert.equal(HOME[BLUE], 0);
  assert.equal(GOAL[BLUE], 80);
});

test('starting position matches the official setup', () => {
  const board = startingBoard();
  assert.deepEqual(counts(board), [[3, 4, 3], [3, 4, 3]]);
  assert.equal(board[parseCell('b4')], piece(BLUE, ROCK));
  assert.equal(board[parseCell('e2')], piece(BLUE, PAPER));
  assert.equal(board[parseCell('d4')], piece(BLUE, SCISSORS));
  // red is the mirror image across the a9 to i1 diagonal
  assert.equal(board[parseCell('f8')], piece(RED, ROCK));
  assert.equal(board[parseCell('h5')], piece(RED, PAPER));
  assert.equal(board[parseCell('e7')], piece(RED, SCISSORS));
  assert.equal(board[0], 0);
  assert.equal(board[80], 0);
  assert.equal(mirror(parseCell('b4')), parseCell('f8'));
  assert.equal(mirror(mirror(parseCell('c5'))), parseCell('c5'));
});

test('pieces move one step in any direction', () => {
  const board = boardFrom({ blue: { P: ['e5'] } });
  const targets = targetsFrom(board, parseCell('e5')).map(cellName).sort();
  assert.deepEqual(targets, ['d4', 'd5', 'd6', 'e4', 'e6', 'f4', 'f5', 'f6']);
  const corner = boardFrom({ blue: { R: ['a1'] } });
  assert.deepEqual(targetsFrom(corner, 0).map(cellName).sort(), ['a2', 'b1', 'b2']);
});

test('captures only follow the rock paper scissors cycle', () => {
  const board = boardFrom({
    blue: { R: ['e5'], P: ['d4'] },
    red: { S: ['e6'], P: ['f6'], R: ['f5'] },
  });
  const from = parseCell('e5');
  assert.ok(canMove(board, from, parseCell('e6')));
  assert.ok(!canMove(board, from, parseCell('f6')));
  assert.ok(!canMove(board, from, parseCell('f5')));
  assert.ok(!canMove(board, from, parseCell('d4')));
  assert.ok(!canMove(board, from, parseCell('e7')));
  const targets = targetsFrom(board, from).map(cellName).sort();
  assert.deepEqual(targets, ['d5', 'd6', 'e4', 'e6', 'f4']);
});

test('blue moves first and has 36 opening moves', () => {
  const game = newGame();
  assert.equal(game.turn, BLUE);
  assert.equal(legalMoves(game.board, BLUE).length, 36);
  assert.equal(legalMoves(game.board, RED).length, 36);
});

test('play rejects wrong piece and illegal moves', () => {
  const game = newGame();
  assert.throws(() => play(game, packMove(parseCell('e7'), parseCell('e6'))), /Not your piece/);
  assert.throws(() => play(game, packMove(parseCell('c5'), parseCell('c7'))), /Illegal/);
  assert.throws(() => play(game, packMove(parseCell('c5'), parseCell('c4'))), /Illegal/);
});

test('reaching the far corner wins', () => {
  const game = gameFrom({ blue: { S: ['h8'] }, red: { R: ['a3'] } });
  const next = play(game, packMove(parseCell('h8'), parseCell('i9')));
  assert.deepEqual(next.result, { winner: BLUE, reason: 'corner' });
  assert.equal(describeResult(next.result), 'Blue wins by reaching the corner.');
  const redGame = gameFrom({ blue: { S: ['h8'] }, red: { R: ['b2'] } }, RED);
  const redWin = play(redGame, packMove(parseCell('b2'), parseCell('a1')));
  assert.deepEqual(redWin.result, { winner: RED, reason: 'corner' });
});

test('you can capture into the corner and win', () => {
  const game = gameFrom({ blue: { S: ['h8'] }, red: { P: ['i9'], R: ['a5'] } });
  const next = play(game, packMove(parseCell('h8'), parseCell('i9')));
  assert.deepEqual(next.result, { winner: BLUE, reason: 'corner' });
  assert.equal(next.moves[0].notation, 'h8xi9');
});

test('a blocked corner cannot be entered', () => {
  const board = boardFrom({ blue: { S: ['h8'] }, red: { S: ['i9'] } });
  assert.ok(!canMove(board, parseCell('h8'), parseCell('i9')));
});

test('no legal moves loses immediately', () => {
  // The blue rock in its own corner is boxed in by red rocks and papers.
  const game = gameFrom({ blue: { R: ['a1'] }, red: { P: ['a2', 'b1'], R: ['b2', 'e5'] } }, RED);
  const next = play(game, packMove(parseCell('e5'), parseCell('e4')));
  assert.deepEqual(next.result, { winner: RED, reason: 'no_moves' });
});

test('capturing the last piece wins', () => {
  const game = gameFrom({ blue: { R: ['d4'] }, red: { S: ['e5'] } });
  const next = play(game, packMove(parseCell('d4'), parseCell('e5')));
  assert.deepEqual(next.result, { winner: BLUE, reason: 'no_pieces' });
});

test('stagnation draws after 200 half-moves without a capture', () => {
  const game = gameFrom({ blue: { R: ['b2'] }, red: { R: ['h8'] } }, BLUE, STAGNATION_PLIES - 1);
  const next = play(game, packMove(parseCell('b2'), parseCell('b3')));
  assert.deepEqual(next.result, { winner: null, reason: 'stagnation' });
  const fresh = gameFrom({ blue: { R: ['b2'] }, red: { R: ['h8'] } }, BLUE, STAGNATION_PLIES - 2);
  assert.equal(play(fresh, packMove(parseCell('b2'), parseCell('b3'))).result, null);
});

test('a capture resets the stagnation clock', () => {
  const game = gameFrom({ blue: { R: ['d4'] }, red: { S: ['e5'], P: ['h8'] } }, BLUE, 150);
  const next = play(game, packMove(parseCell('d4'), parseCell('e5')));
  assert.equal(next.sinceCapture, 0);
});

test('notation, move text, undo and parsing round trip', () => {
  let game = newGame();
  game = play(game, packMove(parseCell('c5'), parseCell('d6')));
  game = play(game, packMove(parseCell('e8'), parseCell('d7')));
  game = play(game, packMove(parseCell('d6'), parseCell('d7')));
  assert.equal(game.moves[0].notation, 'c5-d6');
  assert.equal(game.moves[1].notation, 'e8-d7');
  assert.equal(game.moves[2].notation, 'd6xd7');
  assert.equal(movesText(game), '1. c5-d6 e8-d7 2. d6xd7');
  assert.equal(game.sinceCapture, 0);
  assert.equal(game.turn, RED);
  const back = undo(game);
  assert.equal(back.moves.length, 2);
  assert.equal(back.turn, BLUE);
  assert.equal(back.sinceCapture, 2);
  assert.equal(back.board[parseCell('d7')], piece(RED, PAPER));
  const parsed = parseMoves('1. c5-d6 e8-d7 2. d6xd7 f7-e6');
  assert.equal(parsed.moves.length, 4);
  assert.equal(parsed.turn, BLUE);
  assert.deepEqual(Array.from(parsed.board), Array.from(play(game, packMove(parseCell('f7'), parseCell('e6'))).board));
  assert.throws(() => parseMoves('1. c5-d6 zz'), /not a move/);
  assert.throws(() => parseMoves('1. c5-c7'), /not legal/);
  assert.equal(notation(newGame().board, packMove(parseCell('c5'), parseCell('d6'))), 'c5-d6');
});

test('resigning ends the game', () => {
  const game = resign(newGame(), BLUE);
  assert.deepEqual(game.result, { winner: RED, reason: 'resign' });
  assert.equal(movesText(game), '0-1');
});

test('search takes an immediate win', () => {
  const board = boardFrom({ blue: { S: ['h8', 'b2'] }, red: { R: ['a3'], P: ['d5'] } });
  const r = search(board, BLUE, 0, { maxDepth: 3, timeMs: 500 });
  assert.equal(cellName(r.move % 81), 'i9');
});

test('search blocks an opponent about to win', () => {
  // Red paper on b2 threatens a1 next move. Blue's paper on b1 can step in.
  const board = boardFrom({ blue: { P: ['b1'], R: ['h4'] }, red: { P: ['b2'], R: ['g8'] } });
  const r = search(board, BLUE, 0, { maxDepth: 4, timeMs: 1000 });
  assert.equal(cellName(r.move % 81), 'a1');
});

test('search captures a hanging piece instead of wandering', () => {
  const board = boardFrom({ blue: { R: ['d4'], P: ['b3'] }, red: { S: ['e5'], R: ['h9'] } });
  const r = search(board, BLUE, 0, { maxDepth: 4, timeMs: 1000 });
  assert.equal(notation(board, r.move), 'd4xe5');
});

test('search returns null with no legal moves', () => {
  const board = boardFrom({ blue: { R: ['a1'] }, red: { P: ['a2', 'b1'], R: ['b2'] } });
  assert.equal(search(board, BLUE), null);
});

test('evaluation is symmetric at the start', () => {
  const board = startingBoard();
  assert.equal(evaluate(board, BLUE) + evaluate(board, RED), 0);
});

test('evaluation prefers a balanced distribution', () => {
  const balanced = boardFrom({ blue: { R: ['b2', 'c2'], P: ['b3', 'c3'], S: ['d2', 'd3'] }, red: { R: ['g7'], P: ['g8', 'h8'], S: ['h7', 'g6', 'h6'] } });
  const lopsided = boardFrom({ blue: { R: ['b2', 'c2', 'b3'], P: ['c3', 'd2', 'd3'] }, red: { R: ['g7'], P: ['g8', 'h8'], S: ['h7', 'g6', 'h6'] } });
  assert.ok(evaluate(balanced, BLUE) > evaluate(lopsided, BLUE));
});

test('a full game between two computer players ends legally', () => {
  let game = newGame();
  let guard = 0;
  while (!game.result && guard++ < 400) {
    const r = search(game.board, game.turn, game.sinceCapture, { maxDepth: 2, timeMs: 200, noise: 30 });
    assert.ok(r, 'search returned a move');
    game = play(game, r.move);
  }
  assert.ok(game.result, 'game finished');
  assert.ok(['corner', 'no_moves', 'no_pieces', 'stagnation'].includes(game.result.reason));
  assert.ok(Math.abs(WIN) > 0);
});
