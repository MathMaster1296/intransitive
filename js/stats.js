// Local statistics, rating and badges. Everything lives in localStorage.

const KEY = 'intransitive.stats.v1';
export const LEVEL_RATING = { easy: 900, medium: 1200, hard: 1500 };
export const PROVISIONAL_GAMES = 10;
export const PROVISIONAL_PUZZLES = 20;

export const BADGES = [
  { id: 'first-win', name: 'First win', desc: 'Beat the computer once.' },
  { id: 'hard-win', name: 'Giant slayer', desc: 'Beat the computer on hard.' },
  { id: 'flawless', name: 'Flawless', desc: 'Win without losing a single piece.' },
  { id: 'sprint', name: 'Sprint', desc: 'Win in 20 moves or fewer.' },
  { id: 'comeback', name: 'Comeback', desc: 'Win a game while down two or more pieces at some point.' },
  { id: 'streak-3', name: 'On a roll', desc: 'Win three games in a row.' },
  { id: 'puzzles', name: 'Puzzle master', desc: 'Solve every puzzle.' },
  { id: 'immortal', name: 'Immortal', desc: 'Win a game after the computer runs out of scissors.' },
  { id: 'ten-games', name: 'Regular', desc: 'Play ten games against the computer.' },
  { id: 'rating-1200', name: 'Club player', desc: 'Reach a game rating of 1200.' },
  { id: 'rating-1500', name: 'Expert', desc: 'Reach a game rating of 1500.' },
  { id: 'puzzle-1500', name: 'Sharp eyes', desc: 'Reach a puzzle rating of 1500.' },
  { id: 'rush-10', name: 'Rush hour', desc: 'Solve ten puzzles in one puzzle rush.' },
];

function blank() {
  return {
    games: 0, wins: 0, losses: 0, draws: 0,
    byLevel: { easy: { w: 0, l: 0, d: 0 }, medium: { w: 0, l: 0, d: 0 }, hard: { w: 0, l: 0, d: 0 } },
    streak: 0, bestStreak: 0, rating: 1000, ratedGames: 0, peak: 1000,
    puzzleRating: 1200, puzzleRated: 0, puzzlePeak: 1200, puzzleAttempts: {}, puzzleHistory: [],
    badges: {}, puzzles: {}, tutorialDone: false, history: [],
    players: {}, lastNames: { blue: '', red: '' },
  };
}

// Player profiles for games between people on the same device.
export function getPlayer(stats, name) {
  const key = String(name || '').trim();
  if (!key) return null;
  if (!stats.players) stats.players = {};
  if (!stats.players[key]) {
    stats.players[key] = { name: key, rating: 1200, games: 0, wins: 0, losses: 0, draws: 0, peak: 1200, history: [] };
  }
  return stats.players[key];
}

// Rate a finished game between two named players. `winner` is 0 for blue,
// 1 for red, or null for a draw. Returns the rating changes.
export function recordTwoPlayerGame(stats, blueName, redName, winner, rated = true) {
  const blue = getPlayer(stats, blueName);
  const red = getPlayer(stats, redName);
  if (!blue || !red || blue === red) return null;
  const scoreBlue = winner === null ? 0.5 : winner === 0 ? 1 : 0;
  const kFor = (pl) => (pl.games < PROVISIONAL_GAMES ? 40 : 24);
  let dBlue = 0;
  let dRed = 0;
  if (rated) {
    dBlue = Math.round(kFor(blue) * (scoreBlue - expected(blue.rating, red.rating)));
    dRed = Math.round(kFor(red) * ((1 - scoreBlue) - expected(red.rating, blue.rating)));
    blue.rating = Math.max(100, blue.rating + dBlue);
    red.rating = Math.max(100, red.rating + dRed);
    blue.peak = Math.max(blue.peak || 0, blue.rating);
    red.peak = Math.max(red.peak || 0, red.rating);
  }
  for (const [pl, sc] of [[blue, scoreBlue], [red, 1 - scoreBlue]]) {
    pl.games += 1;
    if (sc === 1) pl.wins += 1;
    else if (sc === 0) pl.losses += 1;
    else pl.draws += 1;
    pl.history.push({ t: Date.now(), vs: pl === blue ? red.name : blue.name, score: sc, rating: pl.rating });
    if (pl.history.length > 50) pl.history = pl.history.slice(-50);
  }
  stats.lastNames = { blue: blue.name, red: red.name };
  saveStats(stats);
  return { blue: dBlue, red: dRed, blueRating: blue.rating, redRating: red.rating };
}

export function leaderboard(stats, limit = 8) {
  return Object.values(stats.players || {})
    .sort((a, b) => b.rating - a.rating || b.games - a.games)
    .slice(0, limit);
}

export function loadStats() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return blank();
    return { ...blank(), ...JSON.parse(raw) };
  } catch {
    return blank();
  }
}

export function saveStats(stats) {
  try {
    localStorage.setItem(KEY, JSON.stringify(stats));
  } catch {
    // Private mode. Stats just do not persist.
  }
}

