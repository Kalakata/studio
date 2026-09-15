import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { palletGeometry, buildAsset, ASSETS, clampItem } from '../src/assets/build.js';
import { findClashes } from '../src/assets/clash.js';
import preset from '../src/assets/presets/pallet-studio.json';
import { SAVED_ROOM } from '../src/scene/spec.js';

const size = (obj) => {
  obj.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(obj), s = new THREE.Vector3();
  b.getSize(s);
  return { w: s.x, h: s.y, d: s.z, top: b.max.y, bottom: b.min.y };
};

describe('pallets', () => {
  it('a EUR pallet is 1200 x 800 x 144', () => {
    const g = palletGeometry(1.2, 0.8);
    g.computeBoundingBox();
    const s = new THREE.Vector3();
    g.boundingBox.getSize(s);
    // geometry is stored as 32-bit floats: good to well under a micron, not to 1e-9
    expect(s.x).toBeCloseTo(1.2, 6);
    expect(s.y).toBeCloseTo(0.144, 6);
    expect(s.z).toBeCloseTo(0.8, 6);
    expect(g.boundingBox.min.y).toBeCloseTo(0, 6);
  });

  it('is built once per size and shared', () => {
    expect(palletGeometry(1.2, 0.8)).toBe(palletGeometry(1.2, 0.8));
    expect(palletGeometry(0.8, 0.6)).not.toBe(palletGeometry(1.2, 0.8));
  });

  it('a half pallet leaves out the intermediate deck boards it has no room for', () => {
    const boxes = (g) => g.index.count / 36;       // 36 indices per box
    expect(boxes(palletGeometry(1.2, 0.8))).toBe(3 + 9 + 3 + 5);
    expect(boxes(palletGeometry(0.8, 0.6))).toBe(3 + 9 + 3 + 3);
  });
});

describe('pallet furniture matches its catalog entry', () => {
  for (const id of ['pallet-sofa', 'pallet-table', 'pallet-shelf', 'pallet-desk']) {
    it(id, () => {
      const a = ASSETS[id], s = size(buildAsset(id));
      expect(Math.abs(s.w - a.w)).toBeLessThan(0.011);
      expect(Math.abs(s.d - a.d)).toBeLessThan(0.011);
      expect(s.bottom).toBeGreaterThan(-0.001);
      expect(s.top).toBeGreaterThanOrEqual(a.h - 0.001);        // h is the body; cushions or kit may sit above
    });
  }

  it('the shelving clears the 0.90 sill and the desk top matches the studio desk', () => {
    expect(ASSETS['pallet-shelf'].h).toBeLessThan(0.90);
    expect(ASSETS['pallet-desk'].h).toBeCloseTo(ASSETS.desk.h, 2);
  });
});

describe('the Pallet studio preset', () => {
  it('uses only catalog pieces', () => {
    for (const it of preset.items) expect(ASSETS[it.type], it.type).toBeDefined();
  });

  it('has no clashes', () => {
    expect(findClashes(preset.items, ASSETS, SAVED_ROOM).map((c) => c.message)).toEqual([]);
  });

  it('every piece already sits inside the room (placing it does not move it)', () => {
    for (const it of preset.items) {
      const g = buildAsset(it.type);
      g.position.set(it.x, 0, it.z);
      g.rotation.y = it.ry * Math.PI / 180;
      clampItem(g);
      expect([g.position.x, g.position.z], it.type).toEqual([it.x, it.z]);
    }
  });
});
