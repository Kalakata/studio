import { ASSETS } from '../assets/build.js';
import { clock, dateLabel, point, solar } from '../scene/sun.js';
import { ROOM, L, W, wallFrame } from '../scene/spec.js';

const SVG = 'http://www.w3.org/2000/svg';
const DIAL_R = 32, ROOM_SCALE = 28 / L;       // the room's length spans 28 of the dial's 64 units

// sky position -> dial point: north up, overhead at the centre, horizon on the rim
const onDial = (alt, az) => {
  const r = DIAL_R * (90 - Math.max(0, alt)) / 90, a = az * Math.PI / 180;
  return [r * Math.sin(a), -r * Math.cos(a)];
};

const $ = (id) => document.getElementById(id);
const all = (sel) => document.querySelectorAll(sel);

// Wires the dock (tabs, sliders, palette, toggles, views) and the selection bar.
export function createDock(app) {
  const { state, show } = app;
  const selBar = $('sel'), dock = $('dock'), dockBtn = $('dock-toggle');

  // Called on resize, tab switches and dock toggles. Tells the CSS where the dock starts (panels
  // size against it) and whether its body overflows (only then does it take the pointer to scroll,
  // so the model can still be dragged through it). Parks the selection bar just above it.
  function parkBar() {
    const body = dock.querySelector('.body');
    dock.classList.toggle('scrolls', body.scrollHeight > body.clientHeight + 1);
    const r = dock.getBoundingClientRect();
    document.documentElement.style.setProperty('--dock-top', `${Math.round(r.top)}px`);
    if (selBar.hidden) return;
    selBar.style.bottom = Math.max(12, window.innerHeight - r.top + 8) + 'px';
  }

  function showSelection(g) {
    if (!g) { selBar.hidden = true; return; }
    const locked = g.userData.locked;
    $('sel-name').textContent = g.userData.label;
    const lock = $('sel-lock');
    lock.textContent = locked ? 'Unlock' : 'Lock';
    lock.setAttribute('aria-pressed', String(!!locked));
    $('sel-rot').disabled = $('sel-del').disabled = !!locked;
    const open = $('sel-open');                 // a curtain: open and close it, locked or not
    open.hidden = !g.userData.openable;
    open.textContent = g.userData.open ? 'Close' : 'Open';
    selBar.hidden = false;
    parkBar();
  }

  // ---- sun
  const inTime = $('in-time'), inDate = $('in-date'), inFace = $('in-face');
  function refreshLabels() {
    $('lab-time').textContent = clock(state.minutes);
    $('lab-date').textContent = dateLabel(state.dayOfYear);
    $('lab-face').textContent = state.face + '° ' + point(state.face);
  }
  function syncInputs() {
    inTime.value = state.minutes; inDate.value = state.dayOfYear; inFace.value = state.face;
    refreshLabels();
  }
  inTime.addEventListener('input', () => { state.minutes = +inTime.value; refreshLabels(); app.updateSun(); });
  inDate.addEventListener('input', () => { state.dayOfYear = +inDate.value; refreshLabels(); app.updateSun(); app.refreshSunMap(250); });
  inFace.addEventListener('input', () => {
    state.face = +inFace.value; refreshLabels(); app.updateSun(); app.refreshSunMap(250); app.facades.refresh();
  });

  // ---- sun-hours plan
  const legend = $('sunmap-legend'), mapBtn = $('act-sunmap');
  mapBtn.addEventListener('click', () => app.setSunMap(!state.sunmap));
  $('sunmap-close').addEventListener('click', () => app.setSunMap(false));
  function setSunMapLegend({ on, busy, top, when }) {
    legend.hidden = !on;
    mapBtn.setAttribute('aria-pressed', String(!!on));
    if (!on) return;
    if (busy) { $('sunmap-read').textContent = 'Working out the day…'; return; }
    $('sunmap-when').textContent = when;
    const ticks = $('sunmap-ticks'), step = top <= 8 ? 1 : 2;
    ticks.replaceChildren();
    for (let v = 0; v <= top; v += step) {
      const s = document.createElement('span');
      s.textContent = v === top ? `${v} h` : String(v);
      s.style.left = `${(v / top) * 100}%`;
      ticks.append(s);
    }
    $('sunmap-read').textContent = 'Point at the plan to read a value';
  }
  function setSunMapHover(sample) {
    const read = $('sunmap-read');
    if (!sample) { read.textContent = 'Point at the plan to read a value'; return; }
    const name = sample.surface === 'floor' ? 'Floor' : `${sample.surface.charAt(0).toUpperCase() + sample.surface.slice(1)} wall`;
    read.textContent = Number.isNaN(sample.hours) ? `${name}: opening` : `${name}: ${sample.hours.toFixed(1)} h of direct sun`;
  }

  // ---- views and toggles
  all('[data-view]').forEach((b) => b.addEventListener('click', () => {
    all('[data-view]').forEach((o) => o.setAttribute('aria-pressed', String(o === b)));
    if (state.sunmap) app.setSunMap(false);        // the plan only reads from above
    if (state.soundmap) app.sound.setMap(null);
    app.orbit.setView(b.dataset.view, false);
  }));

  function setToggle(k, on) {
    show[k] = on;
    const b = document.querySelector(`[data-toggle="${k}"]`);
    if (b) b.setAttribute('aria-pressed', String(on));
    const r = app.room;
    if (k === 'grid') r.grid.visible = on;
    if (k === 'furniture') { r.stuff.visible = on; if (!on) app.picking.select(null); app.updateClashes(); }
    if (k === 'lights') r.leds.visible = on && !state.led;
    if (k === 'dims') { r.dims.visible = on; r.swings.visible = on; }
    if (k === 'clashes') app.updateClashes();
    app.invalidate(true);
  }
  all('[data-toggle]').forEach((b) => b.addEventListener('click', () => setToggle(b.dataset.toggle, !show[b.dataset.toggle])));

  all('[data-quality]').forEach((b) => b.addEventListener('click', () => app.setQuality(b.dataset.quality)));
  function setQuality(q) {
    all('[data-quality]').forEach((o) => o.setAttribute('aria-pressed', String(o.dataset.quality === q)));
  }

  // ---- palette
  const palette = $('palette');
  for (const [id, a] of Object.entries(ASSETS)) {
    const b = document.createElement('button');
    b.textContent = a.label;
    b.addEventListener('click', () => {
      if (!show.furniture) setToggle('furniture', true);
      const n = app.furniture.items.length;
      app.picking.select(app.furniture.place(id, ((n * 1.3) % 6) - 3, 0, 0));
      app.invalidate(true);
    });
    palette.appendChild(b);
  }

  $('act-reset').addEventListener('click', () => app.loadItems(app.defaultItems));
  $('act-cover').addEventListener('click', () => app.coverCeiling());
  $('act-clear').addEventListener('click', () => app.clearLayout());

  // ---- selection bar
  $('sel-open').addEventListener('click', () => app.picking.toggleOpen());
  $('sel-lock').addEventListener('click', () => app.picking.toggleLock());
  $('sel-rot').addEventListener('click', () => app.picking.rotate());
  $('sel-dup').addEventListener('click', () => app.picking.duplicate());
  $('sel-del').addEventListener('click', () => app.picking.remove());
  $('sel-done').addEventListener('click', () => app.picking.select(null));

  // ---- tabs and dock
  all('[data-tab]').forEach((b) => b.addEventListener('click', () => {
    all('[data-tab]').forEach((o) => o.setAttribute('aria-pressed', String(o === b)));
    all('[data-pane]').forEach((pane) => { pane.hidden = pane.dataset.pane !== b.dataset.tab; });
    app.onTab(b.dataset.tab);
    parkBar();
    app.orbit.reframe(false);
  }));

  // ---- measure
  const measureBtn = $('act-measure'), chip = $('measure-chip');
  measureBtn.addEventListener('click', () => app.measure.setActive(!app.measure.active));
  $('measure-clear').addEventListener('click', () => app.measure.clear());
  $('measure-done').addEventListener('click', () => app.measure.setActive(false));
  function setMeasure(active, text) {
    measureBtn.setAttribute('aria-pressed', String(active));
    chip.hidden = !active;
    $('measure-text').textContent = text;
  }

  // ---- clashes
  function setClashes(list) {
    const el = $('clash-list');
    if (!show.clashes) { el.textContent = ''; return; }
    el.textContent = list.length
      ? `${list.length} clash${list.length > 1 ? 'es' : ''}: ${list.map((c) => c.message).join('; ')}`
      : 'No clashes';
    el.classList.toggle('ok', !list.length);
  }

  // ---- folding the dock
  let foldedForYou = false;                  // folded by autoFold, not by the Hide button
  function setClosed(closed) {
    dock.classList.toggle('closed', closed);
    dockBtn.textContent = closed ? 'Show' : 'Hide';
    dockBtn.setAttribute('aria-expanded', String(!closed));
    parkBar();
    app.orbit.reframe(false);
  }
  dockBtn.addEventListener('click', () => {
    foldedForYou = false;
    setClosed(!dock.classList.contains('closed'));
  });

  // On a phone the open dock covers half the screen. While a plan or an information panel is up it
  // folds out of the way, and it comes back when the last of them closes, unless you opened or folded
  // it yourself in between. reason: 'plan:…' or 'panel:…'.
  const phone = window.matchMedia('(max-width: 700px)');
  const showing = new Set();
  function autoFold(reason, on) {
    if (on) showing.add(reason); else showing.delete(reason);
    document.body.classList.toggle('sheet-open', [...showing].some((r) => r.startsWith('panel:')));
    if (!phone.matches) return;
    if (on && !dock.classList.contains('closed')) { foldedForYou = true; setClosed(true); }
    else if (!showing.size && foldedForYou) { foldedForYou = false; setClosed(false); }
  }

  // legends: Less folds the explanation away and leaves the title, the scale and the reading; it never
  // leaves the plan (Exit plan does). Phones start folded.
  document.querySelectorAll('.legend .lfold').forEach((b) => {
    const legend = b.closest('.legend');
    const set = (compact) => {
      legend.classList.toggle('compact', compact);
      b.textContent = compact ? 'More' : 'Less';
      b.setAttribute('aria-expanded', String(!compact));
      app.orbit.reframe(false);
    };
    set(phone.matches);
    b.addEventListener('click', () => set(!legend.classList.contains('compact')));
  });

  // ---- the sun instrument
  const dialRoom = $('dial-room'), dialSun = $('dial-sun'), dialPath = $('dial-path');
  let pathFor = null, roomFor = null;

  function drawRoom() {
    const key = JSON.stringify(ROOM.walls);
    if (key === roomFor) return;
    roomFor = key;
    const s = ROOM_SCALE;
    const rect = document.createElementNS(SVG, 'rect');
    Object.entries({ class: 'room', x: -L / 2 * s, y: -W / 2 * s, width: L * s, height: W * s }).forEach(([k, v]) => rect.setAttribute(k, v));
    const parts = [rect];
    // scene x -> dial x and scene z -> dial y; the group is then turned to the street wall's bearing
    for (const wall of ROOM.walls) {
      const f = wallFrame(ROOM, wall);
      for (const o of wall.openings) {
        if (o.type !== 'window') continue;
        const at = (a) => [(f.leftCorner[0] + f.along[0] * a) * s, (f.leftCorner[1] + f.along[2] * a) * s];
        const [x1, y1] = at(o.left), [x2, y2] = at(o.left + o.width);
        const line = document.createElementNS(SVG, 'line');
        Object.entries({ class: 'glass', x1, y1, x2, y2 }).forEach(([k, v]) => line.setAttribute(k, v));
        parts.push(line);
      }
    }
    dialRoom.replaceChildren(...parts);
  }

  function drawDial(s) {
    drawRoom();
    // scene +x faces the street bearing; before turning, dial +x points east (90 deg)
    dialRoom.setAttribute('transform', `rotate(${state.face - 90})`);
    const year = new Date().getFullYear(), key = `${year}-${state.dayOfYear}`;
    if (key !== pathFor) {
      pathFor = key;
      const pts = [];
      for (let m = 0; m <= 1440; m += 10) {
        const p = solar(state.dayOfYear, m, { year });
        if (p.alt > 0) pts.push(onDial(p.alt, p.az).map((v) => v.toFixed(2)).join(','));
      }
      dialPath.setAttribute('points', pts.join(' '));
    }
    const [x, y] = s.alt > 0 ? onDial(s.alt, s.az) : onDial(0, s.az);
    dialSun.setAttribute('cx', x.toFixed(2));
    dialSun.setAttribute('cy', y.toFixed(2));
    dialSun.classList.toggle('down', s.alt <= 0);
  }

  return {
    showSelection, parkBar, autoFold, syncInputs, setQuality, setMeasure, setClashes, setSunMapLegend, setSunMapHover,
    setSunReadout(s) {
      $('sun-time').textContent = clock(state.minutes);
      $('sun-pos').textContent = s.alt < 0 ? 'Below the horizon' : `${Math.round(s.alt)}° up, ${point(s.az)}`;
      drawDial(s);
    },
    activeView: () => document.querySelector('[data-view][aria-pressed="true"]')?.dataset.view || 'iso'
  };
}
