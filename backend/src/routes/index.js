// Every router in one place. Health checks sit at the root; the API lives under /api/v1.
// Provider webhooks are mounted in app.js, before the JSON parser (routes/webhooks.js).
import { Router } from 'express';
import { healthRoutes } from './health.js';
import { authRoutes } from './auth.js';
import { securityRoutes } from './security.js';
import { pushRoutes } from './push.js';
import { errorsRoutes } from './errors.js';
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
import { payoutsRoutes } from './payouts.js';
import { refundsRoutes } from './refunds.js';
import { noticeRoutes } from './notice.js';
import { catalogueRoutes } from './catalogue.js';
import { docsRoutes } from './docs.js';

// extra: [[prefix, router]] mounted elsewhere (the webhooks), so the API docs list them too
export function routes(deps, { extra = [] } = {}) {
  const router = Router();
  const health = healthRoutes(deps);
  router.use(health);
  const api = Router();
  api.use(authRoutes(deps));
  api.use(securityRoutes(deps));
  api.use(pushRoutes(deps));
  api.use(errorsRoutes(deps));
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
  api.use(payoutsRoutes(deps));
  api.use(refundsRoutes(deps));
  api.use(catalogueRoutes(deps));
  api.use(noticeRoutes(deps));
  router.use('/api/v1', api);
  router.use(docsRoutes(deps, () => [['', health], ...extra, ['/api/v1', api]]));
  return router;
}
