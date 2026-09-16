import data from '../assets/lighting-variants.json';
import { variantReport, edgeLabel, LUX_PER_UNIT, TARGETS } from '../analysis/lighting.js';
import { createLightRig, whiteColour } from '../scene/lightRig.js';
import { createSoundOverlay, rampAt, cssGradient } from '../scene/soundOverlay.js';
import { serialize } from '../assets/layouts.js';
import { ASSETS } from '../assets/build.js';

const $ = (id) => document.getElementById(id);
// light on the work plane: one warm hue, pale for little light, dark for a lot
const LUX_RAMP = ['#fff6d6', '#ffe8a3', '#fcd66b', '#eda100', '#c98500', '#8a5b00', '#4d3300'];
// With the profiles on, exposure may open further than daylight's cap, the same for every layout,
// so a room lit only by LEDs at night reads as a lit interior and a brighter layout still looks brighter.
export const LED_EXPOSURE_CAP = 32;
const byId = Object.fromEntries(data.variants.map((v) => [v.id, v]));
const round = (v) => Math.round(v).toLocaleString('en-GB');
const names = (edges) => edges.map(edgeLabel).join(', ');
const WHITES = [[2700, 'Warm white, 2700 K'], [3000, 'Warm white, 3000 K'], [4000, 'Neutral white, 4000 K'], [5000, 'Cool white, 5000 K'], [6500, 'Daylight, 6500 K']];

