import { describe, it, expect } from 'vitest';
import data from '../src/assets/lighting-variants.json';
import catalog from '../src/assets/catalog.json';
import mixRoom from '../src/assets/presets/mix-room.json';
import { SAVED_ROOM as room } from '../src/scene/spec.js';
import {
  roomEdges, profileRuns, totals, directIlluminance, indirectIlluminance, workPlaneMap, areaStats,
  deskOf, glare, variantReport, cctColour
} from '../src/analysis/lighting.js';

const ASSETS = Object.fromEntries(catalog.assets.map((a) => [a.id, a]));
const byId = Object.fromEntries(data.variants.map((v) => [v.id, v]));

describe('room edges', () => {
  const edges = roomEdges(room);

  it('has the twelve edges of the box, with their lengths', () => {
    expect(Object.keys(edges)).toHaveLength(12);
    expect(edges['ceiling window'].length).toBe(11.4);
    expect(edges['floor back'].length).toBe(3.95);
    expect(edges['corner street-mural'].length).toBe(3.1);
  });

  it('aims every corner profile 45 degrees into the room', () => {
    for (const e of Object.values(edges)) {
      expect(Math.hypot(...e.aim)).toBeCloseTo(1, 9);
      const mid = e.start.map((c, k) => c + e.dir[k] * e.length / 2);
      const inside = mid.map((c, k) => c + e.aim[k] * 0.5);
      expect(Math.abs(inside[0])).toBeLessThan(5.7);
      expect(Math.abs(inside[2])).toBeLessThan(1.975);
      expect(inside[1]).toBeGreaterThan(0);
      expect(inside[1]).toBeLessThan(3.1);
      expect(Math.abs(e.aim.reduce((s, a, k) => s + a * e.dir[k], 0))).toBeLessThan(1e-9);   // across the edge, not along it
    }
  });
});

describe('the fifteen variants', () => {
  it('have the lengths agreed', () => {
    const expected = {
      ring: 30.7, coves: 22.8, ends: 20.3, floating: 45.6, desk: 18.45, skirting: 30.7, opposite: 22.8, columns: 12.4, zones: 30.7, wireframe: 73.8,
      inset: 22, pendant: 12.6, grazers: 22, cross: 15, spine: 14.75
    };
    expect(data.variants.map((v) => v.id)).toEqual(Object.keys(expected));
    for (const [id, length] of Object.entries(expected)) expect(totals(profileRuns(room, byId[id], data.defaults)).length).toBeCloseTo(length, 6);
  });

  it('keep the runs of every corner layout straight and in a corner of the room', () => {
    const { length: L, width: W, height: H } = room.clear;
    const onBoundary = (v, max) => Math.abs(Math.abs(v) - max) < 0.02;
    for (const v of data.variants.filter((x) => x.kind === 'corner')) {
      for (const r of profileRuns(room, v, data.defaults)) {
        const nonZero = r.dir.filter((c) => c !== 0);
        expect(nonZero).toHaveLength(1);                           // parallel to an axis
        const mid = r.a.map((c, k) => (c + r.b[k]) / 2);
        const faces = [onBoundary(mid[0], L / 2), onBoundary(mid[2], W / 2), onBoundary(mid[1] - H / 2, H / 2)].filter(Boolean);
        expect(faces.length).toBe(2);                              // on two surfaces at once: a corner
      }
    }
  });

  it('keep the free layouts straight, inside the room and out of its corners', () => {
    const { length: L, width: W, height: H } = room.clear;
    const free = data.variants.filter((x) => x.kind === 'free');
    expect(free).toHaveLength(5);
    for (const v of free) {
      for (const r of profileRuns(room, v, data.defaults)) {
        expect(r.dir.filter((c) => Math.abs(c) > 1e-9)).toHaveLength(1);        // parallel to an axis
        expect(Math.abs(r.aim.reduce((t, a, k) => t + a * r.dir[k], 0))).toBeLessThan(1e-9);
        for (const p of [r.a, r.b]) {
          expect(Math.abs(p[0])).toBeLessThanOrEqual(L / 2);
          expect(Math.abs(p[2])).toBeLessThanOrEqual(W / 2);
          expect(p[1]).toBeGreaterThan(0);
          expect(p[1]).toBeLessThanOrEqual(H);
        }
        // not in a corner: at most one room surface within 2 cm of the run's middle
        const mid = r.a.map((c, k) => (c + r.b[k]) / 2);
        const near = [Math.abs(Math.abs(mid[0]) - L / 2) < 0.02, Math.abs(Math.abs(mid[2]) - W / 2) < 0.02, mid[1] < 0.02, H - mid[1] < 0.02].filter(Boolean);
        expect(near.length).toBeLessThanOrEqual(1);
      }
    }
  });

  it('keeps the window-wall grazer above the window heads', () => {
    const grazer = profileRuns(room, byId.grazers, data.defaults).find((r) => r.a[2] < 0);
    expect(grazer.a[1]).toBeGreaterThan(2.85);
  });

  it('reject a free run that aims along itself', () => {
    expect(() => profileRuns(room, { runs: [{ label: 'bad', start: [0, 3, 0], end: [1, 3, 0], aim: [1, 0, 0] }] }, data.defaults)).toThrow(/aims along itself/);
  });

  it('reject an edge that does not exist', () => {
    expect(() => profileRuns(room, { runs: [{ edge: 'ceiling middle' }] }, data.defaults)).toThrow(/unknown edge/);
  });
});

