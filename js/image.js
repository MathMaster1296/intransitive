// Renders a board to a PNG for sharing: result cards, positions, standings.

import * as E from './engine.js';
import { GLYPH_PATHS } from './board.js';

function cssVar(name, fallback) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawPiece(ctx, cx, cy, size, v, palette) {
  const owner = E.ownerOf(v);
  const type = E.typeOf(v);
  const colours = owner === E.BLUE
    ? ['#9ab9ff', cssVar('--blue', '#3a7bff'), cssVar('--blue-deep', '#1f4fc9')]
    : palette === 'friendly'
      ? ['#ffc48a', '#f28c28', '#b85f0a']
      : ['#ffb0ae', cssVar('--red', '#f0524f'), cssVar('--red-deep', '#c42b2b')];
  const r = size * 0.4;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = size * 0.08;
  ctx.shadowOffsetY = size * 0.04;
  const g = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.4, r * 0.1, cx, cy, r);
  g.addColorStop(0, colours[0]);
  g.addColorStop(0.5, colours[1]);
  g.addColorStop(1, colours[2]);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  if (owner === E.RED && palette === 'friendly') {
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = size * 0.04;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.82, 0, Math.PI * 2);
    ctx.stroke();
  }
  // Glyph: the 24-unit SVG path scaled into the disc.
  const s = (r * 1.25) / 24;
  ctx.save();
  ctx.translate(cx - 12 * s, cy - 12 * s);
  ctx.scale(s, s);
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2.3;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const d of GLYPH_PATHS[type]) ctx.stroke(new Path2D(d));
  ctx.restore();
}

