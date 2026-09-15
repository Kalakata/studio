import * as THREE from 'three';
import { wallFrame } from '../scene/spec.js';

const _u = new THREE.Vector3(), _w = new THREE.Vector3();

// Point on segment ab nearest to a ray.
export function closestOnSegment(ray, a, b, out = new THREE.Vector3()) {
  _u.subVectors(b, a);
  _w.subVectors(a, ray.origin);
  const v = ray.direction;
  const A = _u.dot(_u), B = _u.dot(v), C = v.dot(v), D = _u.dot(_w), E = v.dot(_w);
  const den = A * C - B * B;
  const s = den > 1e-12 ? Math.min(1, Math.max(0, (B * E - C * D) / den)) : 0;
  return out.copy(a).addScaledVector(_u, s);
}

// What a measurement can lock onto: the room's inner corners and edges, the corners and edges
// of every opening, and the corners and edges of every partition.
export function snapFeatures(room) {
  const { length: L, width: W, height: H } = room.clear;
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const points = [], edges = [];
  const loop = (c) => { points.push(...c); for (let i = 0; i < c.length; i++) edges.push([c[i], c[(i + 1) % c.length]]); };

  loop([V(-L / 2, 0, -W / 2), V(L / 2, 0, -W / 2), V(L / 2, 0, W / 2), V(-L / 2, 0, W / 2)]);
  loop([V(-L / 2, H, -W / 2), V(L / 2, H, -W / 2), V(L / 2, H, W / 2), V(-L / 2, H, W / 2)]);
  for (const x of [-L / 2, L / 2]) for (const z of [-W / 2, W / 2]) edges.push([V(x, 0, z), V(x, H, z)]);

  for (const wall of room.walls) {
    const f = wallFrame(room, wall);
    const P = (along, y) => V(f.leftCorner[0] + f.along[0] * along, y, f.leftCorner[1] + f.along[2] * along);
    for (const o of wall.openings) loop([P(o.left, o.sill), P(o.left + o.width, o.sill), P(o.left + o.width, o.head), P(o.left, o.head)]);
  }

  for (const p of room.partitions ?? []) {
    const dx = p.to[0] - p.from[0], dz = p.to[1] - p.from[1], len = Math.hypot(dx, dz) || 1;
    const px = -dz / len * p.thickness / 2, pz = dx / len * p.thickness / 2;
    const base = [[p.from[0] + px, p.from[1] + pz], [p.to[0] + px, p.to[1] + pz], [p.to[0] - px, p.to[1] - pz], [p.from[0] - px, p.from[1] - pz]];
    const bottom = base.map(([x, z]) => V(x, 0, z)), top = base.map(([x, z]) => V(x, p.height, z));
    loop(bottom); loop(top);
    for (let i = 0; i < 4; i++) edges.push([bottom[i], top[i]]);
  }
  return { points, edges };
}

// Snap under the cursor: a feature corner within vertexPx, else the nearest point on a feature
// edge within edgePx, else the surface point under the cursor. project(v) -> [px, py] or null.
export function snap(ray, cursor, project, features, surfacePoint, { vertexPx = 14, edgePx = 10 } = {}) {
  const dist = (s) => Math.hypot(s[0] - cursor[0], s[1] - cursor[1]);

  let best = null, bestD = vertexPx;
  for (const p of features.points) {
    const s = project(p);
    if (s && dist(s) < bestD) { bestD = dist(s); best = p; }
  }
  if (best) return { point: best.clone(), kind: 'vertex' };

  bestD = edgePx;
  const q = new THREE.Vector3();
  for (const [a, b] of features.edges) {
    closestOnSegment(ray, a, b, q);
    const s = project(q);
    if (s && dist(s) < bestD) { bestD = dist(s); best = q.clone(); }
  }
  if (best) return { point: best, kind: 'edge' };

  return surfacePoint ? { point: surfacePoint.clone(), kind: 'surface' } : null;
}
