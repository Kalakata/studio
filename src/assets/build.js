import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import catalog from './catalog.json';
import { L, W, H } from '../scene/spec.js';
import { FIT } from '../scene/materials.js';
import { UNIT } from '../scene/prims.js';

const D2R = Math.PI / 180;
const LEAF = new THREE.SphereGeometry(0.18, 8, 6);
UNIT.userData.shared = LEAF.userData.shared = true;     // never disposed with a piece

// A pallet built the EUR way (EN 13698-1, 1200 x 800 x 144): three bottom boards, nine blocks,
// three cross boards and the top deck, 22 mm boards on 78 mm blocks. Other sizes keep the same
// plan; a deck too narrow for the two intermediate boards leaves them out. One merged geometry
// per size, shared by every pallet of that size, so a stack of ten costs ten draw calls.
const pallets = new Map();
export function palletGeometry(w, d) {
  const key = `${w}x${d}`;
  if (pallets.has(key)) return pallets.get(key);
  const B = 0.022, BLOCK = 0.078, WIDE = 0.145, NARROW = 0.100;
  const xs = [-(w / 2 - WIDE / 2), 0, w / 2 - WIDE / 2];
  const zs = [-(d / 2 - WIDE / 2), 0, d / 2 - WIDE / 2];
  const parts = [];
  const add = (sx, sy, sz, x, y, z) => parts.push(new THREE.BoxGeometry(sx, sy, sz).translate(x, y, z));

  for (const z of zs) add(w, B, WIDE, 0, B / 2, z);                                      // bottom boards
  for (const x of xs) for (const z of zs) add(WIDE, BLOCK, WIDE, x, B + BLOCK / 2, z);     // blocks
  for (const x of xs) add(WIDE, B, d, x, B + BLOCK + B / 2, 0);                          // cross boards
  const deckY = 2 * B + BLOCK + B / 2;
  for (const z of zs) add(w, B, WIDE, 0, deckY, z);                                      // deck: outer and centre
  const free = d / 2 - WIDE - WIDE / 2;                                                  // between centre and outer board
  if (free >= NARROW) for (const s of [-1, 1]) add(w, B, NARROW, 0, deckY, s * (WIDE / 2 + free / 2));

  const g = mergeGeometries(parts);
  parts.forEach((p) => p.dispose());
  g.userData.shared = true;
  pallets.set(key, g);
  return g;
}

export const ASSETS = Object.fromEntries(catalog.assets.map((a) => [a.id, a]));

// Every part receives shadows: a rug, a cushion or a leaf in the shade of a wall must be shaded,
// or the sun's pattern through the windows never shows on it. `shadow` in the catalog only says
// whether a part casts one (small parts do not, to keep the shadow pass light).
function buildPart(p) {
  let m;
  if (p.box) {
    m = new THREE.Mesh(UNIT, FIT[p.mat]);
    m.scale.set(...p.box);
    m.castShadow = (p.shadow ?? 'both') !== 'none';
  } else if (p.cyl) {
    m = new THREE.Mesh(new THREE.CylinderGeometry(...p.cyl), FIT[p.mat]);
    m.castShadow = (p.shadow ?? 'cast') !== 'none';
  } else if (p.leaf) {
    m = new THREE.Mesh(LEAF, FIT[p.mat]);
    m.scale.set(...p.leaf);
    m.castShadow = p.shadow === 'cast' || p.shadow === 'both';
  } else if (p.pallet) {
    m = new THREE.Mesh(palletGeometry(...p.pallet), FIT[p.mat ?? 'pallet']);
    m.castShadow = (p.shadow ?? 'both') !== 'none';
  } else {
    throw new Error('unknown part ' + JSON.stringify(p));
  }
  m.receiveShadow = true;
  m.position.set(...p.at);
  // hung from the ceiling: at[1] is then measured down from the ceiling, so a room of another
  // height still gets its panels at the right drop
  if (p.hang) m.position.y = H - p.at[1];
  if (p.rx) m.rotation.x = p.rx * D2R;
  if (p.ry) m.rotation.y = p.ry * D2R;
  if (p.rz) m.rotation.z = p.rz * D2R;
  return m;
}