// Draws the board into ctx at (x, y) with the given side length.
export function drawBoard(ctx, board, x, y, size, { lastMove = null, flipped = false, palette = 'standard' } = {}) {
  const cell = size / 9;
  const cellA = cssVar('--cell-a', '#f0e4c9');
  const cellB = cssVar('--cell-b', '#d8c39a');
  const frame = cssVar('--frame', '#5b3f27');
  ctx.save();
  ctx.fillStyle = frame;
  roundRect(ctx, x - cell * 0.35, y - cell * 0.35, size + cell * 0.7, size + cell * 0.7, cell * 0.3);
  ctx.fill();
  for (let i = 0; i < 81; i++) {
    const c = E.col(i);
    const r = E.row(i);
    const dc = flipped ? 8 - c : c;
    const dr = flipped ? r : 8 - r;
    const px = x + dc * cell;
    const py = y + dr * cell;
    ctx.fillStyle = (c + r) % 2 === 1 ? cellB : cellA;
    ctx.fillRect(px, py, cell, cell);
    if (i === E.HOME[0] || i === E.HOME[1]) {
      ctx.fillStyle = i === E.HOME[0] ? 'rgba(58,123,255,0.35)' : 'rgba(240,82,79,0.35)';
      ctx.fillRect(px, py, cell, cell);
      ctx.strokeStyle = i === E.HOME[0] ? 'rgba(31,79,201,0.6)' : 'rgba(196,43,43,0.6)';
      ctx.setLineDash([cell * 0.08, cell * 0.06]);
      ctx.lineWidth = cell * 0.04;
      ctx.beginPath();
      ctx.arc(px + cell / 2, py + cell / 2, cell * 0.26, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (lastMove && (i === lastMove.from || i === lastMove.to)) {
      ctx.fillStyle = 'rgba(255,196,0,0.3)';
      ctx.fillRect(px, py, cell, cell);
    }
  }
  // Coordinates inside the frame.
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.font = `700 ${Math.round(cell * 0.22)}px Manrope, system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let k = 0; k < 9; k++) {
    const file = E.FILES[flipped ? 8 - k : k];
    const rank = flipped ? k + 1 : 9 - k;
    ctx.fillText(file, x + k * cell + cell / 2, y + size + cell * 0.18);
    ctx.fillText(String(rank), x - cell * 0.18, y + k * cell + cell / 2);
  }
  for (let i = 0; i < 81; i++) {
    if (!board[i]) continue;
    const c = E.col(i);
    const r = E.row(i);
    const dc = flipped ? 8 - c : c;
    const dr = flipped ? r : 8 - r;
    drawPiece(ctx, x + dc * cell + cell / 2, y + dr * cell + cell / 2, cell, board[i], palette);
  }
  ctx.restore();
}

// A square share card: title, subtitle, the board, and a footer line.
export function boardImage({ board, lastMove = null, flipped = false, title, subtitle = '', footer = '', palette = 'standard' }) {
  const W = 1200;
  const H = 1320;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  const bg = cssVar('--bg', '#f4efe6');
  const text = cssVar('--text', '#1e1b16');
  const muted = cssVar('--muted', '#6b655b');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = text;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.font = '800 64px Outfit, Manrope, system-ui, sans-serif';
  ctx.fillText(title, W / 2, 110);
  if (subtitle) {
    ctx.fillStyle = muted;
    ctx.font = '600 34px Manrope, system-ui, sans-serif';
    ctx.fillText(subtitle, W / 2, 170);
  }
  const size = 920;
  drawBoard(ctx, board, (W - size) / 2, 230, size, { lastMove, flipped, palette });
  ctx.fillStyle = muted;
  ctx.font = '600 28px Manrope, system-ui, sans-serif';
  ctx.fillText(footer || 'Intransitive', W / 2, H - 60);
  return canvas;
}

// A standings card for a tournament.
export function standingsImage({ title, subtitle = '', rows, footer = '' }) {
  const W = 1200;
  const rowH = 78;
  const H = 300 + rows.length * rowH + 120;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  const bg = cssVar('--bg', '#f4efe6');
  const surface = cssVar('--surface', '#fffdf9');
  const text = cssVar('--text', '#1e1b16');
  const muted = cssVar('--muted', '#6b655b');
  const accent = cssVar('--accent', '#2f6ee8');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = text;
  ctx.textAlign = 'center';
  ctx.font = '800 60px Outfit, Manrope, system-ui, sans-serif';
  ctx.fillText(title, W / 2, 110);
  if (subtitle) {
    ctx.fillStyle = muted;
    ctx.font = '600 32px Manrope, system-ui, sans-serif';
    ctx.fillText(subtitle, W / 2, 165);
  }
  const x = 100;
  const w = W - 200;
  let y = 230;
  ctx.textAlign = 'left';
  ctx.fillStyle = muted;
  ctx.font = '700 24px Manrope, system-ui, sans-serif';
  ctx.fillText('PLAYER', x + 90, y);
  ctx.textAlign = 'right';
  ctx.fillText('W-D-L', x + w - 200, y);
  ctx.fillText('POINTS', x + w - 30, y);
  y += 30;
  rows.forEach((r, i) => {
    ctx.fillStyle = i === 0 ? accent : surface;
    roundRect(ctx, x, y, w, rowH - 10, 16);
    ctx.fill();
    ctx.fillStyle = i === 0 ? '#fff' : text;
    ctx.textAlign = 'left';
    ctx.font = '800 34px Outfit, Manrope, system-ui, sans-serif';
    ctx.fillText(String(i + 1), x + 30, y + 46);
    ctx.font = '700 34px Manrope, system-ui, sans-serif';
    ctx.fillText(r.name, x + 90, y + 46);
    ctx.textAlign = 'right';
    ctx.font = '600 30px Manrope, system-ui, sans-serif';
    ctx.fillText(`${r.wins}-${r.draws}-${r.losses}`, x + w - 200, y + 46);
    ctx.font = '800 34px Outfit, Manrope, system-ui, sans-serif';
    ctx.fillText(String(r.points), x + w - 30, y + 46);
    y += rowH;
  });
  ctx.fillStyle = muted;
  ctx.textAlign = 'center';
  ctx.font = '600 28px Manrope, system-ui, sans-serif';
  ctx.fillText(footer || 'Intransitive', W / 2, H - 50);
  return canvas;
}

function toBlob(canvas) {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}

export async function copyImage(canvas) {
  if (!navigator.clipboard || !window.ClipboardItem) return false;
  try {
    const blob = await toBlob(canvas);
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    return true;
  } catch {
    return false;
  }
}

export function downloadImage(canvas, filename) {
  const a = document.createElement('a');
  a.href = canvas.toDataURL('image/png');
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
