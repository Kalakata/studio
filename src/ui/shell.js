import { setOpening, removeOpening, addOpening, addPartition, setPartition, removePartition } from '../scene/shellOps.js';

const $ = (id) => document.getElementById(id);
const title = (id) => id.charAt(0).toUpperCase() + id.slice(1) + ' wall';

// The Shell tab: pick a wall, edit its openings by number, add windows, doors and partitions,
// and save the result to room.json.
export function createShellPanel(app) {
  const wallPick = $('shell-wall'), openingList = $('shell-openings'), partitionList = $('shell-partitions');
  const status = $('shell-state');
  const saveBtn = $('shell-save'), revertBtn = $('shell-revert'), undoBtn = $('shell-undo'), redoBtn = $('shell-redo');
  saveBtn.textContent = import.meta.env.DEV ? 'Save room.json' : 'Download room.json';

  let wallId = app.getRoom().walls[0].id;

  function field(key, caption, value, commit, disabled) {
    const wrap = document.createElement('label');
    wrap.className = 'field';
    const cap = document.createElement('span');
    cap.textContent = caption;
    const input = document.createElement('input');
    Object.assign(input, { type: 'number', step: '0.001', inputMode: 'decimal', value: String(value), disabled: !!disabled });
    input.dataset.key = key;
    input.addEventListener('change', () => {
      const v = parseFloat(input.value);
      if (Number.isFinite(v)) commit(v); else input.value = String(value);
    });
    wrap.append(cap, input);
    return wrap;
  }

  function button(text, onClick, className, aria) {
    const b = document.createElement('button');
    b.textContent = text;
    if (className) b.className = className;
    if (aria) b.setAttribute('aria-label', aria);
    b.addEventListener('click', onClick);
    return b;
  }

  function refresh(message) {
    // re-rendering replaces the inputs: keep focus on the same field (e.g. after Tab)
    const focused = document.activeElement?.dataset?.key;
    const room = app.getRoom(), sel = app.shellSelection;
    if (sel) wallId = sel.wallId;
    const wall = room.walls.find((w) => w.id === wallId) ?? room.walls[0];
    wallId = wall.id;

    wallPick.replaceChildren(...room.walls.map((w) => {
      const o = document.createElement('option');
      o.value = w.id;
      o.textContent = `${title(w.id)} (${w.openings.length} opening${w.openings.length === 1 ? '' : 's'})`;
      return o;
    }));
    wallPick.value = wallId;

    const count = { window: 0, door: 0 };
    openingList.replaceChildren(...wall.openings.map((o, i) => {
      const row = document.createElement('div');
      row.className = 'orow' + (sel && sel.wallId === wall.id && sel.index === i ? ' selected' : '');
      const name = `${o.type === 'door' ? 'Door' : 'Window'} ${++count[o.type]}`;
      const set = (patch) => app.applyRoom(setOpening(app.getRoom(), wall.id, i, patch));
      const k = `${wall.id}-${i}-`;
      row.append(
        button(name, () => app.selectOpening({ wallId: wall.id, index: i }), 'oname'),
        field(k + 'left', 'left', o.left, (v) => set({ left: v })),
        field(k + 'width', 'width', o.width, (v) => set({ width: v })),
        field(k + 'sill', 'sill', o.sill, (v) => set({ sill: v }), o.type === 'door'),
        field(k + 'head', 'head', o.head, (v) => set({ head: v }))
      );
      if (o.type === 'door') {
        const swing = document.createElement('select');
        swing.setAttribute('aria-label', 'Hinge side');
        for (const side of ['left', 'right']) {
          const opt = document.createElement('option');
          opt.value = side; opt.textContent = `hinge ${side}`;
          swing.append(opt);
        }
        swing.value = o.swing;
        swing.addEventListener('change', () => set({ swing: swing.value }));
        row.append(swing);
      }
      row.append(button('✕', () => {
        app.selectOpening(null);
        app.applyRoom(removeOpening(app.getRoom(), wall.id, i));
      }, 'ghost oremove', `Remove ${name.toLowerCase()}`));
      return row;
    }));

    partitionList.replaceChildren(...room.partitions.map((p, i) => {
      const row = document.createElement('div');
      row.className = 'orow prow';
      const set = (patch) => app.applyRoom(setPartition(app.getRoom(), i, patch));
      const k = `partition-${i}-`;
      const title = document.createElement('strong');
      title.textContent = `Partition ${i + 1}`;
      row.append(
        title,
        button('✕', () => app.applyRoom(removePartition(app.getRoom(), i)), 'ghost oremove', `Remove partition ${i + 1}`),
        field(k + 'fx', 'from x', p.from[0], (v) => set({ from: [v, p.from[1]] })),
        field(k + 'fz', 'from z', p.from[1], (v) => set({ from: [p.from[0], v] })),
        field(k + 'tx', 'to x', p.to[0], (v) => set({ to: [v, p.to[1]] })),
        field(k + 'tz', 'to z', p.to[1], (v) => set({ to: [p.to[0], v] })),
        field(k + 'th', 'thickness', p.thickness, (v) => set({ thickness: v })),
        field(k + 'h', 'height', p.height, (v) => set({ height: v }))
      );
      return row;
    }));

    if (focused) document.querySelector(`[data-key="${CSS.escape(focused)}"]`)?.focus();

    const problems = app.roomProblems(), modified = app.roomModified();
    saveBtn.disabled = !modified || problems.length > 0;
    revertBtn.disabled = !modified;
    undoBtn.disabled = !app.shellHistory.canUndo;
    redoBtn.disabled = !app.shellHistory.canRedo;
    status.textContent = message
      ?? (problems.length ? `${problems.length} problem${problems.length > 1 ? 's' : ''}: see the red banner`
        : modified ? 'Unsaved changes to room.json' : 'Matches room.json');
  }

  wallPick.addEventListener('change', () => {
    wallId = wallPick.value;
    app.selectOpening({ wallId, index: -1 });
  });

  const add = (type) => {
    const r = addOpening(app.getRoom(), wallId, type);
    if (!r) return refresh(`No stretch of the ${wallId} wall is wide enough for a new ${type}`);
    app.applyRoom(r.room);
    app.selectOpening({ wallId, index: r.index });
  };
  $('shell-add-window').addEventListener('click', () => add('window'));
  $('shell-add-door').addEventListener('click', () => add('door'));
  $('shell-add-partition').addEventListener('click', () => app.applyRoom(addPartition(app.getRoom())));

  undoBtn.addEventListener('click', () => app.shellUndo());
  redoBtn.addEventListener('click', () => app.shellRedo());
  saveBtn.addEventListener('click', () => app.saveRoom().catch((err) => refresh(`Could not save: ${err.message}`)));
  revertBtn.addEventListener('click', () => {
    if (confirm('Discard every change to the shell since room.json was last saved?')) app.revertRoom();
  });

  refresh();
  return { refresh };
}
