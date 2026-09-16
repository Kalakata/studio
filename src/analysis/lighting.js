// LED profile layouts as light: where each run sits in the room's corners, the illuminance it gives
// (direct from each profile plus a uniform inter-reflected term), the numbers that say whether it is
// enough to work by, and glare at the mix position. Pure: no three.js, tested in node.
//
// Photometry: a profile with an opal diffuser is a line of Lambertian emitters aimed along `aim`
// (45 degrees into the room from its corner): luminous intensity I = (flux / pi) cos(theta). Nothing
// in the room blocks light (furniture and acoustic panels are left out), and the room's own surfaces
// only matter through the inter-reflected term.

import { roomReflectance } from '../scene/daylightMath.js';

// Illuminance in the scene's irradiance unit: W_PER_UNIT (200) W/m^2 at a daylight luminous efficacy
// of about 110 lm/W. Used to put the profiles on the same scale as the sun and sky.
export const LUX_PER_UNIT = 200 * 110;

// Surface reflectances matching the shell materials (the luminance of their colours; the walls are
// #008080 teal, which returns about 17% of the light, and the terracotta tiles about 14%).
export const DEFAULT_ALBEDO = { floor: 0.14, ceiling: 0.91, wall: 0.17, mural: 0.03, glass: 0.08 };

// EN 12464-1: 500 lx on a desk for screen and writing work; 300 lx across the room around it, which
// should be even enough that the darkest point is at least 40% of the average.
export const TARGETS = { desk: 500, room: 300, uniformity: 0.4 };

export const WORK_PLANE = 0.75;
const INSET = 0.012;                             // a corner profile's diffuser, just off the corner

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unit = (v) => { const n = Math.hypot(...v); return v.map((c) => c / n); };
const along = (p, d, s) => [p[0] + d[0] * s, p[1] + d[1] * s, p[2] + d[2] * s];

// The twelve edges of the room's box: start, direction and length (along the long walls from the back
// wall, along the end walls from the window wall, up the corners from the floor), and the aim of a
// corner profile there, 45 degrees into the room.
export function roomEdges(room) {
  const { length: L, width: W, height: H } = room.clear;
  const endX = { back: -L / 2, street: L / 2 }, intoX = { back: 1, street: -1 };
  const sideZ = { window: -W / 2, mural: W / 2 }, intoZ = { window: 1, mural: -1 };
  const out = {};
  for (const [level, y, up] of [['ceiling', H, -1], ['floor', 0, 1]]) {
    for (const end of ['back', 'street']) {
      out[`${level} ${end}`] = { start: [endX[end], y, -W / 2], dir: [0, 0, 1], length: W, aim: unit([intoX[end], up, 0]) };
    }
    for (const side of ['window', 'mural']) {
      out[`${level} ${side}`] = { start: [-L / 2, y, sideZ[side]], dir: [1, 0, 0], length: L, aim: unit([0, up, intoZ[side]]) };
    }
  }
  for (const end of ['back', 'street']) {
    for (const side of ['window', 'mural']) {
      out[`corner ${end}-${side}`] = { start: [endX[end], 0, sideZ[side]], dir: [0, 1, 0], length: H, aim: unit([intoX[end], 0, intoZ[side]]) };
    }
  }
  return out;
}

// A free run: its own start and end points and the way its diffuser faces (made square to the run).
function freeRun(r) {
  const d = sub(r.end, r.start), length = Math.hypot(...d);
  if (!(length > 0)) throw new Error(`run "${r.label}" has no length`);
  const dir = d.map((c) => c / length);
  const aim = r.aim.map((c, k) => c - dot(r.aim, dir) * dir[k]);
  if (Math.hypot(...aim) < 1e-6) throw new Error(`run "${r.label}" aims along itself`);
  return { edge: r.label ?? 'line', a: r.start, b: r.end, dir, aim: unit(aim), length };
}

// A variant's runs placed in the room: end points (just off the corner, or where a free run says),
// direction, length, aim, and their photometric and electrical figures with the defaults filled in.
export function profileRuns(room, variant, defaults) {
  const edges = roomEdges(room);
  const figures = (r) => ({
    lmPerMetre: r.lmPerMetre ?? defaults.lmPerMetre, cct: r.cct ?? defaults.cct,
    wPerMetre: r.wPerMetre ?? defaults.wPerMetre, diffuser: r.diffuser ?? defaults.diffuser
  });
  return variant.runs.map((r) => {
    if (r.start) return { ...freeRun(r), ...figures(r) };
    const e = edges[r.edge];
    if (!e) throw new Error(`unknown edge "${r.edge}"`);
    const from = Math.max(0, r.from ?? 0), to = Math.min(e.length, r.to ?? e.length);
    if (!(to > from)) throw new Error(`run on "${r.edge}" has no length`);
    const base = along(e.start, e.aim, INSET);
    return {
      edge: r.edge, a: along(base, e.dir, from), b: along(base, e.dir, to), dir: e.dir, aim: e.aim, length: to - from,
      lmPerMetre: r.lmPerMetre ?? defaults.lmPerMetre, cct: r.cct ?? defaults.cct,
      wPerMetre: r.wPerMetre ?? defaults.wPerMetre, diffuser: r.diffuser ?? defaults.diffuser
    };
  });
}

