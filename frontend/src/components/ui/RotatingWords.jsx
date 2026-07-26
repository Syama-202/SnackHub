import { useEffect, useState } from 'react';
import { AnimatePresence, m } from 'motion/react';
import { useReducedMotion } from '../../hooks';

/**
 * One word or phrase at a time, sliding up into place every few seconds. Screen readers get
 * the whole list once; with reduced motion the first phrase stays.
 */
export default function RotatingWords({ words, every = 2600, className }) {
  const reduced = useReducedMotion();
  const [i, setI] = useState(0);
  useEffect(() => {
    if (reduced || words.length < 2) return undefined;
    const t = setInterval(() => setI((n) => (n + 1) % words.length), every);
    return () => clearInterval(t);
  }, [reduced, words.length, every]);
  return (
    <span className={`relative inline-grid overflow-hidden align-bottom ${className || ''}`}>
      <span className="sr-only">{words.map((w) => w.replace(/[.!]$/, '')).join(', ')}</span>
      <AnimatePresence mode="popLayout" initial={false}>
        <m.span
          key={i}
          aria-hidden="true"
          className="col-start-1 row-start-1 whitespace-nowrap"
          initial={{ y: '100%', opacity: 0, filter: 'blur(6px)' }}
          animate={{ y: '0%', opacity: 1, filter: 'blur(0px)' }}
          exit={{ y: '-100%', opacity: 0, filter: 'blur(6px)' }}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        >
          {words[i]}
        </m.span>
      </AnimatePresence>
    </span>
  );
}
