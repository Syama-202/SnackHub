// Express app: platform middleware only. Module routers are mounted here as each
// module is built (prompts 2.3 to 2.9).
import { randomUUID } from 'node:crypto';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import pinoHttp from 'pino-http';
import { errorHandler, notFound } from './platform/errors.js';

const REQUEST_ID = /^[A-Za-z0-9-]{8,64}$/;

export function createApp({ env, logger, dbs }) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(
    pinoHttp({
      logger,
      // keep a caller's request id only if it looks like one, so logs cannot be spoofed
      genReqId: (req, res) => {
        const given = req.headers['x-request-id'];
        const id = typeof given === 'string' && REQUEST_ID.test(given) ? given : randomUUID();
        res.setHeader('X-Request-Id', id);
        return id;
      },
      autoLogging: { ignore: (req) => req.url === '/health' },
    }),
  );
  app.use(helmet());
  // exact origins only, never a wildcard with credentials (doc 16.2)
  app.use(cors({ origin: env.CORS_ORIGINS, credentials: true, exposedHeaders: ['X-Request-Id'] }));
  app.use(express.json({ limit: '100kb' }));

  // liveness: the process is up
  app.get('/health', (req, res) => res.json({ ok: true }));

  // readiness: every module can reach its own schema
  app.get('/ready', async (req, res) => {
    const checks = await Promise.all(
      Object.entries(dbs).map(async ([name, db]) => {
        try {
          await db.raw('SELECT 1');
          return [name, 'ok'];
        } catch {
          return [name, 'down'];
        }
      }),
    );
    const ready = checks.every(([, s]) => s === 'ok');
    res.status(ready ? 200 : 503).json({ ok: ready, modules: Object.fromEntries(checks) });
  });

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
