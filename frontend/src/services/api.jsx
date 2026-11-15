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

// The free API host sleeps when quiet and takes up to a minute to wake. Meanwhile the site's
// proxy answers 502 to 504 with a page of its own (not our JSON envelope), or the connection
// drops. Reads wait and try again for about a minute, and pages can show that the server is
// waking up (onWaking). Anything that changes data is never repeated here.
const WAKE_DELAYS_MS = [2000, 3000, 5000, 8000, 10000, 10000, 12000, 12000];
const wakeListeners = new Set();
let waiting = 0;
const setWaking = (delta) => {
  const before = waiting > 0;
  waiting += delta;
  if (before !== waiting > 0) wakeListeners.forEach((cb) => cb(waiting > 0));
};
/** Calls cb(true) when requests start waiting for the server to wake, cb(false) when done. */
export function onWaking(cb) {
  wakeListeners.add(cb);
  return () => wakeListeners.delete(cb);
}
export const isWaking = () => waiting > 0;

const asleep = (res) => [502, 503, 504].includes(res.status) && !(res.headers.get('Content-Type') || '').includes('application/json');
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const offline = () => typeof navigator !== 'undefined' && navigator.onLine === false;

/** fetch, waiting while the server wakes up: only for requests that are safe to repeat. */
async function patientFetch(send) {
  let woke = false;
  try {
    for (let i = 0; ; i += 1) {
      let res = null;
      try {
        res = await send();
      } catch (err) {
        if (i >= WAKE_DELAYS_MS.length || offline()) throw err;
      }
      if (res && (!asleep(res) || i >= WAKE_DELAYS_MS.length)) return res;
      if (!woke) {
        woke = true;
        setWaking(1);
      }
      await pause(WAKE_DELAYS_MS[i]);
    }
  } finally {
    if (woke) setWaking(-1);
  }
}

/** Resolves once the API answers a cheap public read. */
const serverAwake = () => patientFetch(() => fetch(`${API_URL}/cities`, { headers: baseHeaders() }));

let refreshPromise = null;

/** One refresh at a time, however many requests hit 401 together. */
export async function refreshAccessToken() {
  if (!refreshPromise) {
    // the admin console has its own session cookie and refresh route (doc 16.3)
    const path = apiHost === 'admin' ? '/admin/auth/refresh' : '/auth/refresh';
    const send = () => fetch(`${API_URL}${path}`, { method: 'POST', credentials: 'include', headers: baseHeaders() });
    // a refresh rotates the cookie, so it is not repeated blindly: when the server was asleep,
    // wait until it answers, then send it once more (a lost first answer falls in the
    // server's short grace for a just-rotated cookie)
    const sendWhenAwake = async () => {
      let res = null;
      try {
        res = await send();
      } catch (err) {
        if (offline()) throw err;
      }
      if (res && !asleep(res)) return res;
      await serverAwake();
      return send();
    };
    refreshPromise = sendWhenAwake()
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
 * retries once after a silent refresh if the server answers 401. Reads wait while the server
 * wakes up.
 */
export async function apiFetch(path, { method = 'GET', body, idempotencyKey, retry = true } = {}) {
  const send = (token) =>
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
  const doFetch = (token) => (method === 'GET' ? patientFetch(() => send(token)) : send(token));

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
