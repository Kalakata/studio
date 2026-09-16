// Walking around inside the room with the keyboard: W A S D or the arrow keys, Shift to go faster.
// Movement follows where the camera looks, flattened onto the floor, at a steady eye height, and stops
// short of the walls. The camera and the point it looks at move together, so the view keeps its
// direction. No three.js state here beyond vectors; tested in node.

export const WALK_SPEED = 1.4;       // m/s, an easy walking pace
export const RUN_SPEED = 3.2;        // m/s with Shift
export const WALL_GAP = 0.25;        // how close to a wall you can stand

const KEYS = {
  w: 'forward', arrowup: 'forward', s: 'back', arrowdown: 'back',
  a: 'left', arrowleft: 'left', d: 'right', arrowright: 'right'
};
export const walkAction = (key) => KEYS[String(key).toLowerCase()] ?? null;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// position, target: {x, y, z} (THREE.Vector3), moved in place. held: Set of actions. dt: seconds.
// room: { length, width }. Returns true if the camera moved.
export function walkStep(position, target, held, dt, { length, width, run = false }) {
  let fx = target.x - position.x, fz = target.z - position.z;
  const n = Math.hypot(fx, fz);
  if (n < 1e-9) return false;
  fx /= n; fz /= n;
  const rx = -fz, rz = fx;                          // right of forward, with y up
  let mx = 0, mz = 0;
  if (held.has('forward')) { mx += fx; mz += fz; }
  if (held.has('back')) { mx -= fx; mz -= fz; }
  if (held.has('right')) { mx += rx; mz += rz; }
  if (held.has('left')) { mx -= rx; mz -= rz; }
  const m = Math.hypot(mx, mz);
  if (m < 1e-9) return false;
  const step = (run ? RUN_SPEED : WALK_SPEED) * Math.min(dt, 0.1) / m;
  const nx = clamp(position.x + mx * step, -length / 2 + WALL_GAP, length / 2 - WALL_GAP);
  const nz = clamp(position.z + mz * step, -width / 2 + WALL_GAP, width / 2 - WALL_GAP);
  const dx = nx - position.x, dz = nz - position.z;
  position.x = nx; position.z = nz;
  target.x += dx; target.z += dz;
  return Math.abs(dx) > 1e-12 || Math.abs(dz) > 1e-12;
}

// Looking around with the mouse, the way a game does: the pointer is hidden and each movement turns
// the head where it stands. dx, dy: mouse movement in pixels (right and down are positive).
export const LOOK_SPEED = 0.0025;    // radians per pixel
export const MAX_PITCH = 85 * Math.PI / 180;

export function lookStep(position, target, dx, dy, speed = LOOK_SPEED) {
  const ox = target.x - position.x, oy = target.y - position.y, oz = target.z - position.z;
  const r = Math.hypot(ox, oy, oz);
  if (r < 1e-9) return;
  const yaw = Math.atan2(oz, ox) + dx * speed;
  const pitch = clamp(Math.asin(clamp(oy / r, -1, 1)) - dy * speed, -MAX_PITCH, MAX_PITCH);
  target.x = position.x + r * Math.cos(pitch) * Math.cos(yaw);
  target.y = position.y + r * Math.sin(pitch);
  target.z = position.z + r * Math.cos(pitch) * Math.sin(yaw);
}
