import * as THREE from 'three';
import './ui/styles.css';
import { ROOM, FACE, L, W, H } from './scene/spec.js';
import { buildRoom } from './scene/room.js';
import { createSky } from './scene/sky.js';
import { createSunRig, applySun, solar, exposureFor } from './scene/sun.js';
import { createDaylight } from './scene/daylight.js';
import { setSoftShadowSamples, roomUniforms } from './scene/roomlit.js';
import { createPost } from './scene/postfx.js';
import { QUALITY, initialQuality, saveQuality } from './scene/quality.js';
import { createCutaway } from './scene/cutaway.js';
import { matFloor, matCeil, matWall, matMural, matEdge, albedoOf } from './scene/materials.js';
import { createFurniture, ASSETS } from './assets/build.js';
import mixRoom from './assets/presets/mix-room.json';
import { parseLayout, serialize } from './assets/layouts.js';
import { coverCeiling } from './assets/ceilingCover.js';
import { createOrbit } from './interaction/orbit.js';
import { createPicking } from './interaction/picking.js';
import { createShellEdit } from './interaction/shellEdit.js';
import { createMeasure } from './interaction/measure.js';
import { createDock } from './ui/dock.js';
import { createShellPanel } from './ui/shell.js';
import { createFacadePanel } from './ui/facades.js';
import { createPartsPanel } from './ui/soundParts.js';
import { installSound } from './app/sound.js';
import { installLight, LED_EXPOSURE_CAP } from './app/light.js';
import { installPhotoreal } from './app/photoreal.js';
import { installShell } from './app/shell.js';
import { installClashes } from './app/clashes.js';
import { installSunPlan } from './app/sunPlan.js';
import { installKeys } from './app/keys.js';
import { startLayouts } from './app/startLayouts.js';

const canvas = document.getElementById('view');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const m2 = (v) => v.toFixed(2);
document.getElementById('plate-dims').textContent = `${m2(L)} × ${m2(W)} × ${m2(H)} m`;
document.getElementById('plate-site').textContent = ROOM.site.name;
document.title = `Studio shell — ${+L.toFixed(2)} × ${+W.toFixed(2)} × ${+H.toFixed(2)} m`;

const now = new Date();
const state = {
  face: FACE,
  dayOfYear: Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 86400000),
  minutes: Math.round((now.getHours() * 60 + now.getMinutes()) / 5) * 5,
  quality: initialQuality(),
  sunmap: false
};
const show = { grid: false, dims: true, ceiling: false, cutaway: true, furniture: true, lights: true, clashes: true };

// ---- renderer --------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.BasicShadowMap;   // raw depth; roomlit.js filters it as PCSS
renderer.shadowMap.autoUpdate = false;            // the room never moves: redraw shadows on demand

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0xb9bfb6, 0.0055);
// labels, dimension lines and the selection box: drawn after tone mapping, at their own colours
const overlay = new THREE.Scene();
// tight near/far: 0.05 to 4000 shredded depth precision and made surfaces flicker
const camera = new THREE.PerspectiveCamera(45, 1, 0.2, 1400);

// ---- render on demand ------------------------------------------------------
let frame = 0;
let sceneChanged = () => {};                      // set once the photoreal render is installed
function invalidate(shadows) {
  if (shadows) { renderer.shadowMap.needsUpdate = true; sceneChanged(); }
  if (!frame) frame = requestAnimationFrame(tick);
}

// ---- scene -----------------------------------------------------------------
const sky = createSky(scene, renderer);
const rig = createSunRig(scene);
const room = buildRoom(scene, show);
overlay.add(room.dims, room.north, room.swings);
const cutaway = createCutaway(room, show);
const daylight = createDaylight(scene, {
  albedo: { floor: albedoOf(matFloor), ceiling: albedoOf(matCeil), wall: albedoOf(matWall), mural: albedoOf(matMural), glass: 0.08 }
});
const post = createPost(renderer, scene, camera);
const furniture = createFurniture(room.stuff, () => {
  app.layouts?.changed();
  app.updateClashes?.();
  app.sunMapFurniture?.();
  app.parts?.refresh();
  app.sound?.refresh();
  app.light?.refresh();
});

const knownTypes = new Set(Object.keys(ASSETS));
// the default layout is the Mix room: the studio and its treatment, ceiling panels fitted to the lights
const defaultItems = [...parseLayout(mixRoom, knownTypes).items, ...coverCeiling(ROOM)];

