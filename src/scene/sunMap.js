import * as THREE from 'three';
import { ROOM, L, W, H, T, wallFrame } from './spec.js';
import { label } from './room.js';
import { footprint } from '../assets/clash.js';

// One-hue sequential ramp, light -> dark, built in OKLCH around the palette's orange (H 40.6):
// lightness strictly falling 0.95 -> 0.37. Orange rather than the default blue because blue
// already carries the UI's own controls and sun-hours read naturally as warm.
export const RAMP = ['#ffe9e2', '#fec5b1', '#fe9e7b', '#f5723f', '#d35722', '#9b411d', '#56372c'];
const PLATE = 0xf3f4f0, NO_SUN = 0xdcdfd7, INK = 0x1c2530, SOFT = 0x5e6a77;
const Y = 0.03;

const ramp = RAMP.map((h) => new THREE.Color(h));
export function rampColour(t, out = new THREE.Color()) {
  const x = Math.min(1, Math.max(0, t)) * (ramp.length - 1);
  const k = Math.min(ramp.length - 2, Math.floor(x));
  return out.copy(ramp[k]).lerp(ramp[k + 1], x - k);
}

// legend top: whole hours, never below one
export const scaleTop = (max) => Math.max(1, Math.ceil(max - 1e-6));

const title = (id) => id.charAt(0).toUpperCase() + id.slice(1);
export const surfaceName = (id) => (id === 'floor' ? 'Floor' : `${title(id)} wall`);

// The sun-hours plan: floor in the middle, each wall folded flat outward from its foot, on a
// light plate drawn over the model (overlay scene, no depth test).
export function createSunMap({ overlay, canvas, getCamera, onHover }) {
  const group = new THREE.Group();
  group.visible = false;
  overlay.add(group);
  const layers = new THREE.Group(), outlines = new THREE.Group();
  group.add(layers, outlines);

  const ink = new THREE.LineBasicMaterial({ color: INK, depthTest: false, toneMapped: false });
  const soft = new THREE.LineBasicMaterial({ color: SOFT, depthTest: false, toneMapped: false });
  let result = null, top = 1;

  const loop = (pts, mat, order) => {
    const l = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts.map(([x, z]) => new THREE.Vector3(x, Y, z))), mat);
    l.renderOrder = order;
    l.frustumCulled = false;
    return l;
  };
  const clear = (g) => {
    for (const c of [...g.children]) {
      g.remove(c);
      c.geometry?.dispose();
      if (c.material && c.material !== ink && c.material !== soft) { c.material.map?.dispose(); c.material.dispose(); }
    }
  };

  function build(res) {
    result = res;
    top = scaleTop(res.max);
    clear(layers);

    const reach = T + H, pad = 0.9;
    const plate = new THREE.Mesh(
      new THREE.PlaneGeometry(L + 2 * (reach + pad), W + 2 * (reach + pad)).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: PLATE, depthTest: false, depthWrite: false, toneMapped: false })
    );
    plate.position.y = Y;
    plate.renderOrder = 40;
    layers.add(plate);

    const count = res.grids.reduce((s, g) => s + g.hours.reduce((n, h) => n + (Number.isNaN(h) ? 0 : 1), 0), 0);
    const cells = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ depthTest: false, depthWrite: false, toneMapped: false }),
      count
    );
    cells.renderOrder = 41;
    cells.frustumCulled = false;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), c = new THREE.Color();
    let n = 0;
    for (const g of res.grids) {
      const widthAlongX = g.id === 'floor' || g.side.endsWith('z');
      for (let j = 0; j < g.rows; j++) {
        for (let i = 0; i < g.cols; i++) {
          const h = g.hours[i + j * g.cols];
          if (Number.isNaN(h)) continue;
          const [x, z] = g.plan(i, j);
          s.set(widthAlongX ? g.cellW : g.cellH, 1, widthAlongX ? g.cellH : g.cellW);
          cells.setMatrixAt(n, m.compose(p.set(x, Y, z), q, s));
          cells.setColorAt(n, h > 0 ? rampColour(h / top, c) : c.set(NO_SUN));
          n++;
        }
      }
    }
    layers.add(cells);

    // outlines: floor, each unfolded wall and its openings, partitions; a name on each wall
    layers.add(loop([[-L / 2, -W / 2], [L / 2, -W / 2], [L / 2, W / 2], [-L / 2, W / 2]], ink, 43));
    for (const wall of ROOM.walls) {
      const f = wallFrame(ROOM, wall), nn = f.normal;
      const P = (a, out) => [f.leftCorner[0] + f.along[0] * a + nn[0] * out, f.leftCorner[1] + f.along[2] * a + nn[2] * out];
      layers.add(loop([P(0, T), P(f.length, T), P(f.length, T + H), P(0, T + H)], ink, 43));
      for (const o of wall.openings) {
        layers.add(loop([P(o.left, T + o.sill), P(o.left + o.width, T + o.sill), P(o.left + o.width, T + o.head), P(o.left, T + o.head)], soft, 43));
      }
      const tag = label(surfaceName(wall.id));
      const [x, z] = P(f.length / 2, T + H + 0.45);
      tag.position.set(x, Y, z);
      tag.renderOrder = 45;
      layers.add(tag);
    }
    for (const part of ROOM.partitions) {
      const dx = part.to[0] - part.from[0], dz = part.to[1] - part.from[1], len = Math.hypot(dx, dz) || 1;
      const px = -dz / len * part.thickness / 2, pz = dx / len * part.thickness / 2;
      layers.add(loop([[part.from[0] + px, part.from[1] + pz], [part.to[0] + px, part.to[1] + pz], [part.to[0] - px, part.to[1] - pz], [part.from[0] - px, part.from[1] - pz]], ink, 43));
    }
  }

  // furniture footprints for reference; they are not counted as shade
  function setFurniture(items, assets) {
    clear(outlines);
    for (const it of items) {
      const a = assets[it.type];
      if (a && a.clash !== false && a.mount !== 'ceiling') outlines.add(loop(footprint(it, a).poly, soft, 44));
    }
  }

  function sampleAt(x, z) {
    if (!result) return null;
    for (const g of result.grids) {
      let a, b;
      if (g.id === 'floor') {
        a = x + L / 2; b = z + W / 2;
        if (a < 0 || a >= L || b < 0 || b >= W) continue;
      } else {
        const f = g.frame, nn = f.normal, dx = x - f.leftCorner[0], dz = z - f.leftCorner[1];
        a = dx * f.along[0] + dz * f.along[2];
        b = dx * nn[0] + dz * nn[2] - T;
        if (a < 0 || a >= f.length || b < 0 || b >= H) continue;
      }
      const i = Math.min(g.cols - 1, Math.floor(a / g.cellW)), j = Math.min(g.rows - 1, Math.floor(b / g.cellH));
      return { surface: g.id, hours: g.hours[i + j * g.cols] };
    }
    return null;
  }

  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -Y), hit = new THREE.Vector3();
  canvas.addEventListener('pointermove', (e) => {
    if (!group.visible || e.buttons) return;
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, getCamera());
    onHover(ray.ray.intersectPlane(plane, hit) ? sampleAt(hit.x, hit.z) : null);
  });

  return { group, build, setFurniture, sampleAt, get top() { return top; } };
}
