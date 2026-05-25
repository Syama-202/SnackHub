// Every router in one place. Health checks sit at the root; the API lives under /api/v1.
// Provider webhooks are mounted in app.js, before the JSON parser (routes/webhooks.js).
import { Router } from 'express';
import { healthRoutes } from './health.js';
import { authRoutes } from './auth.js';
import { securityRoutes } from './security.js';
import { meRoutes } from './me.js';
import { catalogRoutes } from './catalog.js';
import { onboardingRoutes } from './onboarding.js';
import { verificationRoutes } from './verification.js';
import { adminAuthRoutes } from './adminAuth.js';
import { filesRoutes } from './files.js';
import { ordersRoutes } from './orders.js';
import { shopRoutes } from './shop.js';
import { deliveryRoutes } from './delivery.js';
import { complaintsRoutes } from './complaints.js';
import { operationsRoutes } from './operations.js';

export function routes(deps) {
  const router = Router();
  router.use(healthRoutes(deps));
  const api = Router();
  api.use(authRoutes(deps));
  api.use(securityRoutes(deps));
  api.use(meRoutes(deps));
  api.use(catalogRoutes(deps));
  api.use(onboardingRoutes(deps));
  api.use(verificationRoutes(deps));
  api.use(adminAuthRoutes(deps));
  api.use(filesRoutes(deps));
  api.use(ordersRoutes(deps));
  api.use(shopRoutes(deps));
  api.use(deliveryRoutes(deps));
  api.use(complaintsRoutes(deps));
  api.use(operationsRoutes(deps));
  router.use('/api/v1', api);
  return router;
}
