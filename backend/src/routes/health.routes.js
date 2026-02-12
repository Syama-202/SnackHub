import { Router } from 'express';
import { health, ready } from '../controllers/health.controller.js';

export function healthRoutes({ dbs }) {
  const router = Router();
  router.get('/health', health);
  router.get('/ready', ready(dbs));
  return router;
}
