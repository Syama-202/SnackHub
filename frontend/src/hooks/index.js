import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

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

/**
 * Run `callback` now and then every `ms` while enabled, slower while the tab
 * is hidden. Stands in for socket pushes until Socket.io is wired (Phase 3).
 */
export function usePolling(callback, ms, enabled = true) {
  const saved = useRef(callback);
  const visible = useDocumentVisible();
  useEffect(() => {
    saved.current = callback;
  });
  useEffect(() => {
    if (!enabled) return;
    saved.current();
    const t = setInterval(() => saved.current(), visible ? ms : ms * 4);
    return () => clearInterval(t);
  }, [ms, enabled, visible]);
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
