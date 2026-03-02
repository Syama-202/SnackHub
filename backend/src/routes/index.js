// Every router in one place. Health checks sit at the root; the API lives under /api/v1.
// Module routers (ordering, dispatch, payment) are added here as each is built.
import { Router } from 'express';
import { healthRoutes } from './health.js';
import { authRoutes } from './auth.js';
import { meRoutes } from './me.js';
import { catalogRoutes } from './catalog.js';

export function routes(deps) {
  const router = Router();
  router.use(healthRoutes(deps));
  const api = Router();
  api.use(authRoutes(deps));
  api.use(meRoutes(deps));
  api.use(catalogRoutes(deps));
  router.use('/api/v1', api);
  return router;
}
