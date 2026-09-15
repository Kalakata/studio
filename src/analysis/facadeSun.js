// When each facade gets direct sun, for the dates in CLAUDE.md's daylight table, at any bearing.
// A facade is sunlit while the sun is above the horizon and within 90 deg of the wall's bearing.

import { solar, point, clock } from '../scene/sun.js';

export const TABLE_DATES = [
  { key: 'june', label: 'June', month: 5, day: 21 },
  { key: 'equinox', label: 'Equinox', month: 8, day: 23 },       // 23 Sep, EEST: see CLAUDE.md
  { key: 'december', label: 'December', month: 11, day: 21 }
];

export const dayOfYear = (year, month, day) => Math.round((Date.UTC(year, month, day) - Date.UTC(year, 0, 0)) / 86400000);

// compass bearing of each wall, given the street wall's (+x) bearing
const OFFSET = { '+x': 0, '-z': -90, '+z': 90, '-x': 180 };
export const wallBearing = (side, face) => (((face + OFFSET[side]) % 360) + 360) % 360;

// > 0 while the facade is sunlit; continuous, so its zero crossings can be bisected
function margin(alt, az, bearing) {
  const off = Math.abs(((az - bearing) % 360 + 540) % 360 - 180);
  return Math.min(alt, 90 - off);
}

export function dayPath(doy, year) {
  const alt = new Float64Array(1441), az = new Float64Array(1441);
  for (let m = 0; m <= 1440; m++) { const s = solar(doy, m, { year }); alt[m] = s.alt; az[m] = s.az; }
  return { doy, year, alt, az };
}

// Sunlit intervals in local clock minutes. fromSunrise / toSunset say whether the horizon, rather
// than the sun swinging past the wall, bounds that end.
export function facadeIntervals(path, bearing) {
  const exact = (m) => { const s = solar(path.doy, m, { year: path.year }); return { s, g: margin(s.alt, s.az, bearing) }; };
  const cross = (a, b) => {
    let ga = exact(a).g;
    for (let i = 0; i < 30; i++) {
      const mid = (a + b) / 2, gm = exact(mid).g;
      if ((gm > 0) === (ga > 0)) { a = mid; ga = gm; } else b = mid;
    }
    const m = (a + b) / 2, { s } = exact(m);
    return { m, horizon: Math.abs(s.alt) <= Math.abs(90 - Math.abs(((s.az - bearing) % 360 + 540) % 360 - 180)) };
  };

  const out = [];
  let open = null, prev = margin(path.alt[0], path.az[0], bearing) > 0;
  if (prev) open = { from: 0, fromSunrise: false };
  for (let m = 1; m <= 1440; m++) {
    const lit = margin(path.alt[m], path.az[m], bearing) > 0;
    if (lit !== prev) {
      const c = cross(m - 1, m);
      if (lit) open = { from: c.m, fromSunrise: c.horizon };
      else { out.push({ ...open, to: c.m, toSunset: c.horizon }); open = null; }
    }
    prev = lit;
  }
  if (open) out.push({ ...open, to: 1440, toSunset: false });
  return out;
}

export const hhmm = (m) => clock(Math.round(m));
const title = (id) => id.charAt(0).toUpperCase() + id.slice(1);

// One row per wall: bearing, window count, and for each date the intervals at the bearing and
// at bearing +- spread (the street bearing is only good to about 10 deg).
export function facadeTable(room, face, { year = new Date().getFullYear(), spread = 10 } = {}) {
  const paths = TABLE_DATES.map((d) => dayPath(dayOfYear(year, d.month, d.day), year));
  return room.walls.map((wall) => {
    const bearing = wallBearing(wall.side, face);
    return {
      id: wall.id,
      name: title(wall.id),
      side: wall.side,
      bearing,
      point: point(bearing),
      windows: wall.openings.filter((o) => (o.type ?? 'window') === 'window').length,
      cells: paths.map((p) => ({
        at: facadeIntervals(p, bearing),
        low: facadeIntervals(p, bearing - spread),
        high: facadeIntervals(p, bearing + spread)
      }))
    };
  });
}

// Earliest and latest time one end of interval k takes across the bearing spread.
// null when the spread changes how many intervals there are.
export function boundaryRange(cell, k, end) {
  const lists = [cell.at, cell.low, cell.high];
  if (lists.some((l) => l.length !== cell.at.length)) return null;
  const values = lists.map((l) => l[k][end]);
  return [Math.min(...values), Math.max(...values)];
}

export function formatIntervals(list) {
  if (!list.length) return 'no sun';
  return list.map((i) => `${i.fromSunrise ? 'sunrise' : hhmm(i.from)} → ${i.toSunset ? 'sunset' : hhmm(i.to)}`).join(', ');
}

// The CLAUDE.md "Daylight consequences" table, generated: glazed walls in room.json order, every
// end as a clock time so the figures can be compared and pasted.
export function markdownTable(rows) {
  const head = `| Wall | ${TABLE_DATES.map((d) => d.label).join(' | ')} |`;
  const rule = `|---|${TABLE_DATES.map(() => '---').join('|')}|`;
  const cell = (list) => (list.length ? list.map((i) => `${hhmm(i.from)} → ${hhmm(i.to)}`).join(', ') : 'no sun');
  const body = rows.filter((r) => r.windows > 0).map((r) =>
    `| ${r.name}, ${r.point}, ${r.windows} window${r.windows === 1 ? '' : 's'} | ${r.cells.map((c) => cell(c.at)).join(' | ')} |`);
  return [head, rule, ...body].join('\n');
}
