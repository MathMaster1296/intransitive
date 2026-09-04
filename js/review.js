// Post-game report: accuracy, error counts, evaluation graph, turning point.

import * as E from './engine.js';
import { scoreToShare } from './analysis.js';

const LABEL_SCORE = { best: 100, good: 90, inacc: 65, mistake: 35, blunder: 5 };

export function buildReport(game, quality, evals) {
  const sides = [{ n: 0, sum: 0, counts: { best: 0, good: 0, inacc: 0, mistake: 0, blunder: 0 } }, { n: 0, sum: 0, counts: { best: 0, good: 0, inacc: 0, mistake: 0, blunder: 0 } }];
  game.moves.forEach((mv, i) => {
    const q = quality[i];
    if (!q) return;
    const s = sides[mv.player];
    s.n += 1;
    s.sum += LABEL_SCORE[q.label] || 50;
    s.counts[q.label] = (s.counts[q.label] || 0) + 1;
  });
  let turning = null;
  for (let i = 1; i < evals.length && i <= game.moves.length; i++) {
    if (evals[i] === undefined || evals[i - 1] === undefined) continue;
    const mover = game.moves[i - 1].player;
    const before = mover === E.BLUE ? evals[i - 1] : -evals[i - 1];
    const after = mover === E.BLUE ? evals[i] : -evals[i];
    const drop = Math.min(before, 5000) - Math.min(after, 5000);
    if (drop > 60 && (!turning || drop > turning.drop)) {
      turning = { ply: i, drop, move: game.moves[i - 1].notation, player: mover, better: quality[i - 1] ? quality[i - 1].best : null };
    }
  }
  return {
    accuracy: sides.map((s) => (s.n ? Math.round(s.sum / s.n) : null)),
    counts: sides.map((s) => s.counts),
    rated: sides.map((s) => s.n),
    turning,
  };
}

// Draws the evaluation graph into an SVG element. Points are clickable and
// call onPly(ply).
export function renderEvalGraph(svg, evals, current, onPly) {
  const n = evals.length;
  const w = 320;
  const h = 90;
  if (n < 2) {
    svg.innerHTML = '';
    return;
  }
  const x = (i) => (i / (n - 1)) * w;
  const y = (v) => h - scoreToShare(v) * h;
  let path = `M0 ${y(evals[0])}`;
  for (let i = 1; i < n; i++) path += ` L${x(i)} ${y(evals[i])}`;
  const area = `${path} L${w} ${h} L0 ${h} Z`;
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  svg.innerHTML = `<rect class="eg-red" x="0" y="0" width="${w}" height="${h}"/>`
    + `<path class="eg-blue" d="${area}"/>`
    + `<line class="eg-mid" x1="0" y1="${h / 2}" x2="${w}" y2="${h / 2}"/>`
    + `<path class="eg-line" d="${path}"/>`
    + (current !== null && current < n ? `<line class="eg-cursor" x1="${x(current)}" y1="0" x2="${x(current)}" y2="${h}"/>` : '')
    + evals.map((v, i) => `<circle class="eg-pt" data-ply="${i}" cx="${x(i)}" cy="${y(v)}" r="6"/>`).join('');
  svg.onclick = (e) => {
    const pt = e.target.closest('.eg-pt');
    if (pt && onPly) onPly(Number(pt.dataset.ply));
  };
}
