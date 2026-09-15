import { describe, it, expect } from 'vitest';
import catalog from '../src/assets/catalog.json';
import defaultLayout from '../src/assets/layout.json';
import { SAVED_ROOM } from '../src/scene/spec.js';
import { findClashes, overlaps, footprint } from '../src/assets/clash.js';
import { addOpening, addPartition } from '../src/scene/shellOps.js';

const ASSETS = Object.fromEntries(catalog.assets.map((a) => [a.id, a]));
const clashes = (items, room = SAVED_ROOM) => findClashes(items, ASSETS, room).map((c) => c.message);

describe('default layout', () => {
  it('only the plant by the street end pokes above a long-wall sill', () => {
    // its leaves top out at 0.98, the sill is at 0.90
    expect(clashes(defaultLayout.items)).toEqual(['Plant blocks a window on the long wall']);
  });
});

describe('furniture against furniture', () => {
  it('overlapping pieces clash, touching ones do not', () => {
    expect(clashes([{ type: 'stool', x: 0, z: 0, ry: 0 }, { type: 'stool', x: 0.3, z: 0, ry: 0 }])).toEqual(['Stool overlaps Stool']);
    expect(clashes([{ type: 'stool', x: 0, z: 0, ry: 0 }, { type: 'stool', x: 0.4, z: 0, ry: 0 }])).toEqual([]);
  });

  it('uses the rotated footprint', () => {
    const desk = { type: 'desk', x: 0, z: 0, ry: 90 };           // now 0.72 along x, 2.90 along z
    expect(clashes([desk, { type: 'stool', x: 0, z: 1.3, ry: 0 }])).toEqual(['Desk overlaps Stool']);
    expect(clashes([desk, { type: 'stool', x: 0.6, z: 0, ry: 0 }])).toEqual([]);
  });

  it('pieces at different heights pass: a wall panel above a cabinet top does not clash', () => {
    expect(clashes([{ type: 'shelf', x: 0, z: 1.765, ry: 180 }, { type: 'panel', x: 0, z: 1.935, ry: 180 }])).toEqual([]);
  });

  it('a rug never clashes', () => {
    expect(clashes([{ type: 'rug', x: 0, z: 0, ry: 0 }, { type: 'sofa', x: 0, z: 0, ry: 0 }])).toEqual([]);
  });

  it('footprint corners follow three.js rotation', () => {
    const { poly } = footprint({ x: 1, z: 2, ry: 90 }, { w: 2, d: 1, h: 1 });
    // local +x (half-width 1) maps to scene -z under rotation.y = +90 deg
    expect(poly[1][0]).toBeCloseTo(0.5, 9);
    expect(poly[1][1]).toBeCloseTo(1, 9);
    expect(overlaps(poly, poly)).toBe(true);
  });
});

describe('furniture against the shell', () => {
  it('a tall cabinet in front of a street window blocks it; a low shelf does not', () => {
    expect(clashes([{ type: 'cabinet', x: 5.475, z: -0.9, ry: 90 }])).toEqual(['Cabinet blocks a window on the street wall']);
    expect(clashes([{ type: 'shelf', x: 5.49, z: -0.9, ry: 90 }])).toEqual([]);
  });

  it('something in a door swing clashes', () => {
    const { room } = addOpening(SAVED_ROOM, 'back', 'door');       // hinge at z = 0.45, opens to +x
    expect(clashes([{ type: 'stool', x: -5.3, z: 0, ry: 0 }], room)).toEqual(['Stool is in the swing of the door on the back wall']);
    expect(clashes([{ type: 'stool', x: -4.5, z: 0, ry: 0 }], room)).toEqual([]);
  });

  it('something through a partition clashes', () => {
    const room = addPartition(SAVED_ROOM);                        // x = 0, from the long wall 1.2 m in
    expect(clashes([{ type: 'stool', x: 0, z: -1.2, ry: 0 }], room)).toEqual(['Stool overlaps partition 1']);
    expect(clashes([{ type: 'stool', x: 1, z: -1.2, ry: 0 }], room)).toEqual([]);
  });
});
