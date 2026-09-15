import * as THREE from 'three';
import { roomLit } from './roomlit.js';

// Colour management is on: hex values are sRGB and converted to linear for lighting.
const lit = (params) => roomLit(new THREE.MeshStandardMaterial(params));

// shell
export const matWall  = lit({ color: 0xf0eee9, roughness: 0.95, side: THREE.DoubleSide });
export const matFloor = lit({ color: 0xc4c3bd, roughness: 1 });
export const matCeil  = lit({ color: 0xf6f5f2, roughness: 1, side: THREE.DoubleSide });
export const matGlass = lit({
  color: 0xcfe0ea, roughness: 0.08, transparent: true, opacity: 0.24,
  depthWrite: false, side: THREE.DoubleSide
});
export const matFrame = lit({ color: 0xfbfbfa, roughness: 0.6 });
// writes neither colour nor depth, but the mesh stays visible so it still casts shadows
export const matGhost = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
export const matMural = lit({ color: 0x27333d, roughness: 0.95, side: THREE.DoubleSide });
export const matDoor  = lit({ color: 0xd9d5cc, roughness: 0.8 });

// drawn as-is, not lit and not tone mapped
export const matLine  = new THREE.LineBasicMaterial({ color: 0x23486f, toneMapped: false });
export const matEdge  = new THREE.LineBasicMaterial({ color: 0x4a5560, transparent: true, opacity: 0.55, toneMapped: false });
export const matNorth = new THREE.LineBasicMaterial({ color: 0x8a3b2f, toneMapped: false });
export const matTube  = new THREE.MeshBasicMaterial({ color: 0x4ae8f5, toneMapped: false });
export const matSwing = new THREE.LineBasicMaterial({ color: 0x8a3b2f, toneMapped: false, transparent: true, opacity: 0.8 });
export const matMeasure = new THREE.LineBasicMaterial({ color: 0xd9480f, depthTest: false, toneMapped: false });
export const matSelect = new THREE.LineBasicMaterial({ color: 0xf08c00, depthTest: false, toneMapped: false });

// fit-out, referenced by name from catalog.json
export const FIT = {
  dark:   lit({ color: 0x191d22, roughness: 0.75 }),
  metal:  lit({ color: 0x2b3137, roughness: 0.45, metalness: 0.35 }),
  sofa:   lit({ color: 0x3c444c, roughness: 0.95 }),
  rug:    lit({ color: 0x1d6b70, roughness: 1 }),
  screen: lit({ color: 0x0c1a26, roughness: 0.25, emissive: 0x123246, emissiveIntensity: 0.8 }),
  foam:   lit({ color: 0x23282d, roughness: 1 }),
  leaf:   lit({ color: 0x3c6b46, roughness: 0.9 }),
  pot:    lit({ color: 0x2c3238, roughness: 0.9 }),
  // pallet furniture: untreated pine, dark navy mattress fabric, a teal pillow
  pallet:  lit({ color: 0xc9a46f, roughness: 0.85 }),
  cushion: lit({ color: 0x1f2a3f, roughness: 1 }),
  teal:    lit({ color: 0x1f5c63, roughness: 1 }),
  // the yellow Kevlar woofer of a KRK Rokit
  cone:    lit({ color: 0xf2c230, roughness: 0.55 }),
  // heavy lined velour curtains
  curtain: lit({ color: 0x2e3a48, roughness: 1 }),
  // the listener's head at the best hearing spot: a pale marker that reads against the dark kit
  head:    lit({ color: 0xe8dcc8, roughness: 0.8 })
};

export const albedoOf = (m) => 0.2126 * m.color.r + 0.7152 * m.color.g + 0.0722 * m.color.b;
