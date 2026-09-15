// What the sound is doing in a layout, ready to draw: the listening setup, each first reflection and
// what it meets, the bass over the floor, a room mode's pressure pattern, and the bass response and
// reverberation time at the listening position. Pure: layout items in, numbers out. No three.js.

import {
  firstReflections, createResponseModel, logFrequencies, flatness, peaks, roomModes, modeShape,
  shellAbsorbers, layoutAbsorbers, materialAbsorption, eyringT60, ebuTarget, BANDS, DEFAULT_SHELL
} from './roomAcoustics.js';

export const TWEETER = 1.195, EAR = 1.2, HALF_HEAD = 0.075;
// An early reflection is one that arrives within 20 ms; it should be at least 15 dB below the direct sound.
export const EARLY_MS = 20, QUIET_DB = -15;
const D2R = Math.PI / 180;

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const dist = (a, b) => Math.hypot(...sub(a, b));
const lerp = (p, q, t) => [p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1]), p[2] + t * (q[2] - p[2])];

// The layout with every acoustic piece taken out (panels, traps, ceiling panels, rugs, curtains): the
// same room and furniture, untreated, for comparison.
export const withoutTreatment = (items, assets) => items.filter((it) => !assets[it.type]?.acoustic);

// Monitors (tweeter height) and the head: the listener piece if there is one, otherwise the apex of the
// triangle in front of a pair of monitors. Ears sit either side of the head, across where it faces.
export function listeningSetup(items) {
  const stands = items.filter((it) => it.type === 'monitor-stand');
  if (!stands.length) return null;
  const monitors = stands.map((m) => [m.x, TWEETER, m.z]);
  const head = items.find((it) => it.type === 'listener');
  let ear, facing;
  if (head) {
    ear = [head.x, EAR, head.z];
    const r = (head.ry || 0) * D2R;
    facing = [Math.sin(r), Math.cos(r)];
  } else if (stands.length === 2) {
    const [a, b] = stands, S = Math.hypot(a.x - b.x, a.z - b.z);
    let fx = 0, fz = 0;
    for (const m of stands) { fx += Math.sin((m.ry || 0) * D2R); fz += Math.cos((m.ry || 0) * D2R); }
    const n = Math.hypot(fx, fz) || 1;
    fx /= n; fz /= n;
    const reach = S * Math.sqrt(3) / 2;
    ear = [(a.x + b.x) / 2 + fx * reach, EAR, (a.z + b.z) / 2 + fz * reach];
    facing = [-fx, -fz];
  } else {
    return null;
  }
  const ears = [-1, 1].map((s) => [ear[0] + s * HALF_HEAD * facing[1], EAR, ear[2] - s * HALF_HEAD * facing[0]]);
  return { monitors, ear, ears };
}

// The absorbing face of every treatment piece as a rectangle in space: centre, two in-plane axes with
// half-sizes, and a normal. A closed curtain covers its window; an open one is stacked beside it.
export function acousticFaces(items, assets, room) {
  const H = room.clear.height, out = [];
  for (const it of items) {
    const a = assets[it.type], ac = a?.acoustic;
    if (!ac || (it.type === 'curtain' && it.open)) continue;
    const [absorber] = layoutAbsorbers([it], assets, room);
    const r = (it.ry || 0) * D2R, c = Math.cos(r), s = Math.sin(r);
    const localX = [c, 0, -s], localZ = [s, 0, c];
    if (a.mount === 'ceiling' || ac.floor) {
      const y = ac.floor ? 0.012 : H - a.drop;                   // a rug's top, a ceiling panel's underside
      out.push({ type: it.type, alpha: absorber.alpha, c: [it.x, y, it.z], u: localX, v: localZ, hu: (it.w ?? a.w) / 2, hv: (it.d ?? a.d) / 2, n: [0, 1, 0] });
    } else {
      const [fw, fh] = ac.face, yc = ac.faceY ?? ((a.y0 ?? 0) + a.h) / 2;
      out.push({ type: it.type, alpha: absorber.alpha, c: [it.x, yc, it.z], u: localX, v: [0, 1, 0], hu: fw / 2, hv: fh / 2, n: localZ });
    }
  }
  return out;
}

// Does the segment p -> q pass through the face?
export function crossesFace(face, p, q) {
  const dp = dot(sub(p, face.c), face.n), dq = dot(sub(q, face.c), face.n);
  if (dp * dq > 0 || dp === dq) return false;
  const rel = sub(lerp(p, q, dp / (dp - dq)), face.c);
  return Math.abs(dot(rel, face.u)) <= face.hu && Math.abs(dot(rel, face.v)) <= face.hv;
}

