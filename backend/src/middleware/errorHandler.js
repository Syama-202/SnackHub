// One error envelope for every failure (doc 11): { error: { code, message, requestId } }.
// Same shape the frontend already reads from the mock API. Crashes (500s) are also recorded
// for the admin Errors page, scrubbed, with the request id the person sees, so a report can
// be matched to its row.
import { AppError } from '../utils/AppError.js';
import { describeError, recordError, routeOf } from '../utils/errors.js';

export const errorHandler = ({ dbs, env, logger } = {}) =>
  // eslint-disable-next-line no-unused-vars
  function errorHandler(err, req, res, next) {
    if (err instanceof AppError) {
      return res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details, requestId: req.id } });
    }
    if (err?.type === 'entity.parse.failed') {
      return res.status(400).json({ error: { code: 'BAD_JSON', message: 'The request body is not valid JSON', requestId: req.id } });
    }
    req.log?.error({ err }, 'unhandled error');
    if (dbs) recordError(dbs, { source: 'api', ...describeError(err), where: routeOf(req), requestId: req.id, release: env?.RELEASE, context: { status: 500, role: req.user?.role ?? null } }, { logger });
    res.status(500).json({ error: { code: 'INTERNAL', message: 'Something went wrong on our side', requestId: req.id } });
  };
