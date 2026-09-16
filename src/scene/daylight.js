import * as THREE from 'three';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { ROOM, L, W } from './spec.js';
import { roomUniforms } from './roomlit.js';
import {
  glazedWalls, mergedOpening, planeIrradiance, sunPatch, mergePatches, roomReflectance, splitFlux
} from './daylightMath.js';

// Light that gets into the room other than the direct sun:
// - each window is a one-sided rect-area light facing in, with the radiance of the sky and
//   ground seen through that wall;
// - each sunlit floor patch is an upward rect-area light (the first bounce off the floor);
// - everything else is a uniform inter-reflected term (split flux).
// The reduced path merges each wall's windows, and its patches, into one light.
export function createDaylight(scene, { albedo }) {
  RectAreaLightUniformsLib.init();
  const group = new THREE.Group();
  group.name = 'daylight';
  scene.add(group);

  let walls = glazedWalls(ROOM);
  let reflect = roomReflectance(ROOM, albedo);
  let sources = [], merged = false;
  let daylightBounce = [0, 0, 0], extraBounce = [0, 0, 0];

  // the openings changed: re-derive the windows and rebuild their lights
  function refresh() {
    walls = glazedWalls(ROOM);
    reflect = roomReflectance(ROOM, albedo);
    rebuild(merged);
  }

  function rebuild(merge) {
    merged = merge;
    for (const s of sources) { group.remove(s.light); s.light.dispose(); }
    sources = [];
    for (const w of walls) {
      const openings = merge ? [mergedOpening(w)] : w.rects.map((r) => ({ ...r, fill: 1 }));
      for (const r of openings) {
        const light = new THREE.RectAreaLight(0x000000, 1, r.width, r.height);
        const [x, y, z] = r.centre;
        light.position.set(x + w.nIn[0] * 0.003, y, z + w.nIn[2] * 0.003);
        light.lookAt(x + w.nIn[0], y, z + w.nIn[2]);        // emits towards -z, into the room
        group.add(light);
        sources.push({ light, kind: 'window', wall: w, fill: r.fill });
      }
      // kept in the scene at zero intensity when unlit: changing the light count recompiles
      for (let i = 0; i < (merge ? 1 : w.rects.length); i++) {
        const light = new THREE.RectAreaLight(0x000000, 0, 0.01, 0.01);
        light.rotation.x = Math.PI / 2;                      // -z turned to +y: faces the ceiling
        light.position.y = 0.003;
        group.add(light);
        sources.push({ light, kind: 'patch', wall: w, index: merge ? -1 : i });
      }
    }
  }

  // sunDir: unit vector towards the sun. dni: beam irradiance. radianceAt: sky radiance by direction.
  function update({ sunDir, dni, sunColor, radianceAt }) {
    const phiSun = [0, 0, 0], phiSky = [0, 0, 0];
    const perWall = new Map();

    for (const w of walls) {
      const e = planeIrradiance(radianceAt, w.nOut);         // what arrives at the glass from outside
      const facing = sunDir[0] * w.nOut[0] + sunDir[1] * w.nOut[1] + sunDir[2] * w.nOut[2];
      const glazing = w.rects.reduce((s, r) => s + r.area, 0);
      for (let k = 0; k < 3; k++) {
        phiSky[k] += e[k] * glazing;
        phiSun[k] += dni * Math.max(0, facing) * glazing * sunColor[k];
      }
      const lit = facing > 0 && dni > 0;
      const patches = w.rects.map((r) => (lit ? sunPatch(r.corners, sunDir, L, W) : null));
      perWall.set(w, { radiance: e.map((v) => v / Math.PI), patches });
    }

    const floorE = dni * Math.max(0, sunDir[1]);
    const patchRadiance = sunColor.map((c) => albedo.floor * floorE * c / Math.PI);

    for (const s of sources) {
      const d = perWall.get(s.wall);
      if (s.kind === 'window') {
        s.light.color.setRGB(d.radiance[0] * s.fill, d.radiance[1] * s.fill, d.radiance[2] * s.fill);
        continue;
      }
      const p = s.index >= 0 ? d.patches[s.index] : mergePatches(d.patches.filter(Boolean));
      if (!p) { s.light.intensity = 0; continue; }
      const fill = p.fill ?? 1;
      s.light.position.set(p.cx, 0.003, p.cz);
      s.light.width = p.w;
      s.light.height = p.d;
      s.light.color.setRGB(patchRadiance[0] * fill, patchRadiance[1] * fill, patchRadiance[2] * fill);
      s.light.intensity = 1;
    }

    daylightBounce = splitFlux(phiSun, phiSky, reflect);
    applyBounce();
  }

  // the uniform bounce term is the daylight's plus whatever electric light adds (the LED profiles)
  function applyBounce() {
    roomUniforms.uBounce.value.setRGB(...daylightBounce.map((v, k) => v + extraBounce[k]));
  }
  function setExtraBounce(rgb) {
    extraBounce = rgb;
    applyBounce();
  }

  return { group, rebuild, refresh, update, setExtraBounce };
}
