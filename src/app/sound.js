import {
  listeningSetup, reflectionPaths, bassModel, bassMap, modeMap, modeChoices, modeLabel, worstMode, withoutTreatment, EVEN_FREQS
} from '../analysis/soundViews.js';
import { shellAbsorbers, layoutAbsorbers, flatness, createResponseModel } from '../analysis/roomAcoustics.js';
import { createSoundOverlay, EVEN_RAMP, DIVERGING, rampAt, cssGradient } from '../scene/soundOverlay.js';
import { createResponsePanel } from '../ui/soundResponse.js';
import { serialize } from '../assets/layouts.js';
import { ASSETS } from '../assets/build.js';

const $ = (id) => document.getElementById(id);
const SURFACE = { '+x': 'street wall', '-x': 'back wall', '+z': 'mural wall', '-z': 'window wall', floor: 'floor', ceiling: 'ceiling' };
const signed = (v) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(1)}`;

// The Sound tab: reflection paths in the room, a plan of the bass (how even it is, one frequency, or a
// standing wave), and the bass response panel, with or without the treatment. All of it follows the
// layout as it changes.
export function installSound(app, { overlay, canvas, camera, furniture, state, invalidate }) {
  state.soundmap = null;
  state.soundBare = false;                    // comparing without the treatment: pieces hidden, editing paused
  let rays = false, freq = 45, mode = null, timer = 0, map = null, setup = null, compare = null;
  const legend = $('sound-legend'), read = $('sound-legend-read');
  const views = createSoundOverlay({ overlay, canvas, getCamera: () => camera, onHover: hover });
  const layout = () => serialize(furniture.items);
  const items = () => (state.soundBare ? withoutTreatment(layout(), ASSETS) : layout());
  app.response = createResponsePanel(app);

  // ---- with or without the treatment
  function showTreatment() {
    for (const g of furniture.items) if (ASSETS[g.userData.type]?.acoustic) g.visible = !state.soundBare;
  }
  function setBare(on) {
    if (on === state.soundBare) return;
    state.soundBare = on;
    document.querySelectorAll('[data-treatment]').forEach((b) => b.setAttribute('aria-pressed', String((b.dataset.treatment === 'without') === on)));
    app.picking.select(null);
    showTreatment();
    refreshRays();
    refreshMap(20);
    invalidate(true);                          // hidden pieces no longer shade the sun
  }

  // ---- reflection paths
  function refreshRays() {
    const note = $('snd-rays-note');
    views.rays.visible = rays;
    if (!rays) { note.textContent = ''; invalidate(); return; }
    const its = items(), s = listeningSetup(its);
    if (!s) {
      views.setRays([]);
      note.textContent = 'Add studio monitors on stands and a listening position to trace their reflections.';
      invalidate();
      return;
    }
    const paths = reflectionPaths(app.getRoom(), s, its, ASSETS);
    views.setRays(paths);
    const early = paths.filter((p) => p.verdict === 'problem' || p.verdict === 'quiet');
    const loud = [...new Set(paths.filter((p) => p.verdict === 'problem').map((p) => SURFACE[p.surface]))];
    const which = state.soundBare ? 'Without the treatment: ' : '';
    note.textContent = `${which}${loud.length ? `loud early reflections off the ${loud.join(', ')}.` : `all ${early.length} early reflections come back at least 15 dB down.`} Red: within 20 ms and loud. Green: within 20 ms, at least 15 dB down. Grey: after 20 ms, or blocked.`;
    note.textContent = note.textContent.charAt(0).toUpperCase() + note.textContent.slice(1);
    invalidate();
  }
  function setRays(on) {
    rays = on;
    $('act-rays').setAttribute('aria-pressed', String(on));
    refreshRays();
  }

  // ---- the plan
  function fillModes() {
    const select = $('snd-mode'), choices = modeChoices(app.getRoom());
    const worst = worstMode(app.getRoom(), listeningSetup(layout()));
    mode = mode ?? worst ?? choices[0];
    select.replaceChildren(...choices.map((m) => {
      const o = document.createElement('option');
      o.value = m.n.join(',');
      o.textContent = modeLabel(m) + (worst && m.n.join() === worst.n.join() ? ' (worst peak at the head)' : '');
      return o;
    }));
    select.value = mode.n.join(',');
  }

  const colourFor = (m) => (m.kind === 'even'
    ? (v, c) => rampAt(EVEN_RAMP, (v - m.min) / Math.max(1e-6, m.max - m.min), c)
    : m.kind === 'level' ? (v, c) => rampAt(DIVERGING, 0.5 + v / 24, c)
    : (v, c) => rampAt(DIVERGING, 0.5 + v / 2, c));

  function setLegend({ title, when, note, ramp, ticks }) {
    $('sound-legend-title').textContent = title;
    $('sound-legend-when').textContent = when;
    $('sound-legend-note').textContent = note;
    $('sound-legend-bar').style.background = cssGradient(ramp);
    $('sound-legend-ticks').replaceChildren(...ticks.map(([at, text]) => {
      const s = document.createElement('span');
      s.textContent = text;
      s.style.left = `${at * 100}%`;
      return s;
    }));
    read.textContent = 'Point at the plan to read a value';
  }

  function describe() {
    const now = state.soundBare ? 'without the treatment' : 'with the treatment', other = state.soundBare ? 'with it' : 'without it';
    if (map.kind === 'even') {
      setLegend({
        title: `How even the bass is, ${now}`,
        when: `Evenest spot ${map.best.value.toFixed(1)} dB (ring); at the head ${compare.now.toFixed(1)} dB, ${other} ${compare.other.toFixed(1)} dB`,
        note: 'Spread of the level from 40 to 200 Hz at ear height. Lighter is evener.',
        ramp: EVEN_RAMP,
        ticks: [[0, `${map.min.toFixed(1)} dB`], [0.5, ((map.min + map.max) / 2).toFixed(1)], [1, `${map.max.toFixed(1)} dB`]]
      });
    } else if (map.kind === 'level') {
      setLegend({
        title: `${Math.round(map.freq)} Hz across the room, ${now}`,
        when: `At the head ${signed(compare.now)} dB against the room average, ${other} ${signed(compare.other)} dB. The treatment changes ${Math.round(map.freq)} Hz at the head by ${signed(compare.change)} dB.`,
        note: 'Red is louder than the room average, blue quieter; deep blue is where this note all but disappears.',
        ramp: DIVERGING,
        ticks: [[0, '−12 dB'], [0.5, '0'], [1, '+12 dB']]
      });
    } else {
      setLegend({
        title: `Standing wave: ${modeLabel(map.mode)}`,
        when: `Rings for ${compare.with.toFixed(2)} s with the treatment, ${compare.without.toFixed(2)} s without`,
        note: 'The pattern is the same either way; treatment makes it die away sooner. Red and blue are both loud, in opposite phase; grey is silent.',
        ramp: DIVERGING,
        ticks: [[0, 'loud'], [0.5, 'silent'], [1, 'loud']]
      });
    }
  }

  function hover(sample) {
    if (!state.soundmap || !map) return;
    if (!sample) { read.textContent = 'Point at the plan to read a value'; return; }
    const { length: L, width: W } = app.getRoom().clear;
    const where = `${(sample.x + L / 2).toFixed(1)} m from the back wall, ${(sample.z + W / 2).toFixed(1)} m from the window wall`;
    read.textContent = map.kind === 'even' ? `${where}: the bass swings ${sample.value.toFixed(1)} dB`
      : map.kind === 'level' ? `${where}: ${signed(sample.value)} dB`
      : `${where}: ${Math.abs(sample.value) < 0.15 ? 'silent' : Math.abs(sample.value) > 0.85 ? 'loud' : 'in between'}`;
  }

  // how long one mode rings for with a given treatment
  const ringTime = (room, absorbers, m) => {
    const model = createResponseModel(room, { freqs: [m.f], fMax: m.f + 0.5, t60: Infinity, absorbers });
    return 6.91 / model.modes.find((q) => q.n.join() === m.n.join()).delta;
  };

  function refreshMap(delay = 250) {
    const kind = state.soundmap;
    if (!kind) return;
    clearTimeout(timer);
    read.textContent = 'Working it out…';
    timer = setTimeout(() => {
      const room = app.getRoom(), its = items(), all = layout();
      setup = listeningSetup(its);
      if (kind !== 'mode' && !setup) {
        map = null;
        views.setPlan(null);
        setLegend({ title: 'No monitors in this layout', when: '', note: 'Add studio monitors on stands from the Add tab.', ramp: EVEN_RAMP, ticks: [] });
        invalidate();
        return;
      }
      const shell = shellAbsorbers(room);
      const absorbers = [...shell, ...layoutAbsorbers(its, ASSETS, room)];
      if (kind === 'mode') {
        if (!mode) fillModes();
        map = modeMap(room, mode, { step: 0.1 });
        compare = { with: ringTime(room, [...shell, ...layoutAbsorbers(all, ASSETS, room)], mode), without: ringTime(room, shell, mode) };
      } else if (kind === 'even') {
        const model = bassModel(room, absorbers, EVEN_FREQS);
        map = bassMap(model, room, setup.monitors, { step: 0.2 });
        // the head, worked out exactly at the ear both ways (not read off a 0.2 m cell), for comparison
        const otherItems = state.soundBare ? all : withoutTreatment(all, ASSETS);
        const other = bassModel(room, [...shell, ...layoutAbsorbers(otherItems, ASSETS, room)], EVEN_FREQS);
        const atEar = (md) => flatness(EVEN_FREQS, md.level(setup.monitors, [setup.ear])).spread;
        compare = { now: atEar(model), other: atEar(other) };
      } else {
        const model = bassModel(room, absorbers, [freq]);
        map = bassMap(model, room, setup.monitors, { step: 0.1 });
        // the other way round: its own room average, and the head's level both ways, exactly at the ear
        const otherItems = state.soundBare ? all : withoutTreatment(all, ASSETS);
        const other = bassModel(room, [...shell, ...layoutAbsorbers(otherItems, ASSETS, room)], [freq]);
        const otherMap = bassMap(other, room, setup.monitors, { step: 0.1 });
        const now = model.level(setup.monitors, [setup.ear])[0], then = other.level(setup.monitors, [setup.ear])[0];
        compare = {
          now: now - map.mean, other: then - otherMap.mean,
          change: state.soundBare ? then - now : now - then               // treated minus bare, at the head
        };
      }
      views.setPlan(map, { colour: colourFor(map), items: its, assets: ASSETS, setup, best: map.best });
      describe();
      invalidate();
    }, delay);
  }

  function setMap(kind) {
    if (kind === state.soundmap) return;
    const was = state.soundmap;
    if (kind && state.sunmap) app.setSunMap(false);        // one plan at a time
    state.soundmap = kind;
    document.querySelectorAll('[data-soundmap]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.soundmap === kind)));
    $('snd-freq-row').hidden = kind !== 'level';
    $('snd-mode-row').hidden = kind !== 'mode';
    legend.hidden = !kind;
    app.dock.autoFold('plan:sound', !!kind);
    views.plan.visible = !!kind;
    app.picking.select(null);
    if (kind === 'mode') fillModes();
    if (kind && !was) app.orbit.setView('soundplan', false);
    if (!kind && was) app.orbit.setView(app.dock.activeView(), false);
    app.dock.parkBar();
    if (kind) refreshMap(20);
    invalidate();
  }

  // ---- controls
  $('act-rays').addEventListener('click', () => setRays(!rays));
  document.querySelectorAll('[data-treatment]').forEach((b) => b.addEventListener('click', () => setBare(b.dataset.treatment === 'without')));
  document.querySelectorAll('[data-soundmap]').forEach((b) => b.addEventListener('click', () => setMap(state.soundmap === b.dataset.soundmap ? null : b.dataset.soundmap)));
  $('sound-legend-close').addEventListener('click', () => setMap(null));
  $('snd-freq').addEventListener('input', (e) => {
    freq = +e.target.value;
    $('snd-freq-lab').textContent = `${freq} Hz`;
    refreshMap(120);
  });
  $('snd-mode').addEventListener('change', (e) => {
    mode = modeChoices(app.getRoom()).find((m) => m.n.join(',') === e.target.value) ?? mode;
    refreshMap(0);
  });

  function refresh() {
    showTreatment();                           // a reloaded layout brings its pieces back visible
    refreshRays();
    refreshMap(300);
    app.response.refresh();
  }

  // leaving the Sound tab puts the treatment back, so nothing stays hidden while editing
  function onTab(tab) {
    if (tab !== 'sound') setBare(false);
  }

  return { setRays, setMap, setBare, refresh, onTab };
}
