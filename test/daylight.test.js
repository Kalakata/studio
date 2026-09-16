import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  clearSky, planeIrradiance, glazedWalls, mergedOpening, sunPatch, mergePatches,
  roomReflectance, splitFlux, W_PER_UNIT
} from '../src/scene/daylightMath.js';
import { patchFragment, patchVertex, patchShadowChunk, patchLightsBegin, patchLightsMaps } from '../src/scene/roomlit.js';
import { solar, sunDirection } from '../src/scene/sun.js';
import { ROOM, L, W, FACE } from '../src/scene/spec.js';

const year = 2026;
const toWatts = (v) => v * W_PER_UNIT;
const sunAt = (doy, mins) => {
  const s = solar(doy, mins, { year });
  return { s, dir: sunDirection(s.alt, s.az, FACE).toArray() };
};

describe('clear sky', () => {
  it('June noon: beam ~930 W/m2, diffuse ~100 W/m2', () => {
    const c = clearSky(70.94);
    expect(toWatts(c.dni)).toBeGreaterThan(850);
    expect(toWatts(c.dni)).toBeLessThan(1000);
    expect(toWatts(c.dhi)).toBeGreaterThan(60);
    expect(toWatts(c.dhi)).toBeLessThan(160);
  });

  it('beam weakens as the sun drops, and is gone below the horizon', () => {
    expect(clearSky(30).dni).toBeGreaterThan(clearSky(10).dni);
    expect(clearSky(10).dni).toBeGreaterThan(clearSky(3).dni);
    expect(clearSky(-2).dni).toBe(0);
  });

  it('the sky still glows just after sunset and is near dark by nautical dusk', () => {
    expect(toWatts(clearSky(-2).dhi)).toBeGreaterThan(5);
    expect(toWatts(clearSky(-12).dhi)).toBeLessThan(0.5);
  });
});

describe('plane irradiance', () => {
  const one = () => [1, 1, 1];
  it('uniform unit radiance gives pi on any plane', () => {
    expect(planeIrradiance(one, [0, 1, 0])[0]).toBeCloseTo(Math.PI, 1);
    expect(planeIrradiance(one, [0, 0, -1])[0]).toBeCloseTo(Math.PI, 1);
  });
  it('a window sees half sky, half ground', () => {
    const skyOnly = (x, y) => (y > 0 ? [1, 1, 1] : [0, 0, 0]);
    expect(planeIrradiance(skyOnly, [0, 0, -1])[0]).toBeCloseTo(Math.PI / 2, 1);
    expect(planeIrradiance(skyOnly, [0, -1, 0])[0]).toBeCloseTo(0, 6);
  });
});

describe('openings as light sources', () => {
  const walls = glazedWalls(ROOM);
  const long = walls.find((w) => w.id === 'long');
  const street = walls.find((w) => w.id === 'street');

  it('one source per window, facing into the room', () => {
    expect(long.rects).toHaveLength(5);
    expect(street.rects).toHaveLength(2);
    expect(long.nIn).toEqual([-0, -0, 1]);
    expect(street.nIn).toEqual([-1, -0, -0]);
  });

  it('merged opening keeps the glazed area', () => {
    const m = mergedOpening(long);
    expect(m.width).toBeCloseTo(9.60, 6);           // 0.90 to 10.50 along the wall
    expect(m.area).toBeCloseTo(5 * 1.20 * 1.95, 6);
    expect(m.width * m.height * m.fill).toBeCloseTo(m.area, 6);
  });
});

describe('sun patches: the raking western light', () => {
  const long = glazedWalls(ROOM).find((w) => w.id === 'long');
  const facing = (dir, w) => dir[0] * w.nOut[0] + dir[1] * w.nOut[1] + dir[2] * w.nOut[2];

  it('13:10 on 21 June: no sun through the long NW wall', () => {
    const { dir } = sunAt(172, 13 * 60 + 10);
    expect(facing(dir, long)).toBeLessThanOrEqual(0);
  });

  it('18:30 on 21 June: every long-wall window throws a patch well into the room', () => {
    const { dir } = sunAt(172, 18 * 60 + 30);
    expect(facing(dir, long)).toBeGreaterThan(0);
    const patches = long.rects.map((r) => sunPatch(r.corners, dir, L, W));
    for (const p of patches) {
      expect(p).not.toBeNull();
      expect(Math.abs(p.cx) + p.w / 2).toBeLessThanOrEqual(L / 2 + 1e-9);
      expect(p.cz - p.d / 2).toBeGreaterThan(-W / 2);   // off the window wall, out on the floor
      expect(p.cz).toBeGreaterThan(0);                   // centred past the room's midline
    }
    const merged = mergePatches(patches);
    expect(merged.area).toBeCloseTo(patches.reduce((s, p) => s + p.area, 0), 9);
  });

  it('patches are clipped to the floor and never larger than the unclipped projection', () => {
    const { dir } = sunAt(172, 19 * 60 + 45);
    for (const r of long.rects) {
      const p = sunPatch(r.corners, dir, L, W);
      if (!p) continue;
      expect(p.cz + p.d / 2).toBeLessThanOrEqual(W / 2 + 1e-9);
    }
  });
});

describe('split flux', () => {
  const albedo = { floor: 0.5, ceiling: 0.9, wall: 0.8, mural: 0.03, glass: 0.08 };
  it('interior area is the whole box', () => {
    const r = roomReflectance(ROOM, albedo);
    expect(r.total).toBeCloseTo(2 * (L * W + L * 3.1 + W * 3.1), 6);
    expect(r.rho).toBeGreaterThan(0.03);
    expect(r.rho).toBeLessThan(0.9);
  });
  it('no light in, no bounce; more light in, more bounce', () => {
    const r = roomReflectance(ROOM, albedo);
    expect(splitFlux([0, 0, 0], [0, 0, 0], r)).toEqual([0, 0, 0]);
    const a = splitFlux([10, 10, 10], [1, 1, 1], r)[0], b = splitFlux([20, 20, 20], [1, 1, 1], r)[0];
    expect(b).toBeGreaterThan(a);
  });
});

describe('shader patches still fit three.js', () => {
  const C = THREE.ShaderChunk;
  it('PCSS replaces the basic shadow lookup', () => {
    const s = patchShadowChunk(C.shadowmap_pars_fragment);
    expect(s).toContain('PCSS_BLOCKER');
    expect(s).toContain('#if NUM_SUN_LIGHT_SHADOWS > 0');
  });
  it('window lights and bounce are gated to the room, environment to the outside', () => {
    expect(patchLightsBegin(C.lights_fragment_begin)).toContain('if ( roomInside > 0.5 && max3( rectAreaLight.color ) > 0.0 ) RE_Direct_RectArea');
    expect(patchLightsBegin(C.lights_fragment_begin)).toContain('dot( geometryNormal, directLight.direction ) > 0.0 && max3( directLight.color ) > 0.0 ) ? getShadow');
    expect(patchLightsBegin(C.lights_fragment_begin)).toContain('roomInside * uBounce');
    expect(patchLightsMaps(C.lights_fragment_maps)).toContain('skyShare * iblRadiance');
  });
  it('the standard material shaders patch cleanly', () => {
    const frag = patchFragment(THREE.ShaderLib.standard.fragmentShader, { blocker: 8, filter: 12 });
    expect(frag).toContain('float roomInside');
    expect(frag).toContain('float skyShare');
    expect(frag).not.toContain('#include <lights_fragment_begin>');
    expect(patchVertex(THREE.ShaderLib.standard.vertexShader)).toContain('vRoomPos =');
  });
});
