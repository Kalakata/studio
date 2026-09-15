import { serialize, normalize, sameItems, parseLayout, exportLayout } from '../assets/layouts.js';
import { createHistory } from '../assets/history.js';

const $ = (id) => document.getElementById(id);

// The Layouts tab: pick, save, save as, rename, delete, export and import.
// `base` is what the arrangement on screen started from: null for the default layout,
// 'preset:<id>' for a built-in preset, otherwise the name of a saved layout. The default and
// the presets are read-only: saving one asks for a new name.
export function createLayoutsPanel({ store, furniture, defaultItems, presets = [], knownTypes, loadItems, initialBase }) {
  let base = initialBase ?? null;
  const pick = $('lay-pick'), status = $('lay-state'), file = $('lay-file');

  const presetOf = (b) => (b && b.startsWith('preset:') ? presets.find((p) => `preset:${p.id}` === b) ?? null : null);
  const isSaved = (b) => !!b && !presetOf(b);
  const itemsOf = (b) => presetOf(b)?.items ?? (b ? store.get(b) : defaultItems);
  const labelOf = (b) => presetOf(b)?.name ?? b ?? 'Mix room (default)';

  const current = () => serialize(furniture.items);
  const baseline = () => normalize(itemsOf(base) ?? defaultItems);
  const modified = () => !sameItems(current(), baseline());

  function say(text) { status.textContent = text; }

  function refresh(message) {
    pick.replaceChildren();
    const opt = (value, text) => { const o = document.createElement('option'); o.value = value; o.textContent = text; return o; };
    pick.append(opt('', 'Mix room (default)'));
    for (const p of presets) pick.append(opt(`preset:${p.id}`, `${p.name} (preset)`));
    for (const n of store.names()) pick.append(opt(n, n));
    pick.value = base ?? '';

    $('lay-rename').disabled = !isSaved(base);
    $('lay-delete').disabled = !isSaved(base);
    if (message) say(message);
    else say((modified() ? 'Unsaved changes' : 'Saved') + (store.persisted ? '' : ', but this browser is not keeping data'));
  }

  // ---- undo: every edit is a step; restoring a step goes through loadItems like any edit
  const history = createHistory();
  const undoBtn = $('act-undo'), redoBtn = $('act-redo');
  function refreshUndo() {
    undoBtn.disabled = !history.canUndo;
    redoBtn.disabled = !history.canRedo;
  }
  function step(state) {
    if (state) loadItems(state);
  }
  const undo = () => step(history.undo());
  const redo = () => step(history.redo());
  undoBtn.addEventListener('click', undo);
  redoBtn.addEventListener('click', redo);

  // Ctrl+Z / Ctrl+Shift+Z are bound in app/keys.js, which routes them to the shell or the layout

  // every edit: keep the working arrangement so a reload never loses it
  function changed() {
    const items = current();
    history.record(items);
    store.setWorking(items, base);
    refresh();
    refreshUndo();
  }

  function switchTo(value) {
    if (modified() && !confirm(`Discard unsaved changes to "${labelOf(base)}"?`)) {
      pick.value = base ?? '';
      return;
    }
    base = value || null;
    loadItems(itemsOf(base));
  }

  function askName(suggested) {
    const name = (prompt('Name this layout', suggested) || '').trim();
    return name || null;
  }

  function saveAs() {
    const suggested = isSaved(base) ? `${base} copy` : store.uniqueName(presetOf(base)?.name ?? 'Layout');
    const name = askName(suggested);
    if (!name) return;
    if (store.has(name) && !confirm(`Replace the saved layout "${name}"?`)) return;
    store.save(name, current());
    base = name;
    store.setWorking(current(), base);
    refresh(`Saved as "${name}"`);
  }

  pick.addEventListener('change', () => switchTo(pick.value));

  $('lay-save').addEventListener('click', () => {
    if (!isSaved(base)) return saveAs();
    store.save(base, current());
    refresh(`Saved "${base}"`);
  });
  $('lay-saveas').addEventListener('click', saveAs);

  $('lay-rename').addEventListener('click', () => {
    if (!isSaved(base)) return;
    const name = askName(base);
    if (!name || name === base) return;
    if (store.has(name)) { refresh(`"${name}" already exists`); return; }
    store.rename(base, name);
    base = name;
    refresh(`Renamed to "${name}"`);
  });

  $('lay-delete').addEventListener('click', () => {
    if (!isSaved(base) || !confirm(`Delete the saved layout "${base}"? The room stays as it is.`)) return;
    const gone = base;
    store.remove(gone);
    base = null;
    store.setWorking(current(), base);
    refresh(`Deleted "${gone}"`);
  });

  $('lay-export').addEventListener('click', () => {
    const name = labelOf(base);
    const blob = new Blob([JSON.stringify(exportLayout(name, current()), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name.replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() + '.json';
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    refresh(`Exported ${a.download}`);
  });

  $('lay-import').addEventListener('click', () => file.click());
  file.addEventListener('change', async () => {
    const f = file.files[0];
    file.value = '';
    if (!f) return;
    try {
      const parsed = parseLayout(JSON.parse(await f.text()), knownTypes);
      if (modified() && !confirm(`Discard unsaved changes to "${labelOf(base)}"?`)) return;
      const name = store.uniqueName(parsed.name || f.name.replace(/\.json$/i, ''));
      store.save(name, parsed.items);
      base = name;
      loadItems(parsed.items);
      refresh(`Imported "${name}"` + (parsed.dropped ? `, skipped ${parsed.dropped} unknown piece${parsed.dropped > 1 ? 's' : ''}` : ''));
    } catch (err) {
      refresh(`Could not import ${f.name}: ${err.message}`);
    }
  });

  history.reset(current());
  refresh();
  refreshUndo();
  return { changed, undo, redo, get base() { return base; } };
}
