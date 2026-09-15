import { ROOM, SAVED_ROOM, SAVED_ROOM_TEXT, setRoom, snapshotRoom, getRoomProblems } from '../scene/spec.js';
import { moveOpening } from '../scene/shellOps.js';
import { formatJson, loadDraft, saveDraft, clearDraft, writeRoomFile } from '../scene/roomFile.js';
import { createHistory } from '../assets/history.js';

// Editing the room shell: put an edited room everywhere it shows, undo and redo, keep unsaved
// edits as a draft, and save to room.json.
export function installShell(app, { room, daylight, relight, invalidate }) {
  const problemsBox = document.getElementById('problems');
  function showProblems(list) {
    problemsBox.textContent = list.length ? 'room.json: ' + list.join('; ') : '';
    problemsBox.hidden = !list.length;
    if (list.length) console.warn('room.json problems:', list);
  }
  showProblems(getRoomProblems());

  let diskText = SAVED_ROOM_TEXT;                 // room.json as on disk: drafts are tied to it
  let savedKey = JSON.stringify(SAVED_ROOM);      // the same, normalised, to tell if anything changed
  const history = createHistory();

  Object.assign(app, {
    shellHistory: history,
    shellSelection: null,
    getRoom: () => ROOM,
    roomProblems: getRoomProblems,
    roomModified: () => JSON.stringify(snapshotRoom()) !== savedKey
  });

  app.applyRoom = (next, { record = true, draft = true } = {}) => {
    showProblems(setRoom(next));
    room.rebuildShell();
    daylight.refresh();
    relight();
    const snap = snapshotRoom();
    if (record) history.record(snap);
    if (draft) {
      if (JSON.stringify(snap) === savedKey) clearDraft();
      else saveDraft(snap, diskText);
    }
    app.shellEdit.refresh();
    app.shell?.refresh();
    app.updateClashes?.();
    app.refreshSunMap?.(draft ? 0 : 400);      // while dragging, wait for the drag to settle
    app.facades?.refresh();
    invalidate(true);
  };

  // a drag along the wall: live while it moves, one undo step and a draft when it ends
  app.moveOpening = (wallId, index, left, done) => {
    app.applyRoom(moveOpening(snapshotRoom(), wallId, index, left, 0.005), { record: done, draft: done });
  };

  app.selectOpening = (sel) => {
    app.shellSelection = sel;
    app.shellEdit.setSelection(sel);
    app.shell?.refresh();
    invalidate();
  };

  app.shellUndo = () => { const s = history.undo(); if (s) app.applyRoom(s, { record: false }); };
  app.shellRedo = () => { const s = history.redo(); if (s) app.applyRoom(s, { record: false }); };
  app.revertRoom = () => { app.selectOpening(null); app.applyRoom(JSON.parse(savedKey)); };

  app.saveRoom = async () => {
    if (getRoomProblems().length) throw new Error('fix the problems in the red banner first');
    const text = formatJson(snapshotRoom());
    const how = await writeRoomFile(text);
    if (how === 'written') {
      diskText = savedKey = JSON.stringify(JSON.parse(text));
      clearDraft();
      app.shell.refresh('Saved to src/scene/room.json');
    } else {
      app.shell.refresh('Downloaded room.json: replace src/scene/room.json with it');
    }
  };

  // unsaved shell edits from the last visit, if room.json has not changed since
  app.restoreShellDraft = () => {
    const draft = loadDraft(diskText);
    if (draft) app.applyRoom(draft, { record: false, draft: false });
    history.reset(snapshotRoom());
  };
}
