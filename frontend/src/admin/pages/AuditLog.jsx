import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { usePolling } from '../../hooks';
import { fetchAudit } from '../../store/slices/admin';
import { loadAudit } from '../../store/slices/verification';
import { isDemoSession } from '../../store/slices/auth';
import { Button, Card } from '../../components/ui';

/**
 * Append-only audit log: who, what, before, after (doc 11.4). With a real staff session it is
 * the backend's log (sign-ins, MFA events, decisions, document views); the demo admin sees the
 * browser mock's.
 */
export default function AuditLog() {
  const dispatch = useDispatch();
  const demo = isDemoSession();
  const mock = useSelector((state) => state.admin.audit);
  const real = useSelector((state) => state.verification.audit);
  const [action, setAction] = useState('');
  const [page, setPage] = useState(1);
  usePolling(() => demo && dispatch(fetchAudit()), 5000);
  useEffect(() => {
    if (!demo) dispatch(loadAudit({ action: /^[a-z_.]{2,60}$/.test(action) ? action : undefined, page, pageSize: 50 }));
  }, [dispatch, demo, action, page]);
  const rows = demo ? mock : real?.items;
  return (
    <div>
      <h1 className="text-3xl font-extrabold">Audit log</h1>
      <p className="mt-1 text-sm text-grey-600">Every sign-in, second-factor event, decision and document view. The database refuses to change or delete these rows.</p>
      {!demo && (
        <div className="mt-4 flex flex-wrap gap-2">
          <select value={action} onChange={(e) => (setAction(e.target.value), setPage(1))} aria-label="Filter by action" className="h-10 rounded-full border border-grey-800/15 bg-white px-3 text-sm">
            <option value="">Every action</option>
            <option value="auth.">Sign-ins and security</option>
            <option value="admin.">Staff sign-ins</option>
            <option value="application.">Application decisions</option>
            <option value="document.">Documents</option>
            <option value="user.">Account changes</option>
            <option value="requirements.">Requirements</option>
          </select>
        </div>
      )}
      <Card className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="text-left text-grey-600"><tr><th className="p-3">When</th><th className="p-3">Who</th><th className="p-3">Action</th><th className="p-3">Target</th><th className="p-3">Before</th><th className="p-3">After</th></tr></thead>
          <tbody>
            {rows?.length === 0 && <tr><td colSpan="6" className="p-3 text-grey-600">Nothing yet.</td></tr>}
            {rows?.map((a) => (
              <tr key={a.id} className="border-t border-grey-800/5 align-top">
                <td className="whitespace-nowrap p-3">{new Date(a.at).toLocaleString([], { dateStyle: 'short', timeStyle: 'medium' })}</td>
                <td className="p-3 font-mono text-xs">{a.actor ?? (a.actorId ? `user ${a.actorId}` : 'system')}</td>
                <td className="p-3 font-bold">{a.action}</td>
                <td className="p-3 font-mono text-xs">{a.target ?? '–'}</td>
                <td className="p-3 font-mono text-xs text-grey-600">{a.before ? JSON.stringify(a.before) : '–'}</td>
                <td className="p-3 font-mono text-xs text-grey-600">{a.after ? JSON.stringify(a.after) : '–'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!demo && real && real.total > real.pageSize && (
          <div className="flex items-center justify-end gap-2 border-t border-grey-800/5 p-3 text-sm">
            <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Newer</Button>
            <span>Page {page}</span>
            <Button size="sm" variant="ghost" disabled={page * real.pageSize >= real.total} onClick={() => setPage((p) => p + 1)}>Older</Button>
          </div>
        )}
      </Card>
    </div>
  );
}
