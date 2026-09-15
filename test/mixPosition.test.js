import { describe, it, expect } from 'vitest';
import preset from '../src/assets/presets/pallet-studio.json';
import catalog from '../src/assets/catalog.json';
import { findClashes } from '../src/assets/clash.js';
import { coverCeiling } from '../src/assets/ceilingCover.js';
import { SAVED_ROOM as room, L, W } from '../src/scene/spec.js';
import {
  createResponseModel, logFrequencies, flatness, peaks, firstReflections, roomModes, modeShape,
  membraneFrequency, layoutAbsorbers, shellAbsorbers, eyringT60, ebuTarget
} from '../src/analysis/roomAcoustics.js';

// Placement guidance (sources in the commits): an equilateral triangle, tweeter-to-tweeter 0.9-1.5 m,
// monitors toed in 30 deg to aim at the ears, tweeters at seated ear height, listening position in the
// 30-45% band of the room length, side walls at least 0.6-0.9 m away, front-wall cancellation below what
// the monitors reproduce, first reflections absorbed, bass traps where the problem modes have pressure.
// On top of that, this room's own modes and surfaces pick the spot (npm run mix).
const ASSETS = Object.fromEntries(catalog.assets.map((a) => [a.id, a]));
const C = 343, D2R = Math.PI / 180, TWEETER = 1.195, EAR = 1.2;

const monitors = preset.items.filter((i) => i.type === 'monitor-stand');
const desk = preset.items.find((i) => i.type === 'pallet-desk');
const chair = preset.items.find((i) => i.type === 'chair');
const mid = { x: (monitors[0].x + monitors[1].x) / 2, z: (monitors[0].z + monitors[1].z) / 2 };
const spacing = Math.hypot(monitors[0].x - monitors[1].x, monitors[0].z - monitors[1].z);
const sign = Math.sign(mid.x);                    // the monitors' end of the room: -1 is the back wall
const FRONT = sign * L / 2;
const ear = { x: mid.x - sign * spacing * Math.sqrt(3) / 2, z: mid.z };
const all = [...preset.items, ...coverCeiling(room)];
const of = (type) => all.filter((i) => i.type === type);

// The cases npm run mix scores across: room.json's shell, with no furnishing, with more
const CASES = [{}, { furnishing: 0 }, { furnishing: 6 }].map((m) => shellAbsorbers(room, m));
const freqs = logFrequencies(40, 250);
const model = (absorbers) => createResponseModel(room, { freqs, fMax: 500, highpass: 0, t60: Infinity, absorbers });
const caseModels = CASES.map(model);
const bassWith = (md, x, S) => {
  const mx = x + sign * S * Math.cos(Math.PI / 6);
  const db = md.level([[mx, TWEETER, -S / 2], [mx, TWEETER, S / 2]], [[x, EAR, -0.075], [x, EAR, 0.075]]);
  return { model: md, db, ...flatness(freqs, db) };
};
// the search's score: spread averaged over the cases, worst within 0.1 m for head movement
const score = (x, S) => {
  let worst = 0;
  for (let dx = -0.1; dx <= 0.1001; dx += 0.02) {
    worst = Math.max(worst, caseModels.reduce((s, md) => s + bassWith(md, x + dx, S).spread, 0) / caseModels.length);
  }
  return worst;
};

