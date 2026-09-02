// Local statistics, rating and badges. Everything lives in localStorage.

const KEY = 'intransitive.stats.v1';
const LEVEL_RATING = { easy: 900, medium: 1200, hard: 1500 };

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
];

function blank() {
  return {
    games: 0, wins: 0, losses: 0, draws: 0,
    byLevel: { easy: { w: 0, l: 0, d: 0 }, medium: { w: 0, l: 0, d: 0 }, hard: { w: 0, l: 0, d: 0 } },
    streak: 0, bestStreak: 0, rating: 1000, ratedGames: 0,
    badges: {}, puzzles: {}, tutorialDone: false, history: [],
  };
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

function expected(a, b) {
  return 1 / (1 + 10 ** ((b - a) / 400));
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

  stats.history.push({ t: Date.now(), level, outcome, moves, delta });
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
