# Studio — Burgas

A daylight and layout study for one room. The output is a browser app: an accurate 3D
shell of the space, a physically correct sun, and a furniture layout you can move around.

This file holds the facts that must not drift. If something here conflicts with the code,
the code is wrong.

---

## The room

Internal clear dimensions, in metres. These are measured on site and are not negotiable.

| | |
|---|---|
| Length | 11.40 |
| Width | 3.95 |
| Clear height | 3.10 |
| Wall thickness | 0.12, sitting **outside** the clear dimensions |
| Floor area | 45.03 m² |
| Volume | 139.6 m³ |

Walls are modelled as extruded outlines with real openings punched through them, not as
boxes with window images on the surface. Openings must cut the geometry, because the whole
point is that sunlight passes through them and lands on the floor.

## Axis convention

Right-handed, Y up, room centred on the origin, floor at y = 0.

| Direction | Wall | Bearing | Glazing |
|---|---|---|---|
| +x | Street end wall | 45° NE | 2 windows |
| −x | Back end wall | 225° SW | solid |
| −z | Long wall | 315° NW | 5 windows |
| +z | Long wall (mural, sofa) | 135° SE | solid |

Standing at the back of the room facing the street windows, the five windows are on your
left. This matches the site photographs.

## Windows

Seven openings, all the same size. Dimensions were derived by scaling off a site photo
against the known 3.95 × 3.10 end wall, and the derivation closed to within 10 mm.

| | |
|---|---|
| Width | 1.20 |
| Sill | 0.90 |
| Head | 2.85 (so 1.95 tall, leaving 0.25 of wall above) |
| Long wall | 5 openings, piers of 0.90 — 6 × 0.90 + 5 × 1.20 = 11.40 exactly |
| Street wall | 2 openings, piers of 0.517 |

Total glazing ≈ 16.4 m² against 45 m² of floor.

The app reads these numbers from `src/scene/room.json` — clear dimensions, wall thickness, site,
and every opening as an explicit position (`left` = distance from the wall's left-hand corner
seen from inside, facing that wall). `test/room.test.js` checks that file against the tables
here, so the two cannot quietly disagree. Change a measurement in both places in one commit.

The Shell tab edits openings and partitions and, under `npm run dev`, saves straight to
`room.json` (a static build downloads it instead). Moving a measured window in the app makes
`test/room.test.js` fail until the tables here say the same — that is the guard working, not a
bug. Unsaved shell edits live in a browser draft tied to the room.json they started from.

## Site and sun

Burgas, Bulgaria. **42.50 N, 27.46 E**, rounded to about a kilometre so the building is not identifiable;
that moves the sun by under a second and leaves every figure below as it was.

The street wall bearing of 45° was read off the compass in a Google Maps screenshot: north
sat about 35° left of screen up, and the street facade ran about 9° off screen horizontal.
It is accurate to roughly ±10°. Keep it adjustable in the UI. If a better figure ever
arrives, it changes only one constant.

Solar position uses the NOAA algorithm. Timezone is EET (+2), EEST (+3) from the last
Sunday in March to the last Sunday in October.

### Regression values — these must hold

Verified against the analytic maximum (90 − latitude + 23.44 = 70.94°).

| Case | Expected |
|---|---|
| 21 Jun, 13:10 local (tz +3) | altitude 70.94°, azimuth 179.0° |
| 21 Jun | sunrise 05:38, sunset 20:46 |
| 21 Dec (tz +2) | sunrise 07:42, sunset 16:36 |
| Solar noon, summer | ≈ 13:10 local, not 12:00 |

Sunrise and sunset here mean the sun's **centre on the geometric horizon (altitude 0°)**, with
no refraction or semi-diameter correction. The usual almanac convention (−0.833°) gives a day
about six minutes longer at each end. `test/solar.test.js` uses the 0° convention.

### Daylight consequences of the orientation

| Wall | June | Equinox | December |
|---|---|---|---|
| Street, NE, 2 windows | sunrise → 11:56 | sunrise → 10:46 | 07:42 → 08:50 |
| Long, NW, 5 windows | 14:28 → 20:46 | 15:20 → 19:02 | 15:26 → 16:34 |

"Equinox" is 23 September (EEST, +3). The March equinox falls in EET and gives different clock
times. A wall counts as sunlit while the sun is above 0° and within 90° of the wall's bearing.

This table is generated, not hand-kept: `npm run table -- <bearing>` prints it for any street
bearing, the Sun tab's Facade table shows it with the ±10° spread, and `test/facadeSun.test.js`
reads the rows above and fails if the generator stops reproducing them to within 3 minutes.

The room gets soft morning light down its length, nothing at midday, and six hours of low
raking western sun along the long wall in summer. That last one is the condition the whole
space has to be designed around. Any change that makes it harder to see is a regression.

