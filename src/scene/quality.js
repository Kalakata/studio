// Full effects on desktop, a reduced path on phones. The phone path must hold 60 fps.

export const QUALITY = {
  // filter taps are 2x2 bilinear comparisons, four depth fetches each
  full: { pixelRatio: 2,    shadowMap: 4096, blocker: 16, filter: 16, ao: true,  mergeWindows: false },
  fast: { pixelRatio: 1.25, shadowMap: 2048, blocker: 8,  filter: 6,  ao: false, mergeWindows: true }
};

const KEY = 'studio.quality';

export function detectQuality() {
  const coarse = window.matchMedia?.('(pointer: coarse)').matches;
  const small = Math.min(window.screen?.width ?? 1e4, window.screen?.height ?? 1e4) < 600;
  const lowMemory = navigator.deviceMemory !== undefined && navigator.deviceMemory <= 4;
  return coarse || small || lowMemory ? 'fast' : 'full';
}

export function initialQuality() {
  try {
    const q = localStorage.getItem(KEY);
    if (q in QUALITY) return q;
  } catch { /* storage blocked */ }
  return detectQuality();
}

export function saveQuality(q) {
  try { localStorage.setItem(KEY, q); } catch { /* storage blocked */ }
}
