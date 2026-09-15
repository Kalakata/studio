import { ROOM } from '../scene/spec.js';
import { createSunMap } from '../scene/sunMap.js';
import { dateLabel, point } from '../scene/sun.js';
import { sunHours } from '../analysis/sunHours.js';
import { ASSETS } from '../assets/build.js';
import { serialize } from '../assets/layouts.js';

// The sun-hours plan: switching it on and off, and recomputing it when the day, the bearing,
// the shell or the furniture outlines change.
export function installSunPlan(app, { overlay, canvas, camera, room, furniture, state, show, invalidate }) {
  app.sunMap = createSunMap({ overlay, canvas, getCamera: () => camera, onHover: (s) => app.dock.setSunMapHover(s) });

  let timer = 0;
  app.refreshSunMap = (delay = 0) => {
    if (!state.sunmap) return;
    clearTimeout(timer);
    app.dock.setSunMapLegend({ on: true, busy: true });
    // a timeout lets the "working" note paint before the day is computed on this thread
    timer = setTimeout(() => {
      const res = sunHours(ROOM, { doy: state.dayOfYear, year: new Date().getFullYear(), face: state.face });
      app.sunMap.build(res);
      app.sunMapFurniture();
      app.dock.setSunMapLegend({
        on: true, top: app.sunMap.top,
        when: `${dateLabel(state.dayOfYear)}, street wall facing ${state.face}° ${point(state.face)}`
      });
      invalidate();
    }, delay);
  };

  app.sunMapFurniture = () => {
    if (!state.sunmap) return;
    app.sunMap.setFurniture(serialize(furniture.items), ASSETS);
    invalidate();
  };

  app.setSunMap = (on) => {
    if (on === state.sunmap) return;
    if (on) app.sound?.setMap(null);              // one plan at a time
    state.sunmap = on;
    app.sunMap.group.visible = on;
    room.dims.visible = room.swings.visible = !on && show.dims;
    room.north.visible = !on;
    app.picking.select(null);
    app.selectOpening(null);
    app.dock.setSunMapLegend({ on });              // first: the framing measures around it
    app.orbit.setView(on ? 'sunplan' : app.dock.activeView(), false);
    if (on) app.refreshSunMap(30);
    invalidate();
  };
}
