import * as THREE from 'three';
import { ROOM, wallFrame } from '../scene/spec.js';
import { matSelect } from '../scene/materials.js';

// Shell tab, in the 3D view: tap a wall to pick it, tap an opening to select it, drag an opening
// sideways to move it along its wall. The drag runs on the wall's own vertical plane, so it
// works in the elevation views where the floor plane is edge-on.
// Must be created before OrbitControls so its pointerdown runs first and can claim the drag.
export function createShellEdit({ canvas, overlay, room, getCamera, getControls, getMode, onPick, onDrag }) {
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  const plane = new THREE.Plane(), hit = new THREE.Vector3();

  const outline = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints([0, 1, 2, 3].map(() => new THREE.Vector3())), matSelect);
  outline.visible = false;
  outline.frustumCulled = false;
  outline.renderOrder = 25;
  overlay.add(outline);

  let selection = null, drag = null;

  function aim(e) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, getCamera());
  }

  const frameOf = (wallId) => {
    const wall = ROOM.walls.find((w) => w.id === wallId);
    return wall ? { wall, f: wallFrame(ROOM, wall) } : null;
  };
  const alongOf = (f, p) => (p.x - f.leftCorner[0]) * f.along[0] + (p.z - f.leftCorner[1]) * f.along[2];

  function setSelection(sel) {
    selection = sel;
    const fr = sel && frameOf(sel.wallId);
    const o = fr && sel.index >= 0 ? fr.wall.openings[sel.index] : null;
    if (!o) { outline.visible = false; return; }
    const f = fr.f, inset = f.normal.map((v) => -v * 0.012);
    const P = (along, y) => new THREE.Vector3(f.leftCorner[0] + f.along[0] * along + inset[0], y, f.leftCorner[1] + f.along[2] * along + inset[2]);
    outline.geometry.setFromPoints([P(o.left, o.sill), P(o.left + o.width, o.sill), P(o.left + o.width, o.head), P(o.left, o.head)]);
    outline.visible = true;
  }

  canvas.addEventListener('pointerdown', (e) => {
    if (getMode() !== 'shell' || !e.isPrimary || e.button !== 0 || e.shiftKey || e.ctrlKey || e.metaKey) return;
    aim(e);
    // walls cut away between the camera and the room are invisible: reach through them
    const candidates = room.walls.filter((w) => !w.ghosted);
    const h = ray.intersectObjects(candidates.map((w) => w.mesh), true)[0];
    if (!h) return;                                    // empty space: orbit as usual
    const entry = candidates.find((w) => { for (let o = h.object; o; o = o.parent) if (o === w.mesh) return true; return false; });
    const fr = frameOf(entry.id);
    const along = alongOf(fr.f, h.point), y = h.point.y;
    const index = fr.wall.openings.findIndex((o) =>
      along >= o.left - 0.03 && along <= o.left + o.width + 0.03 && y >= o.sill - 0.1 && y <= o.head + 0.1);
    onPick({ wallId: entry.id, index });
    if (index < 0) return;

    plane.setFromNormalAndCoplanarPoint(new THREE.Vector3(...fr.f.normal).negate(), new THREE.Vector3(fr.f.inner[0], 0, fr.f.inner[1]));
    drag = { wallId: entry.id, index, f: fr.f, offset: along - fr.wall.openings[index].left, pointerId: e.pointerId, last: null };
    const c = getControls();
    if (c) c.enabled = false;
  });

  window.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    aim(e);
    if (!ray.ray.intersectPlane(plane, hit)) return;
    const left = alongOf(drag.f, hit) - drag.offset;
    if (drag.last !== null && Math.abs(left - drag.last) < 0.0005) return;
    drag.last = left;
    onDrag(drag.wallId, drag.index, left, false);
  });

  const end = (e) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    if (drag.last !== null) onDrag(drag.wallId, drag.index, drag.last, true);
    drag = null;
    const c = getControls();
    if (c) c.enabled = true;
  };
  window.addEventListener('pointerup', end);
  window.addEventListener('pointercancel', end);

  return {
    setSelection,
    refresh: () => setSelection(selection),
    get selection() { return selection; }
  };
}
