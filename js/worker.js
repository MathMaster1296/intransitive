import { search, LEVELS } from './ai.js';

self.onmessage = (e) => {
  const { id, board, player, sinceCapture, level } = e.data;
  const opts = LEVELS[level] || LEVELS.medium;
  const result = search(new Uint8Array(board), player, sinceCapture, opts);
  self.postMessage({ id, result });
};
