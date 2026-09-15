import * as THREE from 'three';

// one unit cube, scaled per use — reused ~90 times
export const UNIT = new THREE.BoxGeometry(1, 1, 1);

export function box(w, h, d, x, y, z, mat) {
  const m = new THREE.Mesh(UNIT, mat);
  m.scale.set(w, h, d);
  m.position.set(x, y, z);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}
