// Daylight arithmetic with no three.js, so it runs in node and is tested there.
// Irradiance is in scene units: W_PER_UNIT watts per square metre per unit.

import { wallFrame } from './spec.js';

const D2R = Math.PI / 180;

export const W_PER_UNIT = 200;
export const SUN_ANGULAR_RADIUS = 0.2666;   // degrees

const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export const luminance = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

// Clear-sky irradiance for a solar altitude (degrees).
// Beam: Meinel with Kasten-Young air mass. Global: Haurwitz. Diffuse is what is left, with a
// twilight tail so the sky does not switch off the moment the sun sets.
export function clearSky(alt) {
  const h = Math.max(alt, 0), s = Math.sin(h * D2R);
  let dni = 0, ghiModel = 0;
  if (alt > 0) {
    const airMass = 1 / (s + 0.50572 * Math.pow(h + 6.07995, -1.6364));
    dni = 1353 * Math.pow(0.7, Math.pow(airMass, 0.678));
    ghiModel = 1098 * s * Math.exp(-0.057 / Math.max(s, 1e-3));
  }
  dni *= smoothstep(-SUN_ANGULAR_RADIUS, SUN_ANGULAR_RADIUS, alt);   // the disc clears the horizon
  const beamH = dni * s;
  let dhi = Math.max(ghiModel - beamH, 0.1 * ghiModel);
  dhi += 20 * Math.exp(-Math.abs(alt) / (alt > 0 ? 2 : 2.2));
  dhi = Math.max(dhi, 0.05);
  return { dni: dni / W_PER_UNIT, dhi: dhi / W_PER_UNIT, ghi: (dhi + beamH) / W_PER_UNIT };
}

// Directions over the whole sphere with their solid angles, midpoint rule.
const SPHERE = (() => {
  const out = [], nEl = 24, nAz = 48;
  for (let i = 0; i < nEl; i++) {
    const el = (-90 + (i + 0.5) * 180 / nEl) * D2R, ce = Math.cos(el);
    const dw = ce * (Math.PI / nEl) * (2 * Math.PI / nAz);
    for (let j = 0; j < nAz; j++) {
      const az = (j + 0.5) * 2 * Math.PI / nAz;
      out.push([ce * Math.cos(az), Math.sin(el), ce * Math.sin(az), dw]);
    }
  }
  return out;
})();

// Irradiance (rgb) on a plane with unit normal n, from radianceAt(x, y, z) -> [r, g, b].
export function planeIrradiance(radianceAt, n) {
  const e = [0, 0, 0];
  for (const [x, y, z, dw] of SPHERE) {
    const c = x * n[0] + y * n[1] + z * n[2];
    if (c <= 0) continue;
    const l = radianceAt(x, y, z);
    e[0] += l[0] * c * dw; e[1] += l[1] * c * dw; e[2] += l[2] * c * dw;
  }
  return e;
}

const isWindow = (o) => (o.type ?? 'window') === 'window';

// Every glazed wall with its windows as world-space rectangles on the inner face. Doors are
// opaque and take no part in daylight.
export function glazedWalls(room) {
  return room.walls.filter((w) => w.openings.some(isWindow)).map((wall) => {
    const f = wallFrame(room, wall);
    const nOut = f.normal, nIn = nOut.map((v) => -v);
    const t = [-nOut[2], 0, nOut[0]];                    // horizontal, along the wall
    const rects = wall.openings.filter(isWindow).map((o) => {
      const [cx, cz] = f.worldCentre(o), hw = o.width / 2;
      return {
        centre: [cx, (o.sill + o.head) / 2, cz],
        width: o.width, height: o.head - o.sill, area: o.width * (o.head - o.sill),
        corners: [
          [cx - t[0] * hw, o.sill, cz - t[2] * hw], [cx + t[0] * hw, o.sill, cz + t[2] * hw],
          [cx + t[0] * hw, o.head, cz + t[2] * hw], [cx - t[0] * hw, o.head, cz - t[2] * hw]
        ]
      };
    });
    return { id: wall.id, nOut, nIn, along: t, rects };
  });
}

