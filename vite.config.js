import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const ROOM_FILE = fileURLToPath(new URL('./src/scene/room.json', import.meta.url));
const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;

// Dev server only: lets the Shell tab write src/scene/room.json. The page already holds the room
// it just saved, so that write is not hot-reloaded back into it.
function roomWriter() {
  let lastWrite = 0;
  return {
    name: 'studio-room-writer',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__studio/room', (req, res) => {
        const reply = (status, body) => {
          res.statusCode = status;
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify(body));
        };
        if (req.method !== 'POST') return reply(405, { ok: false, error: 'POST only' });
        const origin = req.headers.origin;
        if (origin && !LOCAL_ORIGIN.test(origin)) return reply(403, { ok: false, error: 'local pages only' });
        let body = '';
        req.on('data', (chunk) => { body += chunk; if (body.length > 1e6) req.destroy(); });
        req.on('end', async () => {
          try {
            const room = JSON.parse(body);
            if (!room || typeof room.clear !== 'object' || !Array.isArray(room.walls)) throw new Error('not a room: needs "clear" and "walls"');
            lastWrite = Date.now();
            await writeFile(ROOM_FILE, body.endsWith('\n') ? body : body + '\n');
            reply(200, { ok: true });
          } catch (err) {
            reply(400, { ok: false, error: err.message });
          }
        });
      });
    },
    handleHotUpdate({ file }) {
      if (file === ROOM_FILE && Date.now() - lastWrite < 3000) return [];
    }
  };
}

// One self-contained index.html: module scripts loaded from separate files are blocked
// under file://, inlined ones are not.
export default defineConfig({
  base: './',
  plugins: [roomWriter(), viteSingleFile()],
  test: { environment: 'node' }
});
