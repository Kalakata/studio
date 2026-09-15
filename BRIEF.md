# Work order — rebuild the studio viewer as a proper project

Read `CLAUDE.md` first. It holds the measured facts and the rules that must survive this
rebuild. Read `reference/studio-room-v1.html` second — it is a working app and the
specification for behaviour. Do not treat it as code to preserve; treat it as a description
of what the new version has to do at least as well.

Work through the phases in order. Each has acceptance criteria. Do not start a phase until
the previous one passes.

---

## Why we are moving off a single HTML file

The v1 app is one self-contained file with three.js r128 loaded from a CDN. That was the
right trade for viewing on a phone with no tooling, and it cost us:

- r128 is from 2021. `OrbitControls` had to be hand-written because the CDN build does not
  include it, and `GLTFLoader` needed a second CDN.
- No npm, so no loaders, no post-processing, no test runner.
- A thousand lines in one scope, edited by string replacement.

The target is a Vite project with three.js from npm. It still builds to static files you can
host anywhere or open locally, but imports, hot reload and tests become available.

---

## Phase 1 — Scaffold and port, no behaviour change

```
npm create vite@latest studio -- --template vanilla
cd studio
npm i three
npm i -D vitest
```

Target tree:

```
src/
  main.js           bootstrap, render loop, resize
  scene/
    room.js         shell: floor, walls with openings, ceiling, edges
    openings.js     window geometry from the dimension table
    sky.js          dome shader, ground plane, horizon
    sun.js          NOAA solar position, light rig, palette by altitude
    cutaway.js      hide-but-still-cast logic for walls and ceiling
  assets/
    catalog.json    every asset: id, label, w, d, h, parts
    build.js        turns a catalog entry into a THREE.Group
    layout.json     the current arrangement
  interaction/
    orbit.js        camera, easing, view presets
    picking.js      select, drag, rotate, remove
  ui/
    dock.js         tabs, sliders, palette, selection bar
    styles.css
test/
  solar.test.js
reference/
  studio-room-v1.html
```

Port everything as-is. Same room, same windows, same sun, same assets, same UI. Use current
three.js — real `OrbitControls` can replace the hand-written camera, but keep the existing
view presets and the easing feel.

**Acceptance:** `npm run dev` shows a room indistinguishable from v1. `npm run build`
produces a static bundle that works from `file://`. The regression table in `CLAUDE.md`
passes as a vitest suite, including the ±10 minute sunrise and sunset checks. Idle CPU is
near zero because rendering is still on demand.

## Phase 2 — Data out of code

Move the room, the openings and the asset catalog into JSON. The room JSON holds the clear
dimensions, wall thickness, and an array of openings per wall. The asset catalog holds
dimensions and part lists. Nothing dimensional stays hard-coded in a `.js` file.

Add save and load of layouts to `localStorage`, with named layouts and an export to JSON
file. This is what makes the tool useful for comparing arrangements.

**Acceptance:** changing a number in `room.json` changes the model with no code edit. Two
layouts can be saved, switched between, and survive a reload. Exported JSON re-imports
cleanly.

## Phase 3 — Make the light honest

This is the highest-value work and the reason the project exists.

1. **Image-based lighting.** Replace the hemisphere light with a generated sky environment
   map (`PMREMGenerator` off the existing sky shader, regenerated when the sun moves more
   than a degree or two — not every frame). Ambient light should then fall off with depth
   into the room instead of passing through the ceiling.
2. **Ambient occlusion.** Add SSAO or GTAO through `EffectComposer`. Contact shadows under
   furniture and in the window reveals are what currently make the fit-out read flat.
3. **Soft shadows.** Move to VSM or a PCSS-style soft shadow so the penumbra widens with
   distance. Low winter sun through a 1.20 m opening should not give a razor edge 8 m away.
4. **Exposure and tone mapping.** ACES filmic, with `toneMappingExposure` driven by sun
   altitude, and correct colour space handling throughout.

