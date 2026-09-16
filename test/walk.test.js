import { describe, it, expect } from 'vitest';
import { walkAction, walkStep, lookStep, WALK_SPEED, RUN_SPEED, WALL_GAP, LOOK_SPEED, MAX_PITCH } from '../src/interaction/walk.js';

const room = { length: 11.4, width: 3.95 };
const at = (x, y, z) => ({ x, y, z });

describe('walking inside the room', () => {
  it('reads W A S D and the arrow keys, in either case', () => {
    expect(walkAction('w')).toBe('forward');
    expect(walkAction('W')).toBe('forward');
    expect(walkAction('ArrowLeft')).toBe('left');
    expect(walkAction('d')).toBe('right');
    expect(walkAction('r')).toBeNull();
  });

  it('walks forward the way the camera looks, flat on the floor, and the view keeps its direction', () => {
    const pos = at(0, 1.5, 0), tgt = at(1, 1.2, 0);
    expect(walkStep(pos, tgt, new Set(['forward']), 0.08, room)).toBe(true);
    expect(pos.x).toBeCloseTo(WALK_SPEED * 0.08, 9);
    expect(pos.y).toBe(1.5);
    expect(pos.z).toBeCloseTo(0, 9);
    expect(tgt.x - pos.x).toBeCloseTo(1, 9);
    expect(tgt.y).toBe(1.2);
  });

  it('steps sideways to the right of where it looks, and runs with Shift', () => {
    const pos = at(0, 1.5, 0), tgt = at(1, 1.5, 0);          // looking along +x: right is +z
    walkStep(pos, tgt, new Set(['right']), 0.1, room);
    expect(pos.z).toBeCloseTo(WALK_SPEED * 0.1, 9);
    const p2 = at(0, 1.5, 0), t2 = at(1, 1.5, 0);
    walkStep(p2, t2, new Set(['forward']), 0.1, { ...room, run: true });
    expect(p2.x).toBeCloseTo(RUN_SPEED * 0.1, 9);
  });

  it('keeps the same speed walking diagonally', () => {
    const pos = at(0, 1.5, 0), tgt = at(1, 1.5, 0);
    walkStep(pos, tgt, new Set(['forward', 'right']), 0.1, room);
    expect(Math.hypot(pos.x, pos.z)).toBeCloseTo(WALK_SPEED * 0.1, 9);
  });

  it('stops short of the walls, and does not count a blocked step as moving', () => {
    const pos = at(5.4, 1.5, 0), tgt = at(6.4, 1.5, 0);
    walkStep(pos, tgt, new Set(['forward']), 0.1, room);
    expect(pos.x).toBeCloseTo(5.7 - WALL_GAP, 9);
    expect(walkStep(pos, tgt, new Set(['forward']), 0.1, room)).toBe(false);
  });

  it('caps a long frame so a stall does not throw the camera across the room', () => {
    const pos = at(0, 1.5, 0), tgt = at(1, 1.5, 0);
    walkStep(pos, tgt, new Set(['forward']), 5, room);
    expect(pos.x).toBeCloseTo(WALK_SPEED * 0.1, 9);
  });

  it('turns the head where it stands: mouse right looks right, mouse up looks up', () => {
    const pos = at(0, 1.5, 0), tgt = at(1, 1.5, 0);               // looking along +x: right is +z
    lookStep(pos, tgt, 100, 0);
    expect(tgt.z).toBeGreaterThan(0);
    expect(Math.hypot(tgt.x, tgt.z)).toBeCloseTo(1, 9);
    expect(Math.atan2(tgt.z, tgt.x)).toBeCloseTo(100 * LOOK_SPEED, 9);
    expect(pos).toEqual(at(0, 1.5, 0));
    lookStep(pos, tgt, 0, -100);
    expect(tgt.y).toBeGreaterThan(1.5);
    expect(Math.hypot(tgt.x - pos.x, tgt.y - pos.y, tgt.z - pos.z)).toBeCloseTo(1, 9);
  });

  it('stops short of looking straight up or down', () => {
    const pos = at(0, 1.5, 0), tgt = at(1, 1.5, 0);
    lookStep(pos, tgt, 0, 1e5);
    expect(Math.asin(tgt.y - pos.y)).toBeCloseTo(-MAX_PITCH, 9);
    lookStep(pos, tgt, 0, -1e5);
    expect(Math.asin(tgt.y - pos.y)).toBeCloseTo(MAX_PITCH, 9);
  });
});
