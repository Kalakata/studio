import { describe, it, expect } from 'vitest';
import { ROOM, ROOM_PROBLEMS, validateRoom, wallFrame, L, W, H, T, SITE, FACE } from '../src/scene/spec.js';

// room.json must agree with the tables in CLAUDE.md.
const wall = (id) => ROOM.walls.find((w) => w.id === id);
const clone = () => JSON.parse(JSON.stringify(ROOM));

function piers(w, length) {
  const ops = w.openings.slice().sort((a, b) => a.left - b.left);
  const out = [];
  let edge = 0;
  for (const o of ops) { out.push(o.left - edge); edge = o.left + o.width; }
  out.push(length - edge);
  return out;
}

describe('room.json against CLAUDE.md', () => {
  it('is valid', () => {
    expect(ROOM_PROBLEMS).toEqual([]);
  });

  it('clear dimensions, wall thickness, area and volume', () => {
    expect(L).toBe(11.40);
    expect(W).toBe(3.95);
    expect(H).toBe(3.10);
    expect(T).toBe(0.12);
    expect(L * W).toBeCloseTo(45.03, 2);
    expect(L * W * H).toBeCloseTo(139.6, 1);
  });

  it('site and street bearing', () => {
    expect(SITE.lat).toBe(42.50);
    expect(SITE.lon).toBe(27.46);
    expect(FACE).toBe(45);
  });

  it('seven windows, all 1.20 wide, sill 0.90, head 2.85', () => {
    const all = ROOM.walls.flatMap((w) => w.openings);
    expect(all).toHaveLength(7);
    for (const o of all) {
      expect(o.type).toBe('window');
      expect(o.width).toBe(1.20);
      expect(o.sill).toBe(0.90);
      expect(o.head).toBe(2.85);
    }
    const glazing = all.reduce((s, o) => s + o.width * (o.head - o.sill), 0);
    expect(glazing).toBeCloseTo(16.4, 1);
  });

  it('long wall (-z): 5 openings with 0.90 piers', () => {
    expect(wall('long').side).toBe('-z');
    const p = piers(wall('long'), L);
    expect(p).toHaveLength(6);
    for (const v of p) expect(v).toBeCloseTo(0.90, 6);
  });

  it('street wall (+x): 2 openings with 0.517 piers', () => {
    expect(wall('street').side).toBe('+x');
    const p = piers(wall('street'), W);
    expect(p).toHaveLength(3);
    for (const v of p) expect(Math.abs(v - 0.517)).toBeLessThan(0.0015);
  });

  it('back (-x) and mural (+z) walls are solid', () => {
    expect(wall('back').side).toBe('-x');
    expect(wall('back').openings).toEqual([]);
    expect(wall('mural').side).toBe('+z');
    expect(wall('mural').openings).toEqual([]);
  });
});

describe('wall frames', () => {
  // "left" is measured from the left-hand corner seen from inside, facing the wall
  const at = (side, left) => wallFrame(ROOM, { side, openings: [] })
    .worldCentre({ left, width: 0.2 });

  it('facing the street (+x), left is -z', () => {
    expect(at('+x', 0)[1]).toBeCloseTo(-W / 2 + 0.1, 9);
    expect(at('+x', 0)[0]).toBeCloseTo(L / 2, 9);
  });
  it('facing the back wall (-x), left is +z', () => {
    expect(at('-x', 0)[1]).toBeCloseTo(W / 2 - 0.1, 9);
  });
  it('facing the long glazed wall (-z), left is -x', () => {
    expect(at('-z', 0)[0]).toBeCloseTo(-L / 2 + 0.1, 9);
    expect(at('-z', 0)[1]).toBeCloseTo(-W / 2, 9);
  });
  it('facing the mural wall (+z), left is +x', () => {
    expect(at('+z', 0)[0]).toBeCloseTo(L / 2 - 0.1, 9);
  });

  it('standing at the back facing the street, the five windows are on your left', () => {
    // facing +x, your left hand points to -z
    expect(wallFrame(ROOM, wall('long')).normal).toEqual([0, 0, -1]);
  });

  it('street openings land symmetrically about the room axis', () => {
    const f = wallFrame(ROOM, wall('street'));
    const [a, b] = wall('street').openings.map((o) => f.worldCentre(o)[1]);
    expect(a + b).toBeCloseTo(0, 3);
  });
});

describe('validation', () => {
  it('catches an opening running past the end of its wall', () => {
    const r = clone();
    r.walls.find((w) => w.id === 'street').openings[1].left = 3.0;
    expect(validateRoom(r).join()).toMatch(/runs past the ends/);
  });
  it('catches overlapping openings', () => {
    const r = clone();
    r.walls.find((w) => w.id === 'long').openings[1].left = 1.5;
    expect(validateRoom(r).join()).toMatch(/overlaps/);
  });
  it('catches a head above the ceiling', () => {
    const r = clone();
    r.walls[0].openings[0].head = 3.5;
    expect(validateRoom(r).join()).toMatch(/sill\/head/);
  });
  it('catches a missing wall', () => {
    const r = clone();
    r.walls = r.walls.filter((w) => w.side !== '-x');
    expect(validateRoom(r).join()).toMatch(/no wall on side -x/);
  });
});
