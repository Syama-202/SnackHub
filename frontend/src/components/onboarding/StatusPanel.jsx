import { Link } from 'react-router-dom';
import { Button, Icon, Pill, cx } from '../ui';

const STATUS = {
  DRAFT: { tone: 'grey', icon: 'list', title: 'Your application is a draft', body: 'Everything you enter is saved as you go. Finish each step, then submit it for review.' },
  SUBMITTED: { tone: 'sun', icon: 'clock', title: 'Submitted, waiting for review', body: 'The verification team checks most applications within 48 hours. We will email you when anything changes.' },
  UNDER_REVIEW: { tone: 'sun', icon: 'search', title: 'The team is reviewing it now', body: 'Your documents are being checked. You cannot change them until the review is done or the team asks for changes.' },
  ACTION_REQUIRED: { tone: 'orange', icon: 'alert', title: 'A few changes are needed', body: 'Read the note below, fix what is marked, then submit again.' },
  APPROVED: { tone: 'green', icon: 'shield', title: 'Approved', body: 'You are verified. Keep your documents up to date: we remind you before anything expires.' },
  REJECTED: { tone: 'red', icon: 'alert', title: 'Not approved', body: 'This application could not be approved.' },
  SUSPENDED: { tone: 'red', icon: 'lock', title: 'Suspended', body: 'Your approval is on hold. Read the note below; contact support if you think it is a mistake.' },
};

const BG = { grey: 'bg-white/80', sun: 'bg-sun/20', orange: 'bg-orange/15', green: 'bg-emerald-50', red: 'bg-red/10' };
const ACTION = {
  upload: 'You uploaded',
  withdraw: 'You removed an upload',
  submit: 'Submitted',
  resubmit: 'Submitted again',
  'start-review': 'Review started',
  'document.approve': 'Document approved',
  'document.reject': 'Document not accepted',
  'request-changes': 'Changes requested',
  approve: 'Approved',
  reject: 'Not approved',
  suspend: 'Suspended',
  reinstate: 'Reinstated',
};
const when = (d) => new Date(d).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });

/** Where the application stands, the team's note, what still blocks work, and the history. */
export default function StatusPanel({ view, onRestart, home }) {
  const s = STATUS[view.status] ?? STATUS.DRAFT;
  const blocked = view.status === 'APPROVED' && !view.eligibility.ok;
  return (
    <section className={cx('rounded-[26px] p-5 ring-1 ring-grey-800/10 sm:p-6', BG[s.tone])} aria-live="polite">
      <div className="flex flex-wrap items-center gap-3">
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white/80"><Icon name={s.icon} className="h-6 w-6 text-grey-800" /></span>
        <div className="min-w-0 flex-1">
          <h2 className="text-2xl font-bold">{s.title}</h2>
          <p className="text-sm text-grey-600">{s.body}</p>
        </div>
        {view.applicationId && <Pill tone="dark">{view.applicationId}</Pill>}
      </div>
      {view.decisionReason && view.status !== 'APPROVED' && (
        <p className="mt-4 rounded-2xl bg-white/80 p-4 text-sm">
          <b>Note from the verification team:</b> {view.decisionReason}
        </p>
      )}
      {blocked && (
        <div className="mt-4 rounded-2xl bg-white/80 p-4 text-sm">
          <b>Work is paused until:</b>
          <ul className="mt-1 list-disc pl-5">
            {view.eligibility.reasons.map((r) => (
              <li key={`${r.code}${r.docType ?? ''}`}>{r.message}</li>
            ))}
          </ul>
        </div>
      )}
      {view.status === 'REJECTED' && (
        <div className="mt-4">
          {view.reapplyFrom && new Date(view.reapplyFrom) > new Date() ? (
            <p className="text-sm">You can apply again from {new Date(view.reapplyFrom).toLocaleDateString('en-IN', { dateStyle: 'medium' })}.</p>
          ) : (
            <Button onClick={onRestart}>Start a new application</Button>
          )}
        </div>
      )}
      {view.status === 'APPROVED' && home && (
        <Link to={home} className="mt-4 inline-flex h-12 items-center rounded-full bg-grey-800 px-6 font-semibold text-white">
          Open your console <Icon name="arrowRight" className="ml-1 h-4 w-4" />
        </Link>
      )}
      {view.history.length > 0 && (
        <details className="mt-4">
          <summary className="cursor-pointer text-sm font-semibold text-grey-800">History ({view.history.length})</summary>
          <ol className="mt-3 grid gap-2 border-l-2 border-orange/30 pl-4 text-sm">
            {view.history.map((h, i) => (
              <li key={i}>
                <span className="font-semibold">{ACTION[h.action] ?? h.action}</span> <span className="text-grey-600">· {h.by} · {when(h.at)}</span>
                {h.reason && <span className="block text-grey-600">{h.reason}</span>}
              </li>
            ))}
          </ol>
        </details>
      )}
    </section>
  );
}