// a picked colour as linear RGB with unit luminance, so a coloured profile is as bright as a white one
function pickedColour(hex) {
  const lin = (v) => { const x = parseInt(v, 16) / 255; return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
  const rgb = [hex.slice(1, 3), hex.slice(3, 5), hex.slice(5, 7)].map(lin);
  const y = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
  return y > 1e-4 ? rgb.map((v) => v / y) : [1, 1, 1];
}

// The LED profile layouts in the Light tab: pick one to see and light the room with it, read whether
// it is enough to work by, see it at night, draw its light on the floor plan, and compare all of them.
export function installLight(app, { scene, overlay, canvas, camera, furniture, daylight, state, invalidate }) {
  state.led = null;                           // a variant id, or null for the room's current fittings
  state.luxmap = false;
  state.ledColour = { cct: data.defaults.cct };          // or { hex } for a coloured LED
  let report = null, nightFrom = null, timer = 0, compareKey = null;
  const rig = createLightRig(scene);
  const plan = createSoundOverlay({ overlay, canvas, getCamera: () => camera, onHover: hover });
  const pick = $('led-pick'), legend = $('light-legend'), read = $('light-legend-read');
  const panel = $('compare-panel');
  const items = () => serialize(furniture.items);

  pick.replaceChildren(
    new Option('Current fittings', ''),
    ...data.variants.map((v, i) => new Option(`${i + 1}. ${v.name}`, v.id))
  );
  const colourPick = $('led-colour'), custom = $('led-custom');
  colourPick.replaceChildren(...WHITES.map(([k, label]) => new Option(label, String(k))), new Option('Custom colour', 'custom'));
  colourPick.value = String(data.defaults.cct);
  // the colour every profile shows and lights the room with, or null for each run's own white
  const chosenColour = () => (state.ledColour.hex ? pickedColour(state.ledColour.hex) : whiteColour(state.ledColour.cct));

  // ---- choosing a layout
  function select(id) {
    state.led = id || null;
    pick.value = id || '';
    app.room.leds.visible = !state.led && app.show.lights;          // the battens, strips and pendants
    app.showPieces();                                               // ceiling panels step aside
    app.picking.select(null);
    colourPick.disabled = custom.disabled = !state.led;
    refresh(0);
  }

  function describe() {
    if (!report) {
      $('led-note').textContent = 'The room as it is: battens, strips and pendant lamps. Pick a layout to replace them with LED profiles.';
      $('led-figures').textContent = '';
      return;
    }
    $('led-note').textContent = report.note;
    const g = report.glare;
    const parts = [
      `${report.length.toFixed(1)} m of profile, ${round(report.lumens)} lm, ${round(report.watts)} W.`,
      report.desk !== null ? `Desk ${round(report.desk)} lx (target ${TARGETS.desk}),` : '',
      `room ${round(report.room.avg)} lx (${TARGETS.room}), evenness ${report.room.uniformity.toFixed(2)} (${TARGETS.uniformity}).`,
      g ? (g.inView.length ? `In your view at the desk: ${names(g.inView)}.` : 'Nothing in your view at the desk.') : '',
      g && g.inScreen.length ? `Reflects in the screen: ${names(g.inScreen)}.` : '',
      state.ledColour.hex ? 'Coloured light: the lux figures are for white LEDs of the same output.' : ''
    ];
    $('led-figures').textContent = parts.filter(Boolean).join(' ');
  }

  function refresh(delay = 150) {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (!state.led) {
        report = null;
        rig.clear();
        daylight.setExtraBounce([0, 0, 0]);
      } else {
        report = variantReport(app.getRoom(), byId[state.led], data.defaults, items(), ASSETS);
        const colour = chosenColour();
        rig.set(report.runs, colour);
        // the light bounced round the room, as irradiance in the scene's units, in the LEDs' colour
        daylight.setExtraBounce(colour.map((c) => c * report.map.indirect / LUX_PER_UNIT));
      }
      describe();
      if (state.luxmap) drawPlan();
      if (!panel.hidden) drawCompare();
      invalidate(true);
    }, delay);
  }

  // ---- at night
  function setNight(on) {
    if (on === (nightFrom !== null)) return;
    if (on) { nightFrom = state.minutes; state.minutes = 22 * 60; }
    else { state.minutes = nightFrom; nightFrom = null; }
    $('act-night').setAttribute('aria-pressed', String(on));
    app.dock.syncInputs();
    app.updateSun();
  }

  // ---- the lux plan
  function setLegend({ title, when, note, top }) {
    $('light-legend-title').textContent = title;
    $('light-legend-when').textContent = when;
    $('light-legend-note').textContent = note;
    $('light-legend-bar').style.background = cssGradient(LUX_RAMP);
    $('light-legend-ticks').replaceChildren(...(top ? [[0, '0'], [0.5, round(top / 2)], [1, `${round(top)} lx`]] : []).map(([at, text]) => {
      const s = document.createElement('span');
      s.textContent = text;
      s.style.left = `${at * 100}%`;
      return s;
    }));
    read.textContent = top ? 'Point at the plan to read a value' : '';
  }

  function drawPlan() {
    if (!report) {
      plan.setPlan(null);
      setLegend({ title: 'Pick an LED layout', when: '', note: 'The lux plan shows the light from a layout of LED profiles; the current fittings are decorative and not rated.' });
      invalidate();
      return;
    }
    const top = Math.max(100, Math.ceil(report.map.max / 100) * 100);
    plan.setPlan(report.map, { colour: (v, c) => rampAt(LUX_RAMP, v / top, c), items: items(), assets: ASSETS });
    setLegend({
      title: `${report.name}: light on the work plane`,
      when: `Room ${round(report.room.avg)} lx on average, darkest ${round(report.room.min)} lx${report.desk !== null ? `; desk ${round(report.desk)} lx` : ''}`,
      note: '0.75 m above the floor, from the profiles alone; furniture and panels are left out. Darker is more light.',
      top
    });
    invalidate();
  }

  function hover(sample) {
    if (!state.luxmap || !report) return;
    if (!sample) { read.textContent = 'Point at the plan to read a value'; return; }
    const { length: L, width: W } = app.getRoom().clear;
    read.textContent = `${(sample.x + L / 2).toFixed(1)} m from the back wall, ${(sample.z + W / 2).toFixed(1)} m from the window wall: ${round(sample.value)} lx`;
  }

  function setPlan(on) {
    if (on === state.luxmap) return;
    if (on) { app.setSunMap(false); app.sound.setMap(null); }       // one plan at a time
    state.luxmap = on;
    $('act-luxplan').setAttribute('aria-pressed', String(on));
    legend.hidden = !on;
    plan.plan.visible = on;
    app.dock.autoFold('plan:light', on);
    app.picking.select(null);
    app.orbit.setView(on ? 'soundplan' : app.dock.activeView(), false);
    app.dock.parkBar();
    if (on) drawPlan();
    invalidate();
  }

  // ---- comparing every layout
  function drawCompare() {
    const its = items(), key = JSON.stringify(its);
    const body = $('compare-body');
    if (key !== compareKey) {
      compareKey = key;
      const reports = data.variants.map((v) => variantReport(app.getRoom(), v, data.defaults, its, ASSETS));
      const table = document.createElement('table');
      const head = table.insertRow();
      for (const h of ['Layout', 'Length', 'Power', 'Desk', 'Room', 'Evenness', 'Glare']) {
        const th = document.createElement('th');
        th.textContent = h;
        head.append(th);
      }
      for (const r of reports) {
        const tr = table.insertRow();
        tr.dataset.id = r.id;
        const cell = (text, low) => { const td = tr.insertCell(); td.textContent = text; if (low) td.className = 'low'; };
        cell(r.name);
        cell(`${r.length.toFixed(1)} m`);
        cell(`${round(r.watts)} W`);
        cell(r.desk === null ? '–' : `${round(r.desk)} lx`, r.desk !== null && r.desk < TARGETS.desk);
        cell(`${round(r.room.avg)} lx`, r.room.avg < TARGETS.room);
        cell(r.room.uniformity.toFixed(2), r.room.uniformity < TARGETS.uniformity);
        const g = r.glare;
        cell(g ? [g.inView.length ? 'in view' : '', g.inScreen.length ? 'in screen' : ''].filter(Boolean).join(', ') || 'none' : '–');
        tr.addEventListener('click', () => select(r.id));
      }
      body.replaceChildren(table);
    }
    for (const tr of body.querySelectorAll('tr[data-id]')) tr.classList.toggle('current', tr.dataset.id === state.led);
  }

  function setCompare(open) {
    if (open) { app.facades?.setOpen(false); app.response?.setOpen(false); }   // they share the same place on screen
    panel.hidden = !open;
    app.dock.autoFold('panel:compare', open);
    $('act-compare').setAttribute('aria-pressed', String(open));
    if (open) drawCompare();
  }

  // ---- controls
  pick.addEventListener('change', () => select(pick.value));
  const setColour = () => {
    const isCustom = colourPick.value === 'custom';
    custom.hidden = !isCustom;
    state.ledColour = isCustom ? { hex: custom.value } : { cct: +colourPick.value };
    refresh(0);
  };
  colourPick.addEventListener('change', setColour);
  custom.addEventListener('input', setColour);
  colourPick.disabled = custom.disabled = true;               // until a layout is picked
  $('act-night').addEventListener('click', () => setNight(nightFrom === null));
  $('act-luxplan').addEventListener('click', () => setPlan(!state.luxmap));
  $('light-legend-close').addEventListener('click', () => setPlan(false));
  $('act-compare').addEventListener('click', () => setCompare(panel.hidden));
  $('compare-close').addEventListener('click', () => setCompare(false));
  describe();

  return { select, refresh: () => refresh(300), setPlan, setCompare, setNight };
}
