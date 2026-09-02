import { search, LEVELS } from './ai.js';

self.onmessage = (e) => {
  const { id, board, player, sinceCapture, level, opts } = e.data;
  const options = opts || LEVELS[level] || LEVELS.medium;
  const result = search(new Uint8Array(board), player, sinceCapture, options);
  self.postMessage({ id, result });
};
