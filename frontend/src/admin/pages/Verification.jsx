import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Button, Card, CloseButton, Icon, Modal, Pill, Spinner, cx } from '../../components/ui';
import { decideItem, documentLink, itemClosed, loadItem, loadQueue, revealNumber, reviewDocument, tickCheck } from '../../store/slices/verification';
import { isDemoSession } from '../../store/slices/auth';
import { addToast } from '../../store/slices/toast';
import { useAdmin } from '../App';
import { BUSINESS_TYPE_LABELS, DELIVERY_MODE_LABELS } from '@shared/domain/documents';

const STATUS_TONE = { SUBMITTED: 'sun', UNDER_REVIEW: 'sun', ACTION_REQUIRED: 'orange', APPROVED: 'green', REJECTED: 'red', SUSPENDED: 'red', DRAFT: 'grey' };
const DOC_TONE = { PENDING: 'sun', APPROVED: 'green', REJECTED: 'red', SUPERSEDED: 'grey' };
const FILTERS = [
  ['open', 'Waiting for review'],
  ['renewals', 'Renewals'],
  ['ACTION_REQUIRED', 'Changes requested'],
  ['APPROVED', 'Approved'],
  ['REJECTED', 'Rejected'],
  ['SUSPENDED', 'Suspended'],
  ['all', 'All'],
];
const CHECK_LABELS = { location: 'Pickup point and shop front match the map', kitchen: 'Kitchen and storage are clean', menu: 'Menu names, allergens and prep times are real', background: 'Background check came back clear' };
// the toast after a decision says what happened
const DONE = { approve: 'Approved', 'request-changes': 'Changes requested', reject: 'Rejected', suspend: 'Suspended', reinstate: 'Reinstated' };
const words = (s) => s.replaceAll('_', ' ').toLowerCase();
const when = (d) => (d ? new Date(d).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '–');

