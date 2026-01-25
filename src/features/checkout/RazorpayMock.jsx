import { useState } from 'react';
import { Modal, Button, cx } from '../../components/ui';
import { rupees } from '../../domain/money';

/**
 * Stand-in for Razorpay Standard Checkout (doc 10.9). The real page loads
 * checkout.razorpay.com/v1/checkout.js only on this route and opens it with
 * the server's key_id and order_id. Test UPI IDs behave like Razorpay's:
 * success@razorpay succeeds, failure@razorpay fails.
 */
export default function RazorpayMock({ open, payment, method, onSuccess, onFailure, onDismiss }) {
  const [tab, setTab] = useState(method === 'CARD' ? 'card' : 'upi');
  const [vpa, setVpa] = useState('success@razorpay');
  const [busy, setBusy] = useState(false);
  const pay = (fail) => {
    setBusy(true);
    setTimeout(() => {
      setBusy(false);
      const paymentId = `pay_demo${Date.now().toString(36)}`;
      if (fail) onFailure({ reason: tab === 'upi' ? 'UPI request declined' : 'Card authentication failed' });
      else onSuccess({ providerPaymentId: paymentId, signature: `sig_${payment.providerOrderId}_${paymentId}` });
    }, 1400);
  };
  return (
    <Modal open={open} onClose={busy ? undefined : onDismiss} title="Razorpay test checkout">
      {payment && (
        <div>
          <div className="flex items-center justify-between rounded-t-[28px] bg-[#0C2451] px-6 py-4 text-white">
            <div>
              <p className="text-xs opacity-80">SnackHub · test mode</p>
              <p className="text-2xl font-extrabold">{rupees(payment.amountPaise)}</p>
            </div>
            <span className="rounded bg-sun px-2 py-0.5 text-[11px] font-extrabold uppercase text-grey-800">Simulated</span>
          </div>
          <div className="flex border-b border-grey-800/10" role="tablist">
            {[['upi', 'UPI'], ['card', 'Card']].map(([id, l]) => (
              <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={cx('h-12 flex-1 font-bold', tab === id ? 'border-b-2 border-[#0C2451] text-[#0C2451]' : 'text-grey-600')}>{l}</button>
            ))}
          </div>
          <div className="p-6">
            {tab === 'upi' ? (
              <div>
                <label className="block text-sm font-bold" htmlFor="vpa">UPI ID</label>
                <select id="vpa" value={vpa} onChange={(e) => setVpa(e.target.value)} className="mt-1.5 h-11 w-full rounded-xl border border-grey-800/15 px-3">
                  <option value="success@razorpay">success@razorpay (test: succeeds)</option>
                  <option value="failure@razorpay">failure@razorpay (test: fails)</option>
                </select>
                <p className="mt-2 text-xs text-grey-600">UPI Intent and QR need live mode, so this demo uses test UPI IDs only.</p>
                <Button className="mt-5 w-full" loading={busy} onClick={() => pay(vpa.startsWith('failure'))}>{busy ? 'Waiting for UPI approval…' : 'Pay now'}</Button>
              </div>
            ) : (
              <div>
                <p className="rounded-xl bg-grey-50 p-3 text-sm text-grey-600">Test card · 4111 1111 1111 1111 · any future date · any CVV. Card details never touch SnackHub’s servers.</p>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <Button loading={busy} onClick={() => pay(false)}>Pay (succeeds)</Button>
                  <Button variant="ghost" disabled={busy} onClick={() => pay(true)}>Pay (fails)</Button>
                </div>
              </div>
            )}
            <button onClick={onDismiss} disabled={busy} className="mt-4 h-11 w-full text-sm font-bold text-grey-600">Cancel payment</button>
          </div>
        </div>
      )}
    </Modal>
  );
}
