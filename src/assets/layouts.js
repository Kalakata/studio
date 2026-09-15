// Named layouts in localStorage, plus the working arrangement so a reload never loses it.
// No three.js here: layouts are plain data, and this module is tested in node.

const KEY = 'studio.layouts.v1';
export const FORMAT = 'studio-layout';
const D2R = Math.PI / 180, R2D = 180 / Math.PI;
const round = (v, step) => Math.round(v / step) * step;

// one canonical form for comparing and storing: 0.1 mm, 0.001 deg, rotation in [-180, 180)
// A resizable piece (a fitted ceiling panel) also carries its own w and d.
export function normalize(items) {
  return items.map((it) => ({
    type: it.type,
    x: +round(it.x, 1e-4).toFixed(4),
    z: +round(it.z, 1e-4).toFixed(4),
    ry: +round((((it.ry || 0) % 360) + 540) % 360 - 180, 1e-3).toFixed(3),
    ...(it.w !== undefined ? { w: +round(it.w, 1e-4).toFixed(4), d: +round(it.d, 1e-4).toFixed(4) } : {}),
    // locked is the default: only an unlocked piece says so
    ...(it.locked === false ? { locked: false } : {}),
    // closed is the default: only an open curtain says so
    ...(it.open === true ? { open: true } : {})
  }));
}

// scene groups -> plain items (metres, degrees)
export function serialize(groups) {
  return normalize(groups.map((g) => ({
    type: g.userData.type, x: g.position.x, z: g.position.z, ry: g.rotation.y * R2D,
    ...(g.userData.resizable ? { w: g.userData.w, d: g.userData.d } : {}),
    locked: g.userData.locked !== false,
    open: g.userData.open === true
  })));
}

export const toRadians = (deg) => deg * D2R;

export function sameItems(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

// Accepts an exported file or a bare { items } object. Throws on anything unusable;
// unknown asset types are dropped and counted rather than failing the whole file.
export function parseLayout(data, knownTypes) {
  if (!data || typeof data !== 'object' || !Array.isArray(data.items)) {
    throw new Error('not a layout file: expected an object with an "items" list');
  }
  if (data.format && data.format !== FORMAT) throw new Error(`unknown format "${data.format}"`);
  const items = [];
  let dropped = 0;
  for (const it of data.items) {
    const sized = it && (it.w !== undefined || it.d !== undefined);
    const ok = it && typeof it.type === 'string' && Number.isFinite(it.x) && Number.isFinite(it.z) &&
      (it.ry === undefined || Number.isFinite(it.ry)) &&
      (!sized || (it.w > 0 && it.d > 0)) &&
      (it.locked === undefined || typeof it.locked === 'boolean') &&
      (it.open === undefined || typeof it.open === 'boolean');
    if (!ok) throw new Error('malformed item: ' + JSON.stringify(it));
    if (knownTypes && !knownTypes.has(it.type)) { dropped++; continue; }
    items.push({
      type: it.type, x: it.x, z: it.z, ry: it.ry || 0,
      ...(sized ? { w: it.w, d: it.d } : {}),
      ...(it.locked === false ? { locked: false } : {}),
      ...(it.open === true ? { open: true } : {})
    });
  }
  const name = typeof data.name === 'string' && data.name.trim() ? data.name.trim() : null;
  return { name, items, dropped };
}

export function exportLayout(name, items) {
  return { format: FORMAT, version: 1, name, savedAt: new Date().toISOString(), items };
}

function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
}

// storage: anything with getItem/setItem. Falls back to memory if it is missing or throws
// (private windows, blocked site data).
export function createStore(storage) {
  let store = storage;
  let data = { version: 1, layouts: {}, working: null };

  try {
    const raw = store?.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.version === 1 && parsed.layouts) data = { ...data, ...parsed };
    }
    if (!store) store = memoryStorage();
  } catch {
    store = memoryStorage();
  }

  let persisted = true;
  function flush() {
    try { store.setItem(KEY, JSON.stringify(data)); persisted = true; } catch { persisted = false; }
  }

  return {
    get persisted() { return persisted; },
    names: () => Object.keys(data.layouts).sort((a, b) => a.localeCompare(b)),
    has: (name) => Object.prototype.hasOwnProperty.call(data.layouts, name),
    get: (name) => data.layouts[name]?.items ?? null,

    save(name, items) {
      data.layouts[name] = { items, savedAt: new Date().toISOString() };
      flush();
    },
    remove(name) {
      delete data.layouts[name];
      if (data.working?.base === name) data.working.base = null;
      flush();
    },
    rename(from, to) {
      if (!this.has(from) || from === to) return;
      data.layouts[to] = data.layouts[from];
      delete data.layouts[from];
      if (data.working?.base === from) data.working.base = to;
      flush();
    },
    uniqueName(name) {
      if (!this.has(name)) return name;
      let i = 2;
      while (this.has(`${name} (${i})`)) i++;
      return `${name} (${i})`;
    },

    // the arrangement on screen, and the named layout it started from (null = default)
    get working() { return data.working; },
    setWorking(items, base) {
      data.working = { items, base: base ?? null };
      flush();
    }
  };
}