// Solid furniture that can stand in a reflection's way (the desk in front of the floor bounce). Seats,
// the head, the stands and treatment are left out.
const NOT_IN_THE_WAY = new Set(['chair', 'stool', 'listener', 'monitor-stand']);
export function obstacles(items, assets) {
  const out = [];
  for (const it of items) {
    const a = assets[it.type];
    if (!a || a.clash === false || a.acoustic || a.mount === 'ceiling' || NOT_IN_THE_WAY.has(it.type)) continue;
    const r = (it.ry || 0) * D2R;
    out.push({ type: it.type, x: it.x, z: it.z, c: Math.cos(r), s: Math.sin(r), hw: a.w / 2, hd: a.d / 2, y0: a.y0 ?? 0, y1: a.h });
  }
  return out;
}

// Slab test of the segment p -> q against an obstacle's box, in the obstacle's own frame.
export function blocks(b, p, q) {
  const local = (pt) => {
    const dx = pt[0] - b.x, dz = pt[2] - b.z;
    return [dx * b.c - dz * b.s, pt[1], dx * b.s + dz * b.c];
  };
  const a = local(p), e = local(q);
  const lo = [-b.hw, b.y0, -b.hd], hi = [b.hw, b.y1, b.hd];
  let t0 = 0, t1 = 1;
  for (let k = 0; k < 3; k++) {
    const d = e[k] - a[k];
    if (Math.abs(d) < 1e-12) {
      if (a[k] < lo[k] || a[k] > hi[k]) return false;
      continue;
    }
    let ta = (lo[k] - a[k]) / d, tb = (hi[k] - a[k]) / d;
    if (ta > tb) [ta, tb] = [tb, ta];
    t0 = Math.max(t0, ta);
    t1 = Math.min(t1, tb);
    if (t0 > t1) return false;
  }
  return true;
}

// Every first reflection from every monitor to the head, and what it meets on the way:
//   hit      absorber (a treatment piece, with its type), glass, bare (wall, floor or ceiling), or
//            blocked (furniture in the way)
//   levelDb  at 1 kHz against the direct sound: the longer path, and whatever absorbs it
//   verdict  blocked; late (after 20 ms); quiet (15 dB or more below the direct sound); problem
export function reflectionPaths(room, setup, items, assets) {
  if (!setup) return [];
  const m = { ...DEFAULT_SHELL, ...room.acoustics };
  const surfaceAlpha = { floor: materialAbsorption(m.floor), ceiling: materialAbsorption(m.ceiling), wall: materialAbsorption(m.walls) };
  const openings = shellAbsorbers(room).filter((a) => a.type.startsWith('window') || a.type.startsWith('door'));
  const glass = materialAbsorption(m.windows), door = materialAbsorption('door-wood');
  const faces = acousticFaces(items, assets, room), things = obstacles(items, assets);
  const inBox = (p, box) => box.every(([lo, hi], k) => p[k] >= lo - 1e-6 && p[k] <= hi + 1e-6);
  const out = [];
  setup.monitors.forEach((src, k) => {
    const direct = dist(src, setup.ear);
    for (const r of firstReflections(room, src, setup.ear)) {
      const legs = [[src, r.point], [r.point, setup.ear]];
      const blocker = things.find((b) => legs.some(([p, q]) => blocks(b, p, q)));
      const face = faces.find((f) => legs.some(([p, q]) => crossesFace(f, p, q)));
      const opening = r.surface.length === 2 ? openings.find((o) => inBox(r.point, o.box)) : null;
      const behind = opening ? (opening.type.startsWith('door') ? door : glass) : surfaceAlpha[r.surface.length === 2 ? 'wall' : r.surface];
      let kept = 1 - behind(1000);
      if (face) kept *= Math.max(1e-4, 1 - face.alpha(1000));
      const levelDb = 20 * Math.log10(direct / (direct + r.extra)) + 10 * Math.log10(Math.max(1e-4, kept));
      const hit = blocker ? { kind: 'blocked', type: blocker.type }
        : face ? { kind: 'absorber', type: face.type }
        : opening ? { kind: opening.type.startsWith('door') ? 'door' : 'glass' }
        : { kind: 'bare' };
      const verdict = hit.kind === 'blocked' ? 'blocked' : r.delayMs > EARLY_MS ? 'late' : levelDb <= QUIET_DB ? 'quiet' : 'problem';
      out.push({ monitor: k, surface: r.surface, points: [src, r.point, setup.ear], delayMs: r.delayMs, levelDb, hit, verdict });
    }
  });
  return out;
}

