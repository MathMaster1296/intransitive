// Tiny synthesised sound effects. No audio files, nothing to download.

const KEY = 'intransitive.sound';
let ctx = null;
let enabled = true;

try {
  enabled = localStorage.getItem(KEY) !== 'off';
} catch {
  enabled = true;
}

function audio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function tone(freq, { type = 'sine', start = 0, duration = 0.12, gain = 0.18, slide = 0 } = {}) {
  const ac = audio();
  if (!ac) return;
  const t0 = ac.currentTime + start;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t0 + duration);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(g).connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
}

function noise({ start = 0, duration = 0.06, gain = 0.12, cutoff = 1800 } = {}) {
  const ac = audio();
  if (!ac) return;
  const t0 = ac.currentTime + start;
  const buffer = ac.createBuffer(1, Math.ceil(ac.sampleRate * duration), ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const src = ac.createBufferSource();
  src.buffer = buffer;
  const filter = ac.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = cutoff;
  const g = ac.createGain();
  g.gain.value = gain;
  src.connect(filter).connect(g).connect(ac.destination);
  src.start(t0);
}

const EFFECTS = {
  select() {
    tone(660, { type: 'triangle', duration: 0.05, gain: 0.06 });
  },
  move() {
    noise({ duration: 0.05, gain: 0.16, cutoff: 1400 });
    tone(220, { type: 'sine', duration: 0.07, gain: 0.12, slide: -80 });
  },
  capture() {
    noise({ duration: 0.09, gain: 0.22, cutoff: 900 });
    tone(140, { type: 'sine', duration: 0.16, gain: 0.2, slide: -60 });
    tone(880, { type: 'triangle', start: 0.03, duration: 0.08, gain: 0.07 });
  },
  win() {
    [523, 659, 784, 1047].forEach((f, i) => tone(f, { type: 'triangle', start: i * 0.11, duration: 0.22, gain: 0.14 }));
    tone(1319, { type: 'triangle', start: 0.44, duration: 0.5, gain: 0.12 });
  },
  lose() {
    [440, 392, 330].forEach((f, i) => tone(f, { type: 'sine', start: i * 0.16, duration: 0.3, gain: 0.12 }));
  },
  draw() {
    tone(440, { type: 'sine', duration: 0.25, gain: 0.1 });
    tone(440, { type: 'sine', start: 0.3, duration: 0.25, gain: 0.1 });
  },
  error() {
    tone(180, { type: 'square', duration: 0.09, gain: 0.05 });
  },
  badge() {
    [784, 988, 1175, 1568].forEach((f, i) => tone(f, { type: 'triangle', start: i * 0.07, duration: 0.18, gain: 0.1 }));
  },
  tick() {
    tone(1200, { type: 'sine', duration: 0.03, gain: 0.04 });
  },
};

export const sound = {
  get enabled() {
    return enabled;
  },
  set enabled(value) {
    enabled = !!value;
    try {
      localStorage.setItem(KEY, enabled ? 'on' : 'off');
    } catch {
      // ignore
    }
  },
  play(name) {
    if (!enabled || !EFFECTS[name]) return;
    try {
      EFFECTS[name]();
    } catch {
      // Audio can fail before a user gesture; that is fine.
    }
  },
  // Warm the context up on the first user gesture so later sounds are instant.
  prime() {
    audio();
  },
};
