import * as THREE from 'three';
import { ROOM, L, W, H, T, wallFrame } from './spec.js';
import { box, UNIT } from './prims.js';
import {
  matWall, matFloor, matCeil, matGlass, matFrame, matLine, matEdge, matNorth, matMural, matTube, matDoor, matSwing, FIT
} from './materials.js';

const FINISH = { plaster: matWall, mural: matMural };

// A wall as an extruded outline with the openings cut through it, so sunlight passes.
// Built in the XY plane, width centred on x = 0, extruded T towards +z (outward).
function wallPanel(width, height, holes, faceMat) {
  const g = new THREE.Group();
  const shape = new THREE.Shape();
  shape.moveTo(-width / 2, 0); shape.lineTo(width / 2, 0);
  shape.lineTo(width / 2, height); shape.lineTo(-width / 2, height); shape.lineTo(-width / 2, 0);

  for (const h of holes) {
    const p = new THREE.Path(), a = h.x - h.w / 2, b = h.x + h.w / 2;
    p.moveTo(a, h.y0); p.lineTo(b, h.y0); p.lineTo(b, h.y1); p.lineTo(a, h.y1); p.lineTo(a, h.y0);
    shape.holes.push(p);
  }

  const panel = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: T, bevelEnabled: false }), faceMat);
  panel.castShadow = true; panel.receiveShadow = true;
  g.add(panel);

  const { bar: f, depth, sill: sd } = ROOM.windowFrame;
  for (const h of holes) {
    const hh = h.y1 - h.y0, cy = (h.y0 + h.y1) / 2, z = T / 2;
    const bar = (w, hgt, x, y) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, hgt, depth), matFrame);
      m.position.set(x, y, z); m.castShadow = true; g.add(m);
    };

    if (h.type === 'door') {
      bar(h.w, f, h.x, h.y1 - f / 2);
      bar(f, hh, h.x - h.w / 2 + f / 2, cy);
      bar(f, hh, h.x + h.w / 2 - f / 2, cy);
      // drawn closed: an opaque leaf between the jambs
      const leaf = new THREE.Mesh(new THREE.BoxGeometry(h.w - 2 * f, hh - f, 0.04), matDoor);
      leaf.position.set(h.x, h.y0 + (hh - f) / 2, z);
      leaf.castShadow = true; leaf.receiveShadow = true;
      g.add(leaf);
      continue;
    }

    const glass = new THREE.Mesh(new THREE.PlaneGeometry(h.w - f, hh - f), matGlass);
    glass.position.set(h.x, cy, z);
    g.add(glass);

    bar(h.w, f, h.x, h.y0 + f / 2);
    bar(h.w, f, h.x, h.y1 - f / 2);
    bar(f, hh, h.x - h.w / 2 + f / 2, cy);
    bar(f, hh, h.x + h.w / 2 - f / 2, cy);
    bar(f * 0.7, hh - f * 2, h.x, cy);

    const sill = new THREE.Mesh(new THREE.BoxGeometry(h.w + 2 * sd.overhang, sd.height, T + sd.projection), matFrame);
    sill.position.set(h.x, h.y0 - sd.height / 2, T / 2 - sd.projection / 2);
    sill.castShadow = true; sill.receiveShadow = true;
    g.add(sill);
  }

  g.traverse((o) => { if (o.isMesh) o.userData.mat = o.material; });
  return g;
}

// Plan symbol for a door: the leaf's quarter-circle sweep into the room, on the floor.
function doorSwing(f, o) {
  const nIn = f.normal.map((v) => -v);
  const right = o.swing === 'right';
  const hinge = right ? o.left + o.width : o.left;
  const dir = right ? -1 : 1;
  const hx = f.leftCorner[0] + f.along[0] * hinge, hz = f.leftCorner[1] + f.along[2] * hinge;
  const pts = [new THREE.Vector3(hx, 0.01, hz)];
  for (let k = 0; k <= 16; k++) {
    const t = (k / 16) * Math.PI / 2, c = Math.cos(t) * dir, s = Math.sin(t);
    pts.push(new THREE.Vector3(hx + (f.along[0] * c + nIn[0] * s) * o.width, 0.01, hz + (f.along[2] * c + nIn[2] * s) * o.width));
  }
  pts.push(pts[0].clone());
  return new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), matSwing);
}

function partitionMesh(p) {
  const dx = p.to[0] - p.from[0], dz = p.to[1] - p.from[1];
  const m = box(Math.hypot(dx, dz), p.height, p.thickness, (p.from[0] + p.to[0]) / 2, p.height / 2, (p.from[1] + p.to[1]) / 2, matWall);
  m.rotation.y = Math.atan2(-dz, dx);
  return m;
}

export function label(text, small) {
  const c = document.createElement('canvas');
  c.width = 320; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#f3f4f0'; g.strokeStyle = small ? '#8a3b2f' : '#23486f'; g.lineWidth = 3;
  const w = 300, h = 76, x = 10, y = 26;
  g.beginPath(); g.rect(x, y, w, h); g.fill(); g.stroke();
  g.fillStyle = '#1c2530';
  g.font = '600 50px Archivo, Helvetica, Arial, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, x + w / 2, y + h / 2 + 2);
  const tex = new THREE.CanvasTexture(c); tex.anisotropy = 4;
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true, toneMapped: false }));
  s.scale.set(small ? 0.7 : 1.25, small ? 0.28 : 0.5, 1);
  s.renderOrder = 10;
  return s;
}