describe('Pallet studio mix position', () => {
  it('has a pair of monitors on stands, facing the solid back wall', () => {
    expect(monitors).toHaveLength(2);
    expect(sign).toBe(-1);
    expect(room.walls.find((w) => w.side === '-x').openings).toEqual([]);
  });

  it('sits in the 30-45% band, on the centreline', () => {
    expect((FRONT - ear.x) * sign / L).toBeGreaterThanOrEqual(0.30);
    expect((FRONT - ear.x) * sign / L).toBeLessThanOrEqual(0.45);
    expect(ear.z).toBeCloseTo(0, 6);
  });

  it('has bass as flat as any spot within 0.3 m, and flatter than the plain 38% rule', () => {
    const here = score(ear.x, spacing);
    for (const dx of [-0.3, -0.2, -0.1, 0.1, 0.2, 0.3]) expect(here).toBeLessThanOrEqual(score(ear.x + dx, spacing) + 0.15);
    expect(here).toBeLessThan(score(FRONT - sign * 0.38 * L, 1.45) - 0.5);
  });

  it('forms an equilateral triangle, 0.9 to 1.5 m a side', () => {
    expect(spacing).toBeGreaterThanOrEqual(0.9);
    expect(spacing).toBeLessThanOrEqual(1.5);
    for (const m of monitors) expect(Math.hypot(m.x - ear.x, m.z - ear.z)).toBeCloseTo(spacing, 2);
  });

  it('aims each monitor at the listener: 30 degrees of toe-in', () => {
    for (const m of monitors) {
      const facing = [Math.sin(m.ry * D2R), Math.cos(m.ry * D2R)];          // local +z is the front
      const toEar = [ear.x - m.x, ear.z - m.z], n = Math.hypot(...toEar);
      expect(Math.acos((facing[0] * toEar[0] + facing[1] * toEar[1]) / n) / D2R).toBeLessThan(1);
      expect(Math.acos(Math.abs(facing[0])) / D2R).toBeCloseTo(30, 0);
    }
  });

  it('is symmetric across the room and clear of the side walls', () => {
    expect(monitors[0].x).toBeCloseTo(monitors[1].x, 6);
    expect(monitors[0].z).toBeCloseTo(-monitors[1].z, 6);
    for (const m of monitors) expect(W / 2 - Math.abs(m.z)).toBeGreaterThanOrEqual(0.9);
  });

  it('keeps the front-wall cancellation below what a Rokit 7 G4 reproduces (42 Hz)', () => {
    for (const m of monitors) {
      const baffle = Math.abs(FRONT - m.x);
      expect(baffle).toBeGreaterThanOrEqual(0.9);
      expect(C / (4 * baffle)).toBeLessThan(42);
    }
  });

  it('puts the tweeters at seated ear height', () => {
    const tweeter = ASSETS['monitor-stand'].parts.find((p) => p.cyl && p.mat === 'metal' && p.cyl[0] === 0.03);
    expect(tweeter.at[1]).toBe(TWEETER);
  });

  it('has the desk in front of the stands and the chair at the listening spot, facing the desk', () => {
    const d = ASSETS['pallet-desk'].d / 2;
    for (const m of monitors) expect(sign * m.x).toBeGreaterThan(sign * desk.x + d);
    expect(sign * (desk.x - sign * d - ear.x)).toBeLessThan(0.5);
    expect(sign * (desk.x - sign * d - ear.x)).toBeGreaterThan(0.2);
    expect(chair.ry).toBe(sign > 0 ? 90 : -90);
    expect(Math.abs(chair.x - ear.x)).toBeLessThan(0.2);
  });

  it('marks the best hearing spot with a head: ears at the apex of the triangle, level with the tweeters, facing the monitors', () => {
    const heads = preset.items.filter((i) => i.type === 'listener');
    expect(heads).toHaveLength(1);
    const [head] = heads;
    expect(head.x).toBeCloseTo(ear.x, 2);
    expect(head.z).toBeCloseTo(ear.z, 6);
    expect(head.ry).toBe(chair.ry);
    const ears = ASSETS.listener.parts.filter((p) => p.leaf && Math.abs(p.at[0]) > 0.05);
    expect(ears).toHaveLength(2);
    for (const e of ears) expect(e.at[1]).toBeCloseTo(EAR, 6);
  });

  it('the whole preset, ceiling panels included, has no clashes', () => {
    expect(findClashes(all, ASSETS, room).map((c) => c.message)).toEqual([]);
  });

  it('the pallet desk no longer carries its own desktop speakers', () => {
    expect(ASSETS['pallet-desk'].parts.filter((p) => p.box && p.mat === 'dark' && p.box[1] >= 0.3)).toEqual([]);
  });
});

