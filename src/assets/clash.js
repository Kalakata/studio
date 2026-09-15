// Clash check on plain layout items (metres, degrees): furniture overlapping furniture, standing
// in front of a window, in a door's swing, or through a partition. No three.js; tested in node.

import { wallFrame } from '../scene/spec.js';

const D2R = Math.PI / 180;
export const TOL = 0.005;            // touching is not a clash
export const WINDOW_ZONE = 0.30;     // depth in front of a window that counts as blocking it

// Footprint as a convex polygon in (x, z), plus the vertical span of the body. A piece hung from
// the ceiling spans from `drop` below the ceiling up to it, so it needs the room height.
export function footprint(item, asset, roomHeight) {
  const c = Math.cos((item.ry || 0) * D2R), s = Math.sin((item.ry || 0) * D2R);
  const hw = (item.w ?? asset.w) / 2, hd = (item.d ?? asset.d) / 2;     // a fitted panel has its own size
  // Object3D rotation.y maps local (x, z) to (x cos + z sin, -x sin + z cos)
  const poly = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]]
    .map(([x, z]) => [item.x + x * c + z * s, item.z - x * s + z * c]);
  if (asset.mount === 'ceiling' && roomHeight) return { poly, y0: roomHeight - asset.drop, y1: roomHeight };
  return { poly, y0: asset.y0 ?? 0, y1: asset.h };
}

function interval(poly, nx, nz) {
  let min = Infinity, max = -Infinity;
  for (const [x, z] of poly) { const v = x * nx + z * nz; min = Math.min(min, v); max = Math.max(max, v); }
  return [min, max];
}

// Separating-axis test for two convex polygons; overlaps shallower than `tol` do not count.
export function overlaps(a, b, tol = TOL) {
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const [x0, z0] = poly[i], [x1, z1] = poly[(i + 1) % poly.length];
      const len = Math.hypot(x1 - x0, z1 - z0);
      if (len < 1e-12) continue;
      const nx = -(z1 - z0) / len, nz = (x1 - x0) / len;
      const [a0, a1] = interval(a, nx, nz), [b0, b1] = interval(b, nx, nz);
      if (a1 - tol <= b0 || b1 - tol <= a0) return false;
    }
  }
  return true;
}

// Zones the shell reserves: in front of each window, each door's swing, each partition.
export function roomObstacles(room) {
  const out = [];
  for (const wall of room.walls) {
    const f = wallFrame(room, wall);
    const nIn = f.normal.map((v) => -v);
    const at = (along, inward = 0) => [
      f.leftCorner[0] + f.along[0] * along + nIn[0] * inward,
      f.leftCorner[1] + f.along[2] * along + nIn[2] * inward
    ];
    for (const o of wall.openings) {
      if (o.type === 'door') {
        const right = o.swing === 'right';
        const [hx, hz] = at(right ? o.left + o.width : o.left);
        const dir = right ? -1 : 1, poly = [[hx, hz]];
        for (let k = 0; k <= 12; k++) {
          const t = (k / 12) * Math.PI / 2, c = Math.cos(t) * dir, s = Math.sin(t);
          poly.push([hx + (f.along[0] * c + nIn[0] * s) * o.width, hz + (f.along[2] * c + nIn[2] * s) * o.width]);
        }
        out.push({ kind: 'door', wall: wall.id, poly, y0: 0.02, y1: o.head });
      } else {
        const poly = [at(o.left), at(o.left + o.width), at(o.left + o.width, WINDOW_ZONE), at(o.left, WINDOW_ZONE)];
        out.push({ kind: 'window', wall: wall.id, poly, y0: o.sill, y1: o.head });
      }
    }
  }
  (room.partitions ?? []).forEach((p, i) => {
    const dx = p.to[0] - p.from[0], dz = p.to[1] - p.from[1], len = Math.hypot(dx, dz) || 1;
    const px = -dz / len * p.thickness / 2, pz = dx / len * p.thickness / 2;
    const poly = [[p.from[0] + px, p.from[1] + pz], [p.to[0] + px, p.to[1] + pz], [p.to[0] - px, p.to[1] - pz], [p.from[0] - px, p.from[1] - pz]];
    out.push({ kind: 'partition', index: i, poly, y0: 0, y1: p.height });
  });
  return out;
}

const spansMeet = (a, b) => a.y0 < b.y1 - TOL && b.y0 < a.y1 - TOL;

// items: [{ type, x, z, ry }]; assets: id -> catalog entry. Returns [{ kind, items, message }].
export function findClashes(items, assets, room) {
  const pieces = [];
  items.forEach((it, i) => {
    const a = assets[it.type];
    if (a && a.clash !== false) pieces.push({ i, label: a.label, window: !!a.window, ...footprint(it, a, room.clear.height) });
  });

  const out = [];
  for (let p = 0; p < pieces.length; p++) {
    for (let q = p + 1; q < pieces.length; q++) {
      const A = pieces[p], B = pieces[q];
      if (spansMeet(A, B) && overlaps(A.poly, B.poly)) {
        out.push({ kind: 'overlap', items: [A.i, B.i], message: `${A.label} overlaps ${B.label}` });
      }
    }
  }

  const obstacles = roomObstacles(room);
  for (const P of pieces) {
    for (const ob of obstacles) {
      if (ob.kind === 'window' && P.window) continue;           // a curtain belongs in front of the glass
      if (!spansMeet(P, ob) || !overlaps(P.poly, ob.poly)) continue;
      const message = ob.kind === 'window' ? `${P.label} blocks a window on the ${ob.wall} wall`
        : ob.kind === 'door' ? `${P.label} is in the swing of the door on the ${ob.wall} wall`
        : `${P.label} overlaps partition ${ob.index + 1}`;
      out.push({ kind: ob.kind, items: [P.i], message });
    }
  }
  return out;
}
