import { facadeTable, markdownTable, boundaryRange, hhmm, TABLE_DATES } from '../analysis/facadeSun.js';
import { point } from '../scene/sun.js';

const $ = (id) => document.getElementById(id);
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// When each facade is in direct sun on the three reference dates, at the current bearing, with how
// far the times move if the bearing is 10 deg off either way.
export function createFacadePanel(app) {
  const panel = $('facade-panel'), body = $('facade-body'), sub = $('facade-sub');
  const note = $('facade-note'), button = $('act-facades');
  const NOTE = note.textContent;
  let rows = [];

  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  };

  function spell(cell, k) {
    const iv = cell.at[k], wrap = el('div', 'spell');
    const end = (time, horizon, word) => {
      const s = el('span', null, hhmm(time));
      if (horizon) s.append(' ', el('small', null, word));
      return s;
    };
    const line = el('div');
    line.append(end(iv.from, iv.fromSunrise, 'sunrise'), ' → ', end(iv.to, iv.toSunset, 'sunset'));
    wrap.append(line);

    // the horizon does not move with the wall's bearing; only the other ends do
    const parts = [];
    for (const [key, horizon, word] of [['from', iv.fromSunrise, 'starts'], ['to', iv.toSunset, 'ends']]) {
      if (horizon) continue;
      const r = boundaryRange(cell, k, key);
      if (r) parts.push(`${word} ${hhmm(r[0])}–${hhmm(r[1])}`);
    }
    if (!boundaryRange(cell, k, 'from')) parts.splice(0, parts.length, 'pattern changes');
    if (parts.length) wrap.append(el('div', 'range', `±10°: ${parts.join(', ')}`));
    return wrap;
  }

  function refresh() {
    if (panel.hidden) return;
    const year = new Date().getFullYear(), face = app.state.face;
    rows = facadeTable(app.getRoom(), face, { year });
    sub.textContent = `Street wall facing ${face}° ${point(face)}, ${year}`;

    const table = el('table');
    const head = el('tr');
    head.append(el('th', null, 'Wall'));
    for (const d of TABLE_DATES) {
      const th = el('th', null, `${d.day} ${MONTHS[d.month]}`);
      th.scope = 'col';
      head.append(th);
    }
    const thead = el('thead');
    thead.append(head);

    const tbody = el('tbody');
    for (const r of [...rows].sort((a, b) => b.windows - a.windows)) {
      const tr = el('tr', r.windows ? null : 'solid');
      const th = el('th');
      th.scope = 'row';
      th.append(el('span', null, r.name), el('small', null, `${r.point}, ${r.windows ? `${r.windows} window${r.windows > 1 ? 's' : ''}` : 'solid'}`));
      tr.append(th);
      for (const cell of r.cells) {
        const td = el('td');
        if (!cell.at.length) td.append(el('div', 'spell none', 'no sun'));
        cell.at.forEach((_, k) => td.append(spell(cell, k)));
        tr.append(td);
      }
      tbody.append(tr);
    }
    table.append(thead, tbody);
    body.replaceChildren(table);
    note.textContent = NOTE;
  }

  function setOpen(open) {
    if (open) { app.parts?.setOpen(false); app.response?.setOpen(false); }   // they share the same place on screen
    panel.hidden = !open;
    app.dock?.autoFold('panel:facades', open);
    button.setAttribute('aria-pressed', String(open));
    refresh();
  }

  button.addEventListener('click', () => setOpen(panel.hidden));
  $('facade-close').addEventListener('click', () => setOpen(false));
  $('facade-copy').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(markdownTable(rows));
      note.textContent = 'Copied the glazed walls as a Markdown table';
    } catch {
      note.textContent = 'Copy blocked here: run npm run table instead';
    }
  });

  return { refresh, setOpen };
}
