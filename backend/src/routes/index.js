// Every router in one place. Module routers (identity, catalog, ordering, dispatch,
// payment) are added here as each module is built (prompts 2.3 to 2.9), under /api/v1.
import { Router } from 'express';
import { healthRoutes } from './health.js';

export function routes(deps) {
  const router = Router();
  router.use(healthRoutes(deps));
  return router;
}
