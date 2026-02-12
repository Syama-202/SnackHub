import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { AnimatePresence, motion } from 'motion/react';
import { removeToast } from '../../store/slices/toastSlice';
import { cx } from './index';

const TONE = {
  info: 'bg-grey-800 text-white',
  success: 'bg-emerald-600 text-white',
  error: 'bg-red-strong text-white',
  sun: 'bg-sun text-grey-800',
};

/** Toasts from the Redux toast slice (addToast / removeToast). */
const Toast = ({ bottomOffset = 0 }) => {
  const toasts = useSelector((state) => state.toast.toasts);
  const dispatch = useDispatch();
  return (
    <div className="pointer-events-none fixed inset-x-0 z-[70] flex flex-col items-center gap-2 px-4" style={{ bottom: 16 + bottomOffset }} aria-live="polite">
      <AnimatePresence>
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onDismiss={() => dispatch(removeToast(toast.id))} />
        ))}
      </AnimatePresence>
    </div>
  );
};

const ToastItem = ({ toast, onDismiss }) => {
  useEffect(() => {
    const timer = setTimeout(onDismiss, toast.duration);
    return () => clearTimeout(timer);
  }, [toast.duration]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.96 }}
      className={cx('pointer-events-auto flex max-w-sm items-start gap-3 rounded-2xl py-3 pl-4 pr-1 shadow-xl', TONE[toast.type] || TONE.info)}
      role={toast.type === 'error' ? 'alert' : 'status'}
    >
      <div className="flex-1 py-0.5">
        {toast.title && <p className="font-bold">{toast.title}</p>}
        {toast.message && <p className="text-sm opacity-90">{toast.message}</p>}
      </div>
      <button onClick={onDismiss} aria-label="Dismiss" className="grid h-9 w-9 shrink-0 place-items-center rounded-full opacity-80 hover:bg-black/10 hover:opacity-100">
        <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" /></svg>
      </button>
    </motion.div>
  );
};

export default Toast;
