import { createStore, parseLayout } from '../assets/layouts.js';
import { createLayoutsPanel } from '../ui/layouts.js';
import { coverCeiling } from '../assets/ceilingCover.js';
import { ROOM } from '../scene/spec.js';
import palletStudio from '../assets/presets/pallet-studio.json';
import conceptRender from '../assets/layout.json';

// built-in, read-only layouts offered in the picker next to the default (the Mix room, set in main.js)
const PRESET_FILES = [{ id: 'pallet-studio', file: palletStudio }, { id: 'concept', file: conceptRender }];

// Picks up where the last visit left off: the arrangement that was on screen and the layout it
// came from. Falls back to the default layout when there is nothing, or nothing readable.
export function startLayouts(app, { furniture, defaultItems, knownTypes }) {
  let storage = null;
  try { storage = window.localStorage; } catch { /* blocked: the store keeps it in memory */ }
  const store = createStore(storage);

  // a preset with coverCeiling gets panels fitted to the room's light fittings as they are now
  const presets = PRESET_FILES.map(({ id, file }) => ({
    id, name: file.name,
    items: [...parseLayout(file, knownTypes).items, ...(file.coverCeiling ? coverCeiling(ROOM) : [])]
  }));
  const known = (b) => store.has(b) || presets.some((p) => `preset:${p.id}` === b);

  let items = defaultItems, base = null;
  const working = store.working;
  if (working) {
    try {
      items = parseLayout(working, knownTypes).items;
      base = working.base && known(working.base) ? working.base : null;
    } catch { /* corrupt working copy: use the default */ }
  }
  furniture.load(items);                  // before the panel exists, so this is not an edit
  return createLayoutsPanel({ store, furniture, defaultItems, presets, knownTypes, loadItems: app.loadItems, initialBase: base });
}
