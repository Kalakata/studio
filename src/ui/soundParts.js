import { treatmentList, treatmentMarkdown, totalCost } from '../analysis/soundTreatment.js';
import { serialize } from '../assets/layouts.js';
import { ASSETS } from '../assets/build.js';

const $ = (id) => document.getElementById(id);
const eur = (v) => `€${Math.round(v).toLocaleString('en-GB')}`;
const range = (lo, hi) => `${eur(lo)}–${eur(hi)}`;

// The sound treatment in the layout on screen and what it costs: one row per kind of piece, opening
// to its size, what it does, how to build it, where it goes and its materials. Follows the layout as
// pieces are added, moved or removed.
export function createPartsPanel(app) {
  const panel = $('parts-panel'), body = $('parts-body'), sub = $('parts-sub');
  const note = $('parts-note'), button = $('act-parts');
  const NOTE = note.textContent;
  const expanded = new Set();                 // rows left open stay open when the layout changes
  let list = [];

  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  };

  const section = (title, lines) => {
    const wrap = el('div', 'pblock');
    wrap.append(el('h3', null, title));
    const ul = el('ul');
    for (const l of lines) ul.append(el('li', null, l));
    wrap.append(ul);
    return wrap;
  };

  function row(r) {
    const d = el('details', 'part');
    d.open = expanded.has(r.type);
    d.addEventListener('toggle', () => (d.open ? expanded.add(r.type) : expanded.delete(r.type)));

    const s = el('summary');
    const name = el('span', 'pname');
    name.append(el('b', null, `${r.count} × ${r.name}`), el('small', null, r.size));
    s.append(name, el('span', 'pcost', range(r.lo, r.hi)));
    d.append(s);

    const where = new Map();
    for (const w of r.where) where.set(w, (where.get(w) ?? 0) + 1);
    d.append(
      el('p', 'pwhy', r.why),
      section('Costs', r.cost.map((c) => `${c.what}: ${range(c.lo, c.hi)}`)),
      section('Build', r.build),
      section('Where', [...where].map(([w, n]) => `${n > 1 ? `${n} × ` : ''}${w}`))
    );
    return d;
  }

  function refresh() {
    if (panel.hidden) return;
    list = treatmentList(serialize(app.furniture.items), ASSETS, app.getRoom());
    note.textContent = NOTE;
    if (!list.length) {
      sub.textContent = 'Nothing for sound in this layout';
      body.replaceChildren(el('p', 'pempty', 'Load the Mix room from the Layouts tab, or add panels, traps, rugs or curtains from the Add tab.'));
      return;
    }
    const total = totalCost(list);
    sub.textContent = `${range(total.lo, total.hi)} with VAT, materials only`;
    const foot = el('div', 'ptotal');
    foot.append(el('b', null, 'Total'), el('b', null, range(total.lo, total.hi)));
    body.replaceChildren(...list.map(row), foot);
  }

  function setOpen(open) {
    if (open) app.facades?.setOpen(false);    // they share the same place on screen
    panel.hidden = !open;
    app.dock?.autoFold('panel:parts', open);
    button.setAttribute('aria-pressed', String(open));
    refresh();
  }

  button.addEventListener('click', () => setOpen(panel.hidden));
  $('parts-close').addEventListener('click', () => setOpen(false));
  $('parts-copy').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(treatmentMarkdown(list, { layout: 'current layout' }));
      note.textContent = 'Copied the parts list with its estimates as Markdown';
    } catch {
      note.textContent = 'Copy blocked here: run npm run parts instead';
    }
  });

  return { refresh, setOpen };
}
