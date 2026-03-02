// Express app: security and logging middleware, the routes, then the 404 and error
// handlers. Everything it needs (settings, logger, database pools, the Google token check)
// is passed in, so the tests can build it with fakes.
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { requestLogger } from './middleware/requestLogger.js';
import { notFound } from './middleware/notFound.js';
import { errorHandler } from './middleware/errorHandler.js';
import { routes } from './routes/index.js';
import { createGoogleVerifier } from './utils/google.js';

export function createApp({ env, logger, dbs, verifyGoogle = createGoogleVerifier(env.GOOGLE_CLIENT_ID) }) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(requestLogger(logger));
  app.use(helmet());
  // exact origins only, never a wildcard with credentials (doc 16.2)
  app.use(cors({ origin: env.CORS_ORIGINS, credentials: true, exposedHeaders: ['X-Request-Id'] }));
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  app.use(routes({ env, dbs, verifyGoogle }));

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
