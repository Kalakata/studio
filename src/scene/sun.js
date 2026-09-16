import * as THREE from 'three';
import { SITE, L, W, H, T } from './spec.js';
import { clearSky } from './daylightMath.js';
import { roomUniforms } from './roomlit.js';

const D2R = Math.PI / 180, R2D = 180 / Math.PI;

// ---- solar position (NOAA) -------------------------------------------------

export function lastSunday(year, monthIndex) {
  const d = new Date(Date.UTC(year, monthIndex + 1, 0));
  return d.getUTCDate() - d.getUTCDay();
}

// Bulgaria: EET (+2), EEST (+3) from the last Sunday in March to the last Sunday in October.
export function tzOffset(year, doy) {
  const d = new Date(Date.UTC(year, 0, doy));
  const start = new Date(Date.UTC(year, 2, lastSunday(year, 2)));
  const end = new Date(Date.UTC(year, 9, lastSunday(year, 9)));
  return (d >= start && d < end) ? 3 : 2;
}

// doy: day of year (1 = 1 Jan). mins: local clock minutes after midnight.
// Returns altitude and compass azimuth in degrees.
export function solar(doy, mins, opts = {}) {
  const lat = (opts.lat ?? SITE.lat) * D2R;
  const lon = opts.lon ?? SITE.lon;
  const year = opts.year ?? new Date().getFullYear();
  const tz = opts.tz ?? tzOffset(year, doy);

  const g = 2 * Math.PI / 365 * (doy - 1 + (mins / 60 - 12) / 24);
  const eq = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g)
           - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g)
             - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g)
             - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const tst = mins + eq + 4 * lon - 60 * tz;
  const ha = (tst / 4 - 180) * D2R;
  const cosZ = Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(ha);
  const alt = Math.asin(Math.max(-1, Math.min(1, cosZ))) * R2D;
  const az = Math.atan2(Math.sin(ha), Math.cos(ha) * Math.sin(lat) - Math.tan(decl) * Math.cos(lat)) * R2D + 180;
  return { alt, az: (az + 360) % 360, tz };
}

// Sun centre on the geometric horizon — the convention the CLAUDE.md table was computed with.
// Pass { horizon: -0.833 } for upper limb with standard refraction (about 6 min longer each end).
export const HORIZON = 0;

function bisect(f, a, b) {
  let fa = f(a);
  for (let i = 0; i < 40; i++) {
    const m = (a + b) / 2, fm = f(m);
    if ((fm < 0) === (fa < 0)) { a = m; fa = fm; } else { b = m; }
  }
  return (a + b) / 2;
}

// Sunrise, sunset and solar noon for a day, in local clock minutes (null if none).
export function sunTimes(doy, opts = {}) {
  const horizon = opts.horizon ?? HORIZON;
  const f = (m) => solar(doy, m, opts).alt - horizon;
  let sunrise = null, sunset = null, prev = f(0);
  for (let m = 1; m <= 1440; m++) {
    const v = f(m);
    if (prev < 0 && v >= 0 && sunrise === null) sunrise = bisect(f, m - 1, m);
    if (prev >= 0 && v < 0) sunset = bisect(f, m - 1, m);
    prev = v;
  }
  // noon: where altitude peaks, found by golden-section search
  let a = 0, b = 1440;
  const k = (Math.sqrt(5) - 1) / 2;
  for (let i = 0; i < 60; i++) {
    const c = b - k * (b - a), d = a + k * (b - a);
    if (f(c) > f(d)) b = d; else a = c;
  }
  const noon = (a + b) / 2;
  return { sunrise, sunset, noon, noonAlt: solar(doy, noon, opts).alt };
}

// ---- presentation ------------------------------------------------------------

const COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
export function point(deg) { return COMPASS[Math.round(((deg % 360) + 360) % 360 / 22.5) % 16]; }

export function dateLabel(doy) {
  const d = new Date(Date.UTC(2025, 0, doy));
  return d.getUTCDate() + ' ' + ['January', 'February', 'March', 'April', 'May', 'June', 'July',
    'August', 'September', 'October', 'November', 'December'][d.getUTCMonth()];
}

export function clock(mins) {
  const h = Math.floor(mins / 60), m = Math.floor(mins % 60);
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}

// Scene direction towards the sun, given that +x points at compass bearing `face`.
export function sunDirection(alt, az, face, out = new THREE.Vector3()) {
  const phi = (az - face + 90) * D2R, a = alt * D2R;
  return out.set(Math.cos(a) * Math.sin(phi), Math.sin(a), -Math.cos(a) * Math.cos(phi));
}

