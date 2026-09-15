import * as THREE from 'three';
import { ROOM } from '../scene/spec.js';
import { label } from '../scene/room.js';
import { matMeasure } from '../scene/materials.js';
import { snap, snapFeatures } from './measureMath.js';

const KIND_COLOUR = { vertex: 0x2f9e44, edge: 0xf08c00, surface: 0x868e96 };

function dotTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d');
  g.beginPath(); g.arc(16, 16, 11, 0, Math.PI * 2);
  g.fillStyle = '#ffffff'; g.fill();
  g.lineWidth = 3; g.strokeStyle = '#1c2530'; g.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const shown = (o) => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; };

// Click two points, get the distance. Points lock onto room, opening and partition corners
// and edges, which is what makes a measurement agree with the drawings to the millimetre.
export function createMeasure({ canvas, scene, overlay, getCamera, invalidate, onChange }) {
  const group = new THREE.Group();
  overlay.add(group);
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  const floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), onFloor = new THREE.Vector3();
  const tex = dotTexture();

  const dot = (colour) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: colour, depthTest: false, sizeAttenuation: false, toneMapped: false }));
    s.scale.set(0.022, 0.022, 1);
    s.renderOrder = 30;
    return s;
  };
  const marker = dot(KIND_COLOUR.vertex);
  marker.visible = false;
  const preview = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), matMeasure);
  preview.visible = false;
  preview.frustumCulled = false;
  preview.renderOrder = 29;
  const results = new THREE.Group();
  group.add(marker, preview, results);

  let active = false, first = null, down = null;

  const describe = (a, b) => {
    const d = a.distanceTo(b), f = (v) => Math.abs(v).toFixed(3);
    return `${d.toFixed(3)} m (Δx ${f(b.x - a.x)}, Δy ${f(b.y - a.y)}, Δz ${f(b.z - a.z)})`;
  };

  function snapAt(e) {
    const r = canvas.getBoundingClientRect(), camera = getCamera();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const targets = [];
    scene.traverse((o) => {
      if (!o.isMesh || !shown(o)) return;
      const m = o.material;
      if (o.userData.noAO || m.transparent || m.colorWrite === false) return;
      targets.push(o);
    });
    const hit = ray.intersectObjects(targets, false)[0];
    const surface = hit ? hit.point : ray.ray.intersectPlane(floor, onFloor);
    const project = (p) => {
      const v = p.clone().project(camera);
      return v.z > 1 ? null : [r.left + (v.x + 1) / 2 * r.width, r.top + (1 - v.y) / 2 * r.height];
    };
    return snap(ray.ray, [e.clientX, e.clientY], project, snapFeatures(ROOM), surface);
  }

  function addResult(a, b) {
    const g = new THREE.Group();
    const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, b]), matMeasure);
    l.renderOrder = 29;
    const da = dot(0xd9480f), db = dot(0xd9480f);
    da.position.copy(a); db.position.copy(b);
    const tag = label(`${a.distanceTo(b).toFixed(3)} m`);
    tag.position.copy(a).add(b).multiplyScalar(0.5);
    tag.scale.multiplyScalar(0.8);
    g.add(l, da, db, tag);
    results.add(g);
  }

  canvas.addEventListener('pointerdown', (e) => {
    if (active && e.isPrimary && e.button === 0) down = { x: e.clientX, y: e.clientY, t: performance.now() };
  });

  window.addEventListener('pointerup', (e) => {
    if (!active || !down) return;
    const click = Math.hypot(e.clientX - down.x, e.clientY - down.y) < 6 && performance.now() - down.t < 600;
    down = null;
    if (!click) return;                                  // it was an orbit drag
    const s = snapAt(e);
    if (!s) return;
    if (!first) {
      first = s.point.clone();
      onChange('Click the second point');
    } else {
      addResult(first, s.point);
      onChange(describe(first, s.point));
      first = null;
      preview.visible = false;
    }
    invalidate();
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!active || e.buttons) return;
    const s = snapAt(e);
    marker.visible = !!s;
    if (s) {
      marker.position.copy(s.point);
      marker.material.color.setHex(KIND_COLOUR[s.kind]);
      if (first) {
        preview.geometry.setFromPoints([first, s.point]);
        preview.visible = true;
        onChange(describe(first, s.point));
      }
    }
    invalidate();
  });

  function clear() {
    for (const g of [...results.children]) {
      results.remove(g);
      g.traverse((o) => { if (o.isLine) o.geometry.dispose(); if (o.isSprite && o.material.map !== tex) { o.material.map.dispose(); o.material.dispose(); } });
    }
    first = null;
    preview.visible = false;
    onChange(active ? 'Click the first point' : '');
    invalidate();
  }

  function setActive(on) {
    active = on;
    marker.visible = false;
    clear();
  }

  // Escape: drop a half-made measurement, or leave the tool
  function cancel() {
    if (first) { first = null; preview.visible = false; onChange('Click the first point'); invalidate(); }
    else setActive(false);
  }

  return { setActive, clear, cancel, get active() { return active; } };
}
