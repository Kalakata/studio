import { describe, it, expect } from 'vitest';
import { shellSunTest, surfaceGrids, sunHours } from '../src/analysis/sunHours.js';
import { solar, sunDirection } from '../src/scene/sun.js';
import { SAVED_ROOM, L, W } from '../src/scene/spec.js';
import { addPartition, setPartition } from '../src/scene/shellOps.js';

const year = 2026;
const unit = (x, y, z) => { const n = Math.hypot(x, y, z); return [x / n, y / n, z / n]; };

describe('the shell sun test', () => {
  const lit = shellSunTest(SAVED_ROOM);

  it('sun through the middle of window 3 on the long wall reaches the floor', () => {
    // window 3 spans x -0.6..0.6, sill 0.90, head 2.85, inner face z = -1.975
    expect(lit(0, 0.001, 0, ...unit(0, 1.875, -1.975))).toBe(true);
  });

  it('straight up is the ceiling; towards a pier is wall', () => {
    expect(lit(0, 0.001, 0, 0, 1, 0)).toBe(false);
    expect(lit(-1.05, 0.001, 0, ...unit(0, 1.875, -1.975))).toBe(false);
  });

  it('the solid mural and back walls let nothing in', () => {
    expect(lit(0, 0.001, 0, ...unit(0, 1.875, 1.975))).toBe(false);
    expect(lit(0, 0.001, 0, ...unit(-5.7, 1.875, 0))).toBe(false);
  });

  it('the 0.12 m reveal shades a steep glancing ray that clears the inner edge', () => {
    // crosses the inner face at x = 0.50 (glass ends at 0.545); at 45 deg the outer face is x = 0.62
    expect(lit(0.025, 1.5, -1.5, ...unit(1, 0.0001, -1))).toBe(false);
    // at a shallower angle it is still inside at the outer face (x = 0.524)
    expect(lit(0.405, 1.5, -1.5, ...unit(0.2, 0.0001, -1))).toBe(true);
  });

  it('a partition in the way blocks it', () => {
    const room = setPartition(addPartition(SAVED_ROOM), 0, { from: [-1, -1], to: [1, -1] });
    expect(shellSunTest(room)(0, 0.001, 0, ...unit(0, 1.875, -1.975))).toBe(false);
  });
});

describe('sun hours over a day', () => {
  const june = sunHours(SAVED_ROOM, { doy: 172, year, face: 45, step: 0.2, minutes: 10 });
  const december = sunHours(SAVED_ROOM, { doy: 355, year, face: 45, step: 0.2, minutes: 10 });
  const byId = (r, id) => r.grids.find((g) => g.id === id);
  const total = (g) => g.hours.reduce((s, h) => s + (Number.isNaN(h) ? 0 : h * g.cellW * g.cellH), 0);

  it('covers the floor and all four walls, with openings left out', () => {
    expect(june.grids.map((g) => g.id).sort()).toEqual(['back', 'floor', 'long', 'mural', 'street']);
    expect([...byId(june, 'long').hours].some(Number.isNaN)).toBe(true);
    expect([...byId(june, 'mural').hours].some(Number.isNaN)).toBe(false);
  });

  it('June puts far more sun into the room than December', () => {
    expect(total(byId(june, 'floor'))).toBeGreaterThan(3 * total(byId(december, 'floor')));
  });

  it('the raking western sun reaches the mural wall in June', () => {
    expect(Math.max(...byId(june, 'mural').hours)).toBeGreaterThan(1);
  });

  it('no floor point is sunlit at 13:10 on 21 June', () => {
    const s = solar(172, 13 * 60 + 10, { year }), d = sunDirection(s.alt, s.az, 45).toArray();
    const lit = shellSunTest(SAVED_ROOM);
    const floor = surfaceGrids(SAVED_ROOM, 0.2)[0];
    let any = false;
    for (let j = 0; j < floor.rows; j++) for (let i = 0; i < floor.cols; i++) any ||= lit(...floor.sample(i, j), ...d);
    expect(any).toBe(false);
  });

  it('unfolds the walls outward around the floor on the plan', () => {
    const long = surfaceGrids(SAVED_ROOM, 0.2).find((g) => g.id === 'long');
    const [x, z] = long.plan(0, long.rows - 1);
    expect(x).toBeCloseTo(-L / 2 + 0.1, 6);
    expect(z).toBeLessThan(-W / 2 - 3);        // the head of the wall lies furthest out
  });
});
