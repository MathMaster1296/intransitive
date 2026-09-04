import { search, rankMoves, LEVELS } from './ai.js';

self.onmessage = (e) => {
  const { id, board, player, sinceCapture, level, opts, op } = e.data;
  const options = opts || LEVELS[level] || LEVELS.medium;
  const b = new Uint8Array(board);
  const result = op === 'rank' ? rankMoves(b, player, sinceCapture, options) : search(b, player, sinceCapture, options);
  self.postMessage({ id, result });
};
