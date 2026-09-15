// Writing room.json back, and keeping unsaved shell edits across reloads.

// JSON laid out like the hand-written file: an array of plain values, or an object whose values
// are plain or such arrays, sits on one line. Anything deeper is spread out.
export function formatJson(value) {
  const plain = (v) => v === null || typeof v !== 'object';
  const plainArray = (v) => Array.isArray(v) && v.every(plain);
  const flat = (v) => plain(v) || plainArray(v) || (!Array.isArray(v) && Object.values(v).every((x) => plain(x) || plainArray(x)));
  const inline = (v) => (plainArray(v) ? `[${v.map((x) => JSON.stringify(x)).join(', ')}]` : JSON.stringify(v));
  function fmt(v, pad) {
    if (plain(v)) return JSON.stringify(v);
    if (flat(v)) {
      if (Array.isArray(v)) return inline(v);
      const entries = Object.entries(v);
      return entries.length ? `{ ${entries.map(([k, x]) => `${JSON.stringify(k)}: ${inline(x)}`).join(', ')} }` : '{}';
    }
    const inner = pad + '  ';
    if (Array.isArray(v)) return `[\n${v.map((x) => inner + fmt(x, inner)).join(',\n')}\n${pad}]`;
    return `{\n${Object.entries(v).map(([k, x]) => `${inner}${JSON.stringify(k)}: ${fmt(x, inner)}`).join(',\n')}\n${pad}}`;
  }
  return fmt(value, '') + '\n';
}

const DRAFT = 'studio.room.draft.v1';

// A draft is only offered against the room.json it was made from; if the file has changed
// since, the draft is stale and ignored.
export function loadDraft(diskText) {
  try {
    const d = JSON.parse(localStorage.getItem(DRAFT));
    if (d && d.basedOn === diskText && d.room) return d.room;
  } catch { /* none, or unreadable */ }
  return null;
}

export function saveDraft(room, diskText) {
  try { localStorage.setItem(DRAFT, JSON.stringify({ basedOn: diskText, room })); } catch { /* storage blocked */ }
}

export function clearDraft() {
  try { localStorage.removeItem(DRAFT); } catch { /* storage blocked */ }
}

function download(text) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  a.download = 'room.json';
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// Under `npm run dev` the dev server writes src/scene/room.json (see vite.config.js).
// A static build cannot reach the project, so it hands the file over as a download.
export async function writeRoomFile(text) {
  if (import.meta.env?.DEV) {
    const res = await fetch('/__studio/room', { method: 'POST', headers: { 'content-type': 'application/json' }, body: text });
    if (res.ok) return 'written';
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `dev server answered ${res.status}`);
  }
  download(text);
  return 'downloaded';
}
