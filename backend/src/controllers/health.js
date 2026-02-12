// Liveness and readiness (doc 15.0). Controllers stay thin: they read the request, call
// models or shared rules, and shape the response.

/** GET /health: the process is up. */
export function health(req, res) {
  res.json({ ok: true });
}

/** GET /ready: every module can reach its own schema. 503 if any cannot. */
export function ready(dbs) {
  return async (req, res) => {
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
    const ok = checks.every(([, s]) => s === 'ok');
    res.status(ok ? 200 : 503).json({ ok, modules: Object.fromEntries(checks) });
  };
}
