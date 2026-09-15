import * as THREE from 'three';
import { ROOM } from '../scene/spec.js';
import { ASSETS } from '../assets/build.js';
import { serialize } from '../assets/layouts.js';
import { findClashes } from '../assets/clash.js';

// Red boxes round every piece in a clash, and the list in the Add tab.
export function installClashes(app, { overlay, furniture, show, invalidate }) {
  const boxes = [];
  app.updateClashes = () => {
    const list = findClashes(serialize(furniture.items), ASSETS, ROOM);
    const involved = [...new Set(list.flatMap((c) => c.items))];
    while (boxes.length < involved.length) {
      const h = new THREE.Box3Helper(new THREE.Box3(), 0xd9480f);
      h.material.depthTest = false;
      h.material.toneMapped = false;
      h.renderOrder = 19;
      overlay.add(h);
      boxes.push(h);
    }
    boxes.forEach((h, k) => {
      const g = furniture.items[involved[k]];
      h.visible = !!g && show.clashes && show.furniture;
      if (g) { g.updateMatrixWorld(true); h.box.setFromObject(g); }
    });
    app.dock?.setClashes(list);
    invalidate();
  };
}
