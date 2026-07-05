import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Button, Card, Pill, Spinner, cx } from '../../components/ui';
import { loadUsers, userAction } from '../../store/slices/verification';
import { isDemoSession } from '../../store/slices/auth';
import { addToast } from '../../store/slices/toast';
import { useAdmin } from '../App';

const ROLE_LABEL = { customer: 'Customer', seller: 'Seller', rider: 'Rider', reviewer: 'Reviewer', admin: 'Admin' };

/**
 * Customer, seller and rider accounts: suspend or reactivate the account or one role, or
 * reset a lost authenticator after checking the person's identity. Each needs a reason and a
 * fresh code, is audited and emails the person. Staff accounts are managed by the server owner.
 */
export default function Users() {
  const dispatch = useDispatch();
  const { run } = useAdmin();
  const data = useSelector((s) => s.verification.users);
  const [q, setQ] = useState('');
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [ask, setAsk] = useState(null);
  const demo = isDemoSession();
  const load = () => dispatch(loadUsers({ q: q.trim().length >= 2 ? q.trim() : undefined, role: role || undefined, status: status || undefined, page, pageSize: 25 }));
  useEffect(() => {
    if (!demo) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, status, page, demo]);
  if (demo) return <p className="text-sm text-grey-600">Sign in with your staff account to manage accounts.</p>;

  const confirm = (title, args) => setAsk({ title, args });
  return (
    <div>
      <h1 className="page-title">Accounts</h1>
      <p className="mt-1 text-sm text-grey-600">Suspending signs the person out everywhere at once. Every change needs a reason, which is kept in the audit log.</p>
      <div className="mt-5 flex flex-wrap gap-2">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setPage(1);
            load();
          }}
        >
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name or email" aria-label="Search accounts" className="field h-11 w-auto rounded-full text-sm" />
          <Button size="sm" variant="dark" type="submit">Search</Button>
        </form>
        <select value={role} onChange={(e) => (setRole(e.target.value), setPage(1))} aria-label="Role" className="field h-11 w-auto rounded-full text-sm">
          <option value="">All roles</option>
          {['customer', 'seller', 'rider'].map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
        </select>
        <select value={status} onChange={(e) => (setStatus(e.target.value), setPage(1))} aria-label="Status" className="field h-11 w-auto rounded-full text-sm">
          <option value="">Any status</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
        </select>
      </div>
      <Card className="mt-4 overflow-x-auto">
        {!data ? (
          <Spinner className="m-6 h-6 w-6 text-orange-text" />
        ) : (
          <table className="w-full min-w-[820px] text-sm">
            <thead className="text-left text-grey-600"><tr><th className="p-3">Account</th><th className="p-3">Roles</th><th className="p-3">Checks</th><th className="p-3">Status</th><th className="p-3">Actions</th></tr></thead>
            <tbody>
              {data.items.length === 0 && <tr><td colSpan="5" className="p-4 text-grey-600">No accounts match.</td></tr>}
              {data.items.map((u) => {
                const staff = u.roles.some((r) => ['admin', 'reviewer'].includes(r.role));
                return (
                  <tr key={u.id} className="border-t border-grey-800/5 align-top">
                    <td className="p-3"><b>{u.name}</b><span className="block text-xs text-grey-600">{u.email} · #{u.id}</span></td>
                    <td className="p-3">
                      <div className="flex flex-wrap gap-1">
                        {u.roles.map((r) => (
                          <button
                            key={r.role}
                            disabled={staff}
                            onClick={() => confirm(`${r.status === 'active' ? 'Suspend' : 'Reactivate'} the ${ROLE_LABEL[r.role].toLowerCase()} role of ${u.name}`, { id: u.id, role: r.role, action: r.status === 'active' ? 'suspend' : 'reactivate' })}
                            className={cx('rounded-full px-2.5 py-0.5 text-xs font-bold', r.status === 'active' ? 'bg-orange/15 text-orange-text' : 'bg-grey-50 text-grey-600 line-through')}
                            title={staff ? 'Staff accounts are managed by the server owner' : 'Suspend or reactivate this role only'}
                          >
                            {ROLE_LABEL[r.role]}
                          </button>
                        ))}
                      </div>
                    </td>
                    <td className="p-3 text-xs text-grey-600">{u.emailVerified ? 'email ✓' : 'email ✗'} · {u.mfaEnrolled ? '2-step ✓' : '2-step off'}{u.mobileVerified ? ' · mobile ✓' : ''}</td>
                    <td className="p-3">{u.status === 'active' ? <Pill tone="green">Active</Pill> : <Pill tone="red" title={u.statusReason}>Suspended</Pill>}</td>
                    <td className="p-3">
                      {!staff && (
                        <div className="flex flex-wrap gap-1">
                          <Button size="sm" variant={u.status === 'active' ? 'outline' : 'primary'} onClick={() => confirm(`${u.status === 'active' ? 'Suspend' : 'Reactivate'} ${u.name}`, { id: u.id, action: u.status === 'active' ? 'suspend' : 'reactivate' })}>
                            {u.status === 'active' ? 'Suspend' : 'Reactivate'}
                          </Button>
                          {u.mfaEnrolled && <Button size="sm" variant="ghost" onClick={() => confirm(`Reset the authenticator of ${u.name}`, { id: u.id, action: 'mfa-reset' })}>Reset 2-step</Button>}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {data && data.total > data.pageSize && (
          <div className="flex items-center justify-end gap-2 border-t border-grey-800/5 p-3 text-sm">
            <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
            <span>Page {page} of {Math.ceil(data.total / data.pageSize)}</span>
            <Button size="sm" variant="ghost" disabled={page * data.pageSize >= data.total} onClick={() => setPage((p) => p + 1)}>Next</Button>
          </div>
        )}
      </Card>
      {ask && (
        <Reason
          title={ask.title}
          onCancel={() => setAsk(null)}
          onConfirm={async (reason) => {
            const done = await run(() => dispatch(userAction({ ...ask.args, reason })).unwrap());
            if (done) {
              dispatch(addToast({ type: 'success', title: 'Done', message: ask.title }));
              setAsk(null);
              load();
            }
          }}
        />
      )}
    </div>
  );
}

function Reason({ title, onCancel, onConfirm }) {
  const [reason, setReason] = useState('');
  return (
    <Card className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-lg p-5 shadow-2xl" role="dialog" aria-label={title}>
      <p className="font-bold">{title}</p>
      <label htmlFor="user-reason" className="mt-2 block text-sm">Reason (kept in the audit log; suspensions are emailed to the person)</label>
      <textarea id="user-reason" rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} className="field mt-1 py-2.5" />
      <div className="mt-3 flex gap-2">
        <Button size="sm" disabled={reason.trim().length < 3} onClick={() => onConfirm(reason.trim())}>Confirm</Button>
        <Button size="sm" variant="quiet" onClick={onCancel}>Cancel</Button>
      </div>
    </Card>
  );
}
