import * as THREE from 'three';
import { FIT } from './materials.js';
import { cctColour, LUX_PER_UNIT } from '../analysis/lighting.js';

export const MAX_RUNS = 12;              // every edge of the room lit
const GLOW_WIDTH = 0.03;                 // the diffuser drawn a little wider than it is, so it reads at a distance

// A blackbody's colour on screen looks far warmer than the same light does in the room, where the eye
// adapts to it. For display, pull it most of the way to neutral and keep unit luminance; the lux
// figures use the light as it is.
function adapted(rgb, keep = 0.4) {
  const c = rgb.map((v) => 1 + (v - 1) * keep);
  const y = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  return c.map((v) => v / y);
}

// LED profiles in the room: for each run a one-sided rect-area light carrying its light, a glowing
// diffuser strip and the aluminium body behind it. The lights are made once at zero intensity, so
// switching variants never changes the number of lights (which would recompile every material).
export function createLightRig(scene) {
  const group = new THREE.Group();
  group.name = 'led-profiles';
  scene.add(group);
  const lights = Array.from({ length: MAX_RUNS }, () => {
    const l = new THREE.RectAreaLight(0x000000, 0, 0.01, 0.01);
    group.add(l);
    return l;
  });
  const fittings = new THREE.Group();
  group.add(fittings);

  function clear() {
    for (const m of [...fittings.children]) {
      fittings.remove(m);
      m.geometry.dispose();
      if (m.material !== FIT.metal) m.material.dispose();
    }
    for (const l of lights) { l.intensity = 0; l.color.setRGB(0, 0, 0); }
  }

  // runs: from analysis/lighting.js profileRuns. colour: unit-luminance linear RGB for every run (a
  // chosen colour), or null to take each run's own white
  function set(runs, colour = null) {
    clear();
    runs.slice(0, MAX_RUNS).forEach((r, i) => {
      const mid = new THREE.Vector3(...r.a.map((c, k) => (c + r.b[k]) / 2));
      const along = new THREE.Vector3(...r.dir), aim = new THREE.Vector3(...r.aim);
      const rgb = colour ?? adapted(cctColour(r.cct));

      // a rect-area light shines along its own -z: x along the run, z against the aim
      const back = aim.clone().negate();
      const lightBasis = new THREE.Matrix4().makeBasis(along, new THREE.Vector3().crossVectors(back, along), back);
      const l = lights[i];
      l.position.copy(mid);
      l.quaternion.setFromRotationMatrix(lightBasis);
      l.width = r.length;
      l.height = r.diffuser;
      // radiance of a Lambertian diffuser: its exitance (lumens over its area) over pi, in the scene's units
      l.color.setRGB(...rgb);
      l.intensity = r.lmPerMetre / r.diffuser / LUX_PER_UNIT / Math.PI;

      // the diffuser faces the aim; the profile body sits just behind it in the corner
      const faceBasis = new THREE.Matrix4().makeBasis(along, new THREE.Vector3().crossVectors(aim, along), aim);
      const glow = new THREE.Mesh(
        new THREE.PlaneGeometry(r.length, GLOW_WIDTH),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(...rgb.map((v) => Math.min(1, v))), toneMapped: false })
      );
      glow.position.copy(mid);
      glow.quaternion.setFromRotationMatrix(faceBasis);
      const body = new THREE.Mesh(new THREE.BoxGeometry(r.length, GLOW_WIDTH + 0.006, 0.014), FIT.metal);
      body.position.copy(mid).addScaledVector(aim, -0.0075);
      body.quaternion.setFromRotationMatrix(faceBasis);
      glow.castShadow = body.castShadow = false;
      fittings.add(body, glow);
    });
  }

  return { group, set, clear };
}

// A white LED's colour for display (see adapted), for callers that pick one colour for every run.
export function whiteColour(cct) {
  return adapted(cctColour(cct));
}
