// API docs (utils/apiDocs.js): the OpenAPI document at /api/v1/openapi.json and Swagger UI at
// /api/docs, served from this API (no outside scripts, so the strict security headers stay).
// On by default outside production; API_DOCS turns them on or off.
//   GET /api/v1/openapi.json            the OpenAPI 3.1 document, built from the routers
//   GET /api/docs                       Swagger UI
import { Router, static as serveStatic } from 'express';
import { createRequire } from 'node:module';
import { buildOpenApi } from '../utils/apiDocs.js';

const require = createRequire(import.meta.url);

// Swagger UI's start-up file, pointed at this API's document; the other files come from the package
const INITIALIZER = `window.onload = function () {
  window.ui = SwaggerUIBundle({
    url: '/api/v1/openapi.json',
    dom_id: '#swagger-ui',
    deepLinking: true,
    docExpansion: 'none',
    tagsSorter: 'alpha',
    persistAuthorization: false,
    presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset],
    layout: 'StandaloneLayout',
  });
};
`;

/** mounts: [[prefix, router], ...], read when the document is first asked for. */
export function docsRoutes(deps, mounts) {
  const router = Router();
  if (!deps.env.API_DOCS) return router;
  let spec = null;
  router.get('/api/v1/openapi.json', (req, res) => {
    spec ??= buildOpenApi(mounts(), { version: deps.env.RELEASE });
    res.set('Cache-Control', 'no-store').json(spec);
  });
  router.get('/api/docs', (req, res, next) => (req.path.endsWith('/') ? next() : res.redirect(301, '/api/docs/')));
  router.get('/api/docs/swagger-initializer.js', (req, res) => res.type('application/javascript').set('Cache-Control', 'no-store').send(INITIALIZER));
  router.use('/api/docs', serveStatic(require('swagger-ui-dist').getAbsoluteFSPath(), { index: 'index.html', maxAge: '1h' }));
  return router;
}
