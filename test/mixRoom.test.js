import { describe, it, expect } from 'vitest';
import mixRoom from '../src/assets/presets/mix-room.json';
import palletStudio from '../src/assets/presets/pallet-studio.json';
import catalog from '../src/assets/catalog.json';
import { findClashes } from '../src/assets/clash.js';
import { coverCeiling } from '../src/assets/ceilingCover.js';
import { parseLayout } from '../src/assets/layouts.js';
import { SAVED_ROOM as room } from '../src/scene/spec.js';
import { shellAbsorbers, layoutAbsorbers, eyringT60, ebuTarget } from '../src/analysis/roomAcoustics.js';

const ASSETS = Object.fromEntries(catalog.assets.map((a) => [a.id, a]));
const HOME = new Set(['pallet-sofa', 'pallet-shelf', 'plant', 'pallet-table', 'sofa', 'table', 'shelf', 'lamp', 'cabinet', 'amp']);
const key = (it) => JSON.stringify(it);

describe('Mix room preset: the studio on its own', () => {
  it('is a valid layout with a name, covering the ceiling', () => {
    const parsed = parseLayout(mixRoom, new Set(Object.keys(ASSETS)));
    expect(parsed.name).toBe('Mix room');
    expect(parsed.dropped).toBe(0);
    expect(mixRoom.coverCeiling).toBe(true);
  });

  it('has none of the lounge or the decor', () => {
    expect(mixRoom.items.filter((it) => HOME.has(it.type))).toEqual([]);
  });

  it('keeps every other Pallet studio piece exactly where it was, with both rugs on the centreline', () => {
    const studio = palletStudio.items.filter((it) => !HOME.has(it.type) && it.type !== 'rug').map(key).sort();
    expect(mixRoom.items.filter((it) => it.type !== 'rug').map(key).sort()).toEqual(studio);
    const rugs = mixRoom.items.filter((it) => it.type === 'rug');
    expect(rugs).toHaveLength(2);
    for (const r of rugs) expect(r.z).toBe(0);
    for (const t of ['pallet-desk', 'chair', 'monitor-stand', 'reflection-panel', 'gobo', 'corner-trap', 'membrane-trap', 'rug', 'curtain']) {
      expect(mixRoom.items.some((it) => it.type === t)).toBe(true);
    }
  });

  it('has no clashes, ceiling panels included', () => {
    expect(findClashes([...mixRoom.items, ...coverCeiling(room)], ASSETS, room).map((c) => c.message)).toEqual([]);
  });

  it('still meets the EBU Tech 3276 mids target: the lounge furniture was not part of the treatment', () => {
    const absorbers = [...shellAbsorbers(room), ...layoutAbsorbers([...mixRoom.items, ...coverCeiling(room)], ASSETS, room)];
    for (const f of [500, 1000, 2000]) expect(Math.abs(eyringT60(room, absorbers, f) - ebuTarget(room))).toBeLessThanOrEqual(0.05);
  });
});
