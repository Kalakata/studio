import { describe, it, expect } from 'vitest';
import { SAVED_ROOM as room, wallFrame } from '../src/scene/spec.js';
import {
  roomModes, modeShape, firstReflections, solidSpans, membraneFrequency, membraneDepth,
  porousAbsorption, createResponseModel, layoutAbsorbers, logFrequencies,
  materialAbsorption, MATERIALS, shellAbsorbers, sabineT60, eyringT60, ebuTarget
} from '../src/analysis/roomAcoustics.js';

describe('room modes', () => {
  const modes = roomModes(room, 130);
  const axial = (n) => modes.find((m) => m.n.join() === n.join());

  it('the first axial modes follow from the measured 11.40 x 3.95 x 3.10', () => {
    expect(axial([1, 0, 0]).f).toBeCloseTo(343 / (2 * 11.4), 6);      // 15.04 Hz
    expect(axial([3, 0, 0]).f).toBeCloseTo(45.13, 2);
    expect(axial([0, 1, 0]).f).toBeCloseTo(43.42, 2);
    expect(axial([0, 0, 1]).f).toBeCloseTo(55.32, 2);
    expect(axial([1, 1, 0]).kind).toBe('tangential');
    expect(modes.every((m, i) => i === 0 || m.f >= modes[i - 1].f)).toBe(true);
  });

  it('a mode has its pressure maxima at the walls and its nodes between', () => {
    const m = axial([3, 0, 0]);
    expect(modeShape(room, m, [-5.7, 1, 0])).toBeCloseTo(1, 9);
    expect(modeShape(room, m, [5.7, 1, 0])).toBeCloseTo(-1, 9);
    expect(modeShape(room, m, [-5.7 + 11.4 / 6, 1, 0])).toBeCloseTo(0, 9);
    expect(modeShape(room, m, [-1.9, 1, 0])).toBeCloseTo(-1, 9);
  });
});

describe('first reflections', () => {
  it('a source and an ear at the same height meet the ceiling halfway, with the image-source delay', () => {
    const r = firstReflections(room, [0, 1.2, -1], [0, 1.2, 1]);
    const ceiling = r.find((q) => q.surface === 'ceiling');
    expect(ceiling.point.map((v) => +v.toFixed(9))).toEqual([0, 3.1, 0]);
    expect(ceiling.extra).toBeCloseTo(2 * Math.hypot(1, 1.9) - 2, 9);
    expect(ceiling.delayMs).toBeCloseTo(ceiling.extra / 343 * 1000, 9);
  });

  it('a side-wall reflection strikes nearer the source when the source is nearer the wall', () => {
    const p = firstReflections(room, [0, 1.2, -1.5], [2, 1.2, 0]).find((q) => q.surface === '-z').point;
    expect(p[2]).toBeCloseTo(-1.975, 9);
    expect(p[0]).toBeGreaterThan(0);
    expect(p[0]).toBeLessThan(1);
  });
});

describe('solid spans', () => {
  it('the window wall has six 0.90 m piers', () => {
    const long = room.walls.find((w) => w.side === '-z');
    const piers = solidSpans(long, wallFrame(room, long));
    expect(piers).toHaveLength(6);
    for (const [a, b] of piers) expect(b - a).toBeCloseTo(0.9, 9);
    expect(piers[0][0]).toBeCloseTo(-5.7, 9);
  });

  it('the back wall is solid end to end', () => {
    const back = room.walls.find((w) => w.side === '-x');
    expect(solidSpans(back, wallFrame(room, back))).toEqual([[-1.975, 1.975]]);
  });
});

