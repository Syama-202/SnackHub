// One error envelope for every failure (doc 11): { error: { code, message, requestId } }.
// Same shape the frontend already reads from the mock API.
import { AppError } from '../utils/AppError.js';

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details, requestId: req.id } });
  }
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: { code: 'BAD_JSON', message: 'The request body is not valid JSON', requestId: req.id } });
  }
  req.log?.error({ err }, 'unhandled error');
  res.status(500).json({ error: { code: 'INTERNAL', message: 'Something went wrong on our side', requestId: req.id } });
}
