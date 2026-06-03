import { useCallback, useEffect, useState } from 'react';
import { useDispatch } from 'react-redux';
import { fetchError, fetchErrors, setErrorStatus } from '../../store/slices/admin';
import { addToast } from '../../store/slices/toast';
import { Button, Card, Pill, cx } from '../../components/ui';
import { usePolling } from '../../hooks';
import { useAdmin } from '../App';

const SOURCE = { api: 'API', job: 'Background job', web: 'Shop site', admin: 'Admin console' };
const TABS = [['open', 'Open'], ['resolved', 'Resolved'], ['ignored', 'Ignored']];
const when = (ms) => new Date(ms).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const ago = (ms) => {
  const m = Math.round((Date.now() - ms) / 60000);
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : when(ms);
};

/**
 * Errors from the API, the background jobs and both websites, one row per cause
 * (shared/domain/errors.js). Text is scrubbed of personal data before it is stored. A
 * resolved error that happens again reopens and emails the admins; an ignored one stays quiet.
 */
const Errors = () => {
  const dispatch = useDispatch();
  const { run } = useAdmin();
  const [status, setStatus] = useState('open');
  const [source, setSource] = useState('');
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(null);

  const load = useCallback(() => run(() => dispatch(fetchErrors({ status, source })).unwrap()).then((d) => d && setData(d)), [dispatch, run, status, source]);
  useEffect(() => {
    load();
  }, [load]);
  usePolling(load, 30000);

  const show = async (id) => {
    if (open?.id === id) return setOpen(null);
    const e = await run(() => dispatch(fetchError(id)).unwrap());
    if (e) setOpen(e);
  };
  const change = async (to) => {
    const e = await run(() => dispatch(setErrorStatus({ id: open.id, status: to })).unwrap());
    if (!e) return;
    dispatch(addToast({ type: 'success', title: to === 'resolved' ? 'Marked resolved' : to === 'ignored' ? 'Ignored' : 'Reopened', message: to === 'resolved' ? 'If it happens again it reopens and the admins get an email.' : `Error #${e.id}` }));
    setOpen(null);
    load();
  };
  const pick = (k) => {
    setStatus(k);
    setOpen(null);
  };

  return (
    <div>
      <h1 className="text-3xl font-extrabold">Errors</h1>
      <p className="mt-1 max-w-3xl text-grey-600">Crashes from the API, the background jobs and both websites, one row per cause. Emails, phone numbers, codes and tokens are removed before anything is stored. Match a customer’s report by the request id they were shown.</p>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <div role="tablist" aria-label="Status" className="inline-flex rounded-full bg-grey-50 p-1">
          {TABS.map(([k, label]) => (
            <button key={k} role="tab" aria-selected={status === k} onClick={() => pick(k)} className={cx('h-9 rounded-full px-4 text-sm font-bold', status === k ? 'bg-white shadow-sm' : 'text-grey-600')}>
              {label}{data?.counts?.[k] ? ` (${data.counts[k]})` : ''}
            </button>
          ))}
        </div>
        <label className="ml-auto flex items-center gap-2 text-sm font-bold">
          From
          <select value={source} onChange={(e) => setSource(e.target.value)} className="h-10 rounded-xl border border-grey-800/15 bg-white px-3">
            <option value="">Everywhere</option>
            {Object.entries(SOURCE).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </label>
      </div>

      <div className="mt-4 space-y-2">
        {data && data.groups.length === 0 && <Card className="p-6 text-center text-grey-600">{status === 'open' ? 'No open errors.' : 'Nothing here.'}</Card>}
        {(data?.groups ?? []).map((g) => (
          <Card key={g.id} className="p-0">
            <button onClick={() => show(g.id)} aria-expanded={open?.id === g.id} className="flex w-full flex-wrap items-start gap-3 p-4 text-left">
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-1.5">
                  <Pill tone={g.source === 'api' || g.source === 'job' ? 'red' : 'orange'}>{SOURCE[g.source]}</Pill>
                  {g.regressedAt && g.status === 'open' && <Pill tone="sun">Came back</Pill>}
                  <span className="break-all font-mono text-xs text-grey-600">{g.where}</span>
                </span>
                <span className="mt-1 block break-words font-bold"><span className="text-red-text">{g.kind}</span>: {g.message}</span>
              </span>
              <span className="text-right text-sm">
                <span className="block font-extrabold">{g.seen.toLocaleString('en-IN')}×</span>
                <span className="block text-xs text-grey-600">last {ago(g.lastSeen)}</span>
              </span>
            </button>
            {open?.id === g.id && (
              <div className="border-t border-grey-800/10 p-4 text-sm">
                <dl className="grid gap-x-6 gap-y-1 sm:grid-cols-3">
                  <div><dt className="text-grey-600">First seen</dt><dd className="font-bold">{when(open.firstSeen)}</dd></div>
                  <div><dt className="text-grey-600">Last seen</dt><dd className="font-bold">{when(open.lastSeen)}</dd></div>
                  <div><dt className="text-grey-600">Release</dt><dd className="font-mono">{open.release ?? '–'}</dd></div>
                  {open.requestId && <div className="sm:col-span-3"><dt className="text-grey-600">Latest request id</dt><dd className="font-mono text-xs">{open.requestId}</dd></div>}
                  {Object.entries(open.context ?? {}).filter(([, v]) => v != null).map(([k, v]) => <div key={k}><dt className="capitalize text-grey-600">{k}</dt><dd className="font-bold">{String(v)}</dd></div>)}
                </dl>
                {open.stack && <pre className="mt-3 max-h-72 overflow-auto rounded-xl bg-grey-900 p-3 text-xs leading-relaxed text-grey-50" tabIndex={0} aria-label="Stack trace">{open.stack}</pre>}
                <div className="mt-3 flex flex-wrap gap-2">
                  {open.status !== 'resolved' && <Button size="sm" onClick={() => change('resolved')}>Mark resolved</Button>}
                  {open.status !== 'ignored' && <Button size="sm" variant="ghost" onClick={() => change('ignored')}>Ignore</Button>}
                  {open.status !== 'open' && <Button size="sm" variant="ghost" onClick={() => change('open')}>Reopen</Button>}
                </div>
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
};

export default Errors;
