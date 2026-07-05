import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Button, Card, Icon, Spinner, cx } from '../../components/ui';
import { loadRequirements, saveRequirements } from '../../store/slices/verification';
import { isDemoSession } from '../../store/slices/auth';
import { addToast } from '../../store/slices/toast';
import { useAdmin } from '../App';
import { BUSINESS_TYPE_LABELS } from '@shared/domain/documents';

/**
 * Which documents sellers and riders must or may upload, by business type or vehicle and by
 * state. Several rows can name one document; the strictest one that applies wins. A change
 * applies at once, also to people already approved, and is written to the audit log.
 */
export default function Requirements() {
  const dispatch = useDispatch();
  const { run } = useAdmin();
  const all = useSelector((s) => s.verification.requirements);
  const [kind, setKind] = useState('seller');
  const [rows, setRows] = useState(null);
  const demo = isDemoSession();
  const data = all[kind];
  useEffect(() => {
    if (!demo) dispatch(loadRequirements({ kind }));
  }, [dispatch, kind, demo]);
  useEffect(() => {
    setRows(data ? data.rows.map(({ docType, mode, types, states }) => ({ docType, mode, types, states })) : null);
  }, [data]);

  if (demo) return <p className="text-sm text-grey-600">Sign in with your staff account to change the requirements.</p>;
  const typeLabel = (t) => (kind === 'seller' ? BUSINESS_TYPE_LABELS[t] : data?.typeLabels?.[t]) ?? t;
  const update = (i, change) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...change } : x)));
  const toggle = (list, v) => {
    const next = (list ?? []).includes(v) ? list.filter((x) => x !== v) : [...(list ?? []), v];
    return next.length ? next : null;
  };

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">Document requirements</h1>
          <p className="mt-1 max-w-3xl text-sm text-grey-600">Leave “applies to” empty for everyone. Saving asks for a fresh code and applies at once: an approved seller or rider missing a newly required document is paused until they upload it.</p>
        </div>
        <div className="flex gap-1 rounded-full bg-white/70 p-1 ring-1 ring-grey-800/10">
          {['seller', 'rider'].map((k) => (
            <button key={k} onClick={() => setKind(k)} className={cx('h-10 rounded-full px-4 text-sm font-bold capitalize', kind === k ? 'chip-on' : '')}>{k}s</button>
          ))}
        </div>
      </div>
      {!rows ? (
        <Spinner className="mt-6 h-6 w-6 text-orange-text" />
      ) : (
        <div className="mt-6 grid gap-3">
          {rows.map((r, i) => (
            <Card key={i} className="grid gap-3 p-4 lg:grid-cols-[14rem_9rem_1fr_1fr_auto]">
              <label className="text-sm">
                <span className="mb-1 block font-bold">Document</span>
                <select value={r.docType} onChange={(e) => update(i, { docType: e.target.value })} className="field h-11">
                  {data.docTypes.map((d) => (
                    <option key={d.docType} value={d.docType}>{d.label}</option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-bold">Rule</span>
                <select value={r.mode} onChange={(e) => update(i, { mode: e.target.value })} className="field h-11">
                  <option value="required">Required</option>
                  <option value="optional">Optional</option>
                </select>
              </label>
              <fieldset className="text-sm">
                <legend className="mb-1 font-bold">Applies to {kind === 'seller' ? 'business types' : 'vehicles'}</legend>
                <div className="flex flex-wrap gap-1">
                  {data.types.map((t) => (
                    <button key={t} type="button" onClick={() => update(i, { types: toggle(r.types, t) })} className={cx('h-8 rounded-full px-3 text-xs font-bold', r.types?.includes(t) ? 'chip-on' : 'chip-off')}>{typeLabel(t)}</button>
                  ))}
                </div>
                {!r.types && <span className="text-xs text-grey-600">All</span>}
              </fieldset>
              <fieldset className="text-sm">
                <legend className="mb-1 font-bold">In states</legend>
                <select
                  value=""
                  onChange={(e) => e.target.value && update(i, { states: toggle(r.states, e.target.value) })}
                  className="h-9 w-full rounded-xl border border-grey-800/15 bg-white px-2 text-xs"
                  aria-label="Add a state"
                >
                  <option value="">{r.states ? 'Add or remove a state…' : 'All states (pick to limit)'}</option>
                  {data.states.map((s) => (
                    <option key={s} value={s}>{r.states?.includes(s) ? `✓ ${s}` : s}</option>
                  ))}
                </select>
                {r.states && <span className="mt-1 block text-xs text-grey-600">{r.states.join(', ')}</span>}
              </fieldset>
              <button type="button" onClick={() => setRows((x) => x.filter((_, j) => j !== i))} className="self-center justify-self-end text-grey-600 hover:text-red-text" aria-label="Remove this rule">
                <Icon name="x" />
              </button>
            </Card>
          ))}
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" onClick={() => setRows((x) => [...x, { docType: data.docTypes[0].docType, mode: 'optional', types: null, states: null }])}>
              <Icon name="plus" className="h-4 w-4" /> Add a rule
            </Button>
            <Button
              onClick={async () => {
                const done = await run(() => dispatch(saveRequirements({ kind, rows })).unwrap());
                if (done) dispatch(addToast({ type: 'success', title: 'Requirements saved', message: 'They apply from now on.' }));
              }}
            >
              Save requirements
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
