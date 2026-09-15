import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildAsset, ASSETS } from '../src/assets/build.js';
import { findClashes, footprint } from '../src/assets/clash.js';
import { createCutaway } from '../src/scene/cutaway.js';
import { matGhost, matCeil } from '../src/scene/materials.js';
import { SAVED_ROOM, L, W, H } from '../src/scene/spec.js';
import preset from '../src/assets/presets/pallet-studio.json';
import { coverCeiling, lightKeepouts } from '../src/assets/ceilingCover.js';
import { serialize, parseLayout } from '../src/assets/layouts.js';

const box = (obj) => { obj.updateMatrixWorld(true); return new THREE.Box3().setFromObject(obj); };

describe('ceiling clouds', () => {
  it('the small cloud hangs its 100 mm panel a 100 mm air gap below the ceiling', () => {
    const g = buildAsset('cloud');
    const panel = g.children[0];
    expect(panel.position.y + 0.05).toBeCloseTo(H - 0.10, 6);      // top of panel
    expect(panel.position.y - 0.05).toBeCloseTo(H - 0.20, 6);      // bottom = drop
    expect(box(g).max.y).toBeLessThanOrEqual(H + 1e-6);
  });

  it('the large cloud hangs 400 mm down on wires', () => {
    const g = buildAsset('cloud-large');
    const b = box(g);
    expect(b.min.y).toBeCloseTo(H - ASSETS['cloud-large'].drop, 6);
    expect(b.max.y).toBeCloseTo(H, 6);
    const s = b.getSize(new THREE.Vector3());
    expect(s.x).toBeCloseTo(2.40, 3);
    expect(s.z).toBeCloseTo(1.20, 3);
  });

  it('spans only the band under the ceiling in the clash check', () => {
    const f = footprint({ x: 0, z: 0, ry: 0 }, ASSETS.cloud, H);
    expect([f.y0, f.y1]).toEqual([H - 0.20, H]);
  });

  it('clashes with another cloud, not with a tall cabinet under it', () => {
    const msgs = (items) => findClashes(items, ASSETS, SAVED_ROOM).map((c) => c.message);
    expect(msgs([{ type: 'cloud', x: 0, z: 0, ry: 0 }, { type: 'cabinet', x: 0, z: 0, ry: 0 }])).toEqual([]);
    expect(msgs([{ type: 'cloud', x: 0, z: 0, ry: 0 }, { type: 'cloud', x: 0.5, z: 0, ry: 0 }]))
      .toEqual(['Ceiling cloud 1.2 × 0.6 overlaps Ceiling cloud 1.2 × 0.6']);
  });

  it('is hidden from above but keeps casting shadows, and shows from inside the room', () => {
    const stuff = new THREE.Group();
    const cloud = buildAsset('cloud');
    stuff.add(cloud);
    const ceiling = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), matCeil);
    ceiling.userData = { mat: matCeil, ghosted: false };
    const update = createCutaway({ walls: [], ceiling, stuff }, { ceiling: false, cutaway: true });
    const panel = cloud.children[0];

    update({ position: new THREE.Vector3(-8, 12, 9) }, false);           // corner view, above
    expect(panel.material).toBe(matGhost);
    expect(panel.visible).toBe(true);                                    // still in the shadow pass
    expect(panel.castShadow).toBe(true);

    update({ position: new THREE.Vector3(-L / 2 + 0.8, 1.5, 0) }, true); // standing inside
    expect(panel.material).not.toBe(matGhost);
  });

  it('the Pallet studio asks for a covered ceiling instead of placing clouds by hand', () => {
    expect(preset.coverCeiling).toBe(true);
    expect(preset.items.some((i) => ASSETS[i.type].mount === 'ceiling')).toBe(false);
  });
});

describe('covering the ceiling around the lights', () => {
  const panels = coverCeiling(SAVED_ROOM);
  const keepouts = lightKeepouts(SAVED_ROOM, 0.10);
  const rect = (p) => ({ x0: p.x - p.w / 2, x1: p.x + p.w / 2, z0: p.z - p.d / 2, z1: p.z + p.d / 2 });
  const overlapArea = (a, b) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0));

  it('keeps every batten clear, with 100 mm to spare', () => {
    expect(keepouts).toHaveLength(8);
    for (const p of panels) for (const k of keepouts) expect(overlapArea(rect(p), k)).toBe(0);
  });

  it('stays inside the room and no two panels overlap', () => {
    for (const p of panels) {
      const r = rect(p);
      expect(r.x0).toBeGreaterThanOrEqual(-L / 2);
      expect(r.x1).toBeLessThanOrEqual(L / 2);
      expect(r.z0).toBeGreaterThanOrEqual(-W / 2);
      expect(r.z1).toBeLessThanOrEqual(W / 2);
    }
    for (let i = 0; i < panels.length; i++) for (let j = i + 1; j < panels.length; j++) expect(overlapArea(rect(panels[i]), rect(panels[j]))).toBe(0);
    expect(findClashes(panels, ASSETS, SAVED_ROOM)).toEqual([]);
  });

  it('covers nearly all the ceiling that is not kept clear for the lights', () => {
    const ceiling = L * W, kept = keepouts.reduce((s, k) => s + (k.x1 - k.x0) * (k.z1 - k.z0), 0);
    const covered = panels.reduce((s, p) => s + p.w * p.d, 0);
    expect(covered / (ceiling - kept)).toBeGreaterThan(0.85);
  });

  it('no panel is bigger than 2.4 x 1.2 or narrower than 0.3', () => {
    for (const p of panels) {
      expect(p.w).toBeLessThanOrEqual(2.4);
      expect(p.d).toBeLessThanOrEqual(1.2);
      expect(Math.min(p.w, p.d)).toBeGreaterThanOrEqual(0.3);
    }
  });

  it('a fitted panel is built to its own size and survives a save and load', () => {
    const p = panels[0];
    const g = buildAsset('ceiling-panel', { w: p.w, d: p.d });
    const s = box(g).getSize(new THREE.Vector3());
    expect(s.x).toBeCloseTo(p.w, 3);
    expect(s.z).toBeCloseTo(p.d, 3);
    g.position.set(p.x, 0, p.z);
    expect(serialize([g])[0]).toMatchObject({ type: 'ceiling-panel', w: p.w, d: p.d });
    expect(parseLayout({ items: serialize([g]) }).items[0]).toMatchObject({ w: p.w, d: p.d });
  });
});