export const totals = (runs) => ({
  length: runs.reduce((s, r) => s + r.length, 0),
  lumens: runs.reduce((s, r) => s + r.length * r.lmPerMetre, 0),
  watts: runs.reduce((s, r) => s + r.length * r.wPerMetre, 0)
});

// Direct illuminance (lux) at point p on a surface with unit normal n, from every run cut into
// pieces no longer than `step`.
export function directIlluminance(runs, p, n, { step = 0.05 } = {}) {
  let e = 0;
  for (const r of runs) {
    const pieces = Math.max(1, Math.ceil(r.length / step)), dl = r.length / pieces;
    const i0 = r.lmPerMetre * dl / Math.PI;
    for (let k = 0; k < pieces; k++) {
      const q = along(r.a, r.dir, (k + 0.5) * dl);
      const v = sub(p, q), d2 = dot(v, v), d = Math.sqrt(d2);
      if (d < 1e-6) continue;
      const cosEmit = dot(r.aim, v) / d, cosIn = -dot(n, v) / d;
      if (cosEmit > 0 && cosIn > 0) e += i0 * cosEmit * cosIn / d2;
    }
  }
  return e;
}

// Uniform inter-reflected illuminance (lux), split-flux: all the flux, reflected by the room's average
// surface over and over.
export function indirectIlluminance(room, runs, albedo = DEFAULT_ALBEDO) {
  const { total, rho } = roomReflectance(room, albedo);
  return totals(runs).lumens * rho / (1 - rho) / total;
}

// Illuminance on the horizontal work plane over the whole floor, in cells of about `step`.
export function workPlaneMap(room, runs, { step = 0.25, height = WORK_PLANE, albedo = DEFAULT_ALBEDO } = {}) {
  const { length: L, width: W } = room.clear;
  const cols = Math.max(1, Math.round(L / step)), rows = Math.max(1, Math.round(W / step));
  const cellW = L / cols, cellD = W / rows, values = new Float32Array(cols * rows);
  const indirect = indirectIlluminance(room, runs, albedo);
  let min = Infinity, max = -Infinity;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const p = [-L / 2 + (i + 0.5) * cellW, height, -W / 2 + (j + 0.5) * cellD];
      const v = directIlluminance(runs, p, [0, 1, 0]) + indirect;
      values[i + j * cols] = v;
      min = Math.min(min, v); max = Math.max(max, v);
    }
  }
  return { kind: 'lux', cols, rows, cellW, cellD, values, min, max, indirect };
}

// Average and minimum over the cells more than `margin` from every wall (the working area), and the
// uniformity minimum / average.
export function areaStats(room, map, margin = 0.5) {
  const { length: L, width: W } = room.clear;
  let sum = 0, n = 0, min = Infinity;
  for (let j = 0; j < map.rows; j++) {
    for (let i = 0; i < map.cols; i++) {
      const x = -L / 2 + (i + 0.5) * map.cellW, z = -W / 2 + (j + 0.5) * map.cellD;
      if (Math.abs(x) > L / 2 - margin || Math.abs(z) > W / 2 - margin) continue;
      const v = map.values[i + j * map.cols];
      sum += v; n++; min = Math.min(min, v);
    }
  }
  const avg = n ? sum / n : 0;
  return { avg, min: n ? min : 0, uniformity: avg > 0 ? min / avg : 0 };
}

const D2R = Math.PI / 180;
const toWorld = (it, [lx, y, lz]) => {
  const c = Math.cos((it.ry || 0) * D2R), s = Math.sin((it.ry || 0) * D2R);
  return [it.x + lx * c + lz * s, y, it.z - lx * s + lz * c];
};
const turn = (it, [lx, y, lz]) => {
  const c = Math.cos((it.ry || 0) * D2R), s = Math.sin((it.ry || 0) * D2R);
  return [lx * c + lz * s, y, -lx * s + lz * c];
};

// Average illuminance over a desk's top, and its screens as rectangles facing the user.
export function deskOf(items, assets) {
  const desk = items.find((it) => ['pallet-desk', 'desk'].includes(it.type));
  if (!desk) return null;
  const a = assets[desk.type];
  const screens = a.parts.filter((p) => p.mat === 'screen' && p.box).map((p) => {
    const ry = (desk.ry || 0) + (p.ry || 0), c = Math.cos(ry * D2R), s = Math.sin(ry * D2R);
    return {
      centre: toWorld(desk, p.at), normal: [s, 0, c], across: [c, 0, -s], up: [0, 1, 0],
      halfWidth: p.box[0] / 2, halfHeight: p.box[1] / 2
    };
  });
  return { item: desk, asset: a, top: a.h, screens };
}

