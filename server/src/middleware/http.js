import { z } from 'zod';
export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
export function check(ok, status, message) {
  if (!ok) throw new HttpError(status, message);
}
export function idParam(value) {
  check(/^[1-9]\d{0,9}$/.test(value) && Number(value) <= 2147483647, 400, 'Invalid resource ID.');
  return Number(value);
}
export const empty = z.strictObject({});
export function audited(event, userId) {
  console.info(JSON.stringify({ event, ...(userId ? { userId } : {}) }));
}
export function requestBoundary(config) {
  return (req, _res, next) => {
    check(!Object.keys(req.query).length, 400, 'Unexpected query parameters.');
    if (['GET', 'HEAD'].includes(req.method)) {
      check(
        !req.headers['transfer-encoding'] && !Number(req.headers['content-length'] || 0),
        400,
        'Read requests must not contain a body.',
      );
    } else if (req.method !== 'OPTIONS') {
      // No CORS grants. Browsers cannot send our custom header cross-origin without a preflight.
      const origin = req.get('Origin');
      check(
        (!origin || origin === config.origin) && req.get('X-QuizX-Request') === 'workspace',
        403,
        'Use the same workspace tab to make this request.',
      );
      check(req.is('application/json'), 415, 'This endpoint requires JSON.');
    }
    next();
  };
}
export function errors(err, _req, res, next) {
  if (res.headersSent) return next(err);
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  if (err instanceof z.ZodError) {
    const issue = err.issues[0];
    return res
      .status(400)
      .json({
        error:
          issue.code === 'unrecognized_keys'
            ? 'Unexpected fields in this request.'
            : issue.message || 'Invalid request.',
      });
  }
  if (err.type === 'entity.too.large')
    return res.status(413).json({ error: 'This request is too large.' });
  if (err.type === 'entity.parse.failed')
    return res.status(400).json({ error: 'The request must contain valid JSON.' });
  if (err.status === 415 || err instanceof URIError)
    return res.status(err.status === 415 ? 415 : 400).json({ error: 'Invalid request encoding.' });
  console.error('[server] request failed');
  return res.status(500).json({ error: 'Something went wrong on the server. Please try again.' });
}
