// Prints CLAUDE.md's "Daylight consequences" table, generated for a street-wall bearing.
//   npm run table            -> bearing from room.json
//   npm run table -- 38      -> street wall facing 38 deg
//   npm run table -- 38 2027 -> and for 2027
import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { facadeTable, markdownTable } = await server.ssrLoadModule('/src/analysis/facadeSun.js');
  const { ROOM, FACE } = await server.ssrLoadModule('/src/scene/spec.js');
  const face = process.argv[2] !== undefined ? Number(process.argv[2]) : FACE;
  const year = process.argv[3] !== undefined ? Number(process.argv[3]) : new Date().getFullYear();
  if (!Number.isFinite(face) || !Number.isFinite(year)) throw new Error('usage: npm run table -- [bearing] [year]');
  console.log(`Street wall bearing ${face}°, ${year}\n`);
  console.log(markdownTable(facadeTable(ROOM, face, { year })));
} finally {
  await server.close();
}
