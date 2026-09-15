import * as THREE from 'three';
import { planeIrradiance, luminance } from './daylightMath.js';
import { roomLit } from './roomlit.js';

const D2R = Math.PI / 180;

const vertexShader = /* glsl */`
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;

// Radiance in scene units: the palette gradient times uSkyScale, which sun.js calibrates so the
// sky's horizontal irradiance matches the clear-sky diffuse figure. The disc is drawn only for
// the eye (uDisc = 1); the environment capture leaves it out, because direct sun is the
// shadowed directional light and must not be counted twice.
const fragmentShader = /* glsl */`
  precision highp float;
  uniform vec3 uZenith, uHorizon, uGround, uSunColor, uSunDir;
  uniform float uSunVis, uSkyScale, uDisc, uDiscScale;
  varying vec3 vDir;
  void main() {
    vec3 d = normalize(vDir);
    vec3 col = d.y >= 0.0 ? mix(uHorizon, uZenith, pow(d.y, 0.42))
                          : mix(uHorizon, uGround, pow(-d.y, 0.30));
    // chord length, not dot(): near mu = 1 a mediump dot loses the sun entirely
    float r = length(d - normalize(uSunDir));
    col += uSunColor * exp(-r * 2.6) * 0.30 * uSunVis;
    col *= uSkyScale;
    vec3 disc = uSunColor * exp(-r * r * 260.0) * 0.55 * uSunVis * uSkyScale;
    disc = mix(disc, uSunColor * uDiscScale, smoothstep(0.024, 0.017, r) * uSunVis);
    col += disc * uDisc;
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

const makeMaterial = (uniforms) => new THREE.ShaderMaterial({
  uniforms, vertexShader, fragmentShader, side: THREE.BackSide, depthWrite: false, fog: false
});

export function createSky(scene, renderer) {
  const uniforms = {
    uZenith:    { value: new THREE.Color(0x3f77b8) },
    uHorizon:   { value: new THREE.Color(0xc7dcea) },
    uGround:    { value: new THREE.Color(0x9ba18e) },
    uSunColor:  { value: new THREE.Color(0xfff1d0) },
    uSunDir:    { value: new THREE.Vector3(0, 1, 0) },
    uSunVis:    { value: 1 },
    uSkyScale:  { value: 1 },
    uDisc:      { value: 1 },
    uDiscScale: { value: 30 }
  };

  const geometry = new THREE.SphereGeometry(620, 32, 20);
  const dome = new THREE.Mesh(geometry, makeMaterial(uniforms));
  dome.renderOrder = -1000;
  dome.userData.noAO = true;
  scene.add(dome);

  // same sky, no disc, for the environment map
  const envScene = new THREE.Scene();
  envScene.add(new THREE.Mesh(geometry, makeMaterial({ ...uniforms, uDisc: { value: 0 } })));

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(800, 800),
    roomLit(new THREE.MeshStandardMaterial({ color: 0x9ba18e, roughness: 1 }))
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.02;
  // outside the room there is nothing to study: the shadow map only covers the room
  ground.receiveShadow = false;
  scene.add(ground);

  // JS twin of the shader above, without the disc
  function radianceAt(x, y, z, scale = uniforms.uSkyScale.value) {
    const u = uniforms, zen = u.uZenith.value, hor = u.uHorizon.value, gnd = u.uGround.value;
    const up = y >= 0, t = up ? Math.pow(y, 0.42) : Math.pow(-y, 0.30), to = up ? zen : gnd;
    const s = u.uSunDir.value, sc = u.uSunColor.value;
    const glow = Math.exp(-Math.hypot(x - s.x, y - s.y, z - s.z) * 2.6) * 0.30 * u.uSunVis.value;
    return [
      (hor.r + (to.r - hor.r) * t + sc.r * glow) * scale,
      (hor.g + (to.g - hor.g) * t + sc.g * glow) * scale,
      (hor.b + (to.b - hor.b) * t + sc.b * glow) * scale
    ];
  }

  // scale the palette so the sky delivers `dhi` on a horizontal surface
  function calibrate(dhi) {
    const unit = luminance(planeIrradiance((x, y, z) => radianceAt(x, y, z, 1), [0, 1, 0]));
    uniforms.uSkyScale.value = unit > 1e-6 ? dhi / unit : 0;
  }

  // Regenerate the environment map only when the sky has visibly changed: the sun moved more
  // than 1.5 deg, or the sky brightness moved more than 4 %.
  const pmrem = new THREE.PMREMGenerator(renderer);
  let target = null, lastScale = -1;
  const lastDir = new THREE.Vector3();
  function updateEnvironment(force) {
    const dir = uniforms.uSunDir.value, s = uniforms.uSkyScale.value;
    const moved = dir.angleTo(lastDir) > 1.5 * D2R;
    const dimmed = Math.abs(s - lastScale) > 0.04 * Math.max(s, lastScale);
    if (!force && target && !moved && !dimmed) return false;
    const next = pmrem.fromScene(envScene, 0, 1, 1000);
    scene.environment = next.texture;
    if (target) target.dispose();
    target = next;
    lastDir.copy(dir); lastScale = s;
    return true;
  }

  return { uniforms, dome, ground, radianceAt, calibrate, updateEnvironment };
}
