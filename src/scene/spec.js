import roomJson from './room.json';

// Every wall, keyed by the side of the room it stands on. `sign` turns a distance measured
// from the wall's left-hand corner (seen from inside, facing the wall) into the panel's local
// x, which runs from its centre. `ry` is the panel's rotation; local +z is always outward.
const SIDES = {
  '-z': { axis: 'L', ry: 0,             sign: 1,  normal: [0, 0, -1] },
  '+z': { axis: 'L', ry: 0,             sign: -1, normal: [0, 0, 1] },
  '+x': { axis: 'W', ry: Math.PI / 2,   sign: -1, normal: [1, 0, 0] },
  '-x': { axis: 'W', ry: -Math.PI / 2,  sign: -1, normal: [-1, 0, 0] }
};

const clone = (v) => JSON.parse(JSON.stringify(v));

// Fills in what room.json may leave out: opening type, a door's zero sill and hinge side, and
// an empty partition list.
export function normalizeRoom(r) {
  r.partitions = r.partitions ?? [];
  for (const wall of r.walls ?? []) {
    wall.openings = wall.openings ?? [];
    for (const o of wall.openings) {
      o.type = o.type ?? 'window';
      if (o.type === 'door') { o.sill = o.sill ?? 0; o.swing = o.swing ?? 'left'; }
    }
  }
  return r;
}

export function validateRoom(r) {
  const problems = [];
  const { length: L, width: W, height: H } = r.clear || {};
  for (const [k, v] of Object.entries({ length: L, width: W, height: H, wallThickness: r.wallThickness })) {
    if (!(v > 0)) problems.push(`${k} must be a positive number`);
  }
  const seen = new Set();
  for (const wall of r.walls || []) {
    const side = SIDES[wall.side];
    if (!side) { problems.push(`wall "${wall.id}": unknown side "${wall.side}"`); continue; }
    if (seen.has(wall.side)) problems.push(`wall "${wall.id}": side ${wall.side} used twice`);
    seen.add(wall.side);
    const length = side.axis === 'L' ? L : W;
    const ops = (wall.openings || []).slice().sort((a, b) => a.left - b.left);
    ops.forEach((o, i) => {
      const type = o.type ?? 'window';
      const name = `wall "${wall.id}", ${type} at ${o.left}`;
      if (type !== 'window' && type !== 'door') problems.push(`${name}: type must be "window" or "door"`);
      if (!(o.width > 0)) problems.push(`${name}: width must be positive`);
      if (!(o.left >= 0) || o.left + o.width > length + 1e-9) problems.push(`${name}: runs past the ends of a ${length} m wall`);
      if (!(o.sill >= 0) || !(o.head > o.sill) || o.head > H + 1e-9) problems.push(`${name}: sill/head must satisfy 0 <= sill < head <= ${H}`);
      if (type === 'door' && o.sill !== 0) problems.push(`${name}: a door's sill must be 0`);
      if (type === 'door' && !['left', 'right'].includes(o.swing ?? 'left')) problems.push(`${name}: swing must be "left" or "right"`);
      const next = ops[i + 1];
      if (next && o.left + o.width > next.left + 1e-9) problems.push(`${name}: overlaps the opening at ${next.left}`);
    });
  }
  for (const s of Object.keys(SIDES)) if (!seen.has(s)) problems.push(`no wall on side ${s}`);

  (r.partitions || []).forEach((p, i) => {
    const name = `partition ${i + 1}`;
    const ends = [p.from, p.to];
    if (!ends.every((q) => Array.isArray(q) && q.length === 2 && q.every(Number.isFinite))) {
      problems.push(`${name}: from and to must be [x, z]`);
      return;
    }
    if (ends.some(([x, z]) => Math.abs(x) > L / 2 + 1e-9 || Math.abs(z) > W / 2 + 1e-9)) problems.push(`${name}: runs outside the room`);
    if (Math.hypot(p.to[0] - p.from[0], p.to[1] - p.from[1]) < 0.05) problems.push(`${name}: shorter than 50 mm`);
    if (!(p.thickness > 0 && p.thickness <= 0.5)) problems.push(`${name}: thickness must be between 0 and 0.5`);
    if (!(p.height > 0 && p.height <= H + 1e-9)) problems.push(`${name}: height must be between 0 and ${H}`);
  });
  return problems;
}

// Placement of a wall panel and its openings in scene space.
export function wallFrame(r, wall) {
  const L = r.clear.length, W = r.clear.width, T = r.wallThickness;
  const s = SIDES[wall.side];
  const length = s.axis === 'L' ? L : W;
  // long walls run past the corners to close them; end walls sit between
  const span = s.axis === 'L' ? L + 2 * T : W;
  const position = {
    '-z': [0, 0, -W / 2 - T], '+z': [0, 0, W / 2],
    '+x': [L / 2, 0, 0],      '-x': [-L / 2, 0, 0]
  }[wall.side];
  const localX = (o) => s.sign * (o.left + o.width / 2 - length / 2);
  const holes = (wall.openings || []).map((o) => ({ ...o, x: localX(o), w: o.width, y0: o.sill, y1: o.head }));
  // centre of the inner face, and the horizontal direction in which `left` grows
  const inner = { '-z': [0, -W / 2], '+z': [0, W / 2], '+x': [L / 2, 0], '-x': [-L / 2, 0] }[wall.side];
  const along = [-s.normal[2], 0, s.normal[0]];
  const leftCorner = [inner[0] - along[0] * length / 2, inner[1] - along[2] * length / 2];
  // centre of an opening in world x/z, on the wall's inner face
  const worldCentre = (o) => {
    const lx = localX(o);
    return [inner[0] + lx * Math.cos(s.ry), inner[1] - lx * Math.sin(s.ry)];
  };
  return { length, span, position, rotationY: s.ry, normal: s.normal, holes, worldCentre, inner, along, leftCorner };
}

// room.json as it is on disk; a draft of unsaved edits records which version it was made from
export const SAVED_ROOM_TEXT = JSON.stringify(roomJson);
export const SAVED_ROOM = normalizeRoom(clone(roomJson));

// The live room. Shell edits replace its walls and partitions; clear dimensions, wall thickness
// and site always stay as room.json has them, because the scene is built around them at load.
export const ROOM = normalizeRoom(clone(roomJson));
export let ROOM_PROBLEMS = validateRoom(ROOM);
export const getRoomProblems = () => ROOM_PROBLEMS;

export function setRoom(next) {
  const n = normalizeRoom(clone(next));
  n.clear = ROOM.clear;
  n.wallThickness = ROOM.wallThickness;
  n.site = ROOM.site;
  for (const k of Object.keys(ROOM)) delete ROOM[k];
  Object.assign(ROOM, n);
  ROOM_PROBLEMS = validateRoom(ROOM);
  return ROOM_PROBLEMS;
}

export const snapshotRoom = () => clone(ROOM);

export const L = ROOM.clear.length;
export const W = ROOM.clear.width;
export const H = ROOM.clear.height;
export const T = ROOM.wallThickness;

export const SITE = { lat: ROOM.site.lat, lon: ROOM.site.lon, name: ROOM.site.name };
// Street wall (+x) bearing: read off a Google Maps screenshot, good to about +-10 deg.
export const FACE = ROOM.site.streetBearing;
