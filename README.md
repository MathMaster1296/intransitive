# intransitive

A browser version of Intransitive, the nine by nine strategy game where
rock, paper and scissors pieces race for the far corner. Play the computer
or a friend, learn the rules on the board, read the strategy notes, and
solve the puzzles.

**Live at [mathmaster1296.github.io/intransitive](https://mathmaster1296.github.io/intransitive/).**

This is a fan-made site and is not affiliated with the game's designer. The
official site, with online play, ratings and tournaments, is
[meaf.us/rps2](https://meaf.us/rps2/), built by Meaf.

## The game

Each side has three rocks, four papers and three scissors on a 9x9 board.
Pieces move one square in any direction. Rock captures scissors, scissors
captures paper, paper captures rock, and nothing else can be moved onto. The
first player to get any piece into the opponent's home corner wins. There is
no stalemate (no legal moves means you lose) and a game with 100 moves and no
captures is a draw.

## What is here

- A rules engine that matches the official implementation, including the
  edge cases, and uses the same move notation, so games can be copied
  between the two sites.
- A computer opponent with three levels: an alpha-beta search with a
  capture-only quiescence search, running in a Web Worker. The evaluation
  is the game's strategy advice written down: material, matchup (a side with no
  scissors cannot ever capture a paper), distance to the enemy corner, and
  a ring-rule check for runners that can no longer be stopped.
- Drag and drop or click to move, an evaluation bar, move ratings (best,
  good, inaccuracy, mistake, blunder), hints with an arrow, a threats
  overlay, a rings overlay, board flipping, and move-by-move review.
- A one-minute interactive tutorial, a home page demo game, rules and
  strategy pages with diagrams, and strategy tips on the play page.
- Puzzles with one decisive idea each, all checked with the search, a
  featured daily puzzle, and a button to play any puzzle position out
  against the computer.
- A local rating, win-loss record, streaks and badges, stored only in your
  browser.
- Share links that replay a whole game, sound effects, confetti, keyboard
  shortcuts, light and dark themes, and offline support as an installable
  web app.

## Run it locally

Everything is static files, so any web server will do. For example:

```bash
python3 -m http.server 8093
```

Then open http://localhost:8093/. The computer opponent uses a module
worker, so the page needs to be served over http rather than opened as a
file.

Tests use the Node test runner:

```bash
node --test test/test.mjs
```

## Layout

```
index.html         the whole site, six sections switched by the URL hash
css/style.css
js/engine.js       rules, move generation, notation, share-link encoding
js/ai.js           evaluation and search
js/worker.js       runs the search off the main thread
js/analysis.js     engine channels for moves, hints and evaluation
js/board.js        board rendering, drag and drop, arrows, animations
js/game.js         the play page
js/puzzles.js      the puzzles page
js/tutorial.js     the guided tutorial
js/home.js         the demo game on the home page
js/lessons.js      diagram positions, puzzles, tutorial steps, tips
js/stats.js        rating, record and badges
js/sound.js        synthesised sound effects
js/fx.js           confetti
js/app.js          routing, theme, dialogs, boot
sw.js              offline cache
test/test.mjs
```

## Licence

MIT. The game itself belongs to its designer.
