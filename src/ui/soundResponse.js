import { responseCurves, listeningSetup } from '../analysis/soundViews.js';
import { serialize } from '../assets/layouts.js';
import { ASSETS } from '../assets/build.js';

const $ = (id) => document.getElementById(id);
const NS = 'http://www.w3.org/2000/svg';
// categorical slots 1 and 2 of the validated reference palette; each series keeps its colour always
const SERIES = [
  { key: 'bare', name: 'Bare room', colour: '#eb6834' },
  { key: 'treated', name: 'With the treatment', colour: '#2a78d6' }
];
const TREATED = SERIES[1].colour;
const signed = (v) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(1)}`;
const hz = (f) => (f >= 1000 ? `${f / 1000} kHz` : `${Math.round(f)} Hz`);

// The bass response at the listening position, bare room against the treatment in the layout, and the
// reverberation time per band against the EBU Tech 3276 target.
export function createResponsePanel(app) {
  const panel = $('response-panel'), body = $('response-body'), sub = $('response-sub'), button = $('act-response');

  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  };
  const svg = (tag, attrs = {}, parent) => {
    const e = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    parent?.append(e);
    return e;
  };

  function bassChart(r) {
    const Wd = 460, Ht = 210, m = { l: 36, r: 14, t: 14, b: 24 };
    const fx = (f) => m.l + Math.log(f / 40) / Math.log(250 / 40) * (Wd - m.l - m.r);
    const extent = Math.max(...[...r.bare.db, ...r.treated.db].map(Math.abs));
    const step = extent > 15 ? 10 : 5, top = Math.max(step, Math.ceil(extent / step) * step);
    const fy = (v) => m.t + (top - v) / (2 * top) * (Ht - m.t - m.b);

    const wrap = el('div', 'chart');
    const root = svg('svg', { viewBox: `0 0 ${Wd} ${Ht}`, role: 'img', 'aria-label': `Bass response from 40 to 250 Hz: bare room swings ${r.bare.spread.toFixed(1)} dB, with the treatment ${r.treated.spread.toFixed(1)} dB` });
    const grid = svg('g', { class: 'grid' }, root);
    for (let v = -top; v <= top; v += step) {
      svg('line', { x1: m.l, x2: Wd - m.r, y1: fy(v), y2: fy(v), class: v === 0 ? 'zero' : '' }, grid);
      svg('text', { x: m.l - 6, y: fy(v) + 3.5, 'text-anchor': 'end' }, grid).textContent = v === 0 ? '0 dB' : signed(v).replace('.0', '');
    }
    for (const f of [40, 63, 100, 160, 250]) {
      svg('line', { x1: fx(f), x2: fx(f), y1: m.t, y2: Ht - m.b }, grid);
      svg('text', { x: fx(f), y: Ht - 7, 'text-anchor': 'middle' }, grid).textContent = f === 250 ? '250 Hz' : String(f);
    }
    for (const s of SERIES) {
      const d = r.freqs.map((f, k) => `${k ? 'L' : 'M'}${fx(f).toFixed(1)},${fy(r[s.key].db[k]).toFixed(1)}`).join('');
      svg('path', { d, class: 'series', stroke: s.colour }, root);
    }
    // the worst bare-room peak, named
    const [peak] = r.bare.peaks;
    if (peak) {
      const k = r.freqs.findIndex((f) => f >= peak.f - 1e-9);
      svg('circle', { cx: fx(r.freqs[k]), cy: fy(r.bare.db[k]), r: 4, fill: SERIES[0].colour, class: 'ring' }, root);
      svg('circle', { cx: fx(r.freqs[k]), cy: fy(r.treated.db[k]), r: 4, fill: TREATED, class: 'ring' }, root);
      const t = svg('text', { x: fx(r.freqs[k]) + 8, y: fy(r.bare.db[k]) + 4, class: 'note' }, root);
      t.textContent = `${Math.round(peak.f)} Hz: ${signed(r.bare.db[k])} bare, ${signed(r.treated.db[k])} treated`;
    }

    // hover: a crosshair and both values at the nearest frequency
    const cross = svg('line', { y1: m.t, y2: Ht - m.b, class: 'cross', visibility: 'hidden' }, root);
    const dots = SERIES.map((s) => svg('circle', { r: 4, fill: s.colour, class: 'ring', visibility: 'hidden' }, root));
    const hitArea = svg('rect', { x: m.l, y: m.t, width: Wd - m.l - m.r, height: Ht - m.t - m.b, class: 'hit' }, root);
    const tip = el('div', 'tip');
    tip.hidden = true;
    hitArea.addEventListener('pointermove', (e) => {
      const box = root.getBoundingClientRect(), x = (e.clientX - box.left) / box.width * Wd;
      const f = 40 * (250 / 40) ** ((x - m.l) / (Wd - m.l - m.r));
      let k = 0;
      r.freqs.forEach((q, i) => { if (Math.abs(Math.log(q / f)) < Math.abs(Math.log(r.freqs[k] / f))) k = i; });
      cross.setAttribute('x1', fx(r.freqs[k])); cross.setAttribute('x2', fx(r.freqs[k]));
      cross.setAttribute('visibility', 'visible');
      SERIES.forEach((s, i) => {
        dots[i].setAttribute('cx', fx(r.freqs[k])); dots[i].setAttribute('cy', fy(r[s.key].db[k]));
        dots[i].setAttribute('visibility', 'visible');
      });
      tip.replaceChildren(el('b', null, hz(r.freqs[k])), ...SERIES.map((s) => {
        const row = el('span');
        const key = el('i'); key.style.background = s.colour;
        row.append(key, `${s.name} ${signed(r[s.key].db[k])} dB`);
        return row;
      }));
      tip.hidden = false;
      const px = fx(r.freqs[k]) / Wd * box.width;
      tip.style.left = `${Math.min(box.width - 170, Math.max(0, px + 10))}px`;
    });
    hitArea.addEventListener('pointerleave', () => {
      cross.setAttribute('visibility', 'hidden');
      dots.forEach((d) => d.setAttribute('visibility', 'hidden'));
      tip.hidden = true;
    });
    wrap.append(root, tip);
    return wrap;
  }

  function rtChart(r) {
    const Wd = 460, Ht = 150, m = { l: 36, r: 14, t: 18, b: 24 };
    const ymax = Math.max(0.8, Math.ceil(Math.max(...r.rt.map((b) => b.treated)) * 5) / 5);
    const n = r.rt.length, fx = (k) => m.l + (k + 0.5) / n * (Wd - m.l - m.r);
    const fy = (v) => m.t + (1 - v / ymax) * (Ht - m.t - m.b);
    const root = svg('svg', { viewBox: `0 0 ${Wd} ${Ht}`, role: 'img', 'aria-label': `Reverberation time with the treatment, ${r.rt.map((b) => `${hz(b.f)} ${b.treated.toFixed(2)} s`).join(', ')}; target ${r.target.toFixed(2)} s` });
    const grid = svg('g', { class: 'grid' }, root);
    svg('rect', { x: m.l, width: Wd - m.l - m.r, y: fy(r.target + 0.05), height: fy(r.target - 0.05) - fy(r.target + 0.05), class: 'target' }, root);
    svg('text', { x: Wd - m.r - 4, y: fy(r.target + 0.05) - 4, 'text-anchor': 'end', class: 'note' }, root).textContent = `target ${r.target.toFixed(2)} s ± 0.05 (200 Hz–4 kHz)`;
    for (let v = 0; v <= ymax + 1e-9; v += 0.2) {
      svg('line', { x1: m.l, x2: Wd - m.r, y1: fy(v), y2: fy(v) }, grid);
      svg('text', { x: m.l - 6, y: fy(v) + 3.5, 'text-anchor': 'end' }, grid).textContent = v === 0 ? '0 s' : v.toFixed(1);
    }
    r.rt.forEach((b, k) => {
      svg('text', { x: fx(k), y: Ht - 7, 'text-anchor': 'middle' }, grid).textContent = b.f >= 1000 ? `${b.f / 1000}k` : String(b.f);
      svg('circle', { cx: fx(k), cy: fy(b.treated), r: 4.5, fill: TREATED, class: 'ring' }, root);
      svg('text', { x: fx(k), y: fy(b.treated) - 9, 'text-anchor': 'middle', class: 'value' }, root).textContent = b.treated.toFixed(2);
    });
    return root;
  }

  function table(r) {
    const d = el('details', 'numbers');
    d.append(el('summary', null, 'Show the numbers'));
    const t1 = el('table');
    const h1 = el('tr');
    h1.append(el('th', null, 'Frequency'), ...SERIES.map((s) => el('th', null, `${s.name}, dB`)));
    t1.append(h1);
    r.freqs.forEach((f, k) => {
      if (k % 4) return;
      const tr = el('tr');
      tr.append(el('td', null, hz(f)), el('td', null, signed(r.bare.db[k])), el('td', null, signed(r.treated.db[k])));
      t1.append(tr);
    });
    const t2 = el('table');
    const h2 = el('tr');
    h2.append(el('th', null, 'Band'), ...SERIES.map((s) => el('th', null, `${s.name}, s`)));
    t2.append(h2);
    for (const b of r.rt) {
      const tr = el('tr');
      tr.append(el('td', null, hz(b.f)), el('td', null, b.bare.toFixed(2)), el('td', null, b.treated.toFixed(2)));
      t2.append(tr);
    }
    d.append(t1, t2);
    return d;
  }

  function refresh() {
    if (panel.hidden) return;
    const items = serialize(app.furniture.items), setup = listeningSetup(items);
    if (!setup) {
      sub.textContent = 'No monitors in this layout';
      body.replaceChildren(el('p', 'pempty', 'Add studio monitors on stands and a listening position from the Add tab.'));
      return;
    }
    const r = responseCurves(app.getRoom(), setup, items, ASSETS);
    sub.textContent = `The bass swings ${r.bare.spread.toFixed(1)} dB in the bare room, ${r.treated.spread.toFixed(1)} dB with the treatment`;
    const keys = el('div', 'keys');
    for (const s of SERIES) {
      const k = el('span', 'key'), sw = el('i');
      sw.style.background = s.colour;
      k.append(sw, s.name);
      keys.append(k);
    }
    const bareRt = r.rt.filter((b) => b.f >= 250).map((b) => b.bare);
    body.replaceChildren(
      el('h3', null, 'Bass at the ears, 40–250 Hz, against its own average'),
      keys, bassChart(r),
      el('h3', null, 'Reverberation time with the treatment'),
      el('p', 'pwhy', `The bare room rings for ${Math.min(...bareRt).toFixed(1)}–${Math.max(...bareRt).toFixed(1)} s from 250 Hz up.`),
      rtChart(r),
      table(r)
    );
  }

  function setOpen(open) {
    if (open) app.facades?.setOpen(false);    // they share the same place on screen
    panel.hidden = !open;
    button.setAttribute('aria-pressed', String(open));
    refresh();
  }

  button.addEventListener('click', () => setOpen(panel.hidden));
  $('response-close').addEventListener('click', () => setOpen(false));
  return { refresh, setOpen };
}