describe('shell materials', () => {
  it('reads absorption between bands on a log-frequency axis', () => {
    const glass = materialAbsorption('double-glazing');
    expect(glass(125)).toBeCloseTo(0.15, 9);
    expect(glass(Math.sqrt(125 * 250))).toBeCloseTo(0.10, 9);
    expect(glass(40)).toBeCloseTo(0.15, 9);
    expect(() => materialAbsorption('marble')).toThrow(/unknown material/);
  });

  it('room.json describes a plastered poured-concrete room with modern double glazing and a tiled floor', () => {
    expect(room.acoustics).toMatchObject({ walls: 'plaster-on-concrete', windows: 'double-glazing', floor: 'ceramic-tiles' });
    for (const k of ['walls', 'windows', 'floor', 'ceiling']) expect(MATERIALS[room.acoustics[k]]).toBeDefined();
  });

  it('puts every window in the shell where room.json has it, over the wall it is cut from', () => {
    const shell = shellAbsorbers(room);
    const windows = shell.filter((a) => a.type.startsWith('window'));
    expect(windows).toHaveLength(7);
    expect(windows.reduce((s, a) => s + a.area, 0)).toBeCloseTo(7 * 1.2 * 1.95, 9);
    expect(shell.find((a) => a.type === 'window long').box).toEqual([[-4.8, -3.6], [0.9, 2.85], [-1.975, -1.975]]);
    const street = shell.filter((a) => a.type === 'window street').map((a) => a.box[2]);
    expect(street[0].map((v) => +v.toFixed(3))).toEqual([-1.458, -0.258]);
    // the window replaces the wall's absorption over its area, it doesn't add to it
    expect(windows[0].alpha(125)).toBeCloseTo(0.15 - 0.013, 9);
  });

  it('the bare concrete room rings for about 3.4 s in the bass, mostly lost through the windows', () => {
    const shell = shellAbsorbers(room);
    expect(sabineT60(room, shell, 125)).toBeCloseTo(3.45, 1);
    expect(sabineT60(room, shellAbsorbers(room, { windows: 'single-glazing' }), 125)).toBeLessThan(2.5);
    const byType = (t) => shell.filter((a) => a.type.startsWith(t)).reduce((s, a) => s + a.area * a.alpha(125), 0);
    expect(byType('window')).toBeGreaterThan(byType('wall'));
  });

  it('the window wall damps the width mode that presses on it more than a mode it has a node of', () => {
    const ring = (materials, n) => {
      const model = createResponseModel(room, { freqs: [50], fMax: 60, t60: Infinity, absorbers: shellAbsorbers(room, materials) });
      return 6.91 / model.modes.find((m) => m.n.join() === n).delta;
    };
    // single glazing shortens the width mode (0,1,0) far more than the height mode (0,0,1)
    expect(ring({}, '0,1,0') - ring({ windows: 'single-glazing' }, '0,1,0')).toBeGreaterThan(ring({}, '0,0,1') - ring({ windows: 'single-glazing' }, '0,0,1'));
  });
});

describe('mid and high frequencies', () => {
  it('EBU Tech 3276 asks about 0.28 s of this 139.6 m^3 room', () => {
    expect(ebuTarget(room)).toBeCloseTo(0.25 * Math.cbrt(139.593 / 100), 6);
    expect(ebuTarget(room)).toBeCloseTo(0.28, 2);
  });

  it('Eyring agrees with Sabine in a live room and reads shorter in a damped one', () => {
    const uniform = (alpha) => [{ area: 2 * (11.4 * 3.95 + 11.4 * 3.1 + 3.95 * 3.1), alpha: () => alpha }];
    expect(eyringT60(room, uniform(0.02), 1000) / sabineT60(room, uniform(0.02), 1000)).toBeGreaterThan(0.98);
    expect(eyringT60(room, uniform(0.5), 1000)).toBeLessThan(0.75 * sabineT60(room, uniform(0.5), 1000));
  });

  it('a rug lying on the floor absorbs over its whole footprint, mostly in the mids and highs', () => {
    const assets = { rug: { w: 3.4, d: 2.3, h: 0.012, acoustic: { kind: 'table', material: 'carpet-on-underlay', floor: true } } };
    const [rug] = layoutAbsorbers([{ type: 'rug', x: 0, z: 0, ry: 0 }], assets, room);
    expect(rug.area).toBeCloseTo(3.4 * 2.3, 9);
    expect(rug.points.every((p) => p[1] === 0)).toBe(true);
    expect(rug.alpha(1000)).toBeGreaterThan(8 * rug.alpha(125));
  });
});

describe('absorbers', () => {
  it('membrane tuning and its inverse agree', () => {
    expect(membraneFrequency(7.8, 0.228)).toBeCloseTo(45, 1);
    expect(membraneDepth(45, 7.8)).toBeCloseTo(0.228, 3);
  });

  it('a 100 mm porous panel absorbs about half at 125 Hz and little at 40 Hz', () => {
    const a = porousAbsorption({ thickness: 0.1 });
    expect(a(125)).toBeGreaterThan(0.5);
    expect(a(125)).toBeLessThan(0.65);
    expect(a(40)).toBeLessThan(0.15);
  });

  it('a trap damps a mode only where that mode has pressure', () => {
    const assets = { trap: { w: 0.9, d: 0.24, h: 2.1, acoustic: { kind: 'membrane', mass: 7.8, depth: 0.228, face: [0.88, 2.08] } } };
    const decay = (x) => {
      const model = createResponseModel(room, { freqs: logFrequencies(40, 50), fMax: 60, absorbers: layoutAbsorbers([{ type: 'trap', x, z: 0, ry: 90 }], assets, room) });
      return 6.91 / model.modes.find((m) => m.n.join() === '3,0,0').delta;
    };
    expect(decay(-5.58)).toBeLessThan(0.57);                        // on the end wall, an antinode
    expect(decay(-5.7 + 11.4 / 6)).toBeCloseTo(0.6, 2);              // on the mode's nodal plane
  });
});
