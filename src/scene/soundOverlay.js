import * as THREE from 'three';
import { ROOM, L, W, wallFrame } from './spec.js';
import { footprint } from '../assets/clash.js';

// Ramps, sRGB hex. Evenness is one hue, light where the bass is even and dark where it swings. Level and
// mode share a diverging pair: blue below the room average (or one phase), red above (or the other),
// grey for nothing.
export const EVEN_RAMP = ['#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#256abf', '#184f95', '#0d366b'];
export const DIVERGING = ['#1c5cab', '#5598e7', '#b7d3f6', '#f0efec', '#f3b8b6', '#e87574', '#b83232'];
export const VERDICT_COLOUR = { problem: '#e34948', quiet: '#1f9d55', late: '#8a939c', blocked: '#b9bfc6' };
export const cssGradient = (ramp) => `linear-gradient(to right,${ramp.join(',')})`;

const cache = new Map();
export function rampAt(ramp, t, out = new THREE.Color()) {
  if (!cache.has(ramp)) cache.set(ramp, ramp.map((h) => new THREE.Color(h)));
  const cs = cache.get(ramp), x = Math.min(1, Math.max(0, t)) * (cs.length - 1);
  const k = Math.min(cs.length - 2, Math.floor(x));
  return out.copy(cs[k]).lerp(cs[k + 1], x - k);
}

const INK = 0x1c2530, SOFT = 0x5e6a77, Y = 0.03;

// A small tag for a reflection: delay and level, outlined in the verdict's colour.
function tag(text, colour) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#f3f4f0'; g.strokeStyle = colour; g.lineWidth = 5;
  g.beginPath(); g.roundRect(4, 6, 248, 52, 8); g.fill(); g.stroke();
  g.fillStyle = '#1c2530'; g.font = '600 30px Archivo, Helvetica, Arial, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 128, 33);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true, toneMapped: false }));
  s.scale.set(0.64, 0.16, 1);
  s.renderOrder = 36;
  return s;
}

const dispose = (group, keep) => {
  for (const c of [...group.children]) {
    group.remove(c);
    c.traverse((o) => {
      if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose();
      if (o.material && !keep.has(o.material)) { o.material.map?.dispose(); o.material.dispose(); }
    });
  }
};

