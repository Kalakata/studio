import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { facadeTable, markdownTable, wallBearing, boundaryRange, formatIntervals, dayOfYear, TABLE_DATES } from '../src/analysis/facadeSun.js';
import { sunTimes } from '../src/scene/sun.js';
import { SAVED_ROOM, FACE } from '../src/scene/spec.js';

const year = 2026;
const hm = (s) => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
const TOL = 3;   // minutes

// The "Daylight consequences" table, read straight out of CLAUDE.md
function claudeTable() {
  const text = readFileSync(new URL('../CLAUDE.md', import.meta.url), 'utf8');
  const rows = {};
  for (const line of text.split('\n')) {
    const m = line.match(/^\| (Street|Long), [A-Z]+, \d windows \|(.+)\|\s*$/);
    if (m) rows[m[1].toLowerCase()] = m[2].split('|').map((c) => c.trim().split(' → '));
  }
  return rows;
}

describe('generated facade table', () => {
  const rows = facadeTable(SAVED_ROOM, FACE, { year });
  const expected = claudeTable();

  it('CLAUDE.md has the two glazed walls to compare against', () => {
    expect(Object.keys(expected).sort()).toEqual(['long', 'street']);
  });

  for (const wall of ['street', 'long']) {
    for (const [k, date] of TABLE_DATES.entries()) {
      it(`${wall} wall, ${date.label}: reproduces CLAUDE.md within ${TOL} min`, () => {
        const row = rows.find((r) => r.id === wall);
        const [from, to] = expected[wall][k];
        expect(row.cells[k].at).toHaveLength(1);
        const got = row.cells[k].at[0];
        const doy = dayOfYear(year, date.month, date.day);
        const wantFrom = from === 'sunrise' ? sunTimes(doy, { year }).sunrise : hm(from);
        expect(Math.abs(got.from - wantFrom)).toBeLessThan(TOL);
        expect(Math.abs(got.to - hm(to))).toBeLessThan(TOL);
      });
    }
  }

  it('bearings follow the axis table: street NE, long NW, mural SE, back SW', () => {
    expect(rows.map((r) => `${r.id} ${r.bearing} ${r.point}`).sort()).toEqual(['back 225 SW', 'long 315 NW', 'mural 135 SE', 'street 45 NE']);
    expect(wallBearing('-z', 10)).toBe(280);
  });

  it('marks which ends are the horizon', () => {
    const june = rows.find((r) => r.id === 'street').cells[0].at[0];
    expect(june.fromSunrise).toBe(true);
    expect(june.toSunset).toBe(false);
    expect(rows.find((r) => r.id === 'long').cells[0].at[0].toSunset).toBe(true);
  });

  it('gives the spread over +-10 deg of bearing', () => {
    const cell = rows.find((r) => r.id === 'long').cells[0];
    const [lo, hi] = boundaryRange(cell, 0, 'from');
    expect(lo).toBeLessThan(cell.at[0].from);
    expect(hi).toBeGreaterThan(cell.at[0].from);
  });

  it('a north-facing wall in June gets two separate spells', () => {
    const north = facadeTable(SAVED_ROOM, 90, { year }).find((r) => r.id === 'long');   // long wall faces 0 deg
    expect(north.cells[0].at).toHaveLength(2);
    expect(formatIntervals(north.cells[0].at)).toMatch(/^sunrise → \d\d:\d\d, \d\d:\d\d → sunset$/);
  });

  it('prints as a markdown table for the glazed walls, street first, clock times throughout', () => {
    const lines = markdownTable(rows).split('\n');
    expect(lines).toHaveLength(4);
    expect(lines[2]).toMatch(/^\| Street, NE, 2 windows \| 05:3\d → 11:5\d \| /);
    expect(lines[3]).toMatch(/^\| Long, NW, 5 windows \| 14:2\d → 20:4\d \| /);
    expect(markdownTable(rows)).not.toMatch(/sunrise|sunset/);
  });
});
