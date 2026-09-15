// The sound treatment as a parts list: what to buy or build, how big, what from, and where it goes.
// Counts, sizes and positions come from a layout (the Mix room) and the catalog, so the list follows
// the room; how each piece is built is written down here. Pure: no three.js, tested in node.
//   npm run parts   writes docs/sound-treatment.md

import { membraneFrequency } from './roomAcoustics.js';

const mm = (v) => Math.round(v * 1000);
const m2 = (v) => (+v.toFixed(2)).toString();
const SLAB = 0.6 * 1.2;                          // mineral wool slabs are sold 600 x 1200 mm
const LEV = 1 / 1.95583;                         // euros per lev, the fixed conversion rate

// Prices in euros with VAT, Bulgaria, September 2026: [low, high] per unit, and where they come from.
// A range without a source is an estimate.
export const PRICES = {
  wool100:  { unit: 'Mineral wool, per m² of 100 mm', range: [+(63.71 * LEV / 4.32).toFixed(2), +(78.96 * LEV / 2.88).toFixed(2)], source: 'Rockwool Multirock 100 mm (63.71 лв for 4.32 m²) to Rockwool Acoustic Extra 100 mm, 70 kg/m³ (78.96 лв for 2.88 m²)', url: 'https://polaris-bg.com/bg/kamenna-vata-rockwool-multirock-100/p647.html' },
  birch12:  { unit: '12 mm birch plywood, sheet 1525 × 1525 mm', range: [46, 54], source: 'Eurotrading C/C to BB/BB; WoodCom €50', url: 'https://www.eurotrading.bg/shperplat/plywood-FK.htm' },
  mdf18:    { unit: '18 mm MDF, sheet 2800 × 2070 mm', range: [+(100.28 * LEV).toFixed(2), 64.8], source: 'GS Stroimarket 100.28 лв to G-M Varna €64.80', url: 'https://gsstroimarket.bg/product/19451-mdf-18mm-2800h2070' },
  spruce:   { unit: 'Planed spruce, board 18 × 100 × 3000 mm', range: [5.21, 7], source: 'Praktis, planed spruce/fir, €5.21', url: 'https://praktis.bg/rendosana-daska-smarch-ela-18x100x3000mm' },
  fabric:   { unit: 'Acoustic fabric, per metre, 1.5 m wide', range: [8, 64.9], source: 'budget polyester acoustic fabric (estimate) to Camira Blazer Lite €64.90', url: 'https://meinmic.com/Camira-Fabrics-sold-by-the-meter-Blazer-Lite' },
  hanger:   { unit: 'Ceiling hanging kit, per panel', range: [9, 15], source: 'cable suspension kit £7.50', url: 'https://www.homewardsound.co.uk/products/panel-suspension-kit' },
  trapKit:  { unit: 'Trap fixings, per trap', range: [15, 25], source: 'foam tape, acoustic sealant, screws, glue (estimate)' },
  stand:    { unit: 'Panel stand', range: [20, 40], source: 'two uprights and feet, beech or spruce, and fixings (estimate)' },
  velvet:   { unit: 'Curtain velvet, per metre', range: [17.5, 23], source: 'perdeta.online velvet, €17.50-23 per metre', url: 'https://perdeta.online/category.php?cat_id=1&sub_cat_id=81' },
  sewing:   { unit: 'Curtain sewing, per metre', range: [5.23, 10], source: 'perdeta.online sewing €5.23 per metre, more with a lining', url: 'https://perdeta.online/category.php?cat_id=1&sub_cat_id=81' },
  track:    { unit: 'Ceiling curtain track, up to 1.5 m', range: [16, 16], source: "Studio '79 single aluminium ceiling track", url: 'https://studio79.bg/edinichna-relsa-za-tavan/' },
  rug:      { unit: 'Rug, 240 × 340 cm', range: [100, 1089], source: 'eMAG synthetic from 195.58 лв to Domtex wool €1,089', url: 'https://www.e-kilimi.com/p/kilim-240-340-valnen-864/' },
  underlay: { unit: 'Rug underlay, per m²', range: [5, 10], source: 'felt or foam rug underlay (estimate)' }
};

