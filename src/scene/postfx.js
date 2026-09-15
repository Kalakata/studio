import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// GTAO renders its depth/normal buffer with a scene-wide override material, which would turn
// the invisible cut-away walls, the glass, the sky dome and the labels back into occluders.
// Hide them for that pass. (Extends GTAOPass internals; pinned by package-lock.)
class RoomGTAOPass extends GTAOPass {
  _overrideVisibility() {
    super._overrideVisibility();
    const cache = this._visibilityCache;
    this.scene.traverse((o) => {
      if (!o.visible) return;
      const m = o.material;
      if (o.isSprite || o.userData.noAO || (o.isMesh && (m.transparent || m.colorWrite === false))) {
        o.visible = false;
        cache.push(o);
      }
    });
  }
}

// Full path: scene -> GTAO -> ACES + sRGB. Renders only when asked, like everything else.
export function createPost(renderer, scene, camera) {
  const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));

  const gtao = new RoomGTAOPass(scene, camera, 1, 1);
  // A tight world radius keeps AO to contact shadows; the heavier denoise removes the dither
  // grain that otherwise rings the acoustic panels and the plant.
  gtao.updateGtaoMaterial({ radius: 0.3, distanceExponent: 1, thickness: 1, scale: 1, samples: 24 });
  gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 12, radiusExponent: 1, rings: 4, samples: 32 });
  // Half strength: GTAO leaves dotted speckle along silhouettes (panel edges, plant, chair legs)
  // that denoise settings and MSAA changes did not remove. Fainter is the agreed compromise.
  gtao.blendIntensity = 0.5;
  composer.addPass(gtao);
  composer.addPass(new OutputPass());

  return {
    enabled: true,
    gtao,
    composer,
    setSize(w, h, pixelRatio) { composer.setPixelRatio(pixelRatio); composer.setSize(w, h); },
    render() { composer.render(); }
  };
}
