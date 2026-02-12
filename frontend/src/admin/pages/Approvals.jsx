import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { decideApplication, fetchApplications } from '../../store/slices/admin';
import { addToast } from '../../store/slices/toast';
import { Button, Card, Pill, Icon, cx } from '../../components/ui';
import { useAdmin } from '../App';

const CHECK_LABELS = { identity: 'Owner ID matches Google account', licence: 'Licence looked up on regulator register', location: 'Map pin and shop-front photo', kitchen: 'Kitchen and storage evidence', menu: 'Menu: names, allergens, serving temp, prep time', testOrder: 'Test order reviewed', vehicle: 'Vehicle documents' };

/** Verification queue with the checklist (doc 16.4). Decisions need fresh MFA. */
export default function Approvals() {
  const dispatch = useDispatch();
  const { run } = useAdmin();
  const data = useSelector((state) => state.admin.applications);
  useEffect(() => {
    dispatch(fetchApplications());
  }, [dispatch]);
  const [reason, setReason] = useState({});
  const act = async (a, action, body) => {
    const done = await run(() => dispatch(decideApplication({ id: a.id, action, body })).unwrap());
    if (done && action !== 'check') dispatch(addToast({ title: `Application ${action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'updated'}`, type: 'success' }));
  };
  return (
    <div>
      <h1 className="text-3xl font-extrabold">Approvals</h1>
      <p className="mt-1 text-sm text-grey-600">A shop stays hidden from customers until every check passes. Approved shops start on probation. Seller documents open only through short-lived signed links.</p>
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        {data.map((a) => {
          const open = ['SUBMITTED', 'UNDER_REVIEW', 'NEEDS_INFO'].includes(a.status);
          const allPass = Object.values(a.checks).every(Boolean);
          return (
            <Card key={a.id} className="p-5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <Pill tone={a.kind === 'SELLER' ? 'orange' : 'dark'}>{a.kind === 'SELLER' ? 'Shop' : 'Rider'}</Pill>
                  <h2 className="mt-2 text-xl font-extrabold">{a.name}</h2>
                  <p className="text-sm text-grey-600">{a.city} · submitted {new Date(a.submittedAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}{a.licenceNo ? ` · ${a.licenceNo}` : ''}</p>
                </div>
                <Pill tone={a.status === 'APPROVED' ? 'green' : a.status === 'REJECTED' ? 'red' : 'sun'}>{a.status.replace('_', ' ').toLowerCase()}</Pill>
              </div>
              <ul className="mt-4 space-y-1.5">
                {Object.entries(a.checks).map(([k, v]) => (
                  <li key={k}>
                    <label className={cx('flex items-center gap-3 rounded-xl p-2 text-sm', v ? 'bg-emerald-50' : 'bg-grey-50')}>
                      <input type="checkbox" checked={v} disabled={!open} onChange={(e) => act(a, 'check', { check: k, value: e.target.checked })} className="h-4 w-4 accent-emerald-600" />
                      <span className="flex-1">{CHECK_LABELS[k] || k}</span>
                      {v ? <Icon name="check" className="h-4 w-4 text-emerald-600" /> : <span className="text-xs font-bold text-grey-600">pending</span>}
                    </label>
                  </li>
                ))}
              </ul>
              {open && (
                <>
                  <label className="mt-4 block text-sm font-bold" htmlFor={`r-${a.id}`}>Reason (required to reject)</label>
                  <input id={`r-${a.id}`} value={reason[a.id] || ''} onChange={(e) => setReason({ ...reason, [a.id]: e.target.value })} className="mt-1 h-11 w-full rounded-xl border border-grey-800/15 px-3" placeholder="e.g. licence number not found on register" />
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button size="sm" disabled={!allPass} onClick={() => act(a, 'approve', {})}>Approve on probation</Button>
                    <Button size="sm" variant="ghost" onClick={() => act(a, 'needs-info', {})}>Ask for more info</Button>
                    <Button size="sm" variant="outline" disabled={!reason[a.id]} onClick={() => act(a, 'reject', { reason: reason[a.id] })}>Reject</Button>
                  </div>
                  {!allPass && <p className="mt-2 text-xs text-grey-600">Approve unlocks when every check passes.</p>}
                </>
              )}
              {a.decisionReason && <p className="mt-3 text-sm text-grey-600">Reason: {a.decisionReason}</p>}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
