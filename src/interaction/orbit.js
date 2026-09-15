import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { L, W, H, T } from '../scene/spec.js';

const D2R = Math.PI / 180;
const EASE = 0.14;

// OrbitControls for direct input; preset views ease the camera there the way v1 did.
// getFrame() -> { top, bottom } in CSS pixels: the band of the window the panels leave free.
// Views are fitted into that band and centred in it, rather than hidden under the dock.
export function createOrbit(camera, canvas, invalidate, getFrame) {
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.14;
  controls.rotateSpeed = 0.8;
  controls.minPolarAngle = 0.05;
  controls.maxPolarAngle = 1.605;
  controls.minDistance = 0.6;
  controls.maxDistance = L * 6 + 20;
  controls.zoomSpeed = 0.8;

  const state = { inside: false, autoFit: true, view: 'iso' };
  let goal = null;                            // { theta, phi, radius, target } while easing
  const sph = new THREE.Spherical(), off = new THREE.Vector3();

  function frame() {
    const h = canvas.clientHeight || window.innerHeight, w = canvas.clientWidth || window.innerWidth;
    const f = getFrame?.() ?? { top: 0, bottom: h };
    const top = Math.max(0, f.top), bottom = Math.min(h, Math.max(top + 1, f.bottom));
    return { w, h, share: Math.max(0.35, (bottom - top) / h), shift: Math.round(h / 2 - (top + bottom) / 2) };
  }

  // shift the projection so the middle of the free band is the middle of the view
  function applyOffset() {
    const { w, h, shift } = frame();
    if (Math.abs(shift) < 1) camera.clearViewOffset();
    else camera.setViewOffset(w, h, 0, shift, w, h);
    camera.updateProjectionMatrix();
  }

  // camera distance that fits a w x h (metres) extent into the free band
  function fitRadius(w, h, margin = 1.25) {
    const vFov = camera.fov * D2R, aspect = Math.max(camera.aspect, 0.35);
    const vHalf = Math.atan(Math.tan(vFov / 2) * frame().share);
    const hHalf = Math.atan(Math.tan(vFov / 2) * aspect);
    return Math.max((h / 2) / Math.tan(vHalf), (w / 2) / Math.tan(hHalf)) * margin;
  }

  // Views from above. On a tall, narrow screen (a phone held upright) the room turns so its length
  // runs up the screen instead of across it, which fits it at twice the size.
  function fromAbove(w, h, phi, margin) {
    const upright = camera.aspect < 0.8;
    return { theta: upright ? -Math.PI / 2 : 0, phi, radius: upright ? fitRadius(h, w, margin) : fitRadius(w, h, margin), target: new THREE.Vector3() };
  }

  function presetGoal(name) {
    const t = new THREE.Vector3();
    switch (name) {
      case 'plan':   return fromAbove(L, W, 0.06, 1.18);
      // the sun-hours plan: floor plus the walls unfolded around it, and their labels
      case 'sunplan': return fromAbove(L + 2 * (T + H + 0.9), W + 2 * (T + H + 0.9), 0.02, 1.32);
      // the sound plans: the floor and the edge just around it
      case 'soundplan': return fromAbove(L + 1.6, W + 1.6, 0.02, 1.12);
      case 'long':   return { theta: 0, phi: Math.PI / 2, radius: fitRadius(L, H, 1.15), target: t.set(0, H / 2, 0) };
      case 'end':    return { theta: -Math.PI / 2, phi: Math.PI / 2, radius: fitRadius(W, H, 1.3), target: t.set(0, H / 2, 0) };
      case 'inside': return { theta: -Math.PI / 2, phi: Math.PI / 2, radius: L - 0.8, target: t.set(L / 2, 1.5, 0) };
      default:       return { theta: -0.78, phi: 1.04, radius: fitRadius(L * 0.86, H * 1.9, 1.2), target: t.set(0, H * 0.45, 0) };
    }
  }

  function place(s) {
    controls.target.copy(s.target);
    sph.set(s.radius, s.phi, s.theta);
    camera.position.copy(s.target).add(off.setFromSpherical(sph));
    camera.lookAt(s.target);
  }

  function setView(name, instant) {
    state.view = name;
    state.inside = name === 'inside';
    state.autoFit = true;
    applyOffset();
    goal = presetGoal(name);
    if (instant) { place(goal); goal = null; }
    invalidate();
  }

  // the free band changed (resize, dock shown or hidden, tab switch): re-centre, and refit the
  // current view unless the camera has been moved by hand
  function reframe(instant) {
    if (state.autoFit) setView(state.view, instant);
    else { applyOffset(); invalidate(); }
  }

  // start from a pulled-back, high camera and ease into the current view
  function intro() {
    const g = presetGoal(state.view);
    place({ ...g, radius: g.radius * 1.6, phi: 0.5 });
    goal = g;
    invalidate();
  }

  controls.addEventListener('start', () => { goal = null; state.autoFit = false; invalidate(); });
  controls.addEventListener('change', () => invalidate());

  // advance one frame; returns true while the camera is still moving
  function update() {
    let moving = false;
    if (goal) {
      sph.setFromVector3(off.copy(camera.position).sub(controls.target));
      let dt = goal.theta - sph.theta;
      dt = Math.atan2(Math.sin(dt), Math.cos(dt));     // shortest way round
      const done = Math.abs(dt) < 2e-4 && Math.abs(goal.phi - sph.phi) < 2e-4 &&
        Math.abs(goal.radius - sph.radius) < 1e-3 && controls.target.distanceToSquared(goal.target) < 1e-7;
      if (done) {
        place(goal); goal = null;
      } else {
        place({
          theta: sph.theta + dt * EASE,
          phi: sph.phi + (goal.phi - sph.phi) * EASE,
          radius: sph.radius + (goal.radius - sph.radius) * EASE,
          target: controls.target.clone().lerp(goal.target, EASE)
        });
        moving = true;
      }
    }
    if (controls.update()) moving = true;

    // keep panning from wandering under the floor or far above the roof
    const y = controls.target.y, cy = Math.max(0, Math.min(H * 2, y));
    if (cy !== y) { controls.target.y = cy; camera.position.y += cy - y; }
    return moving;
  }

  return { controls, state, setView, reframe, intro, update };
}
