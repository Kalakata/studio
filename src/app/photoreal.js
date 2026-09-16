import * as THREE from 'three';
import { WebGLPathTracer } from 'three-gpu-pathtracer';
import { L, W, H } from '../scene/spec.js';

const $ = (id) => document.getElementById(id);
export const TARGET_SAMPLES = 400;

// Photoreal: path-trace the view from inside the room, where every wall and the ceiling are really
// there. The path tracer takes the real materials, the sun and a sky image, and the lights in the room
// (the LED profiles as area lights), and works out bounces, colour bleeding and soft shadows itself, so
// the raster shortcuts step aside while it runs: the shader sky dome and ground (it cannot read them),
// the window and sun-patch lights, and the fog.
export function installPhotoreal(app, { renderer, scene, camera, sky, daylight, state, invalidate, canvas }) {
  state.photoreal = false;
  let tracer = null, active = false, dirty = true, saveNext = false, envTexture = null, stash = null;
  const chip = $('photoreal-chip'), text = $('photoreal-text'), button = $('act-photoreal');
  const insideButton = $('photoreal-inside'), saveButton = $('photoreal-save');

  const inside = () => {
    const p = camera.position;
    return Math.abs(p.x) < L / 2 && Math.abs(p.z) < W / 2 && p.y > 0 && p.y < H;
  };

  // The sky as an equirectangular image in the scene's radiance units, the way three maps directions:
  // u from atan2(z, x), v from the elevation. The sun is left out (it is its own light).
  function skyTexture() {
    const w = 512, h = 256, data = new Float32Array(w * h * 4);
    for (let j = 0; j < h; j++) {
      const el = ((j + 0.5) / h - 0.5) * Math.PI, ce = Math.cos(el), y = Math.sin(el);
      for (let i = 0; i < w; i++) {
        const az = ((i + 0.5) / w - 0.5) * 2 * Math.PI;
        const [r, g, b] = sky.radianceAt(ce * Math.cos(az), y, ce * Math.sin(az));
        const k = (i + j * w) * 4;
        data[k] = r; data[k + 1] = g; data[k + 2] = b; data[k + 3] = 1;
      }
    }
    const t = new THREE.DataTexture(data, w, h, THREE.RGBAFormat, THREE.FloatType);
    t.mapping = THREE.EquirectangularReflectionMapping;
    t.colorSpace = THREE.LinearSRGBColorSpace;
    t.magFilter = t.minFilter = THREE.LinearFilter;
    t.needsUpdate = true;
    return t;
  }

  function useTracedScene(on) {
    if (on && !stash) {
      stash = {
        dome: sky.dome.visible, ground: sky.ground.visible, daylight: daylight.group.visible,
        environment: scene.environment, background: scene.background, fog: scene.fog
      };
      sky.dome.visible = sky.ground.visible = daylight.group.visible = false;
      scene.fog = null;
    }
    if (on) {
      envTexture?.dispose();
      envTexture = skyTexture();                  // the sun may have moved: rebuild every time
      scene.environment = scene.background = envTexture;
    }
    if (!on && stash) {
      sky.dome.visible = stash.dome; sky.ground.visible = stash.ground; daylight.group.visible = stash.daylight;
      scene.environment = stash.environment; scene.background = stash.background; scene.fog = stash.fog;
      stash = null;
      envTexture?.dispose();
      envTexture = null;
    }
  }

  function showChip(message, { needInside = false } = {}) {
    chip.hidden = false;
    text.textContent = message;
    insideButton.hidden = !needInside;
    saveButton.hidden = needInside;
  }

  function start() {
    if (!inside()) {
      showChip('Photoreal renders from inside the room, where every wall is there to hold the light.', { needInside: true });
      button.setAttribute('aria-pressed', 'false');
      return;
    }
    active = true;
    state.photoreal = true;
    dirty = true;
    button.setAttribute('aria-pressed', 'true');
    app.picking.select(null);
    showChip('Preparing the scene…');
    invalidate();
  }

  function stop() {
    active = false;
    state.photoreal = false;
    useTracedScene(false);
    button.setAttribute('aria-pressed', 'false');
    chip.hidden = true;
    invalidate(true);
  }

  // anything that changes what the room looks like starts the render again
  function sceneChanged() {
    if (active) dirty = true;
  }

  // Called by the frame loop in place of the normal render. moving: the camera is easing.
  function render(moving) {
    if (!inside()) {
      stop();
      showChip('Left the room: photoreal stopped. Step back inside to render again.', { needInside: true });
      return;
    }
    if (!tracer) {
      tracer = new WebGLPathTracer(renderer);
      tracer.bounces = 6;
      tracer.transmissiveBounces = 3;
      tracer.tiles.set(2, 2);
      tracer.renderDelay = 0;
      tracer.minSamples = 1;
      tracer.fadeDuration = 0;
    }
    if (dirty) {
      useTracedScene(true);
      tracer.setScene(scene, camera);
      dirty = false;
    } else if (moving) {
      tracer.updateCamera();
    }
    tracer.renderSample();
    const n = Math.floor(tracer.samples);
    text.textContent = n < TARGET_SAMPLES ? `Rendering: ${n} of ${TARGET_SAMPLES} samples` : `Rendered: ${TARGET_SAMPLES} samples`;
    if (saveNext) {
      saveNext = false;
      canvas.toBlob((blob) => {
        if (!blob) return;
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `studio-render-${n}-samples.png`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      }, 'image/png');
    }
  }

  const needsFrame = () => active && (dirty || saveNext || (tracer?.samples ?? 0) < TARGET_SAMPLES);

  button.addEventListener('click', () => (active ? stop() : start()));
  $('photoreal-done').addEventListener('click', () => { if (active) stop(); else chip.hidden = true; });
  saveButton.addEventListener('click', () => { saveNext = true; invalidate(); });
  insideButton.addEventListener('click', () => {
    app.orbit.setView('inside', false);
    showChip('Stepping inside…');
    setTimeout(start, 1200);                       // after the camera has eased in
  });

  return { render, sceneChanged, needsFrame, start, stop, get active() { return active; } };
}