const BOARD = 3, SHEET_MDF = 2.8 * 2.07, FABRIC_WIDTH = 1.5;
const line = (what, qty, key) => {
  const [lo, hi] = PRICES[key].range;
  return { what, qty, key, lo: qty * lo, hi: qty * hi };
};
const boards = (perimeter) => Math.ceil(perimeter * 1.1 / BOARD);                 // 10% for cutting
const fabricM = (area) => Math.ceil(area / FABRIC_WIDTH * 10) / 10;              // to the nearest 0.1 m
// fabric for a panel face w x h, wrapped round its depth d to the back
const wrap = (w, h, d) => (w + 2 * d + 0.1) * (h + 2 * d + 0.1);
const woolLine = ([t, area]) => line(`${m2(area * 1.1)} m² of ${mm(t)} mm mineral wool, with 10% for cutting`, area * 1.1 * t / 0.1, 'wool100');

// How each treatment piece is made. `wool` is the mineral wool it uses per piece: [thickness m, area m^2].
export const SPECS = {
  'membrane-trap': {
    build: (a) => {
      const ac = a.acoustic, f = membraneFrequency(ac.mass, ac.depth);
      return [
        `Built as two sealed boxes stacked, each ${mm(a.w)} × ${mm(a.h / 2)} mm and ${mm(a.d)} mm deep, so every front fits one sheet.`,
        `Back, sides, top and bottom: 18 mm MDF, glued and screwed, every inside seam sealed with acoustic sealant. The box must be airtight.`,
        `Front: 12 mm birch plywood (about ${ac.mass} kg/m²), ${mm(ac.face[0])} × ${mm(ac.face[1] / 2)} mm, sitting on 10 mm closed-cell foam tape round the edge so it can move, held by screws through the tape, not glued.`,
        `Inside: a ${mm(ac.depth)} mm air space with 50 mm mineral wool (40-60 kg/m³) hung loose behind the front, not touching it.`,
        `Tuning: 60 / √(${ac.mass} × ${ac.depth}) = ${f.toFixed(0)} Hz. Measure the room first; to lower it add mass to the front or depth to the box, to raise it do the opposite.`
      ];
    },
    wool: (a) => [0.05, a.acoustic.face[0] * a.acoustic.face[1]],
    why: 'Takes the worst bass peak, the 45 Hz length mode, where that mode is strongest.'
  },
  'corner-trap': {
    build: (a) => [
      `Two units stacked floor to ${m2(a.h)} m, each ${mm(a.w)} × ${mm(a.h / 2)} mm and ${mm(a.d)} mm deep.`,
      `Fill: three layers of 100 mm mineral wool slab (40-60 kg/m³), ${mm(a.w)} × ${mm(a.h / 2)} mm, stacked to ${mm(a.d)} mm deep.`,
      `Frame: 18 × 44 mm pine round the edges, wrapped in breathable acoustic fabric.`
    ],
    wool: (a) => [0.1, 3 * a.w * a.h],                   // three layers of 100 mm slab
    why: 'Corners are where every room mode has pressure: broadband bass absorption.'
  },
  'reflection-panel': {
    build: (a) => [
      `${mm(a.acoustic.face[1])} × ${mm(a.acoustic.face[0])} mm, ${mm(a.acoustic.thickness)} mm thick: one slab of mineral wool (40-60 kg/m³) in an 18 × ${mm(a.acoustic.thickness)} mm pine frame, faced with breathable acoustic fabric.`,
      `Hung upright, centred ${m2(((a.y0 ?? 0) + a.h) / 2)} m above the floor.`
    ],
    wool: (a) => [a.acoustic.thickness, a.acoustic.face[0] * a.acoustic.face[1]],
    why: 'Absorbs a monitor\'s first reflection off the wall before it reaches the ears.'
  },
  gobo: {
    build: (a) => [
      `Two ${mm(1.2)} × ${mm(0.6)} mm, 100 mm panels (built like the reflection panels) side by side, bottom edge ${m2(a.acoustic.faceY - a.acoustic.face[1] / 2)} m above the floor.`,
      `Stand: two 25 × 25 mm uprights ${m2(1.8)} m tall with ${mm(a.d)} mm feet, screwed to the panel frames.`
    ],
    wool: () => [0.1, 1.2 * 1.2],
    why: 'The side reflection on the window wall falls on glass, where nothing can hang; move it aside when not mixing.'
  },
  panel: {
    build: (a) => [
      `${mm(a.acoustic.face[1])} × ${mm(a.acoustic.face[0])} mm, ${mm(a.acoustic.thickness)} mm thick: mineral wool in a pine frame faced with acoustic fabric, hung upright from ${m2(a.y0)} to ${m2(a.h)} m.`
    ],
    wool: (a) => [a.acoustic.thickness, a.acoustic.face[0] * a.acoustic.face[1]],
    why: 'Breaks up the flutter between the window wall and the mural wall.'
  },
  'ceiling-panel': {
    build: (a) => [
      `${mm(a.panel.thickness)} mm mineral wool (40-60 kg/m³) in light pine frames faced with acoustic fabric; panels longer than ${mm(1.2)} mm are two slabs butted in one frame.`,
      `Hung ${mm(a.panel.gap)} mm below the ceiling on cloud brackets or wires (the air gap makes them work lower), 20 mm joints between panels, 100 mm clear round every light batten.`
    ],
    why: 'The largest absorber in the room: without the whole ceiling the mids stay at twice the target.'
  },
  rug: {
    build: (a) => [`${m2(a.w)} × ${m2(a.d)} m, heavy wool or thick pile, on a 10 mm felt or foam underlay: with it a rug absorbs about 0.57 at 500 Hz, straight on tiles about 0.14.`],
    why: 'The floor is tiles; rugs take the mids and highs, and keep the chair off the tiles.'
  },
  curtain: {
    build: (a) => [
      `Heavy lined velour (about 600 g/m²), ${m2(a.w)} m wide finished and ${m2(a.h - 0.02)} m drop; cut ${m2(2 * a.w)} m of fabric width for double fullness.`,
      `On a ${m2(a.w)} m ceiling track 120 mm in from the glass, so it laps the window 150 mm each side.`
    ],
    why: 'Closed when mixing: takes the glass reflection from behind the listener. Open, it stacks on the piers.'
  }
};

