import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { fetchPushStatus, markAllRead, removePushDevice, savePushDevice, sendTestPush } from '../../store/slices/notification';
import { addToast } from '../../store/slices/toast';
import { currentSubscription, deviceLabel, pushPermission, pushSupported, subscribeDevice, unsubscribeDevice } from '../../utils/push';
import { Button, Card, EmptyState, Icon, cx } from '../../components/ui';
import { linkFor } from '@shared/domain/push';

// Each portal sees its own messages (the API filters them by the token's role) and each
// message leads to the place where it can be acted on
const PORTAL = {
  customer: {
    note: 'In-app messages. Notifications never contain your delivery code.',
    empty: 'Order updates show up here.',
  },
  seller: {
    note: 'New orders, cancellations and news about your shop.',
    empty: 'New orders and shop updates show up here.',
  },
  rider: {
    note: 'Deliveries, cancellations and pay updates.',
    empty: 'Delivery and pay updates show up here.',
  },
};

const Notifications = () => {
  const dispatch = useDispatch();
  const { items, loaded } = useSelector((state) => state.notifications);
  const role = useSelector((state) => state.auth.user?.role);
  const portal = PORTAL[role] ?? PORTAL.customer;
  // Mark everything read shortly after the page opens
  useEffect(() => {
    const t = setTimeout(() => dispatch(markAllRead()), 1500);
    return () => clearTimeout(t);
  }, [dispatch]);
  return (
    <div className="mx-auto max-w-3xl px-4 pt-6">
      <h1 className="text-4xl font-extrabold">Notifications</h1>
      <p className="mt-1 text-sm text-grey-600">{portal.note}</p>
      <PushAlerts role={PORTAL[role] ? role : 'customer'} />
      <div className="mt-6 space-y-2">
        {loaded && items.length === 0 && <EmptyState title="All quiet" body={portal.empty} />}
        {items.map((n) => {
          const to = linkFor(PORTAL[role] ? role : 'customer', n);
          return (
            <Card key={n.id} as={to ? Link : 'div'} to={to ?? undefined} className={cx('flex items-start gap-3 p-4', !n.readAt && 'ring-2 ring-sun')}>
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-sun/30"><Icon name="bell" className="h-5 w-5" /></span>
              <div className="flex-1">
                <p className="font-bold">{n.body}</p>
                <p className="text-xs text-grey-600">{n.orderId ? `Order #${n.orderId} · ` : ''}{new Date(n.createdAt).toLocaleString([], { timeStyle: 'short', dateStyle: 'medium' })}</p>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
};

const ASK = {
  customer: 'Get order updates on this device, even when SnackHub is closed.',
  seller: 'Hear about new orders on this device at once, even when the console is closed.',
  rider: 'Get delivery offers and updates on this device, even when the app is closed.',
};

/**
 * Phone and desktop alerts for this device: the same messages as this inbox, sent by the
 * browser's push service. Only this device's sign-in can turn them on; signing out stops them.
 */
function PushAlerts({ role }) {
  const dispatch = useDispatch();
  const [state, setState] = useState(null); // null while loading | { enabled, publicKey, subscribed, devices }
  const [busy, setBusy] = useState(false);
  const permission = pushPermission();

  const load = useCallback(async () => {
    const sub = await currentSubscription().catch(() => null);
    const res = await dispatch(fetchPushStatus(sub?.endpoint)).unwrap().catch(() => null);
    setState(res ?? { enabled: false });
  }, [dispatch]);
  useEffect(() => {
    load();
  }, [load]);

  const fail = (title, e) => dispatch(addToast({ type: 'error', title, message: e?.message ?? 'Try again in a moment.' }));
  const turnOn = async () => {
    setBusy(true);
    try {
      const sub = await subscribeDevice(state.publicKey);
      await dispatch(savePushDevice({ endpoint: sub.endpoint, keys: sub.keys, device: deviceLabel() })).unwrap();
      dispatch(addToast({ type: 'success', title: 'Alerts are on', message: 'This device will show SnackHub messages.' }));
    } catch (e) {
      // the person said no in the browser's own prompt: nothing more to do here
      if (pushPermission() !== 'denied') fail('Alerts not turned on', e);
    } finally {
      setBusy(false);
      load();
    }
  };
  const turnOff = async () => {
    setBusy(true);
    try {
      const endpoint = await unsubscribeDevice();
      if (endpoint) await dispatch(removePushDevice(endpoint)).unwrap();
    } catch (e) {
      fail('Alerts not turned off', e);
    } finally {
      setBusy(false);
      load();
    }
  };
  const test = async () => {
    try {
      await dispatch(sendTestPush()).unwrap();
      dispatch(addToast({ type: 'success', title: 'Test sent', message: 'It should appear on this device in a few seconds.' }));
    } catch (e) {
      fail('Test not sent', e);
    }
  };

  if (!state) return null;
  let note = null;
  if (!pushSupported()) note = 'This browser cannot show alerts. On iPhone, add SnackHub to the home screen first.';
  else if (!state.enabled) note = 'Phone and desktop alerts are not set up on this server yet. Messages still arrive here.';
  else if (permission === 'denied') note = 'Alerts are blocked for this site. Allow notifications in the browser’s site settings, then come back.';
  return (
    <Card className="mt-5 flex flex-wrap items-center gap-3 p-4" role="region" aria-label="Alerts on this device">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-sun/30"><Icon name="bell" className="h-5 w-5" /></span>
      <div className="min-w-[200px] flex-1">
        <p className="font-bold">Alerts on this device {state.subscribed ? <span className="text-emerald-700">· on</span> : null}</p>
        <p className="text-sm text-grey-600">{note ?? (state.subscribed ? `On${state.devices > 1 ? ` (${state.devices} devices in all)` : ''}. Signing out of this device turns them off.` : ASK[role])}</p>
      </div>
      {!note && (
        <div className="flex flex-wrap gap-2">
          {state.subscribed ? (
            <>
              <Button size="sm" variant="ghost" onClick={test}>Send a test</Button>
              <Button size="sm" variant="ghost" loading={busy} onClick={turnOff}>Turn off</Button>
            </>
          ) : (
            <Button size="sm" loading={busy} onClick={turnOn}>Turn on alerts</Button>
          )}
        </div>
      )}
    </Card>
  );
}

export default Notifications;
