// Online play by link: WebRTC data channels via PeerJS. No server of our own;
// PeerJS's public signalling server introduces the two browsers and the
// moves then travel directly between them.

const PEER_SRC = 'https://cdnjs.cloudflare.com/ajax/libs/peerjs/1.5.4/peerjs.min.js';

function randomId() {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  let s = '';
  for (let i = 0; i < 7; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

async function loadPeer() {
  if (window.Peer) return window.Peer;
  await new Promise((resolve, reject) => {
    const el = document.createElement('script');
    el.src = PEER_SRC;
    el.onload = resolve;
    el.onerror = () => reject(new Error('Could not load the connection library.'));
    document.head.appendChild(el);
  });
  return window.Peer;
}

export function createOnline(ui) {
  let peer = null;
  let conn = null;
  let role = null;
  let handlers = {};
  let me = { name: '', rating: 1200 };
  let them = null;
  let options = {};

  function status(text) {
    if (handlers.status) handlers.status(text);
  }

  function send(msg) {
    if (conn && conn.open) conn.send(msg);
  }

  function attach(c) {
    conn = c;
    c.on('data', (msg) => {
      if (!msg || typeof msg !== 'object') return;
      if (msg.type === 'hello') {
        them = { name: String(msg.name || 'Opponent').slice(0, 18), rating: Number(msg.rating) || 1200 };
        if (role === 'host') {
          const hostColor = options.color === 'random' ? (Math.random() < 0.5 ? 0 : 1) : Number(options.color);
          send({ type: 'start', hostColor, clock: options.clock || null, name: me.name, rating: me.rating });
          if (handlers.start) handlers.start({ color: hostColor, opponent: them, clock: options.clock || null });
        }
        return;
      }
      if (msg.type === 'start' && role === 'guest') {
        them = { name: String(msg.name || 'Opponent').slice(0, 18), rating: Number(msg.rating) || 1200 };
        if (handlers.start) handlers.start({ color: 1 - Number(msg.hostColor), opponent: them, clock: msg.clock || null });
        return;
      }
      if (msg.type === 'move' && handlers.move) handlers.move(Number(msg.m), Number(msg.ply));
      if (msg.type === 'resign' && handlers.resign) handlers.resign();
      if (msg.type === 'draw-offer' && handlers.drawOffer) handlers.drawOffer();
      if (msg.type === 'draw-accept' && handlers.drawAccept) handlers.drawAccept();
      if (msg.type === 'rematch' && handlers.rematch) handlers.rematch(msg);
    });
    c.on('close', () => {
      status('Opponent disconnected.');
      if (handlers.close) handlers.close();
    });
    c.on('error', () => status('Connection error.'));
  }

  async function host(opts) {
    options = opts;
    me = { name: opts.name || 'Host', rating: opts.rating || 1200 };
    role = 'host';
    const Peer = await loadPeer();
    return new Promise((resolve, reject) => {
      const id = 'intr-' + randomId();
      peer = new Peer(id);
      peer.on('open', () => {
        status('Waiting for your opponent to open the link.');
        resolve(`${location.origin}${location.pathname}#join=${id}`);
      });
      peer.on('connection', (c) => {
        if (conn && conn.open) {
          c.close();
          return;
        }
        attach(c);
        c.on('open', () => {
          status('Connected. Starting.');
          send({ type: 'hello', name: me.name, rating: me.rating });
        });
      });
      peer.on('error', (err) => {
        status(`Connection problem: ${err.type || err.message}`);
        reject(err);
      });
      peer.on('disconnected', () => status('Lost the signalling server. Reloading the link may help.'));
    });
  }

  async function join(id, opts) {
    options = opts;
    me = { name: opts.name || 'Guest', rating: opts.rating || 1200 };
    role = 'guest';
    const Peer = await loadPeer();
    return new Promise((resolve, reject) => {
      peer = new Peer();
      peer.on('open', () => {
        status('Connecting to the host.');
        const c = peer.connect(id, { reliable: true });
        attach(c);
        c.on('open', () => {
          send({ type: 'hello', name: me.name, rating: me.rating });
          resolve();
        });
        setTimeout(() => {
          if (!c.open) {
            status('Could not reach the host. Is their tab still open?');
            reject(new Error('timeout'));
          }
        }, 12000);
      });
      peer.on('error', (err) => {
        status(`Connection problem: ${err.type || err.message}`);
        reject(err);
      });
    });
  }

  function leave() {
    try {
      if (conn) conn.close();
      if (peer) peer.destroy();
    } catch {
      // ignore
    }
    conn = null;
    peer = null;
    role = null;
    them = null;
  }

  return {
    host,
    join,
    leave,
    send,
    on(map) { handlers = { ...handlers, ...map }; },
    get connected() { return !!(conn && conn.open); },
    get role() { return role; },
    get opponent() { return them; },
    get me() { return me; },
  };
}