// What each group of pieces costs: material lines with quantities. n pieces; row has the wool and sizes.
export const COSTS = {
  'membrane-trap': (a, n, row) => {
    const bw = a.w, bh = a.h / 2, d = a.d, t = 0.018;
    const boxArea = bw * bh + 2 * bh * d + 2 * (bw - 2 * t) * d;                  // back, sides, top and bottom
    return [
      line(`${2 * n} sheets of 12 mm birch plywood, one front per sheet`, 2 * n, 'birch12'),
      line(`${Math.ceil(2 * n * boxArea * 1.15 / SHEET_MDF)} sheets of 18 mm MDF for ${2 * n} boxes`, Math.ceil(2 * n * boxArea * 1.15 / SHEET_MDF), 'mdf18'),
      woolLine(row.wool),
      line(`foam tape, sealant and screws for ${n} traps`, n, 'trapKit')
    ];
  },
  'corner-trap': (a, n, row) => {
    const units = 2 * n, uh = a.h / 2;
    return [
      woolLine(row.wool),
      line(`${boards(units * 2 * (a.w + uh))} spruce boards for ${units} frames`, boards(units * 2 * (a.w + uh)), 'spruce'),
      line(`${fabricM(units * (a.w + a.d + 0.1) * (uh + 0.1))} m of acoustic fabric`, fabricM(units * (a.w + a.d + 0.1) * (uh + 0.1)), 'fabric')
    ];
  },
  'ceiling-panel': (a, n, row, group) => {
    const t = a.panel.thickness;
    const per = group.reduce((s, p) => s + 2 * (p.w + p.d), 0);
    const cloth = group.reduce((s, p) => s + wrap(p.w, p.d, t), 0);
    return [
      woolLine(row.wool),
      line(`${boards(per)} spruce boards for ${n} frames`, boards(per), 'spruce'),
      line(`${fabricM(cloth)} m of acoustic fabric`, fabricM(cloth), 'fabric'),
      line(`${n} hanging kits`, n, 'hanger')
    ];
  },
  'reflection-panel': (a, n, row) => {
    const [fw, fh] = a.acoustic.face, t = a.acoustic.thickness;
    return [
      woolLine(row.wool),
      line(`${boards(n * 2 * (fw + fh))} spruce boards for ${n} frames`, boards(n * 2 * (fw + fh)), 'spruce'),
      line(`${fabricM(n * wrap(fw, fh, t))} m of acoustic fabric`, fabricM(n * wrap(fw, fh, t)), 'fabric')
    ];
  },
  gobo: (a, n, row) => [
    woolLine(row.wool),
    line(`${boards(n * 2 * 2 * (0.6 + 1.2))} spruce boards for ${2 * n} panel frames`, boards(n * 2 * 2 * (0.6 + 1.2)), 'spruce'),
    line(`${fabricM(n * 2 * wrap(0.6, 1.2, 0.1))} m of acoustic fabric`, fabricM(n * 2 * wrap(0.6, 1.2, 0.1)), 'fabric'),
    line(`${n} stand`, n, 'stand')
  ],
  panel: (a, n, row) => {
    const [fw, fh] = a.acoustic.face, t = a.acoustic.thickness;
    return [
      woolLine(row.wool),
      line(`${boards(n * 2 * (fw + fh))} spruce boards for ${n} frames`, boards(n * 2 * (fw + fh)), 'spruce'),
      line(`${fabricM(n * wrap(fw, fh, t))} m of acoustic fabric`, fabricM(n * wrap(fw, fh, t)), 'fabric')
    ];
  },
  rug: (a, n) => [
    line(`${n} rugs, ${m2(a.w)} × ${m2(a.d)} m`, n, 'rug'),
    line(`${m2(n * a.w * a.d)} m² of underlay`, n * a.w * a.d, 'underlay')
  ],
  curtain: (a, n) => [
    line(`${m2(n * 2 * a.w)} m of heavy velvet`, n * 2 * a.w, 'velvet'),
    line(`sewing ${m2(n * 2 * a.w)} m, with lining at the high end`, n * 2 * a.w, 'sewing'),
    line(`${n} ceiling tracks`, n, 'track')
  ]
};

