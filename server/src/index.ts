import { createServer } from 'http';
import { existsSync } from 'fs';
import { join } from 'path';
import express from 'express';
import { bootstrapDb, pool } from './db';
import { createApp } from './app';
import { seed } from './seed';
import { attachWebSockets } from './ws';

const PORT = Number(process.env.PORT ?? 3000);
const DIST_DIR = join(__dirname, '..', '..', 'dist', 'care-marketplace', 'browser');

async function main(): Promise<void> {
  await bootstrapDb();
  await seed();

  const app = createApp();

  // Serve the compiled SPA when a build exists (single origin → cookies and
  // WebSocket handshakes work without CORS). Health endpoint for docker.
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });
  if (existsSync(join(DIST_DIR, 'index.html'))) {
    app.use(express.static(DIST_DIR));
    app.get(/^\/(?!api\/).*/, (_req, res) => {
      res.sendFile(join(DIST_DIR, 'index.html'));
    });
  } else {
    app.get('/', (_req, res) => {
      res
        .status(200)
        .send('CareMarketplace API running. Build the SPA (npm run build) for the full app.');
    });
  }

  const server = createServer(app);
  attachWebSockets(server);
  server.listen(PORT, () => {
    console.log(`[server] CareMarketplace API listening on http://localhost:${PORT}`);
  });

  const shutdown = async (signal: string) => {
    console.log(`[server] ${signal} — shutting down.`);
    server.close();
    await pool.end();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((error) => {
  console.error('[server] fatal', error);
  process.exit(1);
});