// A resizable piece is built from its size rather than a fixed part list: a panel cut to w x d
// hung below the ceiling on four brackets set 100 mm in from its corners.
function resizedParts(a, w, d) {
  const { thickness: t, gap, mat } = a.panel;
  const rods = [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => ({
    cyl: [0.008, 0.008, gap, 6], at: [sx * Math.max(0, w / 2 - 0.1), gap / 2, sz * Math.max(0, d / 2 - 0.1)],
    hang: true, mat: 'metal', shadow: 'none'
  }));
  return [{ box: [w, t, d], at: [0, gap + t / 2, 0], hang: true, mat }, ...rods];
}

function partsFor(a, w, d, open) {
  if (a.resizable) return resizedParts(a, w, d);
  return open && a.openParts ? a.openParts : a.parts;
}

const rememberMaterials = (g) => g.traverse((o) => { if (o.isMesh) o.userData.mat = o.material; });   // for the cutaway to restore

// size: { w, d } for a resizable piece; ignored otherwise. open: an openable piece (a curtain) drawn back.
export function buildAsset(id, size, open = false) {
  const a = ASSETS[id];
  if (!a) return null;
  const w = a.resizable && size ? size.w : a.w, d = a.resizable && size ? size.d : a.d;
  const openable = !!a.openParts;
  const g = new THREE.Group();
  for (const p of partsFor(a, w, d, openable && open)) g.add(buildPart(p));
  g.userData = { type: id, w, d, label: a.label, ceiling: a.mount === 'ceiling', resizable: !!a.resizable, openable, open: openable && open };
  rememberMaterials(g);
  return g;
}

// Opens or closes an openable piece by rebuilding its parts inside the same group, so the selection,
// position and lock stay as they were.
export function rebuildOpen(g, open) {
  const a = ASSETS[g.userData.type];
  if (!a?.openParts) return;
  for (const c of g.children.slice()) {
    g.remove(c);
    if (c.isMesh && !c.geometry.userData.shared) c.geometry.dispose();
  }
  for (const p of open ? a.openParts : a.parts) g.add(buildPart(p));
  g.userData.open = open;
  rememberMaterials(g);
}

// Keeps a footprint inside the room using rotated half-extents, so a rotated piece still
// cannot end up inside a wall.
export function clampItem(g) {
  const c = Math.abs(Math.cos(g.rotation.y)), n = Math.abs(Math.sin(g.rotation.y));
  const hw = (g.userData.w / 2) * c + (g.userData.d / 2) * n;
  const hd = (g.userData.w / 2) * n + (g.userData.d / 2) * c;
  const lx = Math.max(0, L / 2 - hw), lz = Math.max(0, W / 2 - hd);
  g.position.x = Math.max(-lx, Math.min(lx, g.position.x));
  g.position.z = Math.max(-lz, Math.min(lz, g.position.z));
}

// The fit-out living in `stuff`. `place` takes radians, as on the Object3D; layout items
// (metres, degrees) go through `load`. `onChange` fires once per edit.
export function createFurniture(stuff, onChange = () => {}) {
  const items = [];

  // Locked pieces cannot be dragged, rotated or removed until unlocked. Pieces from a layout are
  // locked unless the layout says otherwise; a piece just placed or duplicated arrives unlocked,
  // because the next thing you do with it is move it.
  function add(type, x, z, ry = 0, size, locked = true, open = false) {
    const g = buildAsset(type, size, open);
    if (!g) return null;
    g.userData.locked = locked;
    g.position.set(x, 0, z);
    g.rotation.y = ry;
    clampItem(g);
    stuff.add(g);
    items.push(g);
    return g;
  }

  function drop(g) {
    const i = items.indexOf(g);
    if (i >= 0) items.splice(i, 1);
    stuff.remove(g);
    g.traverse((o) => { if (o.isMesh && !o.geometry.userData.shared) o.geometry.dispose(); });
  }

  return {
    items,
    place(type, x, z, ry, size) { const g = add(type, x, z, ry, size, false); onChange(); return g; },
    remove(g) { drop(g); onChange(); },
    clear() { items.slice().forEach(drop); onChange(); },
    load(layoutItems) {
      items.slice().forEach(drop);
      for (const it of layoutItems) {
        add(it.type, it.x, it.z, (it.ry || 0) * D2R, it.w !== undefined ? { w: it.w, d: it.d } : undefined, it.locked !== false, it.open === true);
      }
      onChange();
    },
    // open or close a curtain: an edit, undoable and saved with the layout
    setOpen(g, open) { rebuildOpen(g, open); onChange(); },
    // a piece was moved or rotated in place
    touch: () => onChange()
  };
}
