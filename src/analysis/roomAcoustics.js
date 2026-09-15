// Low-frequency acoustics of the room as a rigid rectangular box: its modes, the bass response
// from a monitor to the ears, first-reflection points, where each wall is solid, and the depth of
// a tuned membrane bass trap. Pure: takes the room (room.json) and plain positions. No three.js.
//
// Scene coordinates: x along the length (-L/2..L/2), y up from the floor, z across the width.
// The modal model holds below the Schroeder frequency (about 2000 * sqrt(T60 / V), ~130 Hz here);
// glass and plasterboard leak bass that a rigid box keeps, so peaks come out sharper than real.

export const C = 343;                 // speed of sound, m/s

const TAU = 2 * Math.PI;

// Every mode up to fMax: indices along length, width, height, frequency, and axial/tangential/oblique.
export function roomModes(room, fMax = 300) {
  const { length: L, width: W, height: H } = room.clear;
  const out = [];
  for (let a = 0; a <= Math.floor(2 * L * fMax / C); a++) {
    for (let b = 0; b <= Math.floor(2 * W * fMax / C); b++) {
      for (let c = 0; c <= Math.floor(2 * H * fMax / C); c++) {
        const f = C / 2 * Math.hypot(a / L, b / W, c / H);
        if (f > fMax) continue;
        const nonzero = (a > 0) + (b > 0) + (c > 0);
        out.push({ n: [a, b, c], f, kind: ['pressure', 'axial', 'tangential', 'oblique'][nonzero] });
      }
    }
  }
  return out.sort((p, q) => p.f - q.f);
}

// The mode's pressure shape at a point, -1..1: 1 or -1 at an antinode, 0 on a nodal plane.
export function modeShape(room, mode, [x, y, z]) {
  const { length: L, width: W, height: H } = room.clear;
  const [a, b, c] = mode.n;
  return Math.cos(a * Math.PI * (x + L / 2) / L) * Math.cos(b * Math.PI * (z + W / 2) / W) * Math.cos(c * Math.PI * y / H);
}

// Frequencies spaced 1/perOctave octave apart from f0 to f1.
export function logFrequencies(f0, f1, perOctave = 24) {
  const n = Math.round(Math.log2(f1 / f0) * perOctave);
  return Array.from({ length: n + 1 }, (_, i) => f0 * 2 ** (i / perOctave));
}

// Porous absorber (mineral wool panel) t thick on an air gap g: absorption rising from nothing to
// alphaMax, reaching half at c / (30 D) with D = t + g / 2. Fitted to published 100 mm panel
// figures (about 0.55-0.65 at 125 Hz); a rough curve, good for comparing treatments.
export function porousAbsorption({ thickness, gap = 0, alphaMax = 1 }) {
  const half = C / (30 * (thickness + gap / 2));
  return (f) => alphaMax / (1 + (half / f) ** 2);
}

// Membrane absorber: a resonance at membraneFrequency(mass, depth), peak absorption `peak`,
// bandwidth set by q (about 2-3 with mineral wool loose in the cavity).
export function membraneAbsorption({ mass, depth, peak = 0.8, q = 2.5 }) {
  const f0 = membraneFrequency(mass, depth);
  return (f) => peak / (1 + q * q * (f / f0 - f0 / f) ** 2);
}

// table: a piece that absorbs like one of the MATERIALS below (a rug)
const ABSORPTION = { porous: porousAbsorption, membrane: membraneAbsorption, table: ({ material }) => materialAbsorption(material) };