// Reflection paths drawn through the room, and a floor plan of a sound quantity drawn over it.
export function createSoundOverlay({ overlay, canvas, getCamera, onHover }) {
  const rays = new THREE.Group(), plan = new THREE.Group();
  rays.visible = plan.visible = false;
  overlay.add(plan, rays);

  const lineMat = Object.fromEntries(Object.entries(VERDICT_COLOUR).map(([k, hex]) => [k,
    new THREE.LineBasicMaterial({ color: hex, depthTest: false, transparent: true, opacity: k === 'blocked' ? 0.55 : 0.95, toneMapped: false })]));
  const dotMat = Object.fromEntries(Object.entries(VERDICT_COLOUR).map(([k, hex]) => [k,
    new THREE.MeshBasicMaterial({ color: hex, depthTest: false, toneMapped: false })]));
  const ink = new THREE.LineBasicMaterial({ color: INK, depthTest: false, toneMapped: false });
  const soft = new THREE.LineBasicMaterial({ color: SOFT, depthTest: false, toneMapped: false });
  const inkFill = new THREE.MeshBasicMaterial({ color: INK, depthTest: false, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
  const keep = new Set([...Object.values(lineMat), ...Object.values(dotMat), ink, soft, inkFill]);
  const DOT = new THREE.SphereGeometry(0.045, 12, 8);
  DOT.userData.shared = true;

  function setRays(paths) {
    dispose(rays, keep);
    for (const p of paths) {
      const pts = p.points.map((q) => new THREE.Vector3(...q));
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lineMat[p.verdict]);
      line.renderOrder = 34;
      line.frustumCulled = false;
      const dot = new THREE.Mesh(DOT, dotMat[p.verdict]);
      dot.position.copy(pts[1]);
      dot.renderOrder = 35;
      rays.add(line, dot);
      if (p.verdict !== 'blocked') {
        const t = tag(`${Math.round(p.delayMs)} ms, ${Math.round(p.levelDb)} dB`, VERDICT_COLOUR[p.verdict]);
        t.position.copy(pts[1]).lerp(pts[2], 0.1);            // just off the surface, towards the head
        rays.add(t);
      }
    }
  }

  const loop = (pts, mat, order) => {
    const l = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts.map(([x, z]) => new THREE.Vector3(x, Y, z))), mat);
    l.renderOrder = order;
    l.frustumCulled = false;
    return l;
  };
  const disc = (x, z, r0, r1, order) => {
    const m = new THREE.Mesh(new THREE.RingGeometry(r0, r1, 32).rotateX(-Math.PI / 2), inkFill);
    m.position.set(x, Y, z);
    m.renderOrder = order;
    return m;
  };

  let map = null;
  // map: from soundViews (bassMap or modeMap); colour(value) -> THREE.Color; marks: the listening setup and
  // the evenest spot; items and assets for furniture outlines
  function setPlan(next, { colour, items = [], assets = {}, setup = null, best = null } = {}) {
    dispose(plan, keep);
    map = next;
    if (!map) return;
    // the floor only, no plate: the room's own walls frame it
    const cells = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ depthTest: false, depthWrite: false, toneMapped: false }), map.cols * map.rows);
    cells.renderOrder = 41;
    cells.frustumCulled = false;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(map.cellW, 1, map.cellD), p = new THREE.Vector3(), c = new THREE.Color();
    for (let j = 0; j < map.rows; j++) {
      for (let i = 0; i < map.cols; i++) {
        const k = i + j * map.cols;
        cells.setMatrixAt(k, m.compose(p.set(-L / 2 + (i + 0.5) * map.cellW, Y, -W / 2 + (j + 0.5) * map.cellD), q, s));
        cells.setColorAt(k, colour(map.values[k], c));
      }
    }
    plan.add(cells);

    plan.add(loop([[-L / 2, -W / 2], [L / 2, -W / 2], [L / 2, W / 2], [-L / 2, W / 2]], ink, 43));
    // each opening as a short bar just outside its wall
    for (const wall of ROOM.walls) {
      const f = wallFrame(ROOM, wall), n = f.normal;
      for (const o of wall.openings) {
        const at = (a, out) => [f.leftCorner[0] + f.along[0] * a + n[0] * out, f.leftCorner[1] + f.along[2] * a + n[2] * out];
        plan.add(loop([at(o.left, 0.05), at(o.left + o.width, 0.05), at(o.left + o.width, 0.15), at(o.left, 0.15)], soft, 43));
      }
    }
    for (const it of items) {
      const a = assets[it.type];
      if (a && a.clash !== false && a.mount !== 'ceiling') plan.add(loop(footprint(it, a).poly, soft, 44));
    }
    if (setup) {
      for (const [x, , z] of setup.monitors) plan.add(disc(x, z, 0, 0.09, 45));
      plan.add(disc(setup.ear[0], setup.ear[2], 0.1, 0.15, 45));
    }
    if (best) plan.add(disc(best.x, best.z, 0.2, 0.25, 45));
  }

  function sampleAt(x, z) {
    if (!map || Math.abs(x) >= L / 2 || Math.abs(z) >= W / 2) return null;
    const i = Math.min(map.cols - 1, Math.floor((x + L / 2) / map.cellW));
    const j = Math.min(map.rows - 1, Math.floor((z + W / 2) / map.cellD));
    return { x, z, value: map.values[i + j * map.cols] };
  }

  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  const floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), -Y), hit = new THREE.Vector3();
  canvas.addEventListener('pointermove', (e) => {
    if (!plan.visible || e.buttons) return;
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, getCamera());
    onHover(ray.ray.intersectPlane(floor, hit) ? sampleAt(hit.x, hit.z) : null);
  });

  return { rays, plan, setRays, setPlan, sampleAt };
}
