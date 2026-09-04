// Engine access from the page. Two workers: one for the opponent's moves and
// one for analysis (evaluation bar, hints, move quality), so a hint never
// delays the computer's reply. Falls back to the main thread when module
// workers are unavailable.

let aiModule = null;

function createChannel() {
  let worker = null;
  let broken = false;
  let nextId = 1;
  const waiting = new Map();

  function ensure() {
    if (worker || broken) return worker;
    try {
      worker = new Worker('js/worker.js', { type: 'module' });
      worker.onmessage = (e) => {
        const entry = waiting.get(e.data.id);
        if (!entry) return;
        waiting.delete(e.data.id);
        entry.resolve(e.data.result);
      };
      worker.onerror = () => {
        broken = true;
        try {
          worker.terminate();
        } catch {
          // ignore
        }
        worker = null;
        for (const [id, entry] of waiting) {
          waiting.delete(id);
          runInline(entry.request).then(entry.resolve, entry.reject);
        }
      };
    } catch {
      broken = true;
      worker = null;
    }
    return worker;
  }

  async function runInline(request) {
    if (!aiModule) aiModule = await import('./ai.js');
    await new Promise((r) => setTimeout(r, 20));
    const opts = request.opts || aiModule.LEVELS[request.level] || aiModule.LEVELS.medium;
    const b = new Uint8Array(request.board);
    if (request.op === 'rank') return aiModule.rankMoves(b, request.player, request.sinceCapture, opts);
    return aiModule.search(b, request.player, request.sinceCapture, opts);
  }

  return function run(request) {
    const id = nextId++;
    const w = ensure();
    if (!w) return runInline(request);
    return new Promise((resolve, reject) => {
      waiting.set(id, { resolve, reject, request });
      w.postMessage({ id, ...request });
    });
  };
}

const moveChannel = createChannel();
const analysisChannel = createChannel();

export const engine = {
  // Move for the computer opponent. `level` is a name or an options object.
  bestMove(board, player, sinceCapture, level) {
    if (typeof level === 'object') return moveChannel({ board, player, sinceCapture, opts: level });
    return moveChannel({ board, player, sinceCapture, level });
  },
  // Every legal move scored, best first.
  rank(board, player, sinceCapture, opts = { maxDepth: 3, timeMs: 110, top: 5 }) {
    return analysisChannel({ board, player, sinceCapture, opts, op: 'rank' });
  },
  // Quick evaluation. Resolves with the search result: score is from the
  // side to move's point of view.
  analyze(board, player, sinceCapture, opts = { maxDepth: 4, timeMs: 260, noise: 0 }) {
    return analysisChannel({ board, player, sinceCapture, opts });
  },
  hint(board, player, sinceCapture) {
    return analysisChannel({ board, player, sinceCapture, opts: { maxDepth: 7, timeMs: 900, noise: 0 } });
  },
};

// Map a centipiece-ish score (from blue's point of view) to a 0..1 share for
// the evaluation bar.
export function scoreToShare(blueScore) {
  if (blueScore >= 90000) return 0.98;
  if (blueScore <= -90000) return 0.02;
  return 1 / (1 + Math.exp(-blueScore / 260));
}

export function describeScore(blueScore) {
  if (Math.abs(blueScore) >= 90000) {
    const side = blueScore > 0 ? 'Blue' : 'Red';
    const plies = 100000 - Math.abs(blueScore);
    return `${side} wins in ${Math.ceil(plies / 2)}`;
  }
  const pieces = blueScore / 100;
  if (Math.abs(pieces) < 0.15) return 'Even';
  const side = pieces > 0 ? 'Blue' : 'Red';
  return `${side} +${Math.abs(pieces).toFixed(1)}`;
}
