import { useEffect, useState } from 'react';
import { useDispatch } from 'react-redux';
import { fetchNotice, saveNotice } from '../../store/slices/admin';
import { addToast } from '../../store/slices/toast';
import { Button, Card, Pill } from '../../components/ui';
import { useAdmin } from '../App';

const HOURS = [['', 'Until I remove it'], ['6', '6 hours'], ['24', '1 day'], ['72', '3 days'], ['168', '1 week']];

/** The announcement shown across the top of the shop. Saving needs a recent second factor. */
export default function NoticeEditor() {
  const dispatch = useDispatch();
  const { run } = useAdmin();
  const [state, setState] = useState(null);
  const [message, setMessage] = useState('');
  const [tone, setTone] = useState('info');
  const [hours, setHours] = useState('');
  const [busy, setBusy] = useState(false);

  const take = (s) => {
    setState(s);
    setMessage(s.notice?.message ?? '');
    setTone(s.notice?.tone ?? 'info');
  };
  useEffect(() => {
    dispatch(fetchNotice()).unwrap().then(take).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch]);

  const save = async (text) => {
    setBusy(true);
    // `run` asks for the authenticator code again when the last one is too old, then retries
    const saved = await run(() => dispatch(saveNotice({ message: text, tone, endsAt: text && hours ? Date.now() + Number(hours) * 3_600_000 : null })).unwrap());
    setBusy(false);
    if (!saved) return;
    take(saved);
    dispatch(addToast({ type: 'success', title: text ? 'Announcement is showing' : 'Announcement removed' }));
  };

  return (
    <Card className="mt-6 p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-extrabold">Shop announcement</h2>
        {state && <Pill tone={state.showing ? 'green' : 'grey'}>{state.showing ? 'Showing now' : 'Not showing'}</Pill>}
      </div>
      <p className="text-sm text-grey-600">One line across the top of the shop, for example a holiday closure. Plain text, up to 200 characters.</p>
      <label className="mt-3 block text-sm font-bold" htmlFor="notice-text">Message</label>
      <textarea id="notice-text" rows={2} maxLength={200} value={message} onChange={(e) => setMessage(e.target.value.replace(/[<>]/g, ''))} placeholder="Closed on 12 November for Diwali. Back on the 13th." className="field mt-1 py-2.5" />
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="text-sm font-bold">
          Colour
          <select value={tone} onChange={(e) => setTone(e.target.value)} className="field mt-1 block h-11 w-auto font-normal">
            <option value="info">Orange (news)</option>
            <option value="warning">Yellow (warning)</option>
          </select>
        </label>
        <label className="text-sm font-bold">
          Show for
          <select value={hours} onChange={(e) => setHours(e.target.value)} className="field mt-1 block h-11 w-auto font-normal">
            {HOURS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
          </select>
        </label>
        <Button size="sm" loading={busy} disabled={!message.trim()} onClick={() => save(message.trim())}>Show it</Button>
        {state?.notice && <Button size="sm" variant="ghost" disabled={busy} onClick={() => save('')}>Remove</Button>}
      </div>
      {state?.notice?.endsAt && state.showing && <p className="mt-2 text-xs text-grey-600">Stops showing {new Date(state.notice.endsAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}.</p>}
    </Card>
  );
}
