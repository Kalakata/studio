// Hours of direct sun on the floor and each inner wall face, for one day. Sun reaches a point only
// by leaving the room through a window: through the clear glass inside the frame, at both the inner
// and outer face of the wall (so deep reveals shade), and not through a partition. Furniture is not
// counted: it moves, and the question is where the sun lands in the shell.

import { solar, sunDirection } from '../scene/sun.js';
import { wallFrame } from '../scene/spec.js';

const INSET = 0.001;       // sample points sit just off their surface, inside the room

// Returns lit(px, py, pz, dx, dy, dz): does a ray from the point towards the sun leave the room
// through a window? (dx, dy, dz) is a unit vector towards the sun.
export function shellSunTest(room) {
  const { length: L, width: W, height: H } = room.clear;
  const T = room.wallThickness, bar = room.windowFrame?.bar ?? 0;

  const walls = {};
  for (const wall of room.walls) {
    const f = wallFrame(room, wall);
    walls[wall.side] = {
      cx: f.leftCorner[0], cz: f.leftCorner[1], ax: f.along[0], az: f.along[2],
      windows: wall.openings.filter((o) => (o.type ?? 'window') === 'window')
        .map((o) => [o.left + bar, o.left + o.width - bar, o.sill + bar, o.head - bar])
    };
  }

  const partitions = (room.partitions ?? []).map((p) => {
    const dx = p.to[0] - p.from[0], dz = p.to[1] - p.from[1], len = Math.hypot(dx, dz) || 1;
    return {
      c: [(p.from[0] + p.to[0]) / 2, p.height / 2, (p.from[1] + p.to[1]) / 2],
      axes: [[dx / len, 0, dz / len], [0, 1, 0], [-dz / len, 0, dx / len]],
      half: [len / 2, p.height / 2, p.thickness / 2]
    };
  });

  // slab test: does the segment from the point, length tMax, pass through the box?
  function blocked(b, px, py, pz, dx, dy, dz, tMax) {
    let t0 = 0, t1 = tMax;
    for (let k = 0; k < 3; k++) {
      const [ux, uy, uz] = b.axes[k];
      const e = ux * (b.c[0] - px) + uy * (b.c[1] - py) + uz * (b.c[2] - pz);
      const f = ux * dx + uy * dy + uz * dz, h = b.half[k];
      if (Math.abs(f) > 1e-12) {
        let a = (e + h) / f, c = (e - h) / f;
        if (a > c) [a, c] = [c, a];
        t0 = Math.max(t0, a); t1 = Math.min(t1, c);
        if (t0 > t1) return false;
      } else if (-e - h > 0 || -e + h < 0) {
        return false;
      }
    }
    return true;
  }

  const through = (w, px, py, pz, dx, dy, dz, t) => {
    const x = px + dx * t, y = py + dy * t, z = pz + dz * t;
    return [(x - w.cx) * w.ax + (z - w.cz) * w.az, y];
  };

  return function lit(px, py, pz, dx, dy, dz) {
    if (dy <= 0) return false;
    const tx = dx > 0 ? (L / 2 - px) / dx : dx < 0 ? (-L / 2 - px) / dx : Infinity;
    const tz = dz > 0 ? (W / 2 - pz) / dz : dz < 0 ? (-W / 2 - pz) / dz : Infinity;
    const ty = (H - py) / dy;
    if (ty <= tx && ty <= tz) return false;                // out through the ceiling

    let t, side, dn;
    if (tx < tz) { t = tx; side = dx > 0 ? '+x' : '-x'; dn = Math.abs(dx); }
    else { t = tz; side = dz > 0 ? '+z' : '-z'; dn = Math.abs(dz); }
    const w = walls[side];
    if (!w || !w.windows.length) return false;

    for (const b of partitions) if (blocked(b, px, py, pz, dx, dy, dz, t)) return false;

    const [a1, y1] = through(w, px, py, pz, dx, dy, dz, t);
    const [a2, y2] = through(w, px, py, pz, dx, dy, dz, t + T / dn);
    for (const [l, r, s, h] of w.windows) {
      if (a1 >= l && a1 <= r && y1 >= s && y1 <= h && a2 >= l && a2 <= r && y2 >= s && y2 <= h) return true;
    }
    return false;
  };
}

// Sample grids: the floor, and each wall's inner face with its openings left out.
// Each cell also knows where it sits on the unfolded plan (walls folded flat outward).
export function surfaceGrids(room, step = 0.1) {
  const { length: L, width: W, height: H } = room.clear;
  const T = room.wallThickness;
  const grids = [];

  const cols = Math.round(L / step), rows = Math.round(W / step);
  grids.push({
    id: 'floor', cols, rows, cellW: L / cols, cellH: W / rows, normal: [0, 1, 0],
    sample: (i, j) => [-L / 2 + (i + 0.5) * L / cols, INSET, -W / 2 + (j + 0.5) * W / rows],
    plan: (i, j) => [-L / 2 + (i + 0.5) * L / cols, -W / 2 + (j + 0.5) * W / rows],
    hole: () => false
  });

  for (const wall of room.walls) {
    const f = wallFrame(room, wall);
    const n = f.normal, c = Math.round(f.length / step), r = Math.round(H / step);
    const cw = f.length / c, ch = H / r;
    const base = (i) => [f.leftCorner[0] + f.along[0] * (i + 0.5) * cw, f.leftCorner[1] + f.along[2] * (i + 0.5) * cw];
    grids.push({
      id: wall.id, side: wall.side, cols: c, rows: r, cellW: cw, cellH: ch, normal: n.map((v) => -v), frame: f,
      sample: (i, j) => { const [x, z] = base(i); return [x - n[0] * INSET, (j + 0.5) * ch, z - n[2] * INSET]; },
      // unfold: height becomes distance out from the wall line, past the wall's thickness
      plan: (i, j) => { const [x, z] = base(i), out = T + (j + 0.5) * ch; return [x + n[0] * out, z + n[2] * out]; },
      hole: (i, j) => {
        const a = (i + 0.5) * cw, y = (j + 0.5) * ch;
        return wall.openings.some((o) => a > o.left && a < o.left + o.width && y > o.sill && y < o.head);
      }
    });
  }
  return grids;
}

// hours[i + j * cols] for every grid; NaN where there is an opening, not a surface.
export function sunHours(room, { doy, year, face, step = 0.1, minutes = 5 }) {
  const lit = shellSunTest(room);
  const suns = [];
  for (let m = minutes / 2; m < 1440; m += minutes) {
    const s = solar(doy, m, { year });
    if (s.alt > 0) suns.push(sunDirection(s.alt, s.az, face).toArray());
  }

  const grids = surfaceGrids(room, step);
  let max = 0;
  for (const g of grids) {
    const hours = new Float32Array(g.cols * g.rows);
    const [nx, ny, nz] = g.normal;
    for (let j = 0; j < g.rows; j++) {
      for (let i = 0; i < g.cols; i++) {
        if (g.hole(i, j)) { hours[i + j * g.cols] = NaN; continue; }
        const [px, py, pz] = g.sample(i, j);
        let n = 0;
        for (const [dx, dy, dz] of suns) {
          if (dx * nx + dy * ny + dz * nz > 0 && lit(px, py, pz, dx, dy, dz)) n++;
        }
        const h = n * minutes / 60;
        hours[i + j * g.cols] = h;
        if (h > max) max = h;
      }
    }
    g.hours = hours;
  }
  return { grids, max, daylightHours: suns.length * minutes / 60 };
}
