// Edits to the room shell as pure functions: each takes a room and returns a new one.
// Values are rounded to the millimetre, the precision of a site measurement.

const clone = (v) => JSON.parse(JSON.stringify(v));
export const mm = (v) => Math.round(v * 1000) / 1000;

export const DEFAULTS = {
  window: { width: 1.20, sill: 0.90, head: 2.85 },
  door: { width: 0.90, sill: 0, head: 2.10 }
};

function wallOf(room, id) {
  const w = room.walls.find((x) => x.id === id);
  if (!w) throw new Error(`no wall "${id}"`);
  return w;
}

export const wallLength = (room, wall) => (wall.side.endsWith('z') ? room.clear.length : room.clear.width);

// Range for an opening's left edge that keeps it on the wall and clear of its neighbours.
export function leftLimits(room, wallId, index) {
  const wall = wallOf(room, wallId), o = wall.openings[index];
  let min = 0, max = wallLength(room, wall) - o.width;
  wall.openings.forEach((p, j) => {
    if (j === index) return;
    if (p.left + p.width <= o.left + 1e-9) min = Math.max(min, p.left + p.width);
    else if (p.left >= o.left + o.width - 1e-9) max = Math.min(max, p.left - o.width);
  });
  return { min, max };
}

export function moveOpening(room, wallId, index, left, step = 0.001) {
  const r = clone(room);
  const { min, max } = leftLimits(r, wallId, index);
  const snapped = Math.round(left / step) * step;
  wallOf(r, wallId).openings[index].left = mm(Math.min(max, Math.max(min, snapped)));
  return r;
}

export function setOpening(room, wallId, index, patch) {
  const r = clone(room);
  const o = wallOf(r, wallId).openings[index];
  for (const [k, v] of Object.entries(patch)) o[k] = typeof v === 'number' ? mm(v) : v;
  if (o.type === 'door') o.sill = 0;
  return r;
}

// Centres a new opening in the widest free stretch of the wall. null if nothing fits.
export function addOpening(room, wallId, type) {
  const r = clone(room);
  const wall = wallOf(r, wallId), length = wallLength(r, wall), d = DEFAULTS[type];
  const sorted = wall.openings.slice().sort((a, b) => a.left - b.left);
  let best = null, edge = 0;
  for (const o of [...sorted, { left: length, width: 0 }]) {
    const gap = o.left - edge;
    if (!best || gap > best.gap) best = { start: edge, gap };
    edge = Math.max(edge, o.left + o.width);
  }
  if (!best || best.gap < d.width) return null;
  const opening = { type, left: mm(best.start + (best.gap - d.width) / 2), width: d.width, sill: d.sill, head: d.head };
  if (type === 'door') opening.swing = 'left';
  wall.openings.push(opening);
  wall.openings.sort((a, b) => a.left - b.left);
  return { room: r, index: wall.openings.indexOf(opening) };
}

export function removeOpening(room, wallId, index) {
  const r = clone(room);
  wallOf(r, wallId).openings.splice(index, 1);
  return r;
}

export function addPartition(room) {
  const r = clone(room);
  const W = r.clear.width;
  r.partitions = r.partitions ?? [];
  r.partitions.push({ from: [0, mm(-W / 2)], to: [0, mm(-W / 2 + 1.2)], thickness: 0.10, height: r.clear.height });
  return r;
}

export function setPartition(room, index, patch) {
  const r = clone(room);
  const p = r.partitions[index];
  for (const [k, v] of Object.entries(patch)) p[k] = Array.isArray(v) ? v.map(mm) : typeof v === 'number' ? mm(v) : v;
  return r;
}

export function removePartition(room, index) {
  const r = clone(room);
  r.partitions.splice(index, 1);
  return r;
}
