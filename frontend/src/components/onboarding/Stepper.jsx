import { Icon, cx } from '../ui';

/** The steps of an onboarding form, with how far the person has got. Any step can be revisited. */
export default function Stepper({ steps, current, onPick }) {
  const done = steps.filter((s) => s.complete).length;
  return (
    <nav aria-label="Application steps">
      <div className="flex items-center justify-between text-sm font-bold text-grey-600">
        <span>Step {current + 1} of {steps.length}</span>
        <span>{done} of {steps.length} complete</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-grey-800/10" role="progressbar" aria-valuemin={0} aria-valuemax={steps.length} aria-valuenow={done} aria-label="Steps complete">
        <div className="h-full rounded-full bg-gradient-to-r from-sun to-orange transition-all duration-500" style={{ width: `${(done / steps.length) * 100}%` }} />
      </div>
      <ol className="no-scrollbar -mx-1 mt-4 flex gap-2 overflow-x-auto px-1 pb-1">
        {steps.map((s, i) => (
          <li key={s.id} className="shrink-0">
            <button
              type="button"
              onClick={() => onPick(i)}
              aria-current={i === current ? 'step' : undefined}
              className={cx('flex h-10 items-center gap-2 rounded-full px-3.5 text-sm font-bold transition', i === current ? 'chip-on' : 'chip-off')}
            >
              <span className={cx('grid h-6 w-6 place-items-center rounded-full text-xs', s.complete ? 'bg-emerald-600 text-white' : 'bg-white/70 text-grey-800')}>
                {s.complete ? <Icon name="check" className="h-3.5 w-3.5" /> : i + 1}
              </span>
              {s.label}
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}
