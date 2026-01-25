// One API base pointing at the gateway (doc 5.1)
const BASE = import.meta.env.VITE_API_URL || '/api/v1';

let getToken = () => null;
let hostHeader = null;
let onUnauthorized = () => {};

export function configureApi({ tokenGetter, host, unauthorized }) {
  if (tokenGetter) getToken = tokenGetter;
  if (host) hostHeader = host;
  if (unauthorized) onUnauthorized = unauthorized;
}

export class ApiError extends Error {
  constructor(status, err = {}) {
    super(err.message || `Request failed (${status})`);
    this.status = status;
    this.code = err.code || 'UNKNOWN';
    this.details = err.details;
    this.requestId = err.requestId;
  }
}

export async function api(path, { method = 'GET', body, idempotencyKey, signal } = {}) {
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
  // Stands in for the separate admin host name (doc 15.0: Host-based gating)
  if (hostHeader) headers['X-SnackHub-Host'] = hostHeader;
  let res;
  try {
    res = await fetch(`${BASE}${path}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined, signal });
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    throw new ApiError(0, { code: 'NETWORK', message: 'You seem to be offline. Try again.' });
  }
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    const err = new ApiError(res.status, data?.error);
    if (res.status === 401 && err.code === 'UNAUTHENTICATED') onUnauthorized();
    throw err;
  }
  return data;
}

export const newIdempotencyKey = () =>
  (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
