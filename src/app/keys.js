import { ROOM } from '../scene/spec.js';
import { removeOpening } from '../scene/shellOps.js';

// Escape leaves the current tool; Delete removes the selected opening in the Shell tab;
// Ctrl/Cmd+Z and Ctrl+Shift+Z (or Ctrl+Y) undo and redo the shell there, the layout elsewhere.
// Text fields keep their own keys. (Furniture's R, Delete and Escape live in picking.js.)
export function installKeys(app) {
  window.addEventListener('keydown', (e) => {
    if (e.target.closest?.('input, select, textarea')) return;

    if (e.key === 'Escape' && app.measure.active) { app.measure.cancel(); return; }
    if (e.key === 'Escape' && app.state.sunmap) { app.setSunMap(false); return; }

    const sel = app.shellSelection;
    if (app.mode() === 'shell' && sel && sel.index >= 0) {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        app.selectOpening(null);
        app.applyRoom(removeOpening(ROOM, sel.wallId, sel.index));
        return;
      }
      if (e.key === 'Escape') { app.selectOpening(null); return; }
    }

    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    const k = e.key.toLowerCase();
    const undo = k === 'z' && !e.shiftKey, redo = (k === 'z' && e.shiftKey) || k === 'y';
    if (!undo && !redo) return;
    e.preventDefault();
    if (app.mode() === 'shell') undo ? app.shellUndo() : app.shellRedo();
    else undo ? app.layouts.undo() : app.layouts.redo();
  });
}
