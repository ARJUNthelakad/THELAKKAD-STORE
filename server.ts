import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import app from './src/server/app';
import { isVercelRuntime } from './src/server/neon';

const PORT = Number(process.env.PORT) || 3000;
const CURRENT_DIR = path.dirname(fileURLToPath(import.meta.url));
const STATIC_ASSET_EXT_RE = /\.(?:css|js|mjs|cjs|map|svg|png|jpe?g|webp|gif|avif|ico|woff2?|ttf|otf|eot|mp4|webm|json|xml|txt)$/i;

function resolveDistDir(): string | null {
  const candidates = [
    path.resolve(process.cwd(), 'dist'),
    path.resolve(CURRENT_DIR, 'dist'),
  ];
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, 'index.html'))) {
      return dir;
    }
  }
  return null;
}

function mountStaticFrontend(): void {
  const distDir = resolveDistDir();
  if (!distDir) {
    return;
  }

  // Serve hashed Vite bundles with immutable caching and strict 404 fallback
  // (never fall through to index.html for missing JS/CSS/font/image assets).
  app.use(
    '/assets',
    express.static(path.join(distDir, 'assets'), {
      immutable: true,
      maxAge: '1y',
      fallthrough: true,
    })
  );
  app.use('/assets', (_req, res) => {
    res.status(404).type('text/plain').send('Asset not found.');
  });

  // Serve copied studio imagery under /src/assets with strict 404 fallback.
  app.use(
    '/src/assets',
    express.static(path.join(distDir, 'src', 'assets'), {
      maxAge: '7d',
      fallthrough: true,
    })
  );
  app.use('/src/assets', (_req, res) => {
    res.status(404).type('text/plain').send('Asset not found.');
  });

  // Serve remaining root-level static files in dist/ (favicon, robots.txt, etc.)
  app.use(
    express.static(distDir, {
      index: 'index.html',
      fallthrough: true,
    })
  );

  // SPA fallback strictly for non-API, non-upload, non-asset navigation routes.
  app.get('*', (req, res) => {
    const reqPath = req.path || '/';
    if (
      reqPath === '/api' ||
      reqPath.startsWith('/api/') ||
      reqPath === '/uploads' ||
      reqPath.startsWith('/uploads/') ||
      STATIC_ASSET_EXT_RE.test(reqPath)
    ) {
      res.status(404).type('text/plain').send('Not found.');
      return;
    }

    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(distDir, 'index.html'));
  });
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
