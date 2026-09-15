import * as THREE from 'three';
import { clampItem } from '../assets/build.js';

// Select, drag, rotate, duplicate and remove fit-out pieces.
// Must be created before OrbitControls so its pointerdown runs first and can claim the drag.
export function createPicking({ canvas, scene, stuff, furniture, show, invalidate, getCamera, getControls, onSelect, getMode, onMove }) {
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const hit = new THREE.Vector3(), grabOff = new THREE.Vector3();
  let grabbed = null, selected = null, pointerId = null, moved = false;
  let pressed = null;          // a press on a locked piece: selects it on release if it was a click

  const selBox = new THREE.Box3Helper(new THREE.Box3(), 0xffb02e);
  selBox.material.depthTest = false;
  selBox.material.toneMapped = false;
  selBox.renderOrder = 20;
  selBox.visible = false;
  scene.add(selBox);

  function aim(cx, cy) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, getCamera());
  }

  function pick(cx, cy) {
    if (!show.furniture) return null;
    aim(cx, cy);
    // a piece hidden by the cutaway (a cloud seen from above) cannot be clicked
    const hit = ray.intersectObjects(stuff.children, true).find((h) => h.object.material.colorWrite !== false);
    if (!hit) return null;
    let o = hit.object;
    while (o.parent && o.parent !== stuff) o = o.parent;
    return o;
  }

  function refreshBox() {
    if (!selected) { selBox.visible = false; return; }
    selected.updateMatrixWorld(true);       // the helper reads world space
    selBox.box.setFromObject(selected);
    selBox.visible = true;
  }

  function select(g) {
    selected = g;
    refreshBox();
    onSelect(g);
    invalidate();
  }

  function rotate() {
    if (!selected || selected.userData.locked) return;
    selected.rotation.y += Math.PI / 4;
    clampItem(selected);
    refreshBox();
    furniture.touch();
    invalidate(true);
  }

  function duplicate() {
    if (!selected) return;
    const s = selected;
    const size = s.userData.resizable ? { w: s.userData.w, d: s.userData.d } : undefined;
    select(furniture.place(s.userData.type, s.position.x + 0.45, s.position.z + 0.45, s.rotation.y, size));
    invalidate(true);
  }

  function remove() {
    if (!selected || selected.userData.locked) return;
    furniture.remove(selected);
    select(null);
    invalidate(true);
  }

  canvas.addEventListener('pointerdown', (e) => {
    const controls = getControls();
    if (grabbed) {                           // a second finger: let go, no drag and pinch at once
      grabbed = null;
      return;
    }
    if (getMode && getMode() !== 'layout') return;    // shell editing or measuring owns the pointer
    if (!e.isPrimary || e.button !== 0 || e.shiftKey || e.ctrlKey || e.metaKey) return;
    const g = pick(e.clientX, e.clientY);
    if (!g) { select(null); return; }
    if (g.userData.locked) {
      // leave the pointer to the camera; a click without a drag still selects it
      pressed = { g, x: e.clientX, y: e.clientY, pointerId: e.pointerId };
      return;
    }
    select(g);
    grabbed = g;
    moved = false;
    pointerId = e.pointerId;
    if (controls) controls.enabled = false;
    grabOff.set(0, 0, 0);
    if (ray.ray.intersectPlane(floor, hit)) grabOff.set(g.position.x - hit.x, 0, g.position.z - hit.z);
  });

  window.addEventListener('pointermove', (e) => {
    if (!grabbed || e.pointerId !== pointerId) return;
    aim(e.clientX, e.clientY);
    if (ray.ray.intersectPlane(floor, hit)) {
      grabbed.position.x = hit.x + grabOff.x;
      grabbed.position.z = hit.z + grabOff.z;
      clampItem(grabbed);
      refreshBox();
      moved = true;
      onMove?.();                                   // e.g. clash boxes follow the drag
      invalidate(true);
    }
  });

  const release = (e) => {
    if (pressed && e.pointerId === pressed.pointerId) {
      if (Math.hypot(e.clientX - pressed.x, e.clientY - pressed.y) < 6) select(pressed.g);
      pressed = null;
    }
    if (e.pointerId !== pointerId) return;
    if (grabbed && moved) furniture.touch();
    grabbed = null; pointerId = null; moved = false;
    const controls = getControls();
    if (controls) controls.enabled = true;
  };
  window.addEventListener('pointerup', release);
  window.addEventListener('pointercancel', release);
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  window.addEventListener('keydown', (e) => {
    if (!selected || e.target.closest?.('input')) return;
    if (e.key === 'Delete' || e.key === 'Backspace') remove();
    if (e.key === 'r' || e.key === 'R') rotate();
    if (e.key === 'Escape') select(null);
  });

  function toggleLock() {
    if (!selected) return;
    selected.userData.locked = !selected.userData.locked;
    furniture.touch();                        // an edit: undoable and saved with the layout
    onSelect(selected);
    invalidate();
  }

  // Opening a curtain is not moving it, so a locked curtain opens too
  function toggleOpen() {
    if (!selected?.userData.openable) return;
    furniture.setOpen(selected, !selected.userData.open);
    refreshBox();
    onSelect(selected);
    invalidate(true);                          // it shades the sun differently
  }

  return { select, rotate, duplicate, remove, toggleLock, toggleOpen, get selected() { return selected; } };
}
