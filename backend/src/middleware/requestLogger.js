// Request id and structured request logs (doc 15.0). A caller's X-Request-Id is kept only
// if it looks like one, so logs cannot be spoofed; otherwise a new id is made. The id goes
// back in the X-Request-Id response header and on every log line as req.id.
import { randomUUID } from 'node:crypto';
import pinoHttp from 'pino-http';

const REQUEST_ID = /^[A-Za-z0-9-]{8,64}$/;
// a signed document link is a credential for five minutes; the log keeps only that a file was asked for
const scrubUrl = (url) => String(url).replace(/\/files\/[^/?#]+/, '/files/[redacted]');

export function requestLogger(logger) {
  return pinoHttp({
    logger,
    genReqId: (req, res) => {
      const given = req.headers['x-request-id'];
      const id = typeof given === 'string' && REQUEST_ID.test(given) ? given : randomUUID();
      res.setHeader('X-Request-Id', id);
      return id;
    },
    autoLogging: { ignore: (req) => req.url === '/health' },
    serializers: {
      req: (req) => ({ id: req.id, method: req.method, url: scrubUrl(req.url), remoteAddress: req.remoteAddress }),
    },
  });
}
