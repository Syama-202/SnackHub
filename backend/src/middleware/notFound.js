// Any route nobody handled: the same error envelope as every other failure.
export function notFound(req, res) {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Not found', requestId: req.id } });
}