// Materials: absorption coefficients at 63, 125, 250, 500, 1000 and 2000 Hz. 125-2000 Hz are the
// published figures (Everest, Master Handbook of Acoustics, and the usual coefficient tables); 63 Hz
// is rarely tabulated and repeats 125 Hz. For glass the figure is mostly bass passing out through the pane.
export const BANDS = [63, 125, 250, 500, 1000, 2000];
export const MATERIALS = {
  'plaster-on-brick':    { label: 'Lime plaster on solid brick', alpha: [0.013, 0.013, 0.015, 0.02, 0.03, 0.04] },
  'brick':               { label: 'Bare brick',                  alpha: [0.03, 0.03, 0.03, 0.03, 0.04, 0.05] },
  'single-glazing':      { label: 'Single glazing',              alpha: [0.35, 0.35, 0.25, 0.18, 0.12, 0.07] },
  'double-glazing':      { label: 'Double glazing',              alpha: [0.15, 0.15, 0.05, 0.03, 0.03, 0.02] },
  'concrete':            { label: 'Concrete slab, hard finish',  alpha: [0.01, 0.01, 0.01, 0.015, 0.02, 0.02] },
  'ceramic-tiles':       { label: 'Ceramic tiles on a slab',     alpha: [0.01, 0.01, 0.01, 0.01, 0.02, 0.02] },
  'wood-floor-on-joists':{ label: 'Wooden floor on joists',      alpha: [0.15, 0.15, 0.11, 0.10, 0.07, 0.06] },
  'plaster-on-concrete': { label: 'Plaster on poured concrete',         alpha: [0.013, 0.013, 0.015, 0.02, 0.03, 0.04] },
  'door-wood':           { label: 'Solid timber door',           alpha: [0.14, 0.14, 0.10, 0.06, 0.08, 0.10] },
  // rugs and carpet: little below 250 Hz, most of their work is in the mids and highs
  'carpet-on-underlay':  { label: 'Heavy carpet on foam underlay', alpha: [0.08, 0.08, 0.24, 0.57, 0.69, 0.71] },
  'rug-on-tiles':        { label: 'Rug straight on a hard floor',  alpha: [0.02, 0.02, 0.06, 0.14, 0.37, 0.60] },
  'curtain-heavy':       { label: 'Heavy velour, draped to half area', alpha: [0.14, 0.14, 0.35, 0.55, 0.72, 0.70] }
};

// A material's absorption at any frequency: straight lines between bands on a log-frequency axis.
export function materialAbsorption(id) {
  const m = MATERIALS[id];
  if (!m) throw new Error(`unknown material "${id}"`);
  return (f) => {
    if (f <= BANDS[0]) return m.alpha[0];
    for (let i = 1; i < BANDS.length; i++) {
      if (f <= BANDS[i]) {
        const t = Math.log(f / BANDS[i - 1]) / Math.log(BANDS[i] / BANDS[i - 1]);
        return m.alpha[i - 1] + t * (m.alpha[i] - m.alpha[i - 1]);
      }
    }
    return m.alpha[BANDS.length - 1];
  };
}

export const DEFAULT_SHELL = { walls: 'plaster-on-concrete', windows: 'double-glazing', floor: 'concrete', ceiling: 'plaster-on-concrete', furnishing: 2 };

// The shell as absorbers: floor, ceiling, every wall over its full area, and each opening adding the
// difference between its own material and the wall's. Surfaces are boxes in scene coordinates
// ([[x0, x1], [y0, y1], [z0, z1]], one range flat), so a mode's pressure is averaged over them exactly.
// `materials` overrides room.json's acoustics block; furnishing is absorption spread through the room.
export function shellAbsorbers(room, materials = {}) {
  const { length: L, width: W, height: H } = room.clear;
  const m = { ...DEFAULT_SHELL, ...room.acoustics, ...materials };
  const out = [
    { type: 'floor', area: L * W, box: [[-L / 2, L / 2], [0, 0], [-W / 2, W / 2]], alpha: materialAbsorption(m.floor) },
    { type: 'ceiling', area: L * W, box: [[-L / 2, L / 2], [H, H], [-W / 2, W / 2]], alpha: materialAbsorption(m.ceiling) }
  ];
  const wallAlpha = materialAbsorption(m.walls);
  const planes = { '-z': [2, -W / 2], '+z': [2, W / 2], '-x': [0, -L / 2], '+x': [0, L / 2] };
  for (const wall of room.walls) {
    const [axis, at] = planes[wall.side];
    const run = axis === 2 ? 0 : 2;                       // the horizontal axis the wall runs along
    const len = axis === 2 ? L : W;
    const box = (u0, u1, y0, y1) => {
      const b = [null, [y0, y1], null];
      b[axis] = [at, at];
      b[run] = [u0, u1].sort((p, q) => p - q);
      return b;
    };
    out.push({ type: `wall ${wall.id}`, area: len * H, box: box(-len / 2, len / 2, 0, H), alpha: wallAlpha });
    // along the wall from its left-hand corner, as room.json measures openings
    const corner = axis === 2 ? -Math.sign(at) * (-L / 2) : Math.sign(at) * (-W / 2);
    const dir = axis === 2 ? (at < 0 ? 1 : -1) : (at > 0 ? 1 : -1);
    for (const o of wall.openings) {
      const own = materialAbsorption(o.type === 'door' ? 'door-wood' : m.windows);
      out.push({
        type: `${o.type ?? 'window'} ${wall.id}`, area: o.width * (o.head - o.sill),
        box: box(corner + dir * o.left, corner + dir * (o.left + o.width), o.sill, o.head),
        alpha: (f) => own(f) - wallAlpha(f)
      });
    }
  }
  if (m.furnishing) out.push({ type: 'furnishing', area: m.furnishing, uniform: true, alpha: () => 1 });
  return out;
}

