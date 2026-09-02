# intransitive

A browser version of Intransitive, the nine by nine strategy game designed by
webgoatguy where rock, paper and scissors pieces race for the far corner.
Play against the computer or a friend, read the rules, work through the
strategy notes from the designer's video, and try the puzzles.

**Live at [mathmaster1296.github.io/intransitive](https://mathmaster1296.github.io/intransitive/).**

This is a fan-made site. The official site, with online play, ratings and
tournaments, is [meaf.us/rps2](https://meaf.us/rps2/), built by Meaf. The
rules and all of the strategy material come from webgoatguy's video
[Intransitive - How To Play & Basic Strategy](https://www.youtube.com/watch?v=LO_zcGNJriA).

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
  between the two sites with the copy and load buttons.
- A computer opponent with three levels. It is an alpha-beta search with a
  capture-only quiescence search, running in a Web Worker. The evaluation
  is the video's advice written down: material, matchup (a side with no
  scissors cannot ever capture a paper), distance to the enemy corner, and
  a ring-rule check for runners that can no longer be stopped.
- Rules and strategy pages with board diagrams, and a rings overlay on the
  play page for counting distances the way the video does.
- Three puzzles whose solutions were checked with the search.
- Light and dark themes, and the current game survives a page refresh.

## Run it locally

It is static files. Any web server will do; for example:

```bash
python3 -m http.server 8093
```

then open http://localhost:8093/. The computer opponent uses a module
worker, so the page needs to be served over http rather than opened as a
file.

Tests use the Node test runner:

```bash
node --test test/test.mjs
```

## Layout

```
index.html       the whole site, five sections switched by the URL hash
css/style.css
js/engine.js     rules, move generation, notation, game records
js/ai.js         evaluation and search
js/worker.js     runs the search off the main thread
js/board.js      board rendering for the game, diagrams and puzzles
js/lessons.js    diagram positions and puzzle definitions
js/app.js        UI, routing, persistence
test/test.mjs
```

## Licence

MIT. The game itself belongs to its designer.