export const EVEN_FREQS = logFrequencies(40, 200, 12);
export const bassModel = (room, absorbers, freqs) => createResponseModel(room, { freqs, fMax: 400, highpass: 0, t60: Infinity, absorbers });

// A grid over the floor at ear height. With a model of many frequencies each cell holds how uneven the
// bass is there (spread, dB, lower is better) and `best` is the evenest cell; with one frequency each
// cell holds the level against the room average (dB, above 0 a peak, below a dip).
export function bassMap(model, room, monitors, { step = 0.2, y = EAR } = {}) {
  const { length: L, width: W } = room.clear;
  const cols = Math.max(1, Math.round(L / step)), rows = Math.max(1, Math.round(W / step));
  const cellW = L / cols, cellD = W / rows, single = model.freqs.length === 1;
  const values = new Float32Array(cols * rows);
  let best = null;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const x = -L / 2 + (i + 0.5) * cellW, z = -W / 2 + (j + 0.5) * cellD;
      const db = model.level(monitors, [[x, y, z]]);
      const v = single ? db[0] : flatness(model.freqs, db).spread;
      values[i + j * cols] = v;
      if (!single && (!best || v < best.value)) best = { x, z, value: v };
    }
  }
  let mean = null;                             // the room average a one-frequency map is drawn against
  if (single) {
    mean = values.reduce((s, v) => s + v, 0) / values.length;
    for (let k = 0; k < values.length; k++) values[k] -= mean;
  }
  let min = Infinity, max = -Infinity;
  for (const v of values) { min = Math.min(min, v); max = Math.max(max, v); }
  return { kind: single ? 'level' : 'even', freq: single ? model.freqs[0] : null, cols, rows, cellW, cellD, values, min, max, best, mean };
}

// A room mode's pressure over the floor at ear height: +1 and -1 loudest (opposite phase), 0 silent.
export function modeMap(room, mode, { step = 0.1, y = EAR } = {}) {
  const { length: L, width: W } = room.clear;
  const cols = Math.max(1, Math.round(L / step)), rows = Math.max(1, Math.round(W / step));
  const cellW = L / cols, cellD = W / rows;
  const values = new Float32Array(cols * rows);
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) values[i + j * cols] = modeShape(room, mode, [-L / 2 + (i + 0.5) * cellW, y, -W / 2 + (j + 0.5) * cellD]);
  }
  return { kind: 'mode', mode, cols, rows, cellW, cellD, values, min: -1, max: 1 };
}

const AXES = ['length', 'width', 'height'];
export const modeLabel = (m) => `${m.f.toFixed(0)} Hz, ${m.n.map((k, i) => (k ? `${AXES[i]} ${k}` : null)).filter(Boolean).join(' + ')}`;

// The room's axial and tangential modes worth looking at: above 30 Hz and below 130 Hz.
export function modeChoices(room, fMax = 130) {
  return roomModes(room, fMax).filter((m) => m.f > 30 && (m.kind === 'axial' || m.kind === 'tangential'));
}

// The bass response at the ears, bare room against the treatment in the layout, and the reverberation
// time in each band against EBU Tech 3276's target.
export function responseCurves(room, setup, items, assets) {
  if (!setup) return null;
  const freqs = logFrequencies(40, 250, 24);
  const shell = shellAbsorbers(room), treated = [...shell, ...layoutAbsorbers(items, assets, room)];
  const curve = (absorbers) => {
    const db = bassModel(room, absorbers, freqs).level(setup.monitors, setup.ears);
    const f = flatness(freqs, db);
    return { db: db.map((v) => v - f.mean), spread: f.spread, peaks: peaks(freqs, db, 3) };
  };
  return {
    freqs,
    bare: curve(shell),
    treated: curve(treated),
    rt: BANDS.map((f) => ({ f, bare: eyringT60(room, shell, f), treated: eyringT60(room, treated, f) })),
    target: ebuTarget(room)
  };
}

// The mode behind the biggest bass peak at the ears in the bare room: the one to look at first.
export function worstMode(room, setup) {
  if (!setup) return null;
  const freqs = logFrequencies(40, 200, 24);
  const db = bassModel(room, shellAbsorbers(room), freqs).level(setup.monitors, setup.ears);
  const [top] = peaks(freqs, db, 0);
  if (!top) return null;
  return modeChoices(room, 200).sort((p, q) => Math.abs(p.f - top.f) - Math.abs(q.f - top.f))[0];
}