/** The verification queue: sellers and riders, their documents, checks and decisions. */
export default function Verification() {
  const dispatch = useDispatch();
  const { queue, loading, error, item } = useSelector((s) => s.verification);
  const role = useSelector((s) => s.auth.user?.role);
  const [kind, setKind] = useState('seller');
  const [status, setStatus] = useState('open');
  const [overdue, setOverdue] = useState(false);
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const demo = isDemoSession();
  const load = () => dispatch(loadQueue({ kind, status, overdue, q: q.trim().length >= 2 ? q.trim() : undefined, page, pageSize: 20 }));
  useEffect(() => {
    if (!demo) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, status, overdue, page, demo]);

  if (demo) {
    return (
      <div>
        <h1 className="page-title">Verification</h1>
        <Card className="mt-6 max-w-2xl p-6">
          <p className="font-bold">The verification queue runs on the real backend.</p>
          <p className="mt-1 text-sm text-grey-600">The demo admin lives in the browser mock, so it cannot review real uploads. Sign out and sign in with your staff Google account and authenticator (made with npm run create-admin).</p>
        </Card>
      </div>
    );
  }
  const pages = queue ? Math.max(1, Math.ceil(queue.total / queue.pageSize)) : 1;
  const counts = queue?.counts ?? {};
  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">Verification</h1>
          <p className="mt-1 text-sm text-grey-600">Nothing is approved automatically. Every decision is recorded with your name and reason; approving, rejecting and suspending ask for a fresh code.</p>
        </div>
        <div className="flex gap-1 rounded-full bg-white/70 p-1 ring-1 ring-grey-800/10" role="tablist">
          {[['seller', 'Sellers', 'box'], ['rider', 'Riders', 'scooter']].map(([k, l, icon]) => (
            <button key={k} role="tab" aria-selected={kind === k} onClick={() => (setKind(k), setPage(1))} className={cx('flex h-10 items-center gap-2 rounded-full px-4 text-sm font-bold', kind === k ? 'chip-on' : 'text-grey-800')}>
              <Icon name={icon} className="h-4 w-4" /> {l}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        {FILTERS.map(([v, l]) => (
          <button key={v} onClick={() => (setStatus(v), setPage(1))} className={cx('h-9 rounded-full px-3.5 text-[13px] font-bold', status === v ? 'chip-on' : 'chip-off')}>
            {l}
            {v === 'open' && (counts.SUBMITTED ?? 0) + (counts.UNDER_REVIEW ?? 0) > 0 ? ` (${(counts.SUBMITTED ?? 0) + (counts.UNDER_REVIEW ?? 0)})` : ''}
          </button>
        ))}
        <label className="ml-1 flex items-center gap-2 text-sm font-bold">
          <input type="checkbox" checked={overdue} onChange={(e) => (setOverdue(e.target.checked), setPage(1))} className="h-4 w-4 accent-orange-deep" /> Overdue only (48 h+)
        </label>
        <form
          className="ml-auto flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setPage(1);
            load();
          }}
        >
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name or email" aria-label="Search applicants" className="field h-11 w-auto rounded-full text-sm" />
          <Button size="sm" variant="dark" type="submit">Search</Button>
        </form>
      </div>

      <Card className="mt-4 overflow-x-auto">
        {error && <p className="p-4 text-sm font-semibold text-red-text">{error.message}</p>}
        <table className="w-full min-w-[720px] text-sm">
          <thead className="text-left text-grey-600">
            <tr>
              <th className="p-3">Applicant</th>
              <th className="p-3">{kind === 'seller' ? 'Business type' : 'Vehicle'}</th>
              <th className="p-3">City</th>
              <th className="p-3">Submitted</th>
              <th className="p-3">To review</th>
              <th className="p-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {loading && !queue && (
              <tr><td colSpan="6" className="p-6 text-center"><Spinner className="mx-auto h-6 w-6 text-orange-text" /></td></tr>
            )}
            {queue?.items.length === 0 && <tr><td colSpan="6" className="p-4 text-grey-600">Nothing here.</td></tr>}
            {queue?.items.map((a) => (
              <tr key={a.ref} onClick={() => dispatch(loadItem({ ref: a.ref }))} className="cursor-pointer border-t border-grey-800/5 hover:bg-white/70">
                <td className="p-3">
                  <button className="text-left font-bold hover:underline">{a.name}</button>
                  <span className="block text-xs text-grey-600">{a.applicant.email} · {a.ref}</span>
                </td>
                <td className="p-3">{kind === 'seller' ? BUSINESS_TYPE_LABELS[a.type] ?? '–' : DELIVERY_MODE_LABELS[a.type] ?? '–'}</td>
                <td className="p-3">{a.city ?? '–'}</td>
                <td className="p-3">{when(a.submittedAt)}{a.overdue && <Pill tone="red" className="ml-2">Overdue</Pill>}{a.submitCount > 1 && <Pill className="ml-2">Resubmitted</Pill>}</td>
                <td className="p-3">{a.pendingDocuments ? `${a.pendingDocuments} document${a.pendingDocuments === 1 ? '' : 's'}` : '–'}</td>
                <td className="p-3"><Pill tone={STATUS_TONE[a.status]}>{words(a.status)}</Pill></td>
              </tr>
            ))}
          </tbody>
        </table>
        {queue && queue.total > queue.pageSize && (
          <div className="flex items-center justify-between border-t border-grey-800/5 p-3 text-sm">
            <span>{queue.total} applications</span>
            <span className="flex gap-2">
              <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
              <span className="self-center">Page {page} of {pages}</span>
              <Button size="sm" variant="ghost" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Next</Button>
            </span>
          </div>
        )}
      </Card>

      <Modal open={Boolean(item)} onClose={() => dispatch(itemClosed())} title="Application" wide>
        {item && <Detail item={item} role={role} onClose={() => dispatch(itemClosed())} />}
      </Modal>
    </div>
  );
}

