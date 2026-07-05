import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { Card, Pill, Spinner } from '../../components/ui';
import { loadExpiring, loadItem } from '../../store/slices/verification';
import { isDemoSession } from '../../store/slices/auth';

/**
 * Documents of approved sellers and riders that expire within 30 days, or have expired. The
 * daily job emails the person at 30, 7 and 1 days and on the day; an expired required
 * document hides the shop or keeps the rider offline until a renewal is approved.
 */
export default function Expiring() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const list = useSelector((s) => s.verification.expiring);
  const demo = isDemoSession();
  useEffect(() => {
    if (!demo) dispatch(loadExpiring());
  }, [dispatch, demo]);
  return (
    <div>
      <h1 className="page-title">Expiring documents</h1>
      <p className="mt-1 text-sm text-grey-600">Approved sellers and riders whose licences, insurance or permits expire within 30 days. Reminders go out automatically.</p>
      <Card className="mt-6 overflow-x-auto">
        {demo ? (
          <p className="p-4 text-sm text-grey-600">Sign in with your staff account to see real documents.</p>
        ) : !list ? (
          <Spinner className="m-6 h-6 w-6 text-orange-text" />
        ) : (
          <table className="w-full min-w-[640px] text-sm">
            <thead className="text-left text-grey-600"><tr><th className="p-3">Who</th><th className="p-3">Document</th><th className="p-3">Expires</th><th className="p-3">State</th></tr></thead>
            <tbody>
              {list.length === 0 && <tr><td colSpan="4" className="p-4 text-grey-600">Nothing expires in the next 30 days.</td></tr>}
              {list.map((d) => (
                <tr key={d.ref} className="cursor-pointer border-t border-grey-800/5 hover:bg-white/70" onClick={async () => {
                  await dispatch(loadItem({ ref: d.applicationRef }));
                  navigate('/verification');
                }}>
                  <td className="p-3"><b>{d.applicant}</b><span className="block text-xs text-grey-600">{d.kind} · {d.email}</span></td>
                  <td className="p-3">{d.label}</td>
                  <td className="p-3">{d.expiresOn} ({d.daysLeft < 0 ? `${-d.daysLeft} days ago` : `in ${d.daysLeft} days`})</td>
                  <td className="p-3"><Pill tone={d.state === 'expired' ? 'red' : 'orange'}>{d.state}</Pill></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      <p className="mt-3 text-xs text-grey-600">Open a row to see the application and any renewal upload.</p>
    </div>
  );
}
