import { matWall, matCeil, albedoOf } from '../scene/materials.js';

const $ = (id) => document.getElementById(id);
const KEY = 'studio.finishes';
const hexOf = (m) => `#${m.color.getHexString()}`;

// Wall and ceiling colours from the View tab. A colour is also a reflectance: the daylight bounce and the
// LED light estimate read it from the same albedo object, so a darker wall darkens the room as well as
// looking darker. Kept per browser.
export function installFinishes(app, { albedo, daylight, relight, invalidate }) {
  const surfaces = { wall: [matWall, $('finish-wall')], ceiling: [matCeil, $('finish-ceiling')] };
  const defaults = { wall: hexOf(matWall), ceiling: hexOf(matCeil) };

  function apply(name, hex, save = true) {
    const [mat, input] = surfaces[name];
    mat.color.set(hex);
    input.value = hex;
    albedo[name] = albedoOf(mat);
    if (!save) return;
    try { localStorage.setItem(KEY, JSON.stringify({ wall: hexOf(matWall), ceiling: hexOf(matCeil) })); } catch { /* not kept */ }
    changed();
  }

  let timer = 0;
  function changed() {
    invalidate(true);                              // colour now; the light follows once the picker settles
    clearTimeout(timer);
    timer = setTimeout(() => {
      daylight.refresh();
      relight();
      app.light?.refresh(0);
      invalidate(true);
    }, 120);
  }

  let stored = {};
  try { stored = JSON.parse(localStorage.getItem(KEY)) || {}; } catch { /* defaults */ }
  for (const name of Object.keys(surfaces)) {
    if (/^#[0-9a-f]{6}$/i.test(stored[name] ?? '')) apply(name, stored[name], false);
    else surfaces[name][1].value = defaults[name];
    surfaces[name][1].addEventListener('input', (e) => apply(name, e.target.value));
  }
  $('finish-reset').addEventListener('click', () => {
    apply('wall', defaults.wall, false);
    apply('ceiling', defaults.ceiling);
  });
}
