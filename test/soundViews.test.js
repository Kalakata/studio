import { describe, it, expect } from 'vitest';
import mixRoom from '../src/assets/presets/mix-room.json';
import catalog from '../src/assets/catalog.json';
import { coverCeiling } from '../src/assets/ceilingCover.js';
import { SAVED_ROOM as room } from '../src/scene/spec.js';
import { flatness, logFrequencies, shellAbsorbers } from '../src/analysis/roomAcoustics.js';
import {
  listeningSetup, reflectionPaths, bassModel, bassMap, modeMap, modeChoices, modeLabel, responseCurves,
  worstMode, crossesFace, blocks, withoutTreatment, EVEN_FREQS
} from '../src/analysis/soundViews.js';

const ASSETS = Object.fromEntries(catalog.assets.map((a) => [a.id, a]));
const items = [...mixRoom.items, ...coverCeiling(room)];
const setup = listeningSetup(items);
const listener = mixRoom.items.find((it) => it.type === 'listener');

describe('listening setup', () => {
  it('takes the head from the listener piece, with ears either side across where it faces', () => {
    expect(setup.monitors).toHaveLength(2);
    expect(setup.ear).toEqual([listener.x, 1.2, listener.z]);
    for (const e of setup.ears) {
      expect(e[0]).toBeCloseTo(listener.x, 9);
      expect(Math.abs(e[2] - listener.z)).toBeCloseTo(0.075, 9);
    }
  });

  it('without a head, finds the apex of the triangle in front of the monitors', () => {
    const noHead = listeningSetup(items.filter((it) => it.type !== 'listener'));
    expect(noHead.ear[0]).toBeCloseTo(listener.x, 2);
    expect(noHead.ear[2]).toBeCloseTo(listener.z, 6);
  });

  it('has nothing to work with without monitors', () => {
    expect(listeningSetup([{ type: 'chair', x: 0, z: 0 }])).toBeNull();
  });
});

describe('geometry', () => {
  it('a segment crosses a face only inside its rectangle', () => {
    const face = { c: [0, 1, 0], u: [1, 0, 0], v: [0, 1, 0], hu: 0.5, hv: 0.5, n: [0, 0, 1] };
    expect(crossesFace(face, [0, 1, -1], [0, 1, 1])).toBe(true);
    expect(crossesFace(face, [2, 1, -1], [2, 1, 1])).toBe(false);
    expect(crossesFace(face, [0, 1, 1], [0, 1, 2])).toBe(false);
  });

  it('a segment through a rotated box is blocked, one beside it is not', () => {
    const box = { x: 0, z: 0, c: Math.cos(Math.PI / 4), s: Math.sin(Math.PI / 4), hw: 1, hd: 0.1, y0: 0, y1: 1 };
    expect(blocks(box, [0, 0.5, -1], [0, 0.5, 1])).toBe(true);
    expect(blocks(box, [0, 1.5, -1], [0, 1.5, 1])).toBe(false);
    expect(blocks(box, [2, 0.5, -1], [2, 0.5, 1])).toBe(false);
  });
});

describe('reflection paths in the Mix room', () => {
  const paths = reflectionPaths(room, setup, items, ASSETS);
  const of = (surface) => paths.filter((p) => p.surface === surface);

  it('traces six surfaces for each monitor', () => {
    expect(paths).toHaveLength(12);
  });

  it('the early side, front and ceiling reflections all land on treatment and come back quiet', () => {
    const expected = { '+z': 'reflection-panel', '-z': 'gobo', '-x': 'reflection-panel', ceiling: 'ceiling-panel' };
    for (const [surface, type] of Object.entries(expected)) {
      for (const p of of(surface)) {
        expect(p.hit).toEqual({ kind: 'absorber', type });
        expect(p.verdict).toBe('quiet');
        expect(p.delayMs).toBeLessThan(20);
      }
    }
  });

  it('the floor bounce is stopped by the desk, and the street wall reflection arrives late', () => {
    for (const p of of('floor')) expect(p.hit).toEqual({ kind: 'blocked', type: 'pallet-desk' });
    for (const p of of('+x')) expect(p.verdict).toBe('late');
  });

  it('taking the treatment out leaves the furniture, the monitors and the head, and no acoustic piece', () => {
    const bare = withoutTreatment(items, ASSETS);
    expect(bare.filter((it) => ASSETS[it.type].acoustic)).toEqual([]);
    for (const t of ['pallet-desk', 'chair', 'monitor-stand', 'listener']) expect(bare.some((it) => it.type === t)).toBe(true);
    expect(bare.length).toBeLessThan(items.length);
  });

  it('without the treatment the same reflections are problems, and the window-wall one lands on glass', () => {
    const bare = withoutTreatment(mixRoom.items, ASSETS);
    const bp = reflectionPaths(room, listeningSetup(bare), bare, ASSETS);
    for (const s of ['+z', '-z', '-x', 'ceiling']) for (const p of bp.filter((q) => q.surface === s)) expect(p.verdict).toBe('problem');
    for (const p of bp.filter((q) => q.surface === '-z')) expect(p.hit.kind).toBe('glass');
    for (const p of bp.filter((q) => q.surface === '+z')) expect(p.hit.kind).toBe('bare');
  });
});

