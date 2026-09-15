import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildAsset, ASSETS } from '../src/assets/build.js';

// Sources: KRK Rokit 7 G4 (339 H x 225 W x 284 D mm); Gravity SP 3202 (triangular base 292.5 mm
// edge, 250 x 250 mm tray, height 930-1500 mm); tweeters at seated ear height, 1.20-1.40 m.
const a = ASSETS['monitor-stand'];
const parts = a.parts;
const bbox = (obj) => { obj.updateMatrixWorld(true); return new THREE.Box3().setFromObject(obj); };

describe('studio monitor on stand', () => {
  it('the cabinet is a Rokit 7 G4', () => {
    const cabinet = parts.find((p) => p.box && p.mat === 'dark' && p.box[1] > 0.3);
    expect(cabinet.box).toEqual([0.225, 0.339, 0.284]);
  });

  it('the tray sits within the SP 3202 range, and the cabinet sits on it', () => {
    const tray = parts.find((p) => p.box && p.box[0] === 0.25 && p.box[2] === 0.25);
    const trayTop = tray.at[1] + tray.box[1] / 2;
    expect(trayTop).toBeGreaterThanOrEqual(0.93 - 1e-9);
    expect(trayTop).toBeLessThanOrEqual(1.50);
    const cabinet = parts.find((p) => p.box && p.box[1] === 0.339);
    expect(cabinet.at[1] - cabinet.box[1] / 2).toBeCloseTo(trayTop, 6);
  });

  it('the base is the SP 3202 triangle: 292.5 mm edge', () => {
    const base = parts.find((p) => p.cyl && p.cyl[3] === 3);
    expect(base.cyl[0] * Math.sqrt(3)).toBeCloseTo(0.2925, 3);
  });

  it('puts the tweeter at seated ear height', () => {
    const tweeter = parts.find((p) => p.cyl && p.mat === 'metal' && p.cyl[0] === 0.03);
    expect(tweeter.at[1]).toBeGreaterThanOrEqual(1.19);
    expect(tweeter.at[1]).toBeLessThanOrEqual(1.40);
  });

  it('the built piece matches its catalog footprint and height, drivers facing +z', () => {
    const box = bbox(buildAsset('monitor-stand'));
    const size = box.getSize(new THREE.Vector3());
    expect(size.x).toBeLessThanOrEqual(a.w + 1e-6);
    expect(size.z).toBeLessThanOrEqual(a.d + 1e-6);
    expect(box.max.y).toBeCloseTo(a.h, 3);
    const cone = parts.find((p) => p.mat === 'cone');
    expect(cone.at[2]).toBeGreaterThan(0.284 / 2);        // on the front baffle, the +z face
  });
});
