import { describe, it, expect } from 'vitest';
import { SAVED_ROOM, validateRoom, normalizeRoom } from '../src/scene/spec.js';
import {
  leftLimits, moveOpening, setOpening, addOpening, removeOpening, addPartition, setPartition, removePartition
} from '../src/scene/shellOps.js';

const wall = (r, id) => r.walls.find((w) => w.id === id);

describe('moving an opening along its wall', () => {
  it('stays between its neighbours', () => {
    const lim = leftLimits(SAVED_ROOM, 'long', 1);
    expect(lim.min).toBeCloseTo(2.10, 9);      // right edge of window 1
    expect(lim.max).toBeCloseTo(3.90, 9);      // window 3 starts at 5.10
    expect(wall(moveOpening(SAVED_ROOM, 'long', 1, -5), 'long').openings[1].left).toBe(2.1);
    expect(wall(moveOpening(SAVED_ROOM, 'long', 1, 50), 'long').openings[1].left).toBe(3.9);
  });

  it('end openings stop at the corners', () => {
    expect(wall(moveOpening(SAVED_ROOM, 'street', 0, -1), 'street').openings[0].left).toBe(0);
    expect(wall(moveOpening(SAVED_ROOM, 'street', 1, 99), 'street').openings[1].left).toBe(2.75);
  });

  it('snaps to the step and rounds to the millimetre', () => {
    expect(wall(moveOpening(SAVED_ROOM, 'long', 1, 3.2437, 0.005), 'long').openings[1].left).toBe(3.245);
    expect(wall(moveOpening(SAVED_ROOM, 'long', 1, 3.2437), 'long').openings[1].left).toBe(3.244);
  });

  it('leaves the original room untouched and the result valid', () => {
    const before = JSON.stringify(SAVED_ROOM);
    const moved = moveOpening(SAVED_ROOM, 'long', 2, 4.5);
    expect(JSON.stringify(SAVED_ROOM)).toBe(before);
    expect(validateRoom(moved)).toEqual([]);
  });
});

describe('editing and adding openings', () => {
  it('resizes by number', () => {
    const r = setOpening(SAVED_ROOM, 'street', 0, { width: 1.1, head: 2.7004 });
    expect(wall(r, 'street').openings[0]).toMatchObject({ width: 1.1, head: 2.7 });
    expect(validateRoom(r)).toEqual([]);
  });

  it('flags a window widened into its neighbour', () => {
    expect(validateRoom(setOpening(SAVED_ROOM, 'long', 0, { width: 2.5 })).join()).toMatch(/overlaps/);
  });

  it('centres a new window in the widest free stretch', () => {
    const { room, index } = addOpening(SAVED_ROOM, 'mural', 'window');
    expect(wall(room, 'mural').openings[index]).toEqual({ type: 'window', left: 5.1, width: 1.2, sill: 0.9, head: 2.85 });
    expect(validateRoom(room)).toEqual([]);
  });

  it('refuses when nothing fits', () => {
    expect(addOpening(SAVED_ROOM, 'long', 'window')).toBeNull();   // every pier is 0.90
  });

  it('adds a door with no sill and a hinge side', () => {
    const { room, index } = addOpening(SAVED_ROOM, 'back', 'door');
    expect(wall(room, 'back').openings[index]).toEqual({ type: 'door', left: 1.525, width: 0.9, sill: 0, head: 2.1, swing: 'left' });
    expect(validateRoom(room)).toEqual([]);
    expect(wall(setOpening(room, 'back', index, { sill: 0.3 }), 'back').openings[index].sill).toBe(0);
  });

  it('removes', () => {
    expect(wall(removeOpening(SAVED_ROOM, 'street', 1), 'street').openings).toHaveLength(1);
  });

  it('validation rejects a door with a sill or a bad swing', () => {
    const r = normalizeRoom(JSON.parse(JSON.stringify(SAVED_ROOM)));
    wall(r, 'back').openings.push({ type: 'door', left: 1, width: 0.9, sill: 0.2, head: 2.1, swing: 'up' });
    const text = validateRoom(r).join();
    expect(text).toMatch(/sill must be 0/);
    expect(text).toMatch(/swing must be/);
  });
});

describe('partitions', () => {
  it('add, edit, remove', () => {
    let r = addPartition(SAVED_ROOM);
    expect(r.partitions).toHaveLength(1);
    expect(validateRoom(r)).toEqual([]);
    r = setPartition(r, 0, { to: [0.5, 1.2345] });
    expect(r.partitions[0].to).toEqual([0.5, 1.235]);
    expect(validateRoom(r)).toEqual([]);
    expect(removePartition(r, 0).partitions).toHaveLength(0);
  });

  it('validation catches a partition outside the room or too tall', () => {
    const r = setPartition(addPartition(SAVED_ROOM), 0, { to: [0, 3], height: 4 });
    const text = validateRoom(r).join();
    expect(text).toMatch(/outside the room/);
    expect(text).toMatch(/height/);
  });
});
