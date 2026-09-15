// Writes docs/sound-treatment.md: the default layout's (the Mix room's) sound treatment as a parts list.
//   npm run parts
import { createServer } from 'vite';
import { mkdirSync, writeFileSync } from 'node:fs';

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { treatmentList, treatmentMarkdown } = await server.ssrLoadModule('/src/analysis/soundTreatment.js');
  const { SAVED_ROOM: room } = await server.ssrLoadModule('/src/scene/spec.js');
  const { coverCeiling } = await server.ssrLoadModule('/src/assets/ceilingCover.js');
  const mixRoom = (await server.ssrLoadModule('/src/assets/presets/mix-room.json')).default;
  const catalog = (await server.ssrLoadModule('/src/assets/catalog.json')).default;
  const assets = Object.fromEntries(catalog.assets.map((a) => [a.id, a]));
  const items = [...mixRoom.items, ...(mixRoom.coverCeiling ? coverCeiling(room) : [])];
  const text = treatmentMarkdown(treatmentList(items, assets, room), { layout: mixRoom.name });
  mkdirSync('docs', { recursive: true });
  writeFileSync('docs/sound-treatment.md', text);
  console.log(text);
} finally {
  await server.close();
}
