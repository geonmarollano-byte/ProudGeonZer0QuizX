import express from 'express';
import { ready } from './db/pool.js';
import helmet from 'helmet';
import { fileURLToPath } from 'node:url';
import { hostRoutes } from './routes/host.js';
import { playerRoutes } from './routes/player.js';
import { authRoutes } from './routes/auth.js';
import { sessionLayer } from './middleware/session.js';
import { requestBoundary, errors } from './middleware/http.js';
export const clientDir = fileURLToPath(new URL('../../client/dist/', import.meta.url));
export function createApp({ pool, config }) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.proxyHops);
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'"],
          imgSrc: ["'self'", 'data:'],
          fontSrc: ["'self'"],
          frameAncestors: config.preview ? null : ["'none'"],
          upgradeInsecureRequests: config.production ? [] : null,
        },
      },
      xFrameOptions: config.preview ? false : { action: 'deny' },
      strictTransportSecurity: config.production,
    }),
  );
  if (config.production)
    app.use((req, res, next) =>
      req.secure ? next() : res.status(400).json({ error: 'HTTPS is required.' }),
    );
  app.use('/api', (_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  app.get('/api/health', async (_req, res) => {
    try {
      await ready(pool);
      res.json({ status: 'ready' });
    } catch {
      res.status(503).json({ status: 'unavailable' });
    }
  });
  app.use(
    '/api',
    requestBoundary(config),
    express.json({ limit: '256kb' }),
    sessionLayer(pool, config),
  );
  app.use('/api/auth', authRoutes(pool, config));
  app.use('/api/host', hostRoutes(pool, config));
  app.use('/api/player', playerRoutes(pool, config));
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found.' }));
  app.use(express.static(clientDir, { index: false }));
  app.get('/{*path}', (req, res, next) =>
    req.accepts('html') && !req.path.split('/').pop().includes('.')
      ? res.sendFile(`${clientDir}index.html`)
      : next(),
  );
  app.use(errors);
  return app;
}
