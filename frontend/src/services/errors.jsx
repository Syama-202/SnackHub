// Crash reports to the API's error log (shared/domain/errors.js): uncaught errors, rejected
// promises nobody handled, and pages the error boundary caught. Only the error, the page path
// (never the query string) and the browser name are sent; the server scrubs the text again.
// Each distinct error is sent once per page load, at most ten per load.
import { API_URL } from './api';
import { deviceLabel } from '../utils/push';

const sent = new Set();
const MAX_PER_LOAD = 10;
let source = 'web';
// a page file from an older build: the error boundary asks for a reload, nothing to fix
const isStaleChunk = (e) => /dynamically imported module|Importing a module script failed|ChunkLoadError/i.test(String(e?.message ?? ''));
// noise from browser extensions and cross-origin scripts, which the page cannot see into
const isNoise = (message) => /^Script error\.?$|ResizeObserver loop|extension:\/\//i.test(message);

export function reportError(error, { kind } = {}) {
  try {
    const message = String(error?.message ?? error ?? 'Unknown error').slice(0, 1200);
    if (!message || isNoise(message) || isStaleChunk(error) || sent.size >= MAX_PER_LOAD) return;
    const key = `${kind ?? error?.name}|${message}`;
    if (sent.has(key)) return;
    sent.add(key);
    const body = JSON.stringify({
      source,
      kind: String(kind ?? error?.name ?? 'Error').slice(0, 80),
      message,
      ...(error?.stack && { stack: String(error.stack).slice(0, 8000) }),
      page: window.location.pathname.slice(0, 400) || '/',
      release: import.meta.env.VITE_RELEASE || 'dev',
      browser: deviceLabel(),
    });
    // keepalive lets the report finish while the page unloads; no cookies or token go with it
    fetch(`${API_URL}/client-errors`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true, credentials: 'omit' }).catch(() => {});
  } catch {
    /* reporting must never cause an error of its own */
  }
}

/** Listens for crashes the app did not catch. Call once at start-up. */
export function watchErrors(from = 'web') {
  source = from;
  window.addEventListener('error', (e) => reportError(e.error ?? e.message));
  window.addEventListener('unhandledrejection', (e) => reportError(e.reason, { kind: 'UnhandledRejection' }));
}
