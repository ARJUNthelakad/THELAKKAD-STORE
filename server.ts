import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import app from './src/server/app';
import { isVercelRuntime } from './src/server/neon';

const PORT = Number(process.env.PORT) || 3000;

function mountStaticFrontend(): void {
  const distDir = path.resolve(process.cwd(), 'dist');
  if (fs.existsSync(path.join(distDir, 'index.html'))) {
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }
}

async function startServer(): Promise<void> {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    mountStaticFrontend();
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.info(`Thelakkad Store server listening on http://localhost:${PORT}`);
  });
}

if (isVercelRuntime()) {
  mountStaticFrontend();
} else {
  startServer().catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
}

export default app;