// Mean of cos^2(n pi u / len) for u from a to b.
function cosSquaredMean(n, a, b, len) {
  if (n === 0) return 1;
  if (b - a < 1e-9) return Math.cos(n * Math.PI * a / len) ** 2;
  const k = 2 * n * Math.PI / len;
  return 0.5 + (Math.sin(k * b) - Math.sin(k * a)) / (2 * k * (b - a));
}

// A mode's squared pressure averaged over an absorber: exactly over a box, sampled over points.
function meanSquare(room, mode, ab) {
  const { length: L, width: W, height: H } = room.clear;
  const [a, b, c] = mode.n;
  if (ab.uniform) return 2 ** -mode.n.filter((k) => k > 0).length;       // spread through the room
  if (ab.box) {
    const [[x0, x1], [y0, y1], [z0, z1]] = ab.box;
    return cosSquaredMean(a, x0 + L / 2, x1 + L / 2, L) * cosSquaredMean(c, y0, y1, H) * cosSquaredMean(b, z0 + W / 2, z1 + W / 2, W);
  }
  return ab.points.reduce((sum, p) => sum + modeShape(room, mode, p) ** 2, 0) / ab.points.length;
}

// Eyring reverberation time at frequency f: 0.161 V / (-S ln(1 - mean absorption)). Sabine reads
// long once a room is well damped; Eyring holds there, so use it for the treated mids and highs.
export function eyringT60(room, absorbers, f) {
  const { length: L, width: W, height: H } = room.clear;
  const S = 2 * (L * W + L * H + W * H);
  const mean = Math.min(absorbers.reduce((s, ab) => s + ab.area * ab.alpha(f), 0) / S, 0.99);
  return 0.161 * L * W * H / (-S * Math.log(1 - mean));
}

// EBU Tech 3276's reverberation target for a listening room, 200 Hz to 4 kHz: 0.25 (V / 100 m^3)^(1/3)
// seconds, within +-0.05 s.
export const ebuTarget = (room) => 0.25 * Math.cbrt(room.clear.length * room.clear.width * room.clear.height / 100);

// Sabine reverberation time at frequency f: 0.161 V / (sum of area x absorption).
export function sabineT60(room, absorbers, f) {
  const { length: L, width: W, height: H } = room.clear;
  const A = absorbers.reduce((s, ab) => s + ab.area * ab.alpha(f), 0);
  return 0.161 * L * W * H / A;
}