const ORDER = ['membrane-trap', 'corner-trap', 'ceiling-panel', 'reflection-panel', 'gobo', 'panel', 'rug', 'curtain'];

// Where a piece sits, in words: against which wall, and how far along it.
function placement(it, a, room) {
  const { length: L, width: W } = room.clear;
  const fromBack = it.x + L / 2, fromWindowWall = it.z + W / 2;
  if (a.mount === 'ceiling') return 'ceiling';
  if (it.type === 'rug') return `on the floor, centred ${m2(fromBack)} m from the back wall, on the centreline`;
  if (it.type === 'gobo') return `free-standing ${m2(fromWindowWall)} m out from the window wall, centred ${m2(fromBack)} m from the back wall`;
  const walls = [
    { name: 'back wall', gap: fromBack, along: `${m2(fromWindowWall)} m from the window wall` },
    { name: 'street wall', gap: L / 2 - it.x, along: `${m2(fromWindowWall)} m from the window wall` },
    { name: 'window wall', gap: fromWindowWall, along: `${m2(fromBack)} m from the back wall` },
    { name: 'mural wall', gap: W / 2 - it.z, along: `${m2(fromBack)} m from the back wall` }
  ].sort((p, q) => p.gap - q.gap);
  const [first, second] = walls;
  if (second.gap < 0.5) return `${first.name} and ${second.name} corner`;
  return `${first.name}, centred ${first.along}`;
}

// items: a layout's items with its fitted ceiling panels; assets: id -> catalog entry.
export function treatmentList(items, assets, room) {
  const out = [];
  for (const type of ORDER) {
    const group = items.filter((it) => it.type === type);
    if (!group.length) continue;
    const a = assets[type], spec = SPECS[type];
    const row = { type, name: a.label, count: group.length, build: spec.build(a), why: spec.why };
    if (type === 'ceiling-panel') {
      const sizes = new Map();
      for (const p of group) {
        const key = `${mm(Math.max(p.w, p.d))} × ${mm(Math.min(p.w, p.d))} mm`;
        sizes.set(key, (sizes.get(key) ?? 0) + 1);
      }
      row.size = [...sizes].sort((p, q) => parseInt(q[0]) - parseInt(p[0])).map(([k, n]) => `${n} × ${k}`).join(', ');
      row.area = group.reduce((s, p) => s + p.w * p.d, 0);
      row.wool = [a.panel.thickness, row.area];
      row.where = [`the whole ceiling, ${m2(row.area)} m² in ${group.length} fitted panels`];
    } else {
      row.size = type === 'rug' ? `${m2(a.w)} × ${m2(a.d)} m` : `${mm(a.w)} mm wide, ${mm(a.h - (a.y0 ?? 0))} mm tall, ${mm(a.d)} mm deep`;
      if (spec.wool) {
        const [t, area] = spec.wool(a);
        row.wool = [t, area * group.length];
      }
      row.where = group.map((it) => placement(it, a, room));
    }
    row.cost = COSTS[type](a, group.length, row, group);
    row.lo = row.cost.reduce((s, c) => s + c.lo, 0);
    row.hi = row.cost.reduce((s, c) => s + c.hi, 0);
    out.push(row);
  }
  return out;
}

