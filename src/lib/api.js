// One API base pointing at the gateway (doc 5.1)
export const API_URL = import.meta.env.VITE_API_URL || '/api/v1';

// Access token lives in memory only, never localStorage, so a page refresh
// always goes through /auth/refresh (backed by the httpOnly refresh cookie).
let accessToken = null;
export const getAccessToken = () => accessToken;
export const setAccessToken = (token) => {
  accessToken = token;
};

// The admin console marks every request with its host name. The public host
// answers 404 for admin routes (doc 15.0: Host-based gating).
let apiHost = null;
export const setApiHost = (host) => {
  apiHost = host;
};

export class ApiError extends Error {
  constructor(status, err = {}) {
    super(err.message || `Request failed (${status})`);
    this.status = status;
    this.code = err.code || 'UNKNOWN';
    this.details = err.details;
    this.requestId = err.requestId;
  }
}

const baseHeaders = () => (apiHost ? { 'X-SnackHub-Host': apiHost } : {});

let refreshPromise = null;

/** One refresh at a time, however many requests hit 401 together. */
export async function refreshAccessToken() {
  if (!refreshPromise) {
    refreshPromise = fetch(`${API_URL}/auth/refresh`, { method: 'POST', credentials: 'include', headers: baseHeaders() })
      .then(async (res) => {
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new ApiError(res.status, data?.error);
        setAccessToken(data.accessToken);
        return data;
      })
      .catch((err) => {
        setAccessToken(null);
        throw err;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

/**
 * fetch wrapper: attaches the access token, parses the error envelope, and
 * retries once after a silent refresh if the server answers 401.
 */
export async function apiFetch(path, { method = 'GET', body, idempotencyKey, retry = true } = {}) {
  const doFetch = (token) =>
    fetch(`${API_URL}${path}`, {
      method,
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        ...baseHeaders(),
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

  let res;
  try {
    res = await doFetch(accessToken);
    if (res.status === 401 && retry && accessToken) {
      const err = await res.clone().json().catch(() => null);
      if (err?.error?.code === 'UNAUTHENTICATED') {
        try {
          await refreshAccessToken();
          res = await doFetch(accessToken);
        } catch {
          // no valid session: the caller handles the still-401 response
        }
      }
    }
  } catch {
    throw new ApiError(0, { code: 'NETWORK', message: 'You seem to be offline. Try again.' });
  }
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data?.error);
  return data;
}

export const newIdempotencyKey = () =>
  crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
