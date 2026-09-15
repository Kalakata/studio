import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import catalog from '../src/assets/catalog.json';
import { createFurniture, buildAsset } from '../src/assets/build.js';
import { serialize, parseLayout } from '../src/assets/layouts.js';
import { findClashes } from '../src/assets/clash.js';
import { layoutAbsorbers } from '../src/analysis/roomAcoustics.js';
import { SAVED_ROOM as room } from '../src/scene/spec.js';

const ASSETS = Object.fromEntries(catalog.assets.map((a) => [a.id, a]));
const curtain = ASSETS.curtain;
const GLASS = 0.6;                                   // half a 1.2 m window, from the curtain's centre

describe('curtain', () => {
  it('closed, its fabric covers the window and laps it; open, the fabric stacks clear of the glass', () => {
    const fabric = (parts) => parts.filter((p) => p.mat === 'curtain');
    const reach = (p) => (p.box ? p.box[0] / 2 : p.cyl[0]);
    expect(Math.max(...fabric(curtain.parts).map((p) => Math.abs(p.at[0]) + reach(p)))).toBeGreaterThanOrEqual(GLASS + 0.1);
    expect(fabric(curtain.parts).some((p) => p.box && p.box[0] >= 2 * GLASS)).toBe(true);
    for (const p of fabric(curtain.openParts)) expect(Math.abs(p.at[0]) - reach(p)).toBeGreaterThanOrEqual(GLASS - 1e-9);
    for (const p of [...curtain.parts, ...curtain.openParts]) {
      const top = p.at[1] + (p.box ? p.box[1] : p.cyl[2]) / 2;
      expect(top).toBeLessThanOrEqual(curtain.h + 1e-9);
    }
  });

  it('opens and closes in place, keeping the group, its position and its lock; only an open one is written down', () => {
    const f = createFurniture(new THREE.Group());
    f.load([{ type: 'curtain', x: 5.58, z: -0.858, ry: -90 }]);
    const [g] = f.items;
    expect(g.userData).toMatchObject({ openable: true, open: false, locked: true });
    const closedParts = g.children.length;
    expect(serialize(f.items)[0]).not.toHaveProperty('open');

    f.setOpen(g, true);
    expect(f.items[0]).toBe(g);
    expect(g.userData.open).toBe(true);
    expect(g.children.length).toBe(curtain.openParts.length);
    expect(g.children.length).not.toBe(closedParts);
    expect(g.position.x).toBeCloseTo(5.58, 9);
    expect(serialize(f.items)[0].open).toBe(true);

    const again = createFurniture(new THREE.Group());
    again.load(parseLayout({ items: serialize(f.items) }).items);
    expect(again.items[0].userData.open).toBe(true);
  });

  it('a piece that cannot open ignores the flag', () => {
    expect(buildAsset('chair', undefined, true).userData).toMatchObject({ openable: false, open: false });
  });

  it('import rejects an open value that is not true or false', () => {
    expect(() => parseLayout({ items: [{ type: 'curtain', x: 0, z: 0, open: 'yes' }] })).toThrow(/malformed/);
  });

  it('may hang in front of a window where a cabinet may not', () => {
    expect(findClashes([{ type: 'curtain', x: 5.58, z: -0.858, ry: -90 }], ASSETS, room)).toEqual([]);
    expect(findClashes([{ type: 'cabinet', x: 5.47, z: -0.858, ry: -90 }], ASSETS, room).map((c) => c.kind)).toEqual(['window']);
  });

  it('absorbs over its whole face when closed and only its stacks when open', () => {
    const [closed, open] = layoutAbsorbers([{ type: 'curtain', x: 5.58, z: 0.858, ry: -90 }, { type: 'curtain', x: 5.58, z: 0.858, ry: -90, open: true }], ASSETS, room);
    expect(closed.area).toBeCloseTo(1.5 * 2.82, 9);
    expect(open.area).toBeCloseTo(0.3 * 2.82, 9);
    expect(closed.alpha(1000)).toBeCloseTo(0.72, 9);
  });
});
