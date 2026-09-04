// Hot-seat round-robin tournaments on one device.

import { loadStats, saveStats, getPlayer } from './stats.js';

const KEY = 'intransitive.tournament.v1';

// Circle-method schedule. Returns rounds of [blueIndex, redIndex] pairs. With
// `double` every pair meets twice with colours swapped.
export function roundRobin(count, double = false) {
  const ids = Array.from({ length: count }, (_, i) => i);
  if (ids.length % 2) ids.push(-1);
  const m = ids.length;
  const rounds = [];
  const blues = new Array(count).fill(0);
  for (let r = 0; r < m - 1; r++) {
    const pairs = [];
    for (let i = 0; i < m / 2; i++) {
      const a = ids[i];
      const b = ids[m - 1 - i];
      if (a < 0 || b < 0) continue;
      // Give blue to whoever has had it less often so far.
      const pair = blues[a] <= blues[b] ? [a, b] : [b, a];
      blues[pair[0]] += 1;
      pairs.push(pair);
    }
    rounds.push(pairs);
    ids.splice(1, 0, ids.pop());
  }
  if (double) {
    const back = rounds.map((rd) => rd.map(([a, b]) => [b, a]));
    rounds.push(...back);
  }
  return rounds;
}

export function createSchedule(names, double = false, clock = 'none') {
  const rounds = roundRobin(names.length, double);
  const games = [];
  rounds.forEach((pairs, r) => pairs.forEach(([blue, red]) => games.push({ round: r + 1, blue, red, result: undefined })));
  return { names, double, clock, games, rounds: rounds.length, created: Date.now(), current: null };
}

// Points: a win is 1, a draw is half. Sorted by points, then wins, then name.
export function standings(t) {
  const rows = t.names.map((name, i) => ({ i, name, points: 0, wins: 0, draws: 0, losses: 0, played: 0 }));
  for (const g of t.games) {
    if (g.result === undefined) continue;
    const b = rows[g.blue];
    const r = rows[g.red];
    b.played += 1;
    r.played += 1;
    if (g.result === null) {
      b.points += 0.5;
      r.points += 0.5;
      b.draws += 1;
      r.draws += 1;
    } else if (g.result === 0) {
      b.points += 1;
      b.wins += 1;
      r.losses += 1;
    } else {
      r.points += 1;
      r.wins += 1;
      b.losses += 1;
    }
  }
  return rows.sort((a, b) => b.points - a.points || b.wins - a.wins || a.name.localeCompare(b.name));
}

export function nextGame(t) {
  return t.games.findIndex((g) => g.result === undefined);
}

export function loadTournament() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveTournament(t) {
  try {
    if (t) localStorage.setItem(KEY, JSON.stringify(t));
    else localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}

export function createTournament(ui, game) {
  const $ = (id) => document.getElementById(id);
  let T = loadTournament();

  function render() {
    const card = $('tournament-card');
    if (!T) {
      card.hidden = true;
      return;
    }
    card.hidden = false;
    const rows = standings(T);
    const done = T.games.filter((g) => g.result !== undefined).length;
    const next = nextGame(T);
    $('tournament-title').textContent = `${T.names.length} players, ${T.double ? 'double' : 'single'} round robin${T.clock !== 'none' ? `, ${T.clock}` : ''}`;
    $('tournament-progress').textContent = `${done} of ${T.games.length} games played`;
    $('tournament-standings').innerHTML = rows.map((r, i) => {
      const stats = loadStats();
      const pl = stats.players && stats.players[r.name];
      return `<li><span class="lb-rank">${i + 1}</span><span class="lb-name">${escape(r.name)}</span><span class="lb-rec muted">${r.wins}-${r.draws}-${r.losses}${pl ? ` · ${pl.rating}` : ''}</span><strong>${r.points}</strong></li>`;
    }).join('');
    if (next >= 0) {
      const g = T.games[next];
      $('tournament-next').innerHTML = `Round ${g.round} of ${T.rounds}: <span class="dot blue"></span> <strong>${escape(T.names[g.blue])}</strong> against <span class="dot red"></span> <strong>${escape(T.names[g.red])}</strong>`;
      $('tournament-play').hidden = false;
      $('tournament-play').textContent = T.current === next ? 'Resume this game' : 'Play this game';
      $('tournament-image').hidden = true;
    } else {
      $('tournament-next').innerHTML = `<strong>${escape(rows[0].name)}</strong> wins the tournament with ${rows[0].points} point${rows[0].points === 1 ? '' : 's'}.`;
      $('tournament-play').hidden = true;
      $('tournament-image').hidden = false;
    }
  }

  function escape(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function start(names, double, clock) {
    const clean = [...new Set(names.map((n) => n.trim().slice(0, 18)).filter(Boolean))];
    if (clean.length < 2) throw new Error('Enter at least two different names.');
    if (clean.length > 8) throw new Error('Eight players at most.');
    const stats = loadStats();
    clean.forEach((n) => getPlayer(stats, n));
    saveStats(stats);
    T = createSchedule(clean, double, clock);
    saveTournament(T);
    render();
    playNext();
  }

  function playNext() {
    if (!T) return;
    const next = nextGame(T);
    if (next < 0) return;
    const g = T.games[next];
    T.current = next;
    saveTournament(T);
    render();
    game.startGame({
      mode: 'two',
      names: { blue: T.names[g.blue], red: T.names[g.red] },
      clock: T.clock,
      tournament: next,
    });
    if (location.hash !== '#play') location.hash = '#play';
    ui.toast(`Round ${g.round}: ${T.names[g.blue]} (blue) against ${T.names[g.red]} (red).`);
  }

  function recordResult(index, winner) {
    if (!T || !T.games[index] || T.games[index].result !== undefined) return;
    T.games[index].result = winner;
    T.current = null;
    saveTournament(T);
    render();
    const next = nextGame(T);
    if (next < 0) {
      const rows = standings(T);
      setTimeout(() => ui.toast(`Tournament over. ${rows[0].name} wins with ${rows[0].points} points.`, 'badge-toast'), 1200);
    }
  }

  function end() {
    T = null;
    saveTournament(null);
    render();
  }

  return {
    render, start, playNext, recordResult, end,
    get state() { return T; },
    get standings() { return T ? standings(T) : []; },
  };
}
