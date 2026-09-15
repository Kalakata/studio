import { describe, it, expect } from 'vitest';
import { solar, sunTimes, tzOffset } from '../src/scene/sun.js';
import { SITE } from '../src/scene/spec.js';

// Regression table from CLAUDE.md. If a refactor changes these, it is a bug.
const year = 2026;
const o = { year };
const JUN21 = 172, SEP23 = 266, DEC21 = 355;
const hm = (s) => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
const TOL = 10; // minutes

// direct sun on a facade: sun up and within 90 deg of the wall's bearing
function facadeLit(doy, bearing) {
  let from = null, to = null;
  for (let m = 0; m < 1440; m += 0.5) {
    const p = solar(doy, m, o);
    const off = Math.abs(((p.az - bearing + 540) % 360) - 180);
    if (p.alt > 0 && off < 90) { if (from === null) from = m; to = m; }
  }
  return { from, to };
}

describe('timezone', () => {
  it('is EEST in June and EET in December', () => {
    expect(tzOffset(year, JUN21)).toBe(3);
    expect(tzOffset(year, DEC21)).toBe(2);
  });
});

describe('solar position', () => {
  it('21 Jun 13:10 local: altitude 70.94, azimuth 179.0', () => {
    const s = solar(JUN21, hm('13:10'), o);
    expect(s.tz).toBe(3);
    expect(s.alt).toBeCloseTo(70.94, 1);
    expect(Math.abs(s.alt - 70.94)).toBeLessThan(0.05);
    expect(Math.abs(s.az - 179.0)).toBeLessThan(0.5);
  });

  it('peak altitude agrees with the analytic maximum 90 - lat + 23.44', () => {
    const t = sunTimes(JUN21, o);
    expect(Math.abs(t.noonAlt - (90 - SITE.lat + 23.44))).toBeLessThan(0.05);
  });

  it('summer solar noon is about 13:10, not 12:00', () => {
    expect(Math.abs(sunTimes(JUN21, o).noon - hm('13:10'))).toBeLessThan(TOL);
  });
});

describe('sunrise and sunset', () => {
  it('21 Jun: 05:38 to 20:46', () => {
    const t = sunTimes(JUN21, o);
    expect(Math.abs(t.sunrise - hm('05:38'))).toBeLessThan(TOL);
    expect(Math.abs(t.sunset - hm('20:46'))).toBeLessThan(TOL);
  });

  it('21 Dec: 07:42 to 16:36', () => {
    const t = sunTimes(DEC21, o);
    expect(Math.abs(t.sunrise - hm('07:42'))).toBeLessThan(TOL);
    expect(Math.abs(t.sunset - hm('16:36'))).toBeLessThan(TOL);
  });
});

describe('daylight on the facades', () => {
  const cases = [
    ['street NE, June', JUN21, 45, 'sunrise', '11:56'],
    ['street NE, equinox', SEP23, 45, 'sunrise', '10:46'],
    ['street NE, December', DEC21, 45, '07:42', '08:50'],
    ['long NW, June', JUN21, 315, '14:28', '20:46'],
    ['long NW, equinox', SEP23, 315, '15:20', '19:02'],
    ['long NW, December', DEC21, 315, '15:26', '16:34']
  ];
  for (const [name, doy, bearing, from, to] of cases) {
    it(`${name}: ${from} to ${to}`, () => {
      const lit = facadeLit(doy, bearing);
      const start = from === 'sunrise' ? sunTimes(doy, o).sunrise : hm(from);
      expect(Math.abs(lit.from - start)).toBeLessThan(TOL);
      expect(Math.abs(lit.to - hm(to))).toBeLessThan(TOL);
    });
  }
});
