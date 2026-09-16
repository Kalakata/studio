import * as THREE from 'three';

// The floor as the site photo shows it: square terracotta-brown ceramic tiles, mottled, with thin dark
// grout. Drawn once into a canvas as a block of tiles (each a slightly different tone, so the repeat
// does not show) and repeated across the floor. Browser only.
export const TILE = 0.33;                        // metres, one tile with its joint
const BLOCK = 4;                                 // tiles along each side of the drawn block
const PX = 256;                                  // pixels per tile

// sRGB base tones: the photo's terracotta brown, lifted from its dim exposure to a red-brown ceramic
// tile's usual light reflectance (about 15%), dark to light
const TONES = [[140, 66, 46], [156, 75, 52], [170, 84, 58], [182, 94, 64]];
const GROUT = [58, 34, 26];

// Luminance of the tiles as a reflectance, for the daylight bounce and the lighting model: about 14%.
export const TILE_ALBEDO = 0.14;

let rng = 1;
const random = () => ((rng = (rng * 16807) % 2147483647) - 1) / 2147483646;

export function tileTexture({ floorLength, floorWidth }) {
  const size = BLOCK * PX, c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  rng = 12345;                                    // the same floor every time
  for (let j = 0; j < BLOCK; j++) {
    for (let i = 0; i < BLOCK; i++) {
      const [r, gr, b] = TONES[Math.floor(random() * TONES.length)];
      g.fillStyle = `rgb(${r},${gr},${b})`;
      g.fillRect(i * PX, j * PX, PX, PX);
      // mottling: soft blotches a little lighter and darker than the base
      for (let k = 0; k < 90; k++) {
        const x = i * PX + random() * PX, y = j * PX + random() * PX, rad = 6 + random() * 38;
        const shift = (random() - 0.5) * 34;
        const grad = g.createRadialGradient(x, y, 0, x, y, rad);
        grad.addColorStop(0, `rgba(${r + shift | 0},${gr + shift * 0.5 | 0},${b + shift * 0.35 | 0},0.35)`);
        grad.addColorStop(1, `rgba(${r},${gr},${b},0)`);
        g.fillStyle = grad;
        g.fillRect(i * PX, j * PX, PX, PX);
      }
      // fine speckle
      for (let k = 0; k < 1400; k++) {
        const v = random() < 0.5 ? 0 : 255, a = 0.05 + random() * 0.07;
        g.fillStyle = `rgba(${v},${v},${v},${a})`;
        g.fillRect(i * PX + random() * PX, j * PX + random() * PX, 1.5, 1.5);
      }
    }
  }
  // grout: a dark line round every tile, about 3 mm
  const grout = Math.max(2, Math.round(PX * 0.003 / TILE * 1.5));
  g.fillStyle = `rgb(${GROUT.join(',')})`;
  for (let k = 0; k <= BLOCK; k++) {
    g.fillRect(k * PX - grout / 2, 0, grout, size);
    g.fillRect(0, k * PX - grout / 2, size, grout);
  }

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  t.repeat.set(floorLength / (BLOCK * TILE), floorWidth / (BLOCK * TILE));
  return t;
}
