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

// In Phase 1 the mock service worker must be running before the first request.
// Requests wait for it; the page itself renders straight away.
let apiReady = Promise.resolve();
export const setApiReady = (promise) => {
  apiReady = promise.catch(() => {});
};
export const getApiHost = () => apiHost;
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

// X-SnackHub-Client: the backend refuses cookie-only requests (refresh, logout) without it,
// because another site cannot add a custom header to a forged request (doc 16.2)
const baseHeaders = () => ({ 'X-SnackHub-Client': 'web', ...(apiHost ? { 'X-SnackHub-Host': apiHost } : {}) });

let refreshPromise = null;

/** One refresh at a time, however many requests hit 401 together. */
export async function refreshAccessToken() {
  await apiReady;
  if (!refreshPromise) {
    // the admin console has its own session cookie and refresh route (doc 16.3)
    const path = apiHost === 'admin' ? '/admin/auth/refresh' : '/auth/refresh';
    refreshPromise = fetch(`${API_URL}${path}`, { method: 'POST', credentials: 'include', headers: baseHeaders() })
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
  await apiReady;
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

/**
 * A multipart upload (one document file plus its fields) with progress, for the onboarding
 * forms. fetch cannot report upload progress, so this uses XMLHttpRequest; like apiFetch it
 * sends the access token and retries once after a silent refresh.
 */
export async function apiUpload(path, formData, { onProgress } = {}) {
  await apiReady;
  const send = (token) =>
    new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${API_URL}${path}`);
      xhr.withCredentials = true;
      for (const [k, v] of Object.entries({ Accept: 'application/json', ...baseHeaders(), ...(token ? { Authorization: `Bearer ${token}` } : {}) })) xhr.setRequestHeader(k, v);
      xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(Math.round((e.loaded / e.total) * 100));
      xhr.onload = () => {
        let data = null;
        try {
          data = JSON.parse(xhr.responseText);
        } catch {
          /* not JSON */
        }
        resolve({ status: xhr.status, data });
      };
      xhr.onerror = () => reject(new ApiError(0, { code: 'NETWORK', message: 'The upload stopped. Check your connection and try again.' }));
      xhr.send(formData);
    });
  let res = await send(accessToken);
  if (res.status === 401 && res.data?.error?.code === 'UNAUTHENTICATED' && accessToken) {
    try {
      await refreshAccessToken();
      res = await send(accessToken);
    } catch {
      // the still-401 answer is handled below
    }
  }
  if (res.status < 200 || res.status >= 300) throw new ApiError(res.status, res.data?.error);
  return res.data;
}

export const newIdempotencyKey = () =>
  crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
