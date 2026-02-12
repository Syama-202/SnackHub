import { useDispatch, useSelector } from 'react-redux';
import { usePolling } from '../../lib/hooks';
import { fetchAudit } from '../../store/slices/adminSlice';
import { Card } from '../../components/ui';

/** Append-only audit log: who, what, before, after (doc 11.4). */
export default function AuditLog() {
  const dispatch = useDispatch();
  const data = useSelector((state) => state.admin.audit);
  usePolling(() => dispatch(fetchAudit()), 5000);
  return (
    <div>
      <h1 className="text-3xl font-extrabold">Audit log</h1>
      <p className="mt-1 text-sm text-grey-600">Every admin write, login and MFA event. The app’s database user cannot update or delete these rows.</p>
      <Card className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="text-left text-grey-600"><tr><th className="p-3">When</th><th className="p-3">Who</th><th className="p-3">Action</th><th className="p-3">Before</th><th className="p-3">After</th></tr></thead>
          <tbody>
            {data?.length === 0 && <tr><td colSpan="5" className="p-3 text-grey-600">Nothing yet.</td></tr>}
            {data?.map((a) => (
              <tr key={a.id} className="border-t border-grey-800/5 align-top">
                <td className="whitespace-nowrap p-3">{new Date(a.at).toLocaleString([], { dateStyle: 'short', timeStyle: 'medium' })}</td>
                <td className="p-3 font-mono text-xs">{a.actor}</td>
                <td className="p-3 font-bold">{a.action}</td>
                <td className="p-3 font-mono text-xs text-grey-600">{a.before ? JSON.stringify(a.before) : '–'}</td>
                <td className="p-3 font-mono text-xs text-grey-600">{a.after ? JSON.stringify(a.after) : '–'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