// Absorbers from layout items whose catalog entry has an `acoustic` block: an absorption curve, the
// absorbing face's area, and points spread over that face (to read each mode's pressure there).
export function layoutAbsorbers(items, assets, room) {
  const H = room.clear.height, D2R = Math.PI / 180;
  const out = [];
  for (const it of items) {
    const a = assets[it.type], ac = a?.acoustic;
    if (!ac) continue;
    const c = Math.cos((it.ry || 0) * D2R), s = Math.sin((it.ry || 0) * D2R);
    const world = (lx, y, lz) => [it.x + lx * c + lz * s, y, it.z - lx * s + lz * c];
    const thirds = [-1 / 3, 0, 1 / 3], points = [];
    let area;
    if (a.mount === 'ceiling' || ac.floor) {                 // lying flat: its whole footprint absorbs
      const w = it.w ?? a.w, d = it.d ?? a.d;
      area = w * d;
      for (const u of thirds) for (const v of thirds) points.push(world(u * w, ac.floor ? 0 : H, v * d));
    } else {
      const [fw, fh] = it.open && ac.openFace ? ac.openFace : ac.face;    // an open curtain is two stacks
      const yc = ac.faceY ?? ((a.y0 ?? 0) + a.h) / 2;
      area = fw * fh;
      for (const u of thirds) for (const v of thirds) points.push(world(u * fw, yc + v * fh, 0));
    }
    out.push({ type: it.type, area, points, alpha: ABSORPTION[ac.kind](ac) });
  }
  return out;
}

// A response model for one room: modes and their resonance terms precomputed for a set of frequencies,
// so many source and ear positions can be tried cheaply.
//   t60        reverberation time of the bare room at low frequencies; every mode's base damping
//   absorbers  treatment (layoutAbsorbers): each adds damping to a mode in proportion to its
//              absorption at the mode's frequency, its area and the mode's pressure where it sits
//   highpass   the monitor's low corner, as a 4th-order roll-off (0 for none)
export function createResponseModel(room, { freqs = logFrequencies(35, 160), t60 = 0.6, fMax = 300, highpass = 42, absorbers = [] } = {}) {
  const { length: L, width: W, height: H } = room.clear;
  const modes = roomModes(room, fMax);
  const V = L * W * H;
  // Kuttruff's modal sum for a source of constant volume acceleration (flat in free field):
  // p ~ sum psi_s psi_r / (Lambda (w_n^2 - w^2 + 2j delta_n w)), Lambda = product of 1/2 per nonzero index.
  // Sabine's delta = 6.91 / T60 = c A / 8V; an absorber's share for one mode weights its area by psi^2 / Lambda.
  const re = modes.map(() => new Float64Array(freqs.length));
  const im = modes.map(() => new Float64Array(freqs.length));
  modes.forEach((m, i) => {
    const wn = TAU * m.f, norm = 2 ** m.n.filter((k) => k > 0).length;       // 1 / Lambda
    let delta = 6.91 / t60;
    for (const ab of absorbers) {
      delta += C / (8 * V) * ab.alpha(m.f) * ab.area * meanSquare(room, m, ab) * norm;
    }
    m.delta = delta;
    freqs.forEach((f, k) => {
      const w = TAU * f, dr = wn * wn - w * w, di = 2 * delta * w, mag = dr * dr + di * di;
      re[i][k] = norm * dr / mag;
      im[i][k] = -norm * di / mag;
    });
  });
  const roll = freqs.map((f) => Math.sqrt(f ** 8 / (f ** 8 + highpass ** 8)));
  const cosTable = (n, v, len) => Math.cos(n * Math.PI * v / len);

  // Complex pressure at `ear` from sources that play together, per frequency (arbitrary reference).
  function pressure(sources, ear) {
    const pr = new Float64Array(freqs.length), pi = new Float64Array(freqs.length);
    const [ex, ey, ez] = ear;
    modes.forEach((m, i) => {
      const [a, b, c] = m.n;
      const atEar = cosTable(a, ex + L / 2, L) * cosTable(b, ez + W / 2, W) * cosTable(c, ey, H);
      if (Math.abs(atEar) < 1e-12) return;
      let s = 0;
      for (const [sx, sy, sz] of sources) s += cosTable(a, sx + L / 2, L) * cosTable(b, sz + W / 2, W) * cosTable(c, sy, H);
      const g = s * atEar;
      for (let k = 0; k < freqs.length; k++) { pr[k] += g * re[i][k]; pi[k] += g * im[i][k]; }
    });
    return { re: pr, im: pi };
  }

  // Level in dB at each frequency, power-averaged over the ears.
  function level(sources, ears) {
    const power = new Float64Array(freqs.length);
    for (const ear of ears) {
      const p = pressure(sources, ear);
      for (let k = 0; k < freqs.length; k++) power[k] += (p.re[k] ** 2 + p.im[k] ** 2) * roll[k] ** 2 / ears.length;
    }
    return Array.from(power, (v) => 10 * Math.log10(v + 1e-30));
  }

  return { freqs, modes, pressure, level };
}

