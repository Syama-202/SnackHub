// Every route validates its input with zod (CLAUDE.md). The parsed value replaces the body (or query or params),
// so unknown fields never reach a controller.
import { AppError } from '../utils/AppError.js';

const validate = (part) => (schema) => (req, res, next) => {
  const parsed = schema.safeParse(req[part] ?? {});
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }));
    return next(new AppError(400, 'VALIDATION', 'Some fields are missing or invalid', details));
  }
  req[part] = parsed.data;
  next();
};

export const validateBody = validate('body');
export const validateQuery = validate('query');
export const validateParams = validate('params');