// Mineral wool to buy, by thickness, in 600 x 1200 mm slabs with 10% for cutting.
export function woolTotals(list) {
  const byT = new Map();
  for (const r of list) if (r.wool) byT.set(r.wool[0], (byT.get(r.wool[0]) ?? 0) + r.wool[1]);
  return [...byT].sort((p, q) => q[0] - p[0]).map(([t, area]) => ({ thickness: t, area, slabs: Math.ceil(area * 1.1 / SLAB) }));
}

const eur = (v, digits = 0) => `€${v.toLocaleString('en-GB', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;

export function totalCost(list) {
  return { lo: list.reduce((s, r) => s + r.lo, 0), hi: list.reduce((s, r) => s + r.hi, 0) };
}

export function treatmentMarkdown(list, { layout }) {
  const lines = [
    '# Sound treatment parts list',
    '',
    `Everything in the ${layout} that is there for sound, with what it is made of and where it goes. Generated from the layout by \`npm run parts\`; do not edit by hand. Distances are from the inside faces of the walls: the back wall is the solid end the desk faces, the window wall is the long wall with five windows, the mural wall is opposite it, the street wall has two windows.`,
    '',
    'Measure the room before building the tuned traps (a calibrated measurement mic and REW): the tuning is calculated, and real walls and glass shift it.',
    '',
    `Estimated cost, all materials: **${eur(totalCost(list).lo)}-${eur(totalCost(list).hi)}** with VAT (Bulgarian prices, September 2026; the low end is plain materials and a synthetic rug, the high end premium fabric and wool rugs). The breakdown is under each item and in the summary at the end.`,
    ''
  ];
  for (const r of list) {
    lines.push(`## ${r.count} × ${r.name}`, '', `**Size:** ${r.size}`, '', `**Why:** ${r.why}`, '', '**Build:**', '');
    for (const b of r.build) lines.push(`- ${b}`);
    lines.push('', '**Where:**', '');
    const where = new Map();
    for (const w of r.where) where.set(w, (where.get(w) ?? 0) + 1);
    for (const [w, n] of where) lines.push(`- ${n > 1 ? `${n} × ` : ''}${w}`);
    lines.push('', `**Estimate:** ${eur(r.lo)}-${eur(r.hi)}`, '');
    for (const c of r.cost) lines.push(`- ${c.what}: ${eur(c.lo)}-${eur(c.hi)}`);
    lines.push('');
  }
  lines.push('## Mineral wool to buy', '', '| Thickness | Area | Slabs, 600 × 1200 mm, with 10% for cutting |', '|---|---|---|');
  for (const w of woolTotals(list)) lines.push(`| ${mm(w.thickness)} mm | ${m2(w.area)} m² | ${w.slabs} |`);
  const total = totalCost(list);
  lines.push('', '## Cost summary', '', '| Item | Low | High |', '|---|---|---|');
  for (const r of list) lines.push(`| ${r.count} × ${r.name} | ${eur(r.lo)} | ${eur(r.hi)} |`);
  lines.push(`| **Total** | **${eur(total.lo)}** | **${eur(total.hi)}** |`, '', '### Prices used', '');
  for (const p of Object.values(PRICES)) lines.push(`- ${p.unit}: ${eur(p.range[0], 2)}-${eur(p.range[1], 2)}, ${p.url ? `[${p.source}](${p.url})` : p.source}`);
  lines.push('', 'Not included: tools, delivery, labour, the measurement mic. Mineral wool is priced by area; the slab counts below are what to order.');
  lines.push('', 'The corner traps\' three layers of 100 mm slab are in the 100 mm row. Use 40-60 kg/m³ acoustic mineral wool (stone or glass wool) throughout, and a breathable fabric: if you can blow through it easily, sound goes in.', '');
  return lines.join('\n');
}