const line = (pts) => new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), matLine);

function dimension(a, b, tick) {
  const g = new THREE.Group();
  g.add(line([a, b]));
  const t = tick.clone().multiplyScalar(0.16);
  g.add(line([a.clone().sub(t), a.clone().add(t)]));
  g.add(line([b.clone().sub(t), b.clone().add(t)]));
  const txt = label(a.distanceTo(b).toFixed(2) + ' m');
  txt.position.copy(a.clone().add(b).multiplyScalar(0.5)).add(tick.clone().multiplyScalar(0.42));
  g.add(txt);
  return g;
}

function buildLights() {
  const leds = new THREE.Group();
  const { battens, strips, lamps } = ROOM.lighting;
  const noShadow = (m) => { m.castShadow = false; m.receiveShadow = false; return m; };

  for (const [x, z] of battens.at) {
    leds.add(box(...battens.housing, x, H - battens.housingBelowCeiling, z, FIT.dark));
    leds.add(noShadow(box(...battens.tube, x, H - battens.tubeBelowCeiling, z, matTube)));
  }
  for (const s of strips) leds.add(noShadow(box(...s.size, ...s.at, matTube)));

  // Decorative LED tubes, in the same units as daylight (see daylightMath W_PER_UNIT): a few
  // tens of lux at the floor, so they vanish at noon and carry the room at night.
  for (const l of lamps) {
    const lamp = new THREE.PointLight(new THREE.Color(l.colour), l.intensity * 0.12, l.range, 1);
    lamp.position.set(l.at[0], H - l.belowCeiling, l.at[1]);
    leds.add(lamp);
  }
  return leds;
}

const disposeTree = (obj) => obj.traverse((o) => {
  if ((o.isMesh || o.isLine) && o.geometry !== UNIT) o.geometry.dispose();
});

export function buildRoom(scene, show) {
  const hx = L / 2, hz = W / 2;
  const room = new THREE.Group();
  scene.add(room);

  room.add(box(L + T * 2, T, W + T * 2, 0, -T / 2, 0, matFloor));

  // Walls, openings and partitions come from the live ROOM and are rebuilt when it is edited.
  // `walls` is filled in place so the cutaway keeps its reference.
  const shell = new THREE.Group();
  room.add(shell);
  const swings = new THREE.Group();          // door sweeps: drawn in the overlay scene
  swings.visible = show.dims;
  const walls = [];

  function rebuildShell() {
    for (const c of [...shell.children]) { shell.remove(c); disposeTree(c); }
    for (const c of [...swings.children]) { swings.remove(c); disposeTree(c); }
    walls.length = 0;
    for (const wall of ROOM.walls) {
      const f = wallFrame(ROOM, wall);
      const mesh = wallPanel(f.span, H, f.holes, FINISH[wall.finish] || matWall);
      mesh.position.set(...f.position);
      mesh.rotation.y = f.rotationY;
      shell.add(mesh);
      walls.push({ id: wall.id, n: new THREE.Vector3(...f.normal), mesh, ghosted: false });
      for (const o of wall.openings) if (o.type === 'door') swings.add(doorSwing(f, o));
    }
    for (const p of ROOM.partitions) shell.add(partitionMesh(p));
  }
  rebuildShell();

  const ceiling = box(L + T * 2, T, W + T * 2, 0, H + T / 2, 0, matCeil);
  ceiling.userData.mat = matCeil;
  ceiling.userData.ghosted = false;
  room.add(ceiling);

  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(L, H, W)), matEdge);
  edges.position.y = H / 2;
  room.add(edges);

  const gridSize = Math.ceil(Math.max(L, W) / 2) * 2;
  const grid = new THREE.GridHelper(gridSize, gridSize, 0x7d8a96, 0x9aa49a);
  grid.position.y = 0.004;
  grid.material.transparent = true; grid.material.opacity = 0.45; grid.material.toneMapped = false;
  grid.visible = show.grid;
  room.add(grid);

  const dims = new THREE.Group();
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  dims.add(dimension(V(-hx, 0.01, hz + 0.9), V(hx, 0.01, hz + 0.9), V(0, 0, 1)));
  dims.add(dimension(V(hx + 0.9, 0.01, -hz), V(hx + 0.9, 0.01, hz), V(1, 0, 0)));
  dims.add(dimension(V(-hx - 0.5, 0, hz + 0.5), V(-hx - 0.5, H, hz + 0.5), V(0, 0, 1)));
  dims.visible = show.dims;

  const north = new THREE.Group();
  north.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([V(0, 0.02, 0), V(0, 0.02, -1.5)]), matNorth));
  const tip = label('N', true);
  tip.position.set(0, 0.35, -1.85);
  north.add(tip);            // dims, north and swings go into the overlay scene: see main.js

  const stuff = new THREE.Group();
  stuff.visible = show.furniture;
  room.add(stuff);

  const leds = buildLights();
  leds.visible = show.lights;
  room.add(leds);

  return { room, walls, ceiling, grid, dims, north, swings, shell, stuff, leds, rebuildShell };
}
