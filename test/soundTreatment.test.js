import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import mixRoom from '../src/assets/presets/mix-room.json';
import catalog from '../src/assets/catalog.json';
import { coverCeiling } from '../src/assets/ceilingCover.js';
import { SAVED_ROOM as room } from '../src/scene/spec.js';
import { treatmentList, treatmentMarkdown, woolTotals, totalCost, PRICES } from '../src/analysis/soundTreatment.js';

const ASSETS = Object.fromEntries(catalog.assets.map((a) => [a.id, a]));
const items = [...mixRoom.items, ...coverCeiling(room)];
const list = treatmentList(items, ASSETS, room);
const row = (type) => list.find((r) => r.type === type);

describe('sound treatment parts list', () => {
  it('lists every sound piece in the Mix room and nothing else', () => {
    const sound = new Set(['membrane-trap', 'corner-trap', 'ceiling-panel', 'reflection-panel', 'gobo', 'panel', 'rug', 'curtain']);
    for (const type of sound) expect(row(type)?.count).toBe(items.filter((it) => it.type === type).length);
    expect(list.map((r) => r.type).filter((t) => !sound.has(t))).toEqual([]);
    expect(row('membrane-trap').count).toBe(4);
    expect(row('ceiling-panel').count).toBe(30);
  });

  it('gives the tuned traps their catalog size and tuning', () => {
    const r = row('membrane-trap');
    expect(r.size).toBe('900 mm wide, 2800 mm tall, 240 mm deep');
    expect(r.build.join(' ')).toMatch(/= 45 Hz/);
    expect(r.where.filter((w) => w.startsWith('back wall'))).toHaveLength(2);
    expect(r.where.filter((w) => w.startsWith('mural wall'))).toHaveLength(2);
  });

  it('places the corner traps in the back corners and the ceiling panels over the whole ceiling', () => {
    expect(row('corner-trap').where).toEqual(['window wall and back wall corner', 'mural wall and back wall corner']);
    expect(row('ceiling-panel').area).toBeCloseTo(coverCeiling(room).reduce((s, p) => s + p.w * p.d, 0), 9);
  });

  it('adds up the mineral wool by thickness, in whole slabs with a margin', () => {
    const totals = woolTotals(list);
    const t100 = totals.find((t) => t.thickness === 0.1);
    expect(t100.slabs * 0.72).toBeGreaterThanOrEqual(t100.area * 1.1);
    expect((t100.slabs - 1) * 0.72).toBeLessThan(t100.area * 1.1);
  });

  it('prices every item from the price table, low never above high, and the total adds up', () => {
    for (const r of list) {
      expect(r.cost.length).toBeGreaterThan(0);
      for (const c of r.cost) {
        expect(PRICES[c.key]).toBeDefined();
        expect(c.lo).toBeGreaterThan(0);
        expect(c.lo).toBeLessThanOrEqual(c.hi);
      }
      expect(r.lo).toBeCloseTo(r.cost.reduce((s, c) => s + c.lo, 0), 9);
    }
    const total = totalCost(list);
    expect(total.lo).toBeCloseTo(list.reduce((s, r) => s + r.lo, 0), 9);
    expect(total.hi).toBeGreaterThan(total.lo);
  });

  it('prices the tuned traps with one birch sheet per front', () => {
    const birch = row('membrane-trap').cost.find((c) => c.key === 'birch12');
    expect(birch.qty).toBe(8);
    expect(birch.lo).toBeCloseTo(8 * 46, 9);
    expect(birch.hi).toBeCloseTo(8 * 54, 9);
  });

  it('docs/sound-treatment.md is the generator output for the current layout (npm run parts)', () => {
    const doc = readFileSync(new URL('../docs/sound-treatment.md', import.meta.url), 'utf8');
    expect(doc).toBe(treatmentMarkdown(list, { layout: 'Mix room' }));
  });
});