export function expected(a, b) {
  return 1 / (1 + 10 ** ((b - a) / 400));
}

// Every puzzle carries a rating derived from its difficulty, how long the
// win takes, and whether the key move is quiet.
export function puzzleRating(p) {
  let r = 700 + 300 * p.difficulty;
  if (p.winIn) r += 40 * Math.min(p.winIn, 5);
  if (p.solutions[0] && !p.solutions[0].includes('x')) r += 60;
  if (p.source === 'game') r += 60;
  return r;
}

// The first attempt at a puzzle is rated: solved cleanly counts as a win,
// a wrong move or looking at the solution counts as a loss.
export function recordPuzzleAttempt(stats, p, success) {
  if (stats.puzzleAttempts[p.id]) return { delta: 0, first: false, rating: stats.puzzleRating };
  const pr = puzzleRating(p);
  const k = stats.puzzleRated < PROVISIONAL_PUZZLES ? 40 : 20;
  const delta = Math.round(k * ((success ? 1 : 0) - expected(stats.puzzleRating, pr)));
  stats.puzzleRating = Math.max(100, stats.puzzleRating + delta);
  stats.puzzlePeak = Math.max(stats.puzzlePeak || 0, stats.puzzleRating);
  stats.puzzleRated += 1;
  stats.puzzleAttempts[p.id] = success ? 'win' : 'loss';
  stats.puzzleHistory.push({ t: Date.now(), id: p.id, delta, rating: stats.puzzleRating });
  if (stats.puzzleHistory.length > 100) stats.puzzleHistory = stats.puzzleHistory.slice(-100);
  const earned = [];
  if (stats.puzzleRating >= 1500 && !stats.badges['puzzle-1500']) {
    stats.badges['puzzle-1500'] = Date.now();
    earned.push(BADGES.find((b) => b.id === 'puzzle-1500'));
  }
  saveStats(stats);
  return { delta, first: true, rating: stats.puzzleRating, earned };
}

export function recordRush(stats, score) {
  const earned = [];
  stats.rushBest = Math.max(stats.rushBest || 0, score);
  if (score >= 10 && !stats.badges['rush-10']) {
    stats.badges['rush-10'] = Date.now();
    earned.push(BADGES.find((b) => b.id === 'rush-10'));
  }
  saveStats(stats);
  return earned;
}

// Record a finished game against the computer. `outcome` is 'win', 'loss' or
// 'draw' from the human's point of view. Returns the new badges and the
// rating change.
export function recordGame(stats, {
  level, outcome, moves, rated, piecesLost, maxDeficit, opponentScissorsOut,
}) {
  stats.games += 1;
  const lv = stats.byLevel[level] || (stats.byLevel[level] = { w: 0, l: 0, d: 0 });
  if (outcome === 'win') {
    stats.wins += 1;
    lv.w += 1;
    stats.streak += 1;
    stats.bestStreak = Math.max(stats.bestStreak, stats.streak);
  } else if (outcome === 'loss') {
    stats.losses += 1;
    lv.l += 1;
    stats.streak = 0;
  } else {
    stats.draws += 1;
    lv.d += 1;
  }

  let delta = 0;
  if (rated) {
    const score = outcome === 'win' ? 1 : outcome === 'loss' ? 0 : 0.5;
    const k = stats.ratedGames < 10 ? 40 : 24;
    delta = Math.round(k * (score - expected(stats.rating, LEVEL_RATING[level] || 1200)));
    stats.rating = Math.max(100, stats.rating + delta);
    stats.ratedGames += 1;
    stats.peak = Math.max(stats.peak || 0, stats.rating);
  }

  const earned = [];
  const grant = (id) => {
    if (!stats.badges[id]) {
      stats.badges[id] = Date.now();
      earned.push(BADGES.find((b) => b.id === id));
    }
  };
  if (outcome === 'win') {
    grant('first-win');
    if (level === 'hard') grant('hard-win');
    if (piecesLost === 0) grant('flawless');
    if (moves <= 20) grant('sprint');
    if (maxDeficit >= 2) grant('comeback');
    if (stats.streak >= 3) grant('streak-3');
    if (opponentScissorsOut) grant('immortal');
  }
  if (stats.games >= 10) grant('ten-games');
  if (stats.rating >= 1200) grant('rating-1200');
  if (stats.rating >= 1500) grant('rating-1500');

  stats.history.push({ t: Date.now(), level, outcome, moves, delta, rating: stats.rating });
  if (stats.history.length > 50) stats.history = stats.history.slice(-50);
  saveStats(stats);
  return { earned, delta };
}

export function recordPuzzle(stats, id, total) {
  const earned = [];
  if (!stats.puzzles[id]) {
    stats.puzzles[id] = Date.now();
    if (Object.keys(stats.puzzles).length >= total && !stats.badges.puzzles) {
      stats.badges.puzzles = Date.now();
      earned.push(BADGES.find((b) => b.id === 'puzzles'));
    }
    saveStats(stats);
  }
  return earned;
}
