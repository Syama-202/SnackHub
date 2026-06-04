// API docs (OpenAPI 3.1) built from the routers themselves: each middleware that checks
// something carries a note of what (its zod schema, sign-in, permission, admin host, second
// factor, rate limit), and the walker turns a router's routes and notes into the document.
// The docs can never claim a check that the code does not make. Summaries come from the
// route lists at the top of each controller and router file.
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

/** Attaches a docs note to a middleware and returns it. */
export const documented = (docs, fn) => Object.assign(fn, { docs });

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const METHOD = /^\/\/\s+(GET|POST|PUT|PATCH|DELETE)\s+(\/\S+)\s+(.+)$/;

/** "POST /orders/:id/cancel" -> its line from the header comments of controllers and routes. */
export function routeSummaries(dirs = ['controllers', 'routes']) {
  const out = new Map();
  for (const dir of dirs) {
    for (const file of readdirSync(path.join(SRC, dir)).filter((f) => f.endsWith('.js'))) {
      for (const line of readFileSync(path.join(SRC, dir, file), 'utf8').split('\n')) {
        const m = line.trim().match(METHOD);
        if (m && !out.has(`${m[1]} ${m[2]}`)) out.set(`${m[1]} ${m[2]}`, m[3].trim());
      }
    }
  }
  return out;
}

const toOpenApiPath = (p) => p.replace(/:(\w+)/g, '{$1}');
const jsonSchema = (schema) => {
  try {
    const s = z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' });
    delete s.$schema;
    return s;
  } catch {
    return {};
  }
};
// the first path segment names the group; admin routes are grouped by their second segment
const tagOf = (p) => {
  const [a, b] = p.split('/').filter(Boolean);
  if (a === 'admin') return `admin: ${b ?? 'console'}`;
  if (a === 'auth' && ['push', 'security'].includes(b)) return `auth: ${b}`;
  return a ?? 'root';
};

const ERROR = { $ref: '#/components/responses/Error' };

/** Every route of these routers, under a path prefix each: [{ method, path, notes }]. */
export function collectRoutes(mounts) {
  const routes = [];
  const walk = (stack, prefix) => {
    for (const layer of stack) {
      if (layer.route) {
        const notes = layer.route.stack.map((l) => l.handle.docs).filter(Boolean);
        for (const method of Object.keys(layer.route.methods)) routes.push({ method, path: prefix + layer.route.path, notes });
      } else if (layer.handle?.stack) {
        walk(layer.handle.stack, prefix);
      }
    }
  };
  for (const [prefix, router] of mounts) walk(router.stack, prefix);
  return routes;
}

function operation({ method, path: p, notes }, summaries, apiPrefix) {
  const note = Object.assign({}, ...notes.filter((n) => !n.schema));
  const parts = Object.fromEntries(notes.filter((n) => n.schema).map((n) => [n.part, jsonSchema(n.schema)]));
  const local = p.startsWith(apiPrefix) ? p.slice(apiPrefix.length) : p;
  const limits = notes.filter((n) => n.rateLimit).map((n) => n.rateLimit);
  const lines = [];
  if (note.permission) lines.push(`Needs permission \`${note.permission}\` (from the token's role).`);
  if (note.roles) lines.push(`For the ${note.roles.join(' or ')} portal.`);
  if (note.adminHost) lines.push('Admin host only: elsewhere it answers 404.');
  if (note.freshMfaMinutes) lines.push(note.freshMfaMinutes <= 5 ? `Step-up: a second factor from the last ${note.freshMfaMinutes} minutes.` : `A second factor from the last ${note.freshMfaMinutes / 60} hours.`);
  if (note.clientHeader) lines.push('Needs the `X-SnackHub-Client: web` header (cross-site requests are refused).');
  for (const l of limits) lines.push(`Rate limit \`${l.name}\`: ${l.max} per ${l.minutes} min per ${l.per}.`);

  const parameters = [];
  for (const [part, where] of [['params', 'path'], ['query', 'query']]) {
    const props = parts[part]?.properties ?? {};
    const required = new Set(parts[part]?.required ?? []);
    for (const [name, schema] of Object.entries(props)) parameters.push({ name, in: where, required: where === 'path' || required.has(name), schema });
  }
  // path parameters the route has but no schema describes (still part of the URL)
  for (const m of p.matchAll(/:(\w+)/g)) if (!parameters.some((x) => x.in === 'path' && x.name === m[1])) parameters.push({ name: m[1], in: 'path', required: true, schema: { type: 'string' } });

  const responses = { 200: { description: 'OK' } };
  if (parts.body || parts.query || parts.params) responses[400] = ERROR;
  if (note.auth || note.freshMfaMinutes) responses[401] = ERROR;
  if (note.permission || note.roles || note.clientHeader) responses[403] = ERROR;
  if (note.adminHost) responses[404] = ERROR;
  if (limits.length) responses[429] = ERROR;
  return {
    tags: [tagOf(local)],
    ...(summaries.has(`${method.toUpperCase()} ${local}`) && { summary: summaries.get(`${method.toUpperCase()} ${local}`) }),
    ...(lines.length && { description: lines.join('\n\n') }),
    ...(note.auth && { security: [{ bearer: [] }] }),
    ...(parameters.length && { parameters }),
    ...(parts.body && { requestBody: { required: true, content: { 'application/json': { schema: parts.body } } } }),
    responses,
  };
}

/** The OpenAPI document for these mounted routers: [[prefix, router], ...]. */
export function buildOpenApi(mounts, { version = 'dev', apiPrefix = '/api/v1' } = {}) {
  const summaries = routeSummaries();
  const paths = {};
  for (const r of collectRoutes(mounts)) {
    const key = toOpenApiPath(r.path);
    (paths[key] ??= {})[r.method] = operation(r, summaries, apiPrefix);
  }
  return {
    openapi: '3.1.0',
    info: {
      title: 'SnackHub API',
      version,
      description: [
        'Generated from the running routers and their zod schemas, so it lists exactly what the API checks.',
        'Errors share one shape: `{ error: { code, message, details?, requestId } }`. Money is integer paise.',
        'Sign in through `/api/v1/auth/*` for a short-lived bearer token; the refresh token stays in an http-only cookie on `/api/v1/auth`.',
        'All sample data is fake and labelled as demo data.',
      ].join('\n\n'),
    },
    servers: [{ url: '/' }],
    components: {
      securitySchemes: { bearer: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
      responses: {
        Error: {
          description: 'The error envelope',
          content: { 'application/json': { schema: { type: 'object', properties: { error: { type: 'object', required: ['code', 'message'], properties: { code: { type: 'string' }, message: { type: 'string' }, details: {}, requestId: { type: 'string' } } } } } } },
        },
      },
    },
    paths: Object.fromEntries(Object.entries(paths).sort(([a], [b]) => a.localeCompare(b))),
  };
}