const app = { state, show, room, furniture, defaultItems, invalidate };
// which pieces show: acoustic ones step aside while comparing without the treatment, ceiling-hung
// ones while an LED profile layout is on
app.showPieces = () => {
  for (const g of furniture.items) {
    const a = ASSETS[g.userData.type];
    g.visible = !(state.soundBare && a?.acoustic) && !(state.led && a?.mount === 'ceiling');
  }
};

// ---- modes: Measure takes clicks, the sun-hours plan is read-only, the Shell tab edits
// openings, otherwise the pointer moves furniture
let activeTab = 'sun';
app.mode = () => (app.measure?.active ? 'measure' : state.sunmap || state.soundmap || state.luxmap || state.soundBare || state.photoreal ? 'sunmap' : activeTab === 'shell' ? 'shell' : 'layout');
app.onTab = (tab) => {
  activeTab = tab;
  app.sound?.onTab(tab);
  if (tab === 'shell') app.picking.select(null);
  else app.selectOpening(null);
  invalidate();
};

// ---- light -------------------------------------------------------------------
let baseExposure = 1, lastSun = null;
const INSIDE_ADAPT = 1.5;        // standing in the room, the eye opens up a little more

function relight() {
  if (!lastSun) return;
  daylight.update({
    sunDir: lastSun.dir.toArray(), dni: lastSun.clear.dni,
    sunColor: rig.sun.color.toArray(), radianceAt: sky.radianceAt
  });
}

app.updateSun = () => {
  const s = solar(state.dayOfYear, state.minutes);
  lastSun = applySun(rig, sky, scene, s, state.face);
  relight();
  sky.updateEnvironment();
  baseExposure = exposureFor(lastSun.clear, Infinity);      // capped per frame: higher with LED profiles on
  room.north.rotation.y = (90 - state.face) * Math.PI / 180;
  app.dock.setSunReadout(s);
  invalidate(true);
};

app.setQuality = (q) => {
  const cfg = QUALITY[q];
  state.quality = q;
  saveQuality(q);
  rig.sun.shadow.mapSize.set(cfg.shadowMap, cfg.shadowMap);
  if (rig.sun.shadow.map) { rig.sun.shadow.map.dispose(); rig.sun.shadow.map = null; }
  setSoftShadowSamples(cfg.blocker, cfg.filter);
  daylight.rebuild(cfg.mergeWindows);
  post.enabled = cfg.ao;
  app.dock.setQuality(q);
  resize();
  app.updateSun();
};

installShell(app, { room, daylight, relight, invalidate });

// ---- pointer tools: these claim a drag before OrbitControls sees it, so come first ----
app.picking = createPicking({
  canvas, scene: overlay, stuff: room.stuff, furniture, show, invalidate,
  getCamera: () => camera,
  getControls: () => app.orbit?.controls,
  onSelect: (g) => app.dock?.showSelection(g),
  getMode: () => app.mode(),
  onMove: () => app.updateClashes()
});
app.shellEdit = createShellEdit({
  canvas, overlay, room,
  getCamera: () => camera,
  getControls: () => app.orbit?.controls,
  getMode: () => app.mode(),
  onPick: (sel) => app.selectOpening(sel),
  onDrag: (wallId, index, left, done) => app.moveOpening(wallId, index, left, done)
});

// the band above the dock (and below the sun-hours legend when that sits at the top) that the
// room is framed into
function freeFrame() {
  const h = window.innerHeight;
  const dock = document.getElementById('dock').getBoundingClientRect();
  let top = 0, bottom = dock.top - 8;
  // on a narrow screen the title plate and the sun readout span the top: start below them
  if (window.innerWidth <= 700) {
    for (const sel of ['.plate', '.sun']) top = Math.max(top, document.querySelector(sel).getBoundingClientRect().bottom + 6);
  }
  for (const id of ['sunmap-legend', 'sound-legend', 'light-legend']) {
    const legend = document.getElementById(id);
    if (legend.hidden || getComputedStyle(legend).display === 'none') continue;
    const r = legend.getBoundingClientRect();
    if (r.top < h / 2) top = Math.max(top, r.bottom + 8);     // at the top (wider screens)
    else bottom = Math.min(bottom, r.top - 8);                 // just above the dock (phones)
  }
  return { top, bottom };
}
app.orbit = createOrbit(camera, canvas, invalidate, freeFrame);
app.measure = createMeasure({
  canvas, scene, overlay, invalidate,
  getCamera: () => camera,
  onChange: (text) => app.dock?.setMeasure(app.measure.active, text)
});