Keep a quality switch: full effects on desktop, a reduced path on mobile. The v1 app runs
smoothly on a phone and that must not be lost.

**Acceptance:** at 18:30 on 21 June the western light reads as a deep raking patch with a
softening edge, and the shaded end of the room is visibly darker than the lit end. Frame
time on a mid-range phone stays under 16 ms in the reduced path. The regression table still
passes.

## Phase 4 — Editing the shell

Let the app edit what is currently fixed: window positions and sizes, a door, and
partitions. Openings become draggable along their wall with numeric entry for exact values.
Add the door once it has been measured on site.

Add a measure tool: click two points, get a dimension. Add a clash check that flags
furniture overlapping another piece or blocking a window or the door swing.

**Acceptance:** a window can be moved and resized in the app and the change persists to
`room.json`. The measure tool agrees with the known 11.40 and 3.95 to the millimetre.

## Phase 5 — Analysis output

The point of an accurate sun is answering questions.

- **Daylight hours per surface.** For a chosen date, how long each wall and each part of the
  floor receives direct sun. Render it as a plan heatmap.
- **Sun patch animation.** Scrub a whole day and leave a trail of where the patch travelled.
- **Annual view.** The table in `CLAUDE.md`, generated rather than hand-computed, for any
  facade bearing.
- **Camera positions.** Save viewpoints with focal length, for judging what a lens actually
  sees in an 11.4 × 3.95 room. A 35 mm from the back wall is a genuine question here.

**Acceptance:** the generated annual table reproduces the figures in `CLAUDE.md`.

---

## Asset catalog as it stands

Every item is defined in a canonical pose: width along x, depth along z, back face towards
−z, origin on the floor at the centre of the footprint. Dimensions in metres.

| id | label | w | d | notes |
|---|---|---|---|---|
| desk | Desk | 2.90 | 0.72 | top at 0.735, clears the 0.90 sill |
| chair | Chair | 0.62 | 0.62 | must face the desk, not away from it |
| sofa | Sofa | 2.40 | 0.95 | |
| table | Coffee table | 1.30 | 0.62 | |
| rug | Rug | 3.40 | 2.30 | |
| shelf | Shelving | 2.20 | 0.42 | 0.72 high, fits under the sills |
| cabinet | Cabinet | 0.90 | 0.45 | 1.85 high |
| panel | Acoustic panel | 0.60 | 0.07 | wall mounted, centre at 1.80 |
| plant | Plant | 0.40 | 0.40 | |
| amp | Amp | 0.50 | 0.42 | |
| pa | Speaker | 0.36 | 0.34 | floor standing |
| lamp | Floor lamp | 0.42 | 0.42 | |
| stool | Stool | 0.40 | 0.40 | |

Footprints are clamped inside the room using rotated half-extents, so a rotated piece still
cannot end up inside a wall. Keep that.

The default layout is in `layout.json` and reproduces the concept render: desk along the
street wall under the two windows, sofa against the mural wall, storage under the long
windows, acoustic panels on the 0.90 piers between them.

### On third-party asset libraries

Already investigated and rejected. Kenney's Furniture Kit is CC0, tiny, and covers most of
the palette, but it is low-poly game art and looked wrong against an accurate daylight
study. Poly Haven's photoreal CC0 models run 10–100 MB with 4K textures and would undo the
performance work. If better geometry is wanted later, the honest route is modelling the
actual furniture to its measured dimensions.

**ambientCG** is still worth taking: CC0 PBR textures for the concrete floor and plaster
walls would improve realism more than swapping furniture shapes, and pairs well with the
Phase 3 lighting work.

---

## Ground rules

- Metres throughout. No unit conversions anywhere in the code.
- Never regress the numbers in `CLAUDE.md`. Run the solar tests before claiming a phase
  complete.
- Mobile is a first-class target. It is how the room gets looked at on site.
- Prefer deleting a feature to carrying a broken one.
- When a site measurement contradicts this document, the measurement wins — update
  `CLAUDE.md` in the same commit as the code.
