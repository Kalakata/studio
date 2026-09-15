import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { closestOnSegment, snap, snapFeatures } from '../src/interaction/measureMath.js';
import { SAVED_ROOM, L, W, H } from '../src/scene/spec.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

describe('closest point on a segment to a ray', () => {
  it('finds the crossing point', () => {
    const ray = new THREE.Ray(V(0, 5, 0), V(0, -1, 0));
    expect(closestOnSegment(ray, V(-1, 0, 1), V(1, 0, 1)).toArray()).toEqual([0, 0, 1]);
  });
  it('clamps to the segment end', () => {
    const ray = new THREE.Ray(V(5, 5, 0), V(0, -1, 0));
    expect(closestOnSegment(ray, V(-1, 0, 0), V(1, 0, 0)).toArray()).toEqual([1, 0, 0]);
  });
});

describe('snapping a measurement', () => {
  // a plan view looking straight down, 1280 x 800
  const camera = new THREE.PerspectiveCamera(45, 1280 / 800, 0.2, 1400);
  camera.position.set(0, 16, 0.001);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  const project = (p) => { const v = p.clone().project(camera); return v.z > 1 ? null : [(v.x + 1) / 2 * 1280, (1 - v.y) / 2 * 800]; };
  const features = snapFeatures(SAVED_ROOM);
  const rayAt = ([px, py]) => {
    const rc = new THREE.Raycaster();
    rc.setFromCamera(new THREE.Vector2(px / 640 - 1, 1 - py / 400), camera);
    return rc.ray;
  };
  const clickNear = (target, dx = 6, dy = -4, surface = null) => {
    const [px, py] = project(target);
    const cursor = [px + dx, py + dy];
    return snap(rayAt(cursor), cursor, project, features, surface);
  };

  it('locks onto the room corners, so the length reads 11.400 and the width 3.950', () => {
    const a = clickNear(V(-L / 2, 0, -W / 2)), b = clickNear(V(L / 2, 0, -W / 2)), c = clickNear(V(L / 2, 0, W / 2), -5, 5);
    expect(a.kind).toBe('vertex');
    expect(a.point.distanceTo(b.point).toFixed(3)).toBe('11.400');
    expect(b.point.distanceTo(c.point).toFixed(3)).toBe('3.950');
  });

  it('corners and edges of openings are snap targets too', () => {
    const pts = features.points.map((p) => p.toArray().map((v) => +v.toFixed(3)).join());
    expect(pts).toContain([L / 2 - 0.9 - 1.2 - 0.9 - 1.2 - 0.9 - 1.2 - 0.9 - 1.2, 0.9, -W / 2].map((v) => +v.toFixed(3)).join());
    expect(pts).toContain([L / 2, H, W / 2].join());
  });

  it('falls back to an edge, then to the surface', () => {
    const onEdge = clickNear(V(1.234, 0, -W / 2), 0, 4);
    expect(onEdge.kind).toBe('edge');
    expect(onEdge.point.z).toBeCloseTo(-W / 2, 6);
    const middle = clickNear(V(0.3, 0, 0.2), 0, 0, V(0.3, 0, 0.2));
    expect(middle.kind).toBe('surface');
  });
});