describe('bass on the floor', () => {
  const shell = shellAbsorbers(room);

  it('an evenness map covers the room and its best spot is evener than the room typically is', () => {
    const map = bassMap(bassModel(room, shell, EVEN_FREQS), room, setup.monitors, { step: 0.5 });
    expect(map.values).toHaveLength(map.cols * map.rows);
    expect(map.cols * map.cellW).toBeCloseTo(11.4, 9);
    const sorted = [...map.values].sort((a, b) => a - b);
    expect(map.best.value).toBeCloseTo(sorted[0], 4);             // the grid stores float32
    expect(map.best.value).toBeLessThan(sorted[Math.floor(sorted.length / 2)]);
  });

  it('a one-frequency map is relative to the room average', () => {
    const map = bassMap(bassModel(room, shell, [45]), room, setup.monitors, { step: 0.5 });
    expect(map.kind).toBe('level');
    expect(map.values.reduce((s, v) => s + v, 0) / map.values.length).toBeCloseTo(0, 3);
    expect(map.best).toBeNull();
    // the average it was drawn against, so a point can be read exactly: level there minus the average
    const model = bassModel(room, shell, [45]);
    const cell = map.values[2 + 3 * map.cols];
    const x = -5.7 + 2.5 * map.cellW, z = -1.975 + 3.5 * map.cellD;
    expect(model.level(setup.monitors, [[x, 1.2, z]])[0] - map.mean).toBeCloseTo(cell, 3);
  });

  it('matches the response model at a cell centre', () => {
    const model = bassModel(room, shell, EVEN_FREQS);
    const map = bassMap(model, room, setup.monitors, { step: 0.5 });
    const i = 3, j = 2, x = -5.7 + (i + 0.5) * map.cellW, z = -1.975 + (j + 0.5) * map.cellD;
    expect(map.values[i + j * map.cols]).toBeCloseTo(flatness(model.freqs, model.level(setup.monitors, [[x, 1.2, z]])).spread, 4);
  });
});

describe('room modes to look at', () => {
  it('lists the modes from 30 to 130 Hz, with the 45 Hz length mode among them', () => {
    const choices = modeChoices(room);
    expect(choices.every((m) => m.f > 30 && m.f <= 130)).toBe(true);
    const m45 = choices.find((m) => m.n.join() === '3,0,0');
    expect(modeLabel(m45)).toBe('45 Hz, length 3');
  });

  it('draws the 45 Hz mode loud at the end walls and silent a sixth of the way in', () => {
    const mode = modeChoices(room).find((m) => m.n.join() === '3,0,0');
    const map = modeMap(room, mode, { step: 0.1 });
    const at = (x) => map.values[Math.min(map.cols - 1, Math.floor((x + 5.7) / map.cellW)) + Math.floor(map.rows / 2) * map.cols];
    expect(Math.abs(at(-5.65))).toBeGreaterThan(0.95);
    expect(Math.abs(at(-5.7 + 11.4 / 6))).toBeLessThan(0.05);
    expect(Math.abs(at(-1.9))).toBeGreaterThan(0.95);
  });

  it('the worst bass peak at the listening position is the 45 Hz length mode', () => {
    expect(worstMode(room, setup).n).toEqual([3, 0, 0]);
  });
});

describe('response at the listening position', () => {
  const r = responseCurves(room, setup, items, ASSETS);

  it('the treatment flattens the bass and brings the mids to the target', () => {
    expect(r.freqs).toEqual(logFrequencies(40, 250, 24));
    expect(r.treated.spread).toBeLessThan(r.bare.spread);
    const k1 = r.rt.find((b) => b.f === 1000);
    expect(Math.abs(k1.treated - r.target)).toBeLessThanOrEqual(0.05);
    expect(k1.bare).toBeGreaterThan(2);
  });

  it('both curves are drawn about their own average', () => {
    for (const c of [r.bare, r.treated]) expect(c.db.reduce((s, v) => s + v, 0) / c.db.length).toBeCloseTo(0, 6);
  });
});