function Detail({ item, role, onClose }) {
  const dispatch = useDispatch();
  const { run } = useAdmin();
  const [ask, setAsk] = useState(null); // { title, needsReason, onConfirm }
  const [numbers, setNumbers] = useState({});
  const open = ['SUBMITTED', 'UNDER_REVIEW'].includes(item.status);
  const canReview = ['SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'SUSPENDED'].includes(item.status);

  const act = (label, action, needsReason) =>
    setAsk({
      title: label,
      needsReason,
      onConfirm: async (reason) => {
        const done = await run(() => dispatch(decideItem({ ref: item.ref, action, reason })).unwrap());
        if (done) dispatch(addToast({ type: 'success', title: DONE[action] ?? label, message: item.name }));
        return done;
      },
    });
  const docDecision = (doc, decision) =>
    decision === 'approve'
      ? run(() => dispatch(reviewDocument({ ref: doc.ref, decision })).unwrap())
      : setAsk({ title: `Reject ${doc.label}`, needsReason: true, onConfirm: (reason) => run(() => dispatch(reviewDocument({ ref: doc.ref, decision: 'reject', reason })).unwrap()) });
  const view = async (doc) => {
    const res = await run(() => dispatch(documentLink({ ref: doc.ref })).unwrap());
    if (res) window.open(res.url, '_blank', 'noopener');
  };
  const reveal = async (doc) => {
    const res = await run(() => dispatch(revealNumber({ ref: doc.ref })).unwrap());
    if (res) setNumbers((n) => ({ ...n, [doc.ref]: res.number }));
  };
  const p = item.profile ?? {};
  const current = item.documents.filter((d) => d.status !== 'SUPERSEDED');
  const older = item.documents.filter((d) => d.status === 'SUPERSEDED');
  // required gaps first, then what was uploaded, then the optional ones nobody sent
  const missing = item.checklist.filter((c) => !current.some((d) => d.docType === c.docType));
  const gap = (c) => (
    <div key={c.docType} className="flex items-center justify-between rounded-2xl bg-white p-3 text-sm ring-1 ring-grey-800/10">
      <span className="font-bold">{c.label}</span>
      <Pill tone={c.required ? 'red' : 'grey'}>{c.required ? 'Required, not uploaded' : 'Optional, not uploaded'}</Pill>
    </div>
  );

  return (
    <div className="relative p-5 sm:p-7">
      <CloseButton onClick={onClose} className="absolute right-3 top-3" />
      <div className="flex flex-wrap items-center gap-2 pr-10">
        <Pill tone="dark">{item.ref}</Pill>
        <Pill tone={STATUS_TONE[item.status]}>{words(item.status)}</Pill>
        {item.overdue && <Pill tone="red">Overdue</Pill>}
        {open && item.ready && <Pill tone="green">Ready to approve</Pill>}
      </div>
      <h2 className="mt-3 text-2xl font-extrabold">{item.name}</h2>
      <p className="text-sm text-grey-600">
        {item.applicant.name} · {item.applicant.email} {item.applicant.emailVerified ? '(verified)' : '(email not verified)'}
        {item.applicant.mobile && ` · ${item.applicant.mobile}${item.applicant.mobileVerified ? ' (verified)' : ''}`} · submitted <span className="whitespace-nowrap">{when(item.submittedAt)}</span>
        {item.submitCount > 1 && `, ${item.submitCount} times`}
      </p>
      {item.decisionReason && <p className="mt-3 rounded-xl bg-white p-3 text-sm ring-1 ring-grey-800/10"><b>Last decision:</b> {item.decisionReason}</p>}

      <section className="mt-5 grid gap-3 rounded-2xl bg-white p-4 text-sm ring-1 ring-grey-800/10 sm:grid-cols-2">
        {item.kind === 'seller' ? (
          <>
            <Info label="Owner" value={p.ownerLegalName} />
            <Info label="Business type" value={BUSINESS_TYPE_LABELS[p.businessType]} />
            <Info label="Shop" value={`${p.shopName ?? '–'} (${p.kind ?? '–'})`} />
            <Info label="Business contact" value={[p.businessEmail, p.businessPhone].filter(Boolean).join(' · ')} />
            <Info label="Address" value={[p.addressLine, p.city, p.state, p.pin].filter(Boolean).join(', ')} />
            <Info label="Pickup point" value={p.lat ? `${p.lat}, ${p.lng} · ${p.radiusKm} km radius` : null} link={p.lat ? `https://www.openstreetmap.org/?mlat=${p.lat}&mlon=${p.lng}#map=17/${p.lat}/${p.lng}` : null} />
            <Info label="Opening hours" value={p.openHours} />
            <Info label="Settlement account" value={[p.bankHolder, p.bankIfsc, p.bankAccount].filter(Boolean).join(' · ')} />
          </>
        ) : (
          <>
            <Info label="Legal name" value={p.legalName} />
            <Info label="Date of birth" value={p.dob} />
            <Info label="Address" value={[p.addressLine, p.city, p.state, p.pin].filter(Boolean).join(', ')} />
            <Info label="Emergency contact" value={[p.emergencyName, p.emergencyPhone].filter(Boolean).join(' · ')} />
            <Info label="Vehicle" value={item.vehicle ? `${DELIVERY_MODE_LABELS[item.vehicle.mode]}${item.vehicle.registrationNo ? ` · ${item.vehicle.registrationNo}` : ''}${item.vehicle.makeModel ? ` · ${item.vehicle.makeModel}` : ''}` : null} />
            <Info label="Background check consent" value={p.backgroundConsentAt ? when(p.backgroundConsentAt) : 'Not given'} />
            <Info label="Payout account" value={[p.bankHolder, p.bankIfsc, p.bankAccount].filter(Boolean).join(' · ')} />
          </>
        )}
      </section>

      <h3 className="mt-6 text-lg font-extrabold">Documents</h3>
      <div className="mt-2 grid gap-2">
        {missing.filter((c) => c.required).map(gap)}
        {current.map((d) => (
          <div key={d.ref} className="rounded-2xl bg-white p-3 text-sm ring-1 ring-grey-800/10">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-bold">{d.label} <span className="font-normal text-grey-600">v{d.version}</span></span>
              <span className="flex flex-wrap gap-1">
                <Pill tone={DOC_TONE[d.status]}>{words(d.status)}</Pill>
                {d.expiry === 'expiring' && <Pill tone="orange">expires in {d.daysLeft} days</Pill>}
                {d.expiry === 'expired' && <Pill tone="red">expired</Pill>}
                {d.scanStatus !== 'clean' && <Pill title="Virus scan">{d.scanStatus.replace('_', ' ')}</Pill>}
              </span>
            </div>
            <p className="mt-1 text-grey-600">
              {d.hasNumber && <>No. {numbers[d.ref] ?? d.number} {!numbers[d.ref] && <button className="font-bold text-orange-text" onClick={() => reveal(d)}>show</button>} · </>}
              {d.issuer && `${d.issuer} · `}
              {d.issuedOn && `issued ${d.issuedOn} · `}
              {d.expiresOn && `expires ${d.expiresOn} · `}
              {d.mime.split('/')[1].toUpperCase()}, {Math.round(d.sizeBytes / 1024)} KB
            </p>
            {d.rejectionReason && <p className="mt-1 text-red-text">Rejected: {d.rejectionReason}</p>}
            <div className="mt-2 flex flex-wrap gap-2">
              <Button size="sm" variant="ghost" onClick={() => view(d)}><Icon name="eye" className="h-4 w-4" /> Open</Button>
              {d.status === 'PENDING' && canReview && (
                <>
                  <Button size="sm" onClick={() => docDecision(d, 'approve')} disabled={d.expiry === 'expired'}>Approve</Button>
                  <Button size="sm" variant="outline" onClick={() => docDecision(d, 'reject')}>Reject</Button>
                </>
              )}
            </div>
          </div>
        ))}
        {missing.filter((c) => !c.required).map(gap)}
        {older.length > 0 && <p className="text-xs text-grey-600">{older.length} earlier version{older.length === 1 ? '' : 's'} replaced or withdrawn.</p>}
      </div>

      <h3 className="mt-6 text-lg font-extrabold">Checks</h3>
      <ul className="mt-2 grid gap-1.5">
        {item.checkNames.map((k) => (
          <li key={k}>
            <label className={cx('flex items-center gap-3 rounded-xl p-2.5 text-sm', item.checks[k] ? 'bg-emerald-50' : 'bg-white ring-1 ring-grey-800/10')}>
              <input type="checkbox" checked={Boolean(item.checks[k])} disabled={!open} onChange={(e) => run(() => dispatch(tickCheck({ ref: item.ref, check: k, value: e.target.checked })).unwrap())} className="h-4 w-4 accent-emerald-600" />
              <span className="flex-1">{CHECK_LABELS[k] ?? k}</span>
            </label>
          </li>
        ))}
      </ul>

      <div className="mt-6 flex flex-wrap gap-2 border-t border-grey-800/10 pt-4">
        {item.status === 'SUBMITTED' && <Button size="sm" variant="dark" onClick={() => run(() => dispatch(decideItem({ ref: item.ref, action: 'start-review' })).unwrap())}>Start review</Button>}
        {open && <Button size="sm" disabled={!item.ready} onClick={() => act('Approve', 'approve', false)}>{item.kind === 'seller' ? 'Approve (starts on probation)' : 'Approve rider'}</Button>}
        {open && <Button size="sm" variant="ghost" onClick={() => act('Request changes', 'request-changes', true)}>Request changes</Button>}
        {['SUBMITTED', 'UNDER_REVIEW', 'ACTION_REQUIRED'].includes(item.status) && <Button size="sm" variant="outline" onClick={() => act('Reject', 'reject', true)}>Reject</Button>}
        {role === 'admin' && item.status === 'APPROVED' && <Button size="sm" variant="danger" onClick={() => act('Suspend', 'suspend', true)}>Suspend</Button>}
        {role === 'admin' && item.status === 'SUSPENDED' && <Button size="sm" onClick={() => act('Reinstate', 'reinstate', true)}>Reinstate</Button>}
      </div>
      {open && !item.ready && <p className="mt-2 text-xs text-grey-600">Approve unlocks when every required document is approved and every check is ticked.</p>}

      <details className="mt-5">
        <summary className="cursor-pointer text-sm font-bold">History ({item.history.length})</summary>
        <ol className="mt-2 grid gap-1.5 border-l-2 border-orange/30 pl-4 text-sm">
          {item.history.map((h, i) => (
            <li key={i}>
              <b>{h.action}</b> {h.from && h.to && <span className="text-grey-600">{words(h.from)} → {words(h.to)}</span>} · {h.byApplicant ? 'applicant' : h.by} · {when(h.at)}
              {h.reason && <span className="block text-grey-600">{h.reason}</span>}
            </li>
          ))}
        </ol>
      </details>

      <Ask ask={ask} onClose={() => setAsk(null)} />
    </div>
  );
}

function Info({ label, value, link }) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-wider text-grey-400">{label}</p>
      <p className="mt-0.5">{value || '–'} {link && <a href={link} target="_blank" rel="noopener noreferrer" className="font-bold text-orange-text">map</a>}</p>
    </div>
  );
}

/** Asks for the reason before a decision; the applicant sees it. */
function Ask({ ask, onClose }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => setReason(''), [ask]);
  if (!ask) return null;
  return (
    <div className="mt-5 rounded-2xl bg-sun/20 p-4" role="dialog" aria-label={ask.title}>
      <p className="font-bold">{ask.title}</p>
      {ask.needsReason && (
        <>
          <label htmlFor="decision-reason" className="mt-2 block text-sm">Reason (the applicant sees this)</label>
          <textarea id="decision-reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={500} className="field mt-1 py-2.5" placeholder="Like: the FSSAI number does not match the certificate" />
        </>
      )}
      <div className="mt-3 flex gap-2">
        <Button
          size="sm"
          loading={busy}
          disabled={ask.needsReason && reason.trim().length < 3}
          onClick={async () => {
            setBusy(true);
            const done = await ask.onConfirm(reason.trim() || undefined);
            setBusy(false);
            if (done) onClose();
          }}
        >
          Confirm
        </Button>
        <Button size="sm" variant="quiet" onClick={onClose}>Cancel</Button>
      </div>
    </div>
  );
}
