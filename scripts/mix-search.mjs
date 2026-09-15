// Searches the room for the best mix position and reports what the Pallet studio treatment does there.
//   npm run mix
// The bare room's damping comes from its surfaces (room.json's acoustics block: plastered concrete,
// the glazing, the floor slab), not from a guessed reverberation time. Every listening distance along
// the centreline and triangle size from 1.30 to 1.50 m is scored on how flat the bass arrives at the
// ears (room modes, 40-250 Hz): the spread averaged over the furnishing cases below, taking the worst
// within 0.1 m for head movement. A box sounds the same from either end, so this runs facing the back
// wall; which end to face is decided by the walls themselves (see the preset's note).
import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const A = await server.ssrLoadModule('/src/analysis/roomAcoustics.js');
  const { SAVED_ROOM: room, wallFrame } = await server.ssrLoadModule('/src/scene/spec.js');
  const { length: L } = room.clear;
  const TWEETER = 1.195, EAR = 1.2, HALF_HEAD = 0.075;
  const freqs = A.logFrequencies(40, 250);
  // the surfaces are known; what is not is how much else in the room soaks up bass
  const CASES = [
    { label: 'as room.json', materials: {} },
    { label: 'nothing else (0 m²)', materials: { furnishing: 0 } },
    { label: 'more furnishing (6 m²)', materials: { furnishing: 6 } }
  ];
  const shells = CASES.map((c) => A.shellAbsorbers(room, c.materials));
  // the monitor's own roll-off is left out so it doesn't count against every position alike
  const model = (absorbers) => A.createResponseModel(room, { freqs, fMax: 500, highpass: 0, t60: Infinity, absorbers });
  const models = shells.map(model);

  const m = { ...A.DEFAULT_SHELL, ...room.acoustics };
  console.log(`Shell: walls ${A.MATERIALS[m.walls].label.toLowerCase()}, windows ${A.MATERIALS[m.windows].label.toLowerCase()}, floor ${A.MATERIALS[m.floor].label.toLowerCase()}, ceiling ${A.MATERIALS[m.ceiling].label.toLowerCase()}, furnishing ${m.furnishing} m²`);
  console.log('Bare-room reverberation time (Sabine)');
  CASES.forEach((c, i) => console.log(`  ${c.label.padEnd(24)} ${A.BANDS.map((f) => `${f} Hz ${A.sabineT60(room, shells[i], f).toFixed(1)} s`).join('  ')}`));

  const long = room.walls.find((w) => w.side === '-z');
  const piers = A.solidSpans(long, wallFrame(room, long));
  const rows = [];
  for (const S of [1.3, 1.35, 1.4, 1.45, 1.5]) {
    for (let dl = 1.2; dl <= L - 2.5; dl += 0.02) {
      if (dl - S * Math.cos(Math.PI / 6) < 0.3) continue;              // stands clear of the wall
      const ex = -(L / 2 - dl), mx = -(L / 2 - dl + S * Math.cos(Math.PI / 6));
      const mons = [[mx, TWEETER, -S / 2], [mx, TWEETER, S / 2]], ears = [[ex, EAR, -HALF_HEAD], [ex, EAR, HALF_HEAD]];
      const spreads = models.map((md) => A.flatness(freqs, md.level(mons, ears)).spread);
      // the window-wall side reflections: on a pier, where a panel can hang, or on glass?
      const hits = mons.map((mo) => A.firstReflections(room, mo, [ex, EAR, 0]).find((r) => r.surface === '-z').point[0]);
      const onPier = piers.some(([a, b]) => Math.min(...hits) >= a + 0.1 && Math.max(...hits) <= b - 0.1);
      rows.push({ S, dl: +dl.toFixed(2), mean: spreads.reduce((s, v) => s + v, 0) / spreads.length, spreads, onPier });
    }
  }
  for (const r of rows) r.score = Math.max(...rows.filter((q) => q.S === r.S && Math.abs(q.dl - r.dl) <= 0.101).map((q) => q.mean));
  rows.sort((a, b) => a.score - b.score);

  const fmt = (r) => `ear ${r.dl.toFixed(2)} m from the front wall (${(r.dl / L * 100).toFixed(0)}%)  S ${r.S.toFixed(2)}  score ${r.score.toFixed(2)} dB  (${r.spreads.map((v) => v.toFixed(2)).join(' / ')})${r.onPier ? '  side reflections on a pier' : ''}`;
  console.log(`\nSpread per case: ${CASES.map((c) => c.label).join(' / ')}`);
  console.log('Best overall'); rows.slice(0, 6).forEach((r) => console.log(' ', fmt(r)));
  console.log('\nBest in the 30-45% band'); rows.filter((r) => r.dl / L >= 0.3 && r.dl / L <= 0.45).slice(0, 5).forEach((r) => console.log(' ', fmt(r)));
  console.log('\nBest with the window-wall reflections on a pier'); rows.filter((r) => r.onPier).slice(0, 3).forEach((r) => console.log(' ', fmt(r)));
  const rule = rows.find((r) => r.S === 1.45 && Math.abs(r.dl - 0.38 * L) < 0.011);
  if (rule) console.log('\nPlain 38% rule, 1.45 m triangle\n ', fmt(rule), ` rank ${rows.indexOf(rule) + 1}/${rows.length}`);

  // The Pallet studio preset: its mix position, bare room against the treatment it carries
  const preset = (await server.ssrLoadModule('/src/assets/presets/pallet-studio.json')).default;
  const catalog = (await server.ssrLoadModule('/src/assets/catalog.json')).default;
  const { coverCeiling } = await server.ssrLoadModule('/src/assets/ceilingCover.js');
  const { findClashes } = await server.ssrLoadModule('/src/assets/clash.js');
  const assets = Object.fromEntries(catalog.assets.map((a) => [a.id, a]));
  const items = [...preset.items, ...(preset.coverCeiling ? coverCeiling(room) : [])];
  const mons = items.filter((i) => i.type === 'monitor-stand').map((mo) => [mo.x, TWEETER, mo.z]);
  const S = Math.hypot(mons[0][0] - mons[1][0], mons[0][2] - mons[1][2]);
  const midX = (mons[0][0] + mons[1][0]) / 2, ex = midX - Math.sign(midX) * S * Math.cos(Math.PI / 6);
  const ears = [[ex, EAR, -HALF_HEAD], [ex, EAR, HALF_HEAD]];
  const treatment = A.layoutAbsorbers(items, assets, room);
  const report = (label, shell, only) => {
    const absorbers = [...shell, ...treatment.filter(only)];
    const md = model(absorbers);
    const db = md.level(mons, ears), fl = A.flatness(freqs, db);
    const ring = md.modes.filter((q) => q.f > 30 && q.f < 125 && q.kind === 'axial').map((q) => `${q.f.toFixed(0)} Hz ${(6.91 / q.delta).toFixed(2)} s`);
    console.log(`  ${label.padEnd(30)} spread ${fl.spread.toFixed(2)} dB  T60 ${A.BANDS.slice(0, 3).map((f) => `${f} Hz ${A.sabineT60(room, absorbers, f).toFixed(2)} s`).join(', ')}`);
    console.log(`  ${''.padEnd(30)} peaks ${A.peaks(freqs, db, 3).slice(0, 4).map((p) => `${p.f.toFixed(0)} Hz +${p.db.toFixed(1)}`).join(', ')}`);
    console.log(`  ${''.padEnd(30)} axial modes ring for ${ring.join(', ')}`);
  };
  console.log(`\nPallet studio preset: ear ${(L / 2 - Math.abs(ex)).toFixed(2)} m from the ${ex < 0 ? 'back' : 'street'} wall, S ${S.toFixed(2)}`);
  report('bare concrete room', shells[0], () => false);
  report('+ ceiling panels', shells[0], (a) => a.type === 'ceiling-panel');
  report('+ porous panels, corner traps', shells[0], (a) => a.type !== 'membrane-trap' && a.type !== 'rug');
  report('+ 45 Hz membrane traps', shells[0], (a) => a.type !== 'rug');
  report('+ rugs', shells[0], () => true);

  // Rugs and the ceiling do their work above the bass: Eyring reverberation time in the mids and
  // highs against EBU Tech 3276's target, bare, with half the ceiling covered, treated without rugs,
  // and with each rug in turn
  const mids = A.BANDS.filter((f) => f >= 250);
  const t60Row = (label, absorbers) => console.log(`  ${label.padEnd(30)} ${mids.map((f) => `${f} Hz ${A.eyringT60(room, absorbers, f).toFixed(2)} s`).join('  ')}`);
  const rugs = items.map((it, i) => ({ it, i })).filter(({ it }) => it.type === 'rug');
  const rugAbsorber = (i) => A.layoutAbsorbers([items[i]], assets, room)[0];
  const noRugs = [...shells[0], ...treatment.filter((a) => a.type !== 'rug')];
  const halfCeiling = [...shells[0], ...A.layoutAbsorbers(items.filter((it) => it.type !== 'ceiling-panel' || it.x < 0), assets, room)];
  console.log(`\nMids and highs (Eyring); EBU Tech 3276 target ${A.ebuTarget(room).toFixed(2)} s ± 0.05`);
  t60Row('bare concrete room', shells[0]);
  t60Row('front half of ceiling only', halfCeiling);
  const curtainsSet = (open) => [...shells[0], ...A.layoutAbsorbers(items.map((it) => (it.type === 'curtain' ? { ...it, open } : it)), assets, room)];
  if (items.some((it) => it.type === 'curtain')) {
    t60Row('everything, curtains open', curtainsSet(true));
    t60Row('everything, curtains closed', curtainsSet(false));
  }
  t60Row('treated, no rugs', noRugs);
  for (const { it, i } of rugs) t60Row(`+ rug at x ${it.x}, ${(it.w ?? assets.rug.w)} × ${(it.d ?? assets.rug.d)} m`, [...noRugs, rugAbsorber(i)]);
  if (rugs.length > 1) t60Row('+ all rugs', [...noRugs, ...rugs.map(({ i }) => rugAbsorber(i))]);
  const clashes = findClashes(items, assets, room);
  console.log(clashes.length ? `  clashes: ${clashes.map((c) => c.message).join('; ')}` : '  no clashes');
} finally {
  await server.close();
}
