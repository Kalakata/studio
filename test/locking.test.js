import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createFurniture } from '../src/assets/build.js';
import { serialize, normalize, parseLayout, sameItems } from '../src/assets/layouts.js';
import { createCutaway } from '../src/scene/cutaway.js';
import { matGhost, matWall, matCeil } from '../src/scene/materials.js';
import defaultLayout from '../src/assets/layout.json';

describe('locking furniture', () => {
  it('pieces from a layout are locked; a piece just placed is not', () => {
    const f = createFurniture(new THREE.Group());
    f.load([{ type: 'desk', x: 5.34, z: 0, ry: -90 }, { type: 'stool', x: 0, z: 0, ry: 0, locked: false }]);
    expect(f.items.map((g) => g.userData.locked)).toEqual([true, false]);
    expect(f.place('chair', 1, 0, 0).userData.locked).toBe(false);
  });

  it('only an unlocked piece is written down, so old layouts load locked', () => {
    const f = createFurniture(new THREE.Group());
    f.load([{ type: 'desk', x: 5.34, z: 0, ry: -90 }, { type: 'stool', x: 0, z: 0, ry: 0, locked: false }]);
    const saved = serialize(f.items);
    expect(saved[0]).not.toHaveProperty('locked');
    expect(saved[1].locked).toBe(false);

    const again = createFurniture(new THREE.Group());
    again.load(parseLayout({ items: saved }).items);
    expect(again.items.map((g) => g.userData.locked)).toEqual([true, false]);
  });

  it('a freshly loaded default layout still reads as unchanged', () => {
    const f = createFurniture(new THREE.Group());
    const items = parseLayout(defaultLayout).items;
    f.load(items);
    expect(sameItems(serialize(f.items), normalize(items))).toBe(true);
  });

  it('import rejects a locked value that is not true or false', () => {
    expect(() => parseLayout({ items: [{ type: 'desk', x: 0, z: 0, locked: 'yes' }] })).toThrow(/malformed/);
  });
});

describe('cutaway follows the camera, not the last view preset', () => {
  it('near walls cut away once the camera is outside, even if "Stand inside" was the last preset', () => {
    const panel = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), matWall);
    panel.userData.mat = matWall;
    const mesh = new THREE.Group();
    mesh.add(panel);
    const wall = { id: 'mural', n: new THREE.Vector3(0, 0, 1), mesh, ghosted: false };
    const ceiling = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), matCeil);
    ceiling.userData = { mat: matCeil, ghosted: false };
    const update = createCutaway({ walls: [wall], ceiling, stuff: new THREE.Group() }, { cutaway: true, ceiling: false });

    update({ position: new THREE.Vector3(-4, 1.5, 0) }, true);        // standing inside
    expect(panel.material).toBe(matWall);

    update({ position: new THREE.Vector3(-6, 7, 9) }, true);          // orbited out by hand; the old flag says "inside"
    expect(panel.material).toBe(matGhost);
  });
});
