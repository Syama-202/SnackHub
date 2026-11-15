import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useSelector } from 'react-redux';
import { matchPath, useLocation } from 'react-router-dom';
import { onTopics, realtimeStatus, startRealtime, stopRealtime, subscribeStatus } from '../services/realtime';

const rmQuery = typeof window !== 'undefined' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;

// Dev only: localStorage['snackhub.motion'] = 'force' previews full motion on a reduced-motion machine
const forceMotion = (() => {
  try {
    return import.meta.env.DEV && localStorage.getItem('snackhub.motion') === 'force';
  } catch {
    return false;
  }
})();

/** Every animation honours prefers-reduced-motion (doc 5.1, 22.3). */
export function useReducedMotion() {
  return useSyncExternalStore(
    (cb) => {
      rmQuery?.addEventListener('change', cb);
      return () => rmQuery?.removeEventListener('change', cb);
    },
    () => !forceMotion && Boolean(rmQuery?.matches),
    () => false,
  );
}

let webglOk;
export function hasWebGL() {
  if (webglOk !== undefined) return webglOk;
  try {
    const c = document.createElement('canvas');
    webglOk = Boolean(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch {
    webglOk = false;
  }
  return webglOk;
}

/** Low-end or data-saver devices get the poster and SVG versions. */
export function prefersLite() {
  const n = navigator;
  return Boolean(n.connection?.saveData) || (n.hardwareConcurrency && n.hardwareConcurrency <= 2) || (n.deviceMemory && n.deviceMemory <= 2);
}

/** IntersectionObserver plus a CSS class (doc 22.3 scroll reveal). */
export function useReveal(options = { rootMargin: '0px 0px -10% 0px' }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const SEL = '.reveal, .reveal-mask, .split-words';
    const targets = el.matches(SEL) ? [el] : [...el.querySelectorAll(SEL)];
    if (!('IntersectionObserver' in window)) {
      targets.forEach((t) => t.classList.add('is-in'));
      return;
    }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add('is-in');
          io.unobserve(e.target);
        }
      });
    }, options);
    targets.forEach((t) => io.observe(t));
    return () => io.disconnect();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return ref;
}

export function useInView(rootMargin = '200px') {
  const ref = useRef(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || !('IntersectionObserver' in window)) {
      setInView(true);
      return;
    }
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { rootMargin });
    io.observe(el);
    return () => io.disconnect();
  }, [rootMargin]);
  return [ref, inView];
}

/** Count-up for dashboard numbers; reduced motion shows the final number. */
export function useCountUp(target, ms = 900) {
  const reduced = useReducedMotion();
  const [v, setV] = useState(reduced ? target : 0);
  const shown = useRef(reduced ? target : 0);
  useEffect(() => {
    if (reduced) {
      shown.current = target;
      setV(target);
      return;
    }
    let raf;
    const start = performance.now();
    const from = shown.current;
    const step = (t) => {
      const k = Math.min(1, (t - start) / ms);
      shown.current = from + (target - from) * (1 - (1 - k) ** 3);
      setV(shown.current);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, ms, reduced]);
  return v;
}

export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

const HIDDEN_POLL_MS = 30_000;
const MAX_BACKOFF_MS = 60_000;
// with live updates on, polling is only the safety net for a missed hint
const LIVE_POLL_MS = 30_000;
const failed = (r) => r?.meta?.requestStatus === 'rejected';

/**
 * Run `callback` now and then `ms` after each run finishes while enabled. A run that
 * returns a promise (a dispatched thunk) is awaited, so slow requests never pile up;
 * a rejected thunk doubles the wait up to a minute. Offline ticks are skipped, a hidden
 * tab polls every 30 s and refreshes as soon as it is shown again.
 *
 * `topics` ('order', ['offer'], ...) ties it to live updates (services/realtime): a hint on
 * one of them runs it at once, and while the socket is live the poll slows to every 30 s.
 * Hints arriving during a run are folded into one more run, never a second request at once.
 */
export function usePolling(callback, ms, enabled = true, topics = null) {
  const saved = useRef(callback);
  const visible = useDocumentVisible();
  const status = useRealtimeStatus();
  const topicKey = topics ? [].concat(topics).join(',') : '';
  const live = Boolean(topicKey) && status === 'live';
  useEffect(() => {
    saved.current = callback;
  });
  useEffect(() => {
    if (!enabled) return;
    let timer;
    let stopped = false;
    let running = false;
    let again = false;
    const base = live ? Math.max(ms, LIVE_POLL_MS) : ms;
    let wait = base;
    const run = async () => {
      clearTimeout(timer);
      if (running) {
        again = true;
        return;
      }
      running = true;
      if (navigator.onLine !== false) {
        let ok = true;
        try {
          ok = !failed(await saved.current());
        } catch {
          ok = false;
        }
        wait = ok ? base : Math.min(wait * 2, MAX_BACKOFF_MS);
      }
      running = false;
      if (stopped) return;
      if (again) {
        again = false;
        return run();
      }
      timer = setTimeout(run, visible ? wait : Math.max(wait, HIDDEN_POLL_MS));
    };
    run();
    const off = topicKey ? onTopics(topicKey.split(','), run) : null;
    return () => {
      stopped = true;
      clearTimeout(timer);
      off?.();
    };
  }, [ms, enabled, visible, live, topicKey]);
}

/** 'off', 'connecting', 'live' or 'down': the live-update socket (services/realtime). */
export function useRealtimeStatus() {
  return useSyncExternalStore(subscribeStatus, realtimeStatus, () => 'off');
}

/**
 * Keeps the live-update socket open for the signed-in account (once, at the app root);
 * closes it on sign-out or when another account signs in.
 */
export function useRealtime() {
  const token = useSelector((state) => state.auth.accessToken);
  const who = useSelector((state) => (state.auth.user ? `${state.auth.user.id}:${state.auth.user.role}` : ''));
  const signedIn = Boolean(token);
  useEffect(() => {
    if (!signedIn || !who) return undefined;
    startRealtime();
    return stopRealtime;
  }, [signedIn, who]);
}

export function useDocumentVisible() {
  return useSyncExternalStore(
    (cb) => {
      document.addEventListener('visibilitychange', cb);
      return () => document.removeEventListener('visibilitychange', cb);
    },
    () => document.visibilityState === 'visible',
    () => true,
  );
}

/** The tab title from the first matching [pattern, title] (constants/titles.jsx), as "Title · SnackHub". */
export function useRouteTitle(table, site = 'SnackHub') {
  const { pathname } = useLocation();
  useEffect(() => {
    const hit = table.find(([path]) => matchPath({ path, end: true }, pathname));
    document.title = hit ? `${hit[1]} · ${site}` : site;
  }, [table, site, pathname]);
}

/** A page's own title once it knows it (a shop's name, an order number). */
export function usePageTitle(title, site = 'SnackHub') {
  useEffect(() => {
    if (title) document.title = `${title} · ${site}`;
  }, [title, site]);
}
