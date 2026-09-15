import * as THREE from 'three';
import { L, W, H } from './spec.js';
import { matGhost } from './materials.js';

const centre = new THREE.Vector3(0, H / 2, 0);
const toCam = new THREE.Vector3();

// Walls between the camera and the room, and the ceiling from above, turn invisible but keep
// casting shadows. Hidden is not absent: `visible = false` would stop them casting, and the
// sun would pour through the slab. The ghost material writes neither colour nor depth.
export function createCutaway({ walls, ceiling, stuff }, show) {
  function swap(obj, ghost) {
    obj.traverse((o) => { if (o.isMesh) o.material = ghost ? matGhost : o.userData.mat; });
  }

  // returns true if anything changed
  // Decided from where the camera is, never from which view preset was last clicked: after
  // "Stand inside" and an orbit back out by hand, the walls must cut away again.
  return function update(camera) {
    let changed = false;
    toCam.copy(camera.position).sub(centre);
    const outside = Math.abs(camera.position.x) > L / 2 || Math.abs(camera.position.z) > W / 2;

    for (const wall of walls) {
      const g = show.cutaway && outside && wall.n.dot(toCam) > 0.15;
      if (g === wall.ghosted) continue;
      wall.ghosted = g;
      swap(wall.mesh, g);
      changed = true;
    }

    // standing in the room, the ceiling is always there; the toggle is for looking in from outside
    const within = !outside && camera.position.y < H;
    const cg = !within && (!show.ceiling || (show.cutaway && camera.position.y > H));
    if (cg !== ceiling.userData.ghosted) {
      ceiling.userData.ghosted = cg;
      swap(ceiling, cg);
      changed = true;
    }

    // pieces hung from the ceiling go with it: invisible from above, still shading the room
    for (const g of stuff?.children ?? []) {
      if (!g.userData.ceiling) continue;
      if (g.userData.ghosted === cg) continue;
      g.userData.ghosted = cg;
      swap(g, cg);
      changed = true;
    }
    return changed;
  };
}