describe('photometry', () => {
  it('a long line of light gives flux / (2 h) straight below it, as for an infinite Lambertian line', () => {
    const run = { a: [-50, 2, 0], b: [50, 2, 0], dir: [1, 0, 0], aim: [0, -1, 0], length: 100, lmPerMetre: 1500, wPerMetre: 15 };
    expect(directIlluminance([run], [0, 0, 0], [0, 1, 0], { step: 0.02 })).toBeCloseTo(1500 / (2 * 2), 0);
  });

  it('a profile gives no light to a surface behind it or facing away', () => {
    const run = { a: [-1, 2, 0], b: [1, 2, 0], dir: [1, 0, 0], aim: [0, -1, 0], length: 2, lmPerMetre: 1500, wPerMetre: 15 };
    expect(directIlluminance([run], [0, 3, 0], [0, 1, 0])).toBe(0);           // above the profile
    expect(directIlluminance([run], [0, 0, 0], [0, -1, 0])).toBe(0);          // facing the floor
  });

  it('the inter-reflected light grows with the lumens, and a pale room returns more', () => {
    const runs = profileRuns(room, byId.ring, data.defaults);
    const e = indirectIlluminance(room, runs);
    expect(e).toBeGreaterThan(0);
    const dark = indirectIlluminance(room, runs, { floor: 0.1, ceiling: 0.1, wall: 0.1, mural: 0.1, glass: 0.08 });
    expect(dark).toBeLessThan(e);
  });

  it('never puts more light on the work plane than the profiles emit', () => {
    for (const id of ['ring', 'wireframe']) {
      const runs = profileRuns(room, byId[id], data.defaults);
      const map = workPlaneMap(room, runs, { step: 0.5 });
      const direct = map.values.reduce((s, v) => s + v - map.indirect, 0) * map.cellW * map.cellD;
      expect(direct).toBeLessThan(totals(runs).lumens);
    }
  });

  it('every edge lit gives more light than four columns', () => {
    const avg = (id) => areaStats(room, workPlaneMap(room, profileRuns(room, byId[id], data.defaults), { step: 0.5 })).avg;
    expect(avg('wireframe')).toBeGreaterThan(avg('columns'));
  });

  it('colours a 4000 K LED warm of neutral, with unit luminance', () => {
    const [r, g, b] = cctColour(4000);
    expect(0.2126 * r + 0.7152 * g + 0.0722 * b).toBeCloseTo(1, 9);
    expect(r).toBeGreaterThan(b);
    expect(cctColour(6500)[2]).toBeGreaterThan(cctColour(2700)[2]);
  });
});

describe('the mix position', () => {
  const desk = deskOf(mixRoom.items, ASSETS);

  it('finds the desk and its screen facing the listener', () => {
    const listener = mixRoom.items.find((it) => it.type === 'listener');
    expect(desk.screens.length).toBeGreaterThan(0);
    for (const sc of desk.screens) {
      const toListener = [listener.x - sc.centre[0], 0, listener.z - sc.centre[2]];
      expect(sc.normal[0] * toListener[0] + sc.normal[2] * toListener[2]).toBeGreaterThan(0);
    }
  });

  it('sees a light that is straight ahead and reflects one that is behind the head', () => {
    const listener = mixRoom.items.find((it) => it.type === 'listener');
    const ahead = { edge: 'ahead', a: [listener.x - 2, 1.6, -0.5], b: [listener.x - 2, 1.6, 0.5], dir: [0, 0, 1], aim: [1, 0, 0], length: 1, lmPerMetre: 1500, wPerMetre: 15 };
    // behind the head, on the line from the eye's mirror image through the screen's centre, so its
    // reflection lands in the middle of the screen whatever the desk's proportions
    const sc = desk.screens[0], eye = [listener.x, 1.2, listener.z];
    const side = (eye[0] - sc.centre[0]) * sc.normal[0] + (eye[2] - sc.centre[2]) * sc.normal[2];
    const mirror = eye.map((c, k) => c - 2 * side * sc.normal[k]);
    const q = mirror.map((c, k) => c + 3 * (sc.centre[k] - c));
    const behind = { edge: 'behind', a: [q[0], q[1], q[2] - 0.05], b: [q[0], q[1], q[2] + 0.05], dir: [0, 0, 1], aim: sc.normal.map((c) => -c), length: 0.1, lmPerMetre: 1500, wPerMetre: 15 };
    const g = glare([ahead, behind], mixRoom.items, desk);
    expect(g.inView).toEqual(['ahead']);
    expect(g.inScreen).toContain('behind');
    expect(g.inScreen).not.toContain('ahead');
  });

  it('reports every variant with lengths, lumens, watts, light at the desk and in the room, and glare', () => {
    for (const v of data.variants) {
      const r = variantReport(room, v, data.defaults, mixRoom.items, ASSETS);
      expect(r.watts).toBeCloseTo(r.length * 15, 6);
      expect(r.lumens).toBeCloseTo(r.length * 1500, 6);
      expect(r.desk).toBeGreaterThan(0);
      expect(r.room.uniformity).toBeGreaterThan(0);
      expect(r.room.uniformity).toBeLessThanOrEqual(1);
      expect(Array.isArray(r.glare.inView)).toBe(true);
    }
  });
});

describe('edge names', () => {
  it('reads an edge in words', async () => {
    const { edgeLabel } = await import('../src/analysis/lighting.js');
    expect(edgeLabel('ceiling mural')).toBe('top of the mural wall');
    expect(edgeLabel('floor street')).toBe('foot of the street wall');
    expect(edgeLabel('corner back-window')).toBe('back–window corner');
    expect(edgeLabel('pendant over the desk')).toBe('pendant over the desk');
  });
});