app.loadItems = (items) => {
  app.picking.select(null);
  furniture.load(items);
  invalidate(true);
};
app.clearLayout = () => {
  app.picking.select(null);
  furniture.clear();
  invalidate(true);
};
// swap whatever hangs from the ceiling for panels fitted around the light fittings (one undo step)
app.coverCeiling = () => {
  const keep = serialize(furniture.items).filter((it) => ASSETS[it.type]?.mount !== 'ceiling');
  app.loadItems([...keep, ...coverCeiling(ROOM)]);
};

// ---- panels ----------------------------------------------------------------------
installClashes(app, { overlay, furniture, show, invalidate });
app.dock = createDock(app);
app.layouts = startLayouts(app, { furniture, defaultItems, knownTypes });
app.restoreShellDraft();
app.shell = createShellPanel(app);
app.updateClashes();
installSunPlan(app, { overlay, canvas, camera, room, furniture, state, show, invalidate });
app.facades = createFacadePanel(app);
app.parts = createPartsPanel(app);
app.sound = installSound(app, { overlay, canvas, camera, furniture, state, invalidate });
app.light = installLight(app, { scene, overlay, canvas, camera, furniture, daylight, state, invalidate });
app.photoreal = installPhotoreal(app, { renderer, scene, camera, sky, daylight, state, invalidate, canvas });
sceneChanged = app.photoreal.sceneChanged;
installKeys(app);

// ---- frame -------------------------------------------------------------------
// Lines in the main scene go through the tone mapper on the composer path; divide by the
// exposure so they keep roughly their drawn colour.
const annotationColours = [[matEdge, matEdge.color.clone()], [room.grid.material, new THREE.Color(1, 1, 1)]];
function toneAnnotations(exposure) {
  const k = post.enabled ? 1 / exposure : 1;
  for (const [m, base] of annotationColours) m.color.copy(base).multiplyScalar(k);
}

function tick() {
  frame = 0;
  const moving = app.orbit.update();
  cutaway(camera);

  const p = camera.position;
  const inside = Math.abs(p.x) < L / 2 && Math.abs(p.z) < W / 2 && p.y > 0 && p.y < H;

  // dimension lines, the north arrow and door sweeps annotate the plan: not while standing in the room
  const planView = state.sunmap || state.soundmap || state.luxmap;
  room.dims.visible = room.swings.visible = show.dims && !inside && !planView;
  room.north.visible = !inside && !planView;
  const exposure = Math.min(state.led ? LED_EXPOSURE_CAP : 12, baseExposure * (inside ? INSIDE_ADAPT : 1));
  renderer.toneMappingExposure = exposure;
  toneAnnotations(exposure);

  // photoreal: the path tracer draws the frame, sample by sample, until it has enough
  if (app.photoreal?.active) {
    app.photoreal.render(moving);
    if (app.photoreal.needsFrame() && !frame) frame = requestAnimationFrame(tick);
    return;
  }

  if (post.enabled) post.render();
  else renderer.render(scene, camera);
  renderer.autoClear = false;
  renderer.clearDepth();
  renderer.render(overlay, camera);
  renderer.autoClear = true;

  if (moving && !frame) frame = requestAnimationFrame(tick);
}

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, QUALITY[state.quality].pixelRatio));
  renderer.setSize(w, h, false);
  post.setSize(w, h, renderer.getPixelRatio());
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  app.dock.parkBar();
  app.orbit.reframe(true);
  sceneChanged();
  invalidate();
}
window.addEventListener('resize', resize);

// ---- go --------------------------------------------------------------------
app.dock.syncInputs();
app.setQuality(state.quality);                // sizes, lights, sun and first frame
if (!reduceMotion) app.orbit.intro();
invalidate(true);

// console access while developing; left out of the built file
if (import.meta.env.DEV) {
  app.debug = { renderer, scene, overlay, camera, sky, rig, daylight, post, roomUniforms, getExposure: () => renderer.toneMappingExposure };
  window.studio = app;
}
