# intransitive

A browser version of Intransitive, the nine by nine strategy game where
rock, paper and scissors pieces race for the far corner. Play the computer
or a friend, learn the rules on the board, read the strategy notes, and
solve the puzzles.

**Live at [mathmaster1296.github.io/intransitive](https://mathmaster1296.github.io/intransitive/).**

This is a fan-made site and is not affiliated with the game's designer.

## The game

Each side has three rocks, four papers and three scissors on a 9x9 board.
Pieces move one square in any direction. Rock captures scissors, scissors
captures paper, paper captures rock, and nothing else can be moved onto. The
first player to get any piece into the opponent's home corner wins. There is
no stalemate (no legal moves means you lose) and a game with 100 moves and no
captures is a draw.

## What is here

- A rules engine that follows the game's rules exactly, including the
  edge cases, with a chess-style move notation so games can be copied and
  pasted.
- A computer opponent with three levels: an alpha-beta search with a
  capture-only quiescence search, running in a Web Worker. The evaluation
  is the game's strategy advice written down: material, matchup (a side with no
  scissors cannot ever capture a paper), distance to the enemy corner, and
  a ring-rule check for runners that can no longer be stopped.
- Drag and drop or click to move, an evaluation bar, move ratings (best,
  good, inaccuracy, mistake, blunder), hints with an arrow, a threats
  overlay, a rings overlay, board flipping, and move-by-move review.
- Play a friend online by link: the browsers connect directly to each other
  through a public signalling server, with no account and no server of our
  own. Clocks with increments for games between people, an adaptive computer
  level pinned to your rating, and four computer personalities (balanced,
  aggressive, defensive, trader). Watch mode pits two levels against each
  other.
- Analysis tools on any position: the engine's top three moves drawn as
  arrows, a coach that explains material, matchup, runners and threats in
  plain words, and a game report with accuracy, error counts, a clickable
  evaluation graph and the turning point of the game.
- Share links for whole games and for single positions, board colour and
  piece-style settings, and offline support as an installable web app.
- A one-minute interactive tutorial, a home page demo game, rules and
  strategy pages with diagrams, and strategy tips on the play page.
- A large puzzle set mined from the engine: positions with exactly one
  winning or saving move, grouped by theme (races, blocks, stopping a
  runner, forks, traps, and more) and rated by difficulty. Wrong answers
  get a specific refutation, solved puzzles show the engine's line, and
  there is a daily puzzle with a streak calendar, a three-minute puzzle
  rush, a streak mode where puzzles get harder until you miss, a review set
  of the puzzles you failed, and a button to play any position out against
  the computer. `node tools/verify.mjs` re-checks
  every shipped puzzle.
- Ratings, all stored only in your browser: a provisional Elo against the
  computer levels (with history and peak), a separate puzzle rating where
  every puzzle carries its own rating and your first attempt moves yours,
  and named player profiles for two-player games with their own Elo and a
  local leaderboard. Plus win-loss records, streaks and badges.
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
tools/mine.mjs     mines candidate puzzles from self-play and random positions
tools/curate.mjs   verifies, themes and explains them into js/puzzledata.js
tools/verify.mjs   re-checks every shipped puzzle
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
js/lessons.js      diagram positions, guide data, tutorial steps, tips
js/coach.js        plain-language position explanations
js/review.js       game report and evaluation graph
js/online.js       peer-to-peer online play
js/settings.js     board and piece appearance
js/puzzledata.js   the puzzle set (generated)
js/strategy.js     the strategy guide
js/stats.js        rating, record and badges
js/sound.js        synthesised sound effects
js/fx.js           confetti
js/app.js          routing, theme, dialogs, boot
sw.js              offline cache
test/test.mjs
tools/mine.mjs     mines candidate puzzles from self-play and random positions
tools/curate.mjs   verifies, themes and explains them into js/puzzledata.js
tools/verify.mjs   re-checks every shipped puzzle
```

## Licence

MIT. The game itself belongs to its designer.