export function deskIlluminance(room, runs, desk, albedo = DEFAULT_ALBEDO) {
  const { item, asset } = desk, indirect = indirectIlluminance(room, runs, albedo);
  let sum = 0, n = 0;
  for (let u = -0.4; u <= 0.4001; u += 0.2) {
    for (let v = -0.25; v <= 0.2501; v += 0.25) {
      const p = toWorld(item, [u * asset.w, desk.top, v * asset.d]);
      sum += directIlluminance(runs, p, [0, 1, 0]) + indirect; n++;
    }
  }
  return sum / n;
}

// Glare at the listening position (the listener head, or the chair): runs in view within 50 degrees
// of the line of sight and no lower than it, with their diffusers facing the eye; and runs that
// reflect in a screen towards the eye.
export function glare(runs, items, desk, { step = 0.1 } = {}) {
  const head = items.find((it) => it.type === 'listener') ?? items.find((it) => it.type === 'chair');
  if (!head) return null;
  const eye = [head.x, 1.2, head.z], gaze = turn(head, [0, 0, 1]);
  const inView = new Set(), inScreen = new Set();
  for (const r of runs) {
    const pieces = Math.max(1, Math.ceil(r.length / step)), dl = r.length / pieces;
    for (let k = 0; k < pieces; k++) {
      const q = along(r.a, r.dir, (k + 0.5) * dl);
      const toEye = sub(eye, q), d = Math.hypot(...toEye);
      const look = sub(q, eye);
      if (dot(r.aim, toEye) / d > 0.05) {
        const angle = Math.acos(Math.min(1, dot(gaze, look) / d)) / D2R;
        if (angle < 50 && look[1] > -0.05 * d) inView.add(r.edge);
      }
      for (const sc of desk?.screens ?? []) {
        // mirror the eye in the screen's plane: a piece shows in the screen when the line from the
        // mirrored eye to it passes through the screen, and the piece faces the screen
        const side = dot(sub(eye, sc.centre), sc.normal);
        if (side <= 0 || dot(sub(q, sc.centre), sc.normal) <= 0) continue;
        if (dot(r.aim, sub(sc.centre, q)) <= 0) continue;
        const mirror = sub(eye, sc.normal.map((c) => 2 * side * c));
        const dm = dot(sub(mirror, sc.centre), sc.normal), dq = dot(sub(q, sc.centre), sc.normal);
        const t = dm / (dm - dq);
        const hit = along(mirror, sub(q, mirror), t);
        const rel = sub(hit, sc.centre);
        if (Math.abs(dot(rel, sc.across)) <= sc.halfWidth && Math.abs(dot(rel, sc.up)) <= sc.halfHeight) inScreen.add(r.edge);
      }
    }
  }
  return { inView: [...inView], inScreen: [...inScreen] };
}

// Everything the Light tab shows for one variant.
export function variantReport(room, variant, defaults, items, assets, albedo = DEFAULT_ALBEDO) {
  const runs = profileRuns(room, variant, defaults);
  const map = workPlaneMap(room, runs, { albedo });
  const desk = deskOf(items, assets);
  return {
    id: variant.id, name: variant.name, note: variant.note, runs, map,
    ...totals(runs),
    room: areaStats(room, map),
    desk: desk ? deskIlluminance(room, runs, desk, albedo) : null,
    glare: glare(runs, items, desk)
  };
}

// Colour of a white LED at a correlated colour temperature, as linear RGB with unit luminance, from
// the sRGB of a blackbody at that temperature (interpolated between tabulated points).
const CCT = [
  [2700, [255, 169, 87]], [3000, [255, 180, 107]], [3500, [255, 196, 137]],
  [4000, [255, 209, 163]], [5000, [255, 228, 206]], [6500, [255, 249, 253]]
];
export function cctColour(k) {
  const t = Math.min(6500, Math.max(2700, k));
  let i = CCT.findIndex(([c]) => c >= t);
  if (i <= 0) i = 1;
  const [k0, c0] = CCT[i - 1], [k1, c1] = CCT[i], f = (t - k0) / (k1 - k0);
  const lin = (v) => { const x = v / 255; return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
  const rgb = c0.map((v, j) => lin(v + f * (c1[j] - v)));
  const y = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
  return rgb.map((v) => v / y);
}

// An edge in words: "top of the mural wall", "foot of the street wall", "back–window corner". A free
// run already carries its words.
const WALLS = { back: 'back wall', street: 'street wall', window: 'window wall', mural: 'mural wall' };
export function edgeLabel(edge) {
  const [kind, where] = edge.split(' ');
  if (kind === 'corner' && where?.includes('-')) return `${where.replace('-', '–')} corner`;
  if ((kind === 'ceiling' || kind === 'floor') && WALLS[where]) return `${kind === 'ceiling' ? 'top' : 'foot'} of the ${WALLS[where]}`;
  return edge;
}
