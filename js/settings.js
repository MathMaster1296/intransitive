// Appearance settings: board colours, piece style, motion.

const KEY = 'intransitive.settings.v1';
export const BOARD_THEMES = {
  walnut: 'Walnut',
  slate: 'Slate',
  forest: 'Forest',
  sand: 'Sand',
  ocean: 'Ocean',
};

let settings = { board: 'walnut', pieces: 'icons', motion: true, palette: 'standard' };

export function loadSettings() {
  try {
    Object.assign(settings, JSON.parse(localStorage.getItem(KEY) || '{}'));
  } catch {
    // ignore
  }
  apply();
  return settings;
}

export function updateSettings(patch) {
  Object.assign(settings, patch);
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // ignore
  }
  apply();
  return settings;
}

export function getSettings() {
  return settings;
}

function apply() {
  const root = document.documentElement;
  root.dataset.board = BOARD_THEMES[settings.board] ? settings.board : 'walnut';
  root.dataset.pieces = settings.pieces === 'letters' ? 'letters' : 'icons';
  root.dataset.motion = settings.motion ? 'on' : 'off';
  root.dataset.palette = settings.palette === 'friendly' ? 'friendly' : 'standard';
}
