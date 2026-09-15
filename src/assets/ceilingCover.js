// Covering the ceiling with acoustic panels, leaving the light fittings clear. Pure: takes the
// room (its size and its lighting from room.json) and returns layout items. No three.js.

export const COVER = {
  type: 'ceiling-panel',
  margin: 0.05,      // metres in from the walls
  clearance: 0.10,   // around every light fitting, so its light still gets past the panels
  gap: 0.02,         // joint between neighbouring panels
  maxW: 2.4,         // largest panel along the room
  maxD: 1.2,         // largest panel across it
  minSide: 0.30      // anything narrower is not worth hanging
};

const mm = (v) => Math.round(v * 1000) / 1000;

// Rectangles on the ceiling plan that panels must leave clear: every batten housing, and any strip
// light that sits at the ceiling.
export function lightKeepouts(room, clearance = COVER.clearance) {
  const H = room.clear.height, out = [];
  const lighting = room.lighting ?? {};
  const b = lighting.battens;
  if (b) {
    for (const [x, z] of b.at) {
      out.push({ x0: x - b.housing[0] / 2 - clearance, x1: x + b.housing[0] / 2 + clearance, z0: z - b.housing[2] / 2 - clearance, z1: z + b.housing[2] / 2 + clearance });
    }
  }
  for (const s of lighting.strips ?? []) {
    if (s.at[1] + s.size[1] / 2 < H - 0.3) continue;       // on a wall or the floor, not the ceiling
    out.push({ x0: s.at[0] - s.size[0] / 2 - clearance, x1: s.at[0] + s.size[0] / 2 + clearance, z0: s.at[2] - s.size[2] / 2 - clearance, z1: s.at[2] + s.size[2] / 2 + clearance });
  }
  return out;
}

// The free ceiling as rectangles: cut the plan along every keep-out edge, keep the free cells,
// join them into runs along the room, then join identical runs across it.
export function freeRectangles(room, opts = {}) {
  const { margin, clearance } = { ...COVER, ...opts };
  const { length: L, width: W } = room.clear;
  const box = { x0: -L / 2 + margin, x1: L / 2 - margin, z0: -W / 2 + margin, z1: W / 2 - margin };
  const holes = lightKeepouts(room, clearance)
    .map((h) => ({ x0: Math.max(h.x0, box.x0), x1: Math.min(h.x1, box.x1), z0: Math.max(h.z0, box.z0), z1: Math.min(h.z1, box.z1) }))
    .filter((h) => h.x1 > h.x0 && h.z1 > h.z0);

  const cuts = (a, b, key0, key1) => [...new Set([a, b, ...holes.flatMap((h) => [h[key0], h[key1]])])].sort((p, q) => p - q);
  const xs = cuts(box.x0, box.x1, 'x0', 'x1'), zs = cuts(box.z0, box.z1, 'z0', 'z1');
  const free = (i, j) => {
    const cx = (xs[i] + xs[i + 1]) / 2, cz = (zs[j] + zs[j + 1]) / 2;
    return !holes.some((h) => cx > h.x0 && cx < h.x1 && cz > h.z0 && cz < h.z1);
  };

  const rects = [];
  let open = new Map();
  for (let j = 0; j < zs.length - 1; j++) {
    const next = new Map();
    let start = null;
    for (let i = 0; i <= xs.length - 1; i++) {
      const isFree = i < xs.length - 1 && free(i, j);
      if (isFree && start === null) start = i;
      if (!isFree && start !== null) {
        const key = `${xs[start]},${xs[i]}`;
        let r = open.get(key);
        if (r) r.z1 = zs[j + 1];
        else { r = { x0: xs[start], x1: xs[i], z0: zs[j], z1: zs[j + 1] }; rects.push(r); }
        next.set(key, r);
        start = null;
      }
    }
    open = next;
  }
  return rects;
}

// Fitted panels over the free ceiling: each rectangle split into equal panels no bigger than
// maxW x maxD, with joints between them and between neighbouring rectangles.
export function coverCeiling(room, opts = {}) {
  const o = { ...COVER, ...opts };
  const items = [];
  for (const r0 of freeRectangles(room, o)) {
    const r = { x0: r0.x0 + o.gap / 2, x1: r0.x1 - o.gap / 2, z0: r0.z0 + o.gap / 2, z1: r0.z1 - o.gap / 2 };
    const w = r.x1 - r.x0, d = r.z1 - r.z0;
    const nx = Math.ceil((w + o.gap) / (o.maxW + o.gap)), nz = Math.ceil((d + o.gap) / (o.maxD + o.gap));
    const pw = (w - (nx - 1) * o.gap) / nx, pd = (d - (nz - 1) * o.gap) / nz;
    if (pw < o.minSide || pd < o.minSide) continue;
    for (let a = 0; a < nx; a++) {
      for (let b = 0; b < nz; b++) {
        items.push({
          type: o.type, ry: 0,
          x: mm(r.x0 + pw / 2 + a * (pw + o.gap)), z: mm(r.z0 + pd / 2 + b * (pd + o.gap)),
          w: Math.floor(pw * 1000) / 1000, d: Math.floor(pd * 1000) / 1000
        });
      }
    }
  }
  return items;
}