// How far a response strays from flat: spread (standard deviation, dB) and the worst peak and dip
// against its mean, with the frequencies they sit at.
export function flatness(freqs, db) {
  const mean = db.reduce((s, v) => s + v, 0) / db.length;
  const spread = Math.sqrt(db.reduce((s, v) => s + (v - mean) ** 2, 0) / db.length);
  let peak = 0, dip = 0;
  db.forEach((v, k) => { if (v > db[peak]) peak = k; if (v < db[dip]) dip = k; });
  return { spread, peak: { f: freqs[peak], db: db[peak] - mean }, dip: { f: freqs[dip], db: db[dip] - mean }, mean };
}

// Local maxima that stand more than `above` dB over the mean, strongest first.
export function peaks(freqs, db, above = 3) {
  const mean = db.reduce((s, v) => s + v, 0) / db.length;
  const out = [];
  for (let k = 1; k < db.length - 1; k++) {
    if (db[k] >= db[k - 1] && db[k] >= db[k + 1] && db[k] - mean > above) out.push({ f: freqs[k], db: db[k] - mean });
  }
  return out.sort((p, q) => q.db - p.db);
}

// First-order reflections from a source to an ear off each of the six surfaces: where the sound
// strikes, and how much later than the direct sound it arrives.
export function firstReflections(room, source, ear) {
  const { length: L, width: W, height: H } = room.clear;
  const planes = [
    { surface: '+x', axis: 0, at: L / 2 }, { surface: '-x', axis: 0, at: -L / 2 },
    { surface: '+z', axis: 2, at: W / 2 }, { surface: '-z', axis: 2, at: -W / 2 },
    { surface: 'ceiling', axis: 1, at: H }, { surface: 'floor', axis: 1, at: 0 }
  ];
  const direct = Math.hypot(...source.map((v, i) => v - ear[i]));
  return planes.map(({ surface, axis, at }) => {
    const image = source.slice();
    image[axis] = 2 * at - source[axis];
    const t = (at - image[axis]) / (ear[axis] - image[axis]);
    const point = image.map((v, i) => (i === axis ? at : v + t * (ear[i] - v)));
    const path = Math.hypot(...image.map((v, i) => v - ear[i]));
    return { surface, point, extra: path - direct, delayMs: (path - direct) / C * 1000 };
  });
}

// Solid stretches of a wall between its openings, as world-coordinate intervals along the wall
// (x for the long walls, z for the end walls). `frame` is spec.js's wallFrame for that wall.
export function solidSpans(wall, frame) {
  const axis = frame.along[0] !== 0 ? 0 : 2;
  const toWorld = (s) => (axis === 0 ? frame.leftCorner[0] + frame.along[0] * s : frame.leftCorner[1] + frame.along[2] * s);
  const ops = wall.openings.slice().sort((a, b) => a.left - b.left);
  const spans = [];
  let from = 0;
  for (const o of ops) {
    if (o.left > from) spans.push([from, o.left]);
    from = Math.max(from, o.left + o.width);
  }
  if (from < frame.length) spans.push([from, frame.length]);
  return spans.map(([a, b]) => [toWorld(a), toWorld(b)].sort((p, q) => p - q));
}

// Membrane (panel) absorber: a sealed box with a limp front panel of surface mass m (kg/m^2) over an
// air cavity d (m) deep resonates at about 60 / sqrt(m d) Hz (Everest, Master Handbook of Acoustics).
export const membraneFrequency = (mass, depth) => 60 / Math.sqrt(mass * depth);
export const membraneDepth = (f, mass) => (60 / f) ** 2 / mass;