---

## Rules that have already been learned the hard way

**The dimension table is the authority.** Geometry conforms to measured numbers. Never the
reverse. When a model or asset has different proportions, scale the model — do not adjust
the recorded dimension to suit it.

**Hidden is not absent.** Walls and the ceiling get cut away so you can see inside. They
must keep casting shadows while invisible. An invisible object casts no shadow in three.js,
and the first version had sunlight pouring straight down through a hidden ceiling slab at
midday. Use a material that writes neither colour nor depth, rather than `visible = false`.
Pieces hung from the ceiling (catalog `mount: "ceiling"`) are hidden with it the same way.

**Depth range matters.** A camera of 0.05 → 4000 destroyed depth precision and made
surfaces flicker against each other. Keep the ratio under about 10,000.

**Sky shaders need highp.** Drawing the sun from `dot(viewDir, sunDir)` compares values
like 0.99974 against 0.99982. Mobile GPUs at mediump cannot resolve that and the sun
vanishes or strobes. Measure angular distance as the chord length between the two unit
vectors instead.

**Render on demand.** The room does not animate. Render when the camera is easing, when a
control changes, or when something is dragged — not on a permanent 60 fps loop. Keep the
shadow map on manual update for the same reason.

**Sun timings are a feature, not decoration.** If a refactor changes the numbers in the
regression table, it is a bug regardless of how good it looks.

**Sky light enters through the windows, nowhere else.** The environment map lights only
surfaces outside the room's clear volume. Inside, each opening is a one-sided rect-area light
carrying the sky and ground radiance seen through that wall, each sunlit floor patch is an
upward rect-area light for the first bounce, and the rest is a uniform split-flux term.
`src/scene/roomlit.js` gates this per fragment. Do not add a light that reaches the interior
any other way — that is how v1 lit the room through its own ceiling.

**Shadows are simulated for the room only.** The sun's shadow camera is refitted around the room
(walls and slabs included) every time the sun moves, so the whole shadow map serves the
interior; the ground outside does not receive shadows. Anything added that should shade the
interior must sit inside that box, or the fit in `sun.js` has to grow to include it.

**Colour management is on.** Hex colours are sRGB. Labels, dimension lines and the selection
box live in a separate overlay scene drawn after tone mapping, so they keep their colours.

---

## Known limitations, in priority order

1. **Sky light is approximated, not traced.** Direct sun is accurate. Diffuse light comes in
   only through the openings, but furniture (a closed curtain included) does not block a window's view of the sky,
   nothing outside (buildings across the street) blocks it either, glass transmission is
   ignored, and a sun patch that lands on a wall rather than the floor only feeds the uniform
   bounce. Shaded areas are roughly right in level, not in detail.
2. **Dragging degenerates in near-horizontal views.** Furniture is moved by projecting the
   pointer onto the floor plane, which is nearly edge-on in the elevation and interior
   views.
3. **Partitions do not shade the sky.** They cast sun shadows, but the window lights and bounce
   term still treat the room as one open box, so a space behind a partition reads too bright.
4. **No door.** The room has one and it is not in `room.json` because it has not been
   measured. The app supports doors (hinge side, inward swing, clash check); add it by
   measurement, not by eye.
5. **Ambient occlusion speckles at silhouettes.** Three's GTAOPass leaves dotted noise along
   object edges; it runs at half strength as a compromise. N8AO is the candidate replacement.
6. **Room acoustics are a box with assumed surfaces.** `src/analysis/roomAcoustics.js` sums the
   room's modes (below ~250 Hz). Each mode is damped by the surfaces in room.json's `acoustics`
   block (plastered poured-concrete walls, modern double glazing, a tiled floor, the ceiling), weighted by the
   mode's pressure over each wall, window and slab, plus every catalog piece with an `acoustic`
   block. `npm run mix` searches the mix position across the uncertain cases and reports the
   treatment. Walls, glazing and floor are as the owner describes them; the ceiling is assumed,
   the absorption figures are published table values (63 Hz is extrapolated), mode frequencies ignore the
   windows' give, and furniture only counts as a lump of `furnishing`. Use it to compare
   positions and treatments, then measure (a calibrated mic and REW) before building tuned traps.
   Above the bass the room is judged by Eyring reverberation time against EBU Tech 3276's
   0.25 (V / 100 m³)^(1/3) = 0.28 s; with plastered concrete, tiles and glass it takes the whole
   ceiling and rugs to get there.
   The 45 Hz membrane traps are tuned to the third length mode, which depends only on the
   measured 11.40 m.
7. **Layouts live in one browser.** Named layouts are in `localStorage`; moving them between
   devices means exporting and importing the JSON file.
