import { useEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { cx, Icon } from './ui';

const TONE = {
  info: 'bg-grey-800 text-white',
  success: 'bg-emerald-600 text-white',
  error: 'bg-red-strong text-white',
  sun: 'bg-sun text-grey-800',
};

function ToastItem({ t, onDismiss }) {
  useEffect(() => {
    const h = setTimeout(() => onDismiss(t.id), t.duration || 4200);
    return () => clearTimeout(h);
  }, [t, onDismiss]);
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.96 }}
      className={cx('pointer-events-auto flex max-w-sm items-start gap-3 rounded-2xl px-4 py-3 shadow-xl', TONE[t.tone])}
      role={t.tone === 'error' ? 'alert' : 'status'}
    >
      <div className="flex-1">
        {t.title && <p className="font-bold">{t.title}</p>}
        {t.body && <p className="text-sm opacity-90">{t.body}</p>}
      </div>
      <button onClick={() => onDismiss(t.id)} aria-label="Dismiss" className="-mr-1 grid h-8 w-8 place-items-center rounded-full opacity-80 hover:opacity-100">
        <Icon name="twitter" className="h-3.5 w-3.5" />
      </button>
    </motion.div>
  );
}

export default function Toaster({ toasts, onDismiss, bottomOffset = 0 }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 z-[70] flex flex-col items-center gap-2 px-4" style={{ bottom: 16 + bottomOffset }} aria-live="polite">
      <AnimatePresence>
        {toasts.map((t) => (
          <ToastItem key={t.id} t={t} onDismiss={onDismiss} />
        ))}
      </AnimatePresence>
    </div>
  );
}