describe('Pallet studio treatment', () => {
  const earPoint = [ear.x, EAR, 0];
  const reflections = monitors.map((m) => firstReflections(room, [m.x, TWEETER, m.z], earPoint));
  const hit = (surface) => reflections.map((r) => r.find((q) => q.surface === surface).point);

  // the face of a wall piece: centre, horizontal extent along the wall, vertical extent
  const covers = (item, [x, y, z], along) => {
    const a = ASSETS[item.type], [fw, fh] = a.acoustic.face, yc = a.acoustic.faceY ?? ((a.y0 ?? 0) + a.h) / 2;
    const u = along === 'x' ? x - item.x : z - item.z;
    return Math.abs(u) <= fw / 2 && Math.abs(y - yc) <= fh / 2;
  };

  it('absorbs the front-wall reflections with panels on the back wall', () => {
    for (const p of hit(sign < 0 ? '-x' : '+x')) {
      expect(of('reflection-panel').some((it) => Math.abs(it.x - FRONT) < 0.1 && covers(it, p, 'z'))).toBe(true);
    }
  });

  it('absorbs the side reflections off the mural wall with panels hung there', () => {
    for (const p of hit('+z')) {
      expect(of('reflection-panel').some((it) => Math.abs(it.z - W / 2) < 0.1 && covers(it, p, 'x'))).toBe(true);
    }
  });

  it('the window-wall reflections land on glass, so free-standing panels cross both legs of each path', () => {
    const [gobo] = of('gobo');
    const long = room.walls.find((w) => w.side === '-z');
    for (const [k, p] of hit('-z').entries()) {
      const onGlass = long.openings.some((o) => p[0] >= -L / 2 + o.left && p[0] <= -L / 2 + o.left + o.width);
      expect(onGlass).toBe(true);
      const m = monitors[k];
      for (const [a, b] of [[[m.x, TWEETER, m.z], p], [p, earPoint]]) {
        const t = (gobo.z - a[2]) / (b[2] - a[2]);
        const x = a[0] + t * (b[0] - a[0]), y = a[1] + t * (b[1] - a[1]);
        expect(t).toBeGreaterThan(0);
        expect(t).toBeLessThan(1);
        expect(covers(gobo, [x, y, gobo.z], 'x')).toBe(true);
      }
    }
  });

  it('the ceiling reflections fall on fitted ceiling panels', () => {
    for (const [x, , z] of hit('ceiling')) {
      expect(of('ceiling-panel').some((c) => Math.abs(x - c.x) <= c.w / 2 && Math.abs(z - c.z) <= c.d / 2)).toBe(true);
    }
  });

  it('has bass traps in both corners of the front wall', () => {
    for (const side of [-1, 1]) {
      expect(of('corner-trap').some((t) => Math.abs(t.x - FRONT) < 0.35 && Math.abs(t.z - side * W / 2) < 0.2)).toBe(true);
    }
  });

  it('tunes the membrane traps to the mode behind the worst peak, and puts them where it has pressure', () => {
    const bare = bassWith(caseModels[0], ear.x, spacing);
    const worst = peaks(freqs, bare.db)[0];
    const mode = roomModes(room, 250).filter((m) => m.kind === 'axial').sort((p, q) => Math.abs(p.f - worst.f) - Math.abs(q.f - worst.f))[0];
    expect(mode.n).toEqual([3, 0, 0]);
    const ac = ASSETS['membrane-trap'].acoustic;
    expect(Math.abs(membraneFrequency(ac.mass, ac.depth) - mode.f)).toBeLessThan(1);
    expect(of('membrane-trap').length).toBeGreaterThanOrEqual(4);
    for (const t of of('membrane-trap')) expect(Math.abs(modeShape(room, mode, [t.x, 1, t.z]))).toBeGreaterThan(0.9);
  });

  it('in the bare concrete room, the treatment takes the 45 Hz peak down and the bass ringing from seconds to well under one', () => {
    const shell = CASES[0];
    const bare = bassWith(caseModels[0], ear.x, spacing);
    const treated = bassWith(model([...shell, ...layoutAbsorbers(all, ASSETS, room)]), ear.x, spacing);
    const at45 = (r) => r.db[freqs.findIndex((f) => f >= 44.5)] - r.mean;
    expect(at45(treated)).toBeLessThan(at45(bare) - 6);
    expect(treated.spread).toBeLessThan(bare.spread - 1);
    const decay = (r) => 6.91 / r.model.modes.find((m) => m.n.join() === '3,0,0').delta;
    expect(decay(bare)).toBeGreaterThan(2.5);
    expect(decay(treated)).toBeLessThan(0.7);
  });

  it('has a rug on the tiles under the chair and the stands', () => {
    const under = (rug, it) => Math.abs(it.x - rug.x) <= ASSETS.rug.w / 2 && Math.abs(it.z - rug.z) <= ASSETS.rug.d / 2;
    expect(of('rug').some((rug) => under(rug, chair) && monitors.every((m) => under(rug, m)))).toBe(true);
  });

  it('needs the whole ceiling: with it and the rugs the mids meet EBU Tech 3276, with half of it they do not', () => {
    const shell = CASES[0], target = ebuTarget(room);
    const mids = (items) => [500, 1000, 2000].map((f) => eyringT60(room, [...shell, ...layoutAbsorbers(items, ASSETS, room)], f));
    for (const t of mids(all)) expect(t).toBeLessThanOrEqual(target + 0.1);
    for (const t of mids(all.filter((it) => it.type !== 'ceiling-panel' || it.x < 0))) expect(t).toBeGreaterThan(target + 0.15);
    for (const t of mids(all.filter((it) => it.type !== 'rug'))) expect(t).toBeGreaterThan(Math.max(...mids(all)));
  });

  it('has a curtain on each street window, and closing them keeps the mids within tolerance', () => {
    const street = room.walls.find((w) => w.side === '+x');
    const curtains = of('curtain');
    expect(curtains).toHaveLength(street.openings.length);
    for (const o of street.openings) {
      const c = curtains.find((k) => Math.abs(k.z - (-W / 2 + o.left + o.width / 2)) < 0.01);
      expect(c).toBeDefined();
      expect(ASSETS.curtain.w).toBeGreaterThanOrEqual(o.width + 0.2);
      expect(L / 2 - c.x).toBeLessThan(0.2);
    }
    const target = ebuTarget(room), shell = CASES[0];
    const mids = (open) => [500, 1000, 2000].map((f) => eyringT60(room, [...shell, ...layoutAbsorbers(all.map((it) => (it.type === 'curtain' ? { ...it, open } : it)), ASSETS, room)], f));
    const opened = mids(true), closed = mids(false);
    closed.forEach((t, i) => {
      expect(t).toBeLessThan(opened[i]);
      expect(t).toBeGreaterThanOrEqual(target - 0.05);
    });
  });
});