const PAL = {
  night: { zen: 0x080d18, hor: 0x121a26, gnd: 0x0d1116, sun: 0x94a6c4 },
  dusk:  { zen: 0x2b4a70, hor: 0xe89a54, gnd: 0x5b5346, sun: 0xff9b4a },
  day:   { zen: 0x3f77b8, hor: 0xc7dcea, gnd: 0x9ba18e, sun: 0xfff3da }
};
const cB = new THREE.Color();
function blend(target, key, alt) {
  if (alt <= -8) return target.setHex(PAL.night[key]);
  if (alt < 2) return target.setHex(PAL.night[key]).lerp(cB.setHex(PAL.dusk[key]), (alt + 8) / 10);
  if (alt < 22) return target.setHex(PAL.dusk[key]).lerp(cB.setHex(PAL.day[key]), (alt - 2) / 20);
  return target.setHex(PAL.day[key]);
}

export function createSunRig(scene) {
  const sun = new THREE.DirectionalLight(0xfff4e2, 1);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  sun.shadow.normalBias = 0.02;
  sun.target.position.set(0, H / 2, 0);
  scene.add(sun, sun.target);
  return { sun };
}

// Shadows are the room's business. The shadow camera is fitted around the room itself (walls
// and slabs included, so everything that shades the interior is inside it) rather than a wide
// patch of ground outside, which puts the whole shadow map's resolution on the interior.
// Refit whenever the sun moves.
const ROOM_CORNERS = [];
for (const x of [-L / 2 - T, L / 2 + T]) for (const y of [-T, H + T]) for (const z of [-W / 2 - T, W / 2 + T]) ROOM_CORNERS.push(new THREE.Vector3(x, y, z));
const _view = new THREE.Matrix4(), _p = new THREE.Vector3();
const SHADOW_PAD = 0.2;          // metres: room for the PCSS blocker search and filter at the edges
const SHADOW_BIAS = 0.008;       // metres of depth, whatever the fitted depth range

export function fitShadowToRoom(light) {
  const cam = light.shadow.camera;
  // the same placement LightShadow.updateMatrices uses when it renders
  cam.position.copy(light.position);
  cam.lookAt(light.target.position);
  cam.updateMatrixWorld();
  _view.copy(cam.matrixWorld).invert();

  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const c of ROOM_CORNERS) {
    _p.copy(c).applyMatrix4(_view);
    x0 = Math.min(x0, _p.x); x1 = Math.max(x1, _p.x);
    y0 = Math.min(y0, _p.y); y1 = Math.max(y1, _p.y);
    z0 = Math.min(z0, _p.z); z1 = Math.max(z1, _p.z);
  }
  cam.left = x0 - SHADOW_PAD; cam.right = x1 + SHADOW_PAD;
  cam.bottom = y0 - SHADOW_PAD; cam.top = y1 + SHADOW_PAD;
  cam.near = Math.max(0.05, -z1 - SHADOW_PAD); cam.far = -z0 + SHADOW_PAD;   // view space looks down -z
  cam.updateProjectionMatrix();

  const depthRange = cam.far - cam.near;
  light.shadow.bias = -SHADOW_BIAS / depthRange;
  // PCSS turns depth gaps into penumbra widths with these
  roomUniforms.uShadowWorld.value.set(cam.right - cam.left, cam.top - cam.bottom);
  roomUniforms.uShadowDepthRange.value = depthRange;
}

const dir = new THREE.Vector3();

// Moves the sun, sets its clear-sky strength, recolours and recalibrates the sky.
export function applySun(rig, sky, scene, s, face) {
  sunDirection(s.alt, s.az, face, dir);
  rig.sun.position.copy(dir).multiplyScalar(L * 3).add(new THREE.Vector3(0, H / 2, 0));
  rig.sun.target.position.set(0, H / 2, 0);
  fitShadowToRoom(rig.sun);

  const clear = clearSky(s.alt);
  rig.sun.intensity = clear.dni;
  rig.sun.color.setHSL(0.09, 0.55 - 0.45 * Math.min(1, Math.max(0, s.alt) / 25), 0.55 + 0.42 * Math.min(1, Math.max(0, s.alt) / 25));

  const u = sky.uniforms;
  u.uSunDir.value.copy(dir);
  u.uSunVis.value = Math.max(0, Math.min(1, (s.alt + 0.4) / 0.9));
  blend(u.uZenith.value, 'zen', s.alt);
  blend(u.uHorizon.value, 'hor', s.alt);
  blend(u.uGround.value, 'gnd', s.alt);
  blend(u.uSunColor.value, 'sun', s.alt);
  sky.calibrate(clear.dhi);
  u.uDiscScale.value = clear.dni * 12;
  sky.ground.material.color.copy(u.uGround.value);
  scene.fog.color.copy(u.uHorizon.value).multiplyScalar(u.uSkyScale.value);

  return { dir: dir.clone(), alt: s.alt, clear };
}

// Exposure follows the daylight on a horizontal surface, but only part of the way: noon should
// read brighter than dusk, and night darker still, the way an eye adapts rather than a meter.
// The constant is set for looking into the cut-away room, not at the street: at midday the
// interior gets a few percent of outdoor light, and keyed to the exterior it reads black.
export function exposureFor(clear, cap = 12) {
  return Math.min(cap, 3.8 * Math.pow(clear.ghi + 0.004, -0.75));
}
