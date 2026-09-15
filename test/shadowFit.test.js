import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { fitShadowToRoom, solar, sunDirection } from '../src/scene/sun.js';
import { L, W, H, T } from '../src/scene/spec.js';

const year = 2026;
const corners = [];
for (const x of [-L / 2 - T, L / 2 + T]) for (const y of [-T, H + T]) for (const z of [-W / 2 - T, W / 2 + T]) corners.push(new THREE.Vector3(x, y, z));

function lightAt(doy, mins) {
  const s = solar(doy, mins, { year });
  const light = new THREE.DirectionalLight();
  light.position.copy(sunDirection(s.alt, s.az, 45)).multiplyScalar(L * 3).add(new THREE.Vector3(0, H / 2, 0));
  light.target.position.set(0, H / 2, 0);
  light.updateMatrixWorld();
  light.target.updateMatrixWorld();
  return { light, alt: s.alt };
}

describe('shadow camera fitted to the room', () => {
  const cases = [
    ['21 Jun 18:30, raking west', 172, 18 * 60 + 30],
    ['21 Jun 13:10, overhead', 172, 13 * 60 + 10],
    ['23 Sep 08:00, low east', 266, 8 * 60],
    ['21 Dec 16:00, low west', 355, 16 * 60]
  ];

  for (const [name, doy, mins] of cases) {
    it(`${name}: every room corner, walls and slabs included, is inside the shadow map`, () => {
      const { light, alt } = lightAt(doy, mins);
      expect(alt).toBeGreaterThan(0);
      fitShadowToRoom(light);
      light.shadow.updateMatrices(light);       // three's own render-time placement
      for (const c of corners) {
        const p = c.clone().applyMatrix4(light.shadow.matrix);   // texture coords and depth, 0..1
        for (const v of [p.x, p.y, p.z]) {
          expect(v).toBeGreaterThan(0);
          expect(v).toBeLessThan(1);
        }
      }
    });
  }

  it('covers far less than the old 23.9 x 19.4 m ground patch', () => {
    const { light } = lightAt(172, 18 * 60 + 30);
    fitShadowToRoom(light);
    const cam = light.shadow.camera;
    expect((cam.right - cam.left) * (cam.top - cam.bottom)).toBeLessThan(0.5 * 23.94 * 19.38);
  });

  it('keeps the depth bias about 8 mm whatever the fitted depth range', () => {
    const { light } = lightAt(355, 16 * 60);
    fitShadowToRoom(light);
    const cam = light.shadow.camera;
    expect(-light.shadow.bias * (cam.far - cam.near)).toBeCloseTo(0.008, 6);
  });
});