// One rectangle standing in for all of a wall's openings (the reduced quality path).
// `fill` is the glazed share of it, so radiance x fill keeps the flux right.
export function mergedOpening(w) {
  const proj = (p) => p[0] * w.along[0] + p[2] * w.along[2];
  let a0 = Infinity, a1 = -Infinity, y0 = Infinity, y1 = -Infinity, area = 0;
  for (const r of w.rects) {
    for (const c of r.corners) { a0 = Math.min(a0, proj(c)); a1 = Math.max(a1, proj(c)); y0 = Math.min(y0, c[1]); y1 = Math.max(y1, c[1]); }
    area += r.area;
  }
  const mid = (a0 + a1) / 2, c = w.rects[0].centre;
  const offset = mid - proj(c);
  const width = a1 - a0, height = y1 - y0;
  return {
    centre: [c[0] + w.along[0] * offset, (y0 + y1) / 2, c[2] + w.along[2] * offset],
    width, height, area, fill: area / (width * height)
  };
}

function shoelace(pts) {
  let s = 0;
  for (let i = 0; i < pts.length; i++) { const [x0, z0] = pts[i], [x1, z1] = pts[(i + 1) % pts.length]; s += x0 * z1 - x1 * z0; }
  return Math.abs(s) / 2;
}

// Where sunlight through an opening lands on the floor (y = 0), as an axis-aligned rectangle
// of the same area, clipped to the room. sunDir points towards the sun. null if none lands.
export function sunPatch(corners, sunDir, L, W) {
  const [sx, sy, sz] = sunDir;
  if (sy <= 0.01) return null;
  const pts = corners.map(([x, y, z]) => [x - sx * (y / sy), z - sz * (y / sy)]);
  const area = shoelace(pts);
  if (area < 1e-6) return null;
  const xs = pts.map((p) => p[0]), zs = pts.map((p) => p[1]);
  const bw = Math.max(...xs) - Math.min(...xs), bd = Math.max(...zs) - Math.min(...zs);
  const k = Math.sqrt(area / (bw * bd));
  const cx = xs.reduce((a, b) => a + b) / 4, cz = zs.reduce((a, b) => a + b) / 4;
  const x0 = Math.max(cx - bw * k / 2, -L / 2), x1 = Math.min(cx + bw * k / 2, L / 2);
  const z0 = Math.max(cz - bd * k / 2, -W / 2), z1 = Math.min(cz + bd * k / 2, W / 2);
  if (x1 <= x0 || z1 <= z0) return null;
  return { cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, w: x1 - x0, d: z1 - z0, area: (x1 - x0) * (z1 - z0) };
}

// Bounding rectangle of several patches; fill = lit share of it.
export function mergePatches(patches) {
  if (!patches.length) return null;
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity, area = 0;
  for (const p of patches) {
    x0 = Math.min(x0, p.cx - p.w / 2); x1 = Math.max(x1, p.cx + p.w / 2);
    z0 = Math.min(z0, p.cz - p.d / 2); z1 = Math.max(z1, p.cz + p.d / 2);
    area += p.area;
  }
  const w = x1 - x0, d = z1 - z0;
  return { cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, w, d, area, fill: area / (w * d) };
}

// Interior surface area and area-weighted reflectance. Glazing reflects little back in.
export function roomReflectance(room, albedo) {
  const { length: L, width: W, height: H } = room.clear;
  let total = 2 * L * W, weighted = L * W * (albedo.floor + albedo.ceiling);
  for (const wall of room.walls) {
    const length = wall.side.endsWith('z') ? L : W;
    const glazing = wall.openings.filter(isWindow).reduce((s, o) => s + o.width * (o.head - o.sill), 0);
    const solid = length * H - glazing;
    total += length * H;
    weighted += solid * (wall.finish === 'mural' ? albedo.mural : albedo.wall) + glazing * albedo.glass;
  }
  return { total, rho: weighted / total };
}

// Uniform inter-reflected irradiance (split-flux method). Sky flux counts every bounce; the
// sun's first bounce off the floor is drawn separately as patch lights, so only its later
// bounces are spread uniformly here.
export function splitFlux(phiSun, phiSky, { total, rho }) {
  const k1 = rho / (1 - rho), k2 = rho * k1;
  return [0, 1, 2].map((i) => (phiSun[i] * k2 + phiSky[i] * k1) / total);
}
