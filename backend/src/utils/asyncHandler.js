// Express 4 does not catch errors thrown by async handlers; this passes them on to the
// error handler so every failure gets the error envelope.
export const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
