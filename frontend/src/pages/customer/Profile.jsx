import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { deleteAddress, fetchCredits, updateAddress } from '../../store/slices/profile';
import { setAddress } from '../../store/slices/ui';
import { addToast } from '../../store/slices/toast';
import { isDemoSession } from '../../store/slices/auth';
import { rupees } from '@shared/domain/money';
import { KIND_LABEL, addressSummary } from '@shared/domain/addresses';
import { Link } from 'react-router-dom';
import { Button, Card, Icon, Modal, CloseButton, Pill } from '../../components/ui';
import AddressForm, { KIND_ICON } from '../../components/address/Form';

const Profile = () => {
  const dispatch = useDispatch();
  const user = useSelector((state) => state.auth.user);
  const { addresses, credits } = useSelector((state) => state.profile);
  const selectedId = useSelector((state) => state.ui.addressId);
  // null: closed; 'new': adding; an address: editing it
  const [editing, setEditing] = useState(null);
  const [confirming, setConfirming] = useState(null);
  const demo = isDemoSession();

  useEffect(() => {
    dispatch(fetchCredits());
  }, [dispatch]);

  const remove = async (a) => {
    try {
      await dispatch(deleteAddress(a.id)).unwrap();
      if (a.id === selectedId) dispatch(setAddress(addresses.find((x) => x.id !== a.id)?.id ?? 0));
      dispatch(addToast({ type: 'success', title: 'Address deleted', message: 'Orders already placed keep their address.' }));
    } catch (e) {
      dispatch(addToast({ type: 'error', title: 'Address not deleted', message: e.message }));
    } finally {
      setConfirming(null);
    }
  };

  const makeDefault = async (a) => {
    try {
      await dispatch(updateAddress({ id: a.id, isDefault: true })).unwrap();
      dispatch(addToast({ type: 'success', title: `${a.label} is now your default` }));
    } catch (e) {
      dispatch(addToast({ type: 'error', title: 'Not changed', message: e.message }));
    }
  };

  return (
    <div className="mx-auto max-w-4xl px-4 pt-6">
      <h1 className="text-4xl font-extrabold">Profile</h1>
      <Card className="mt-6 flex items-center gap-4 p-5">
        <span className="grid h-14 w-14 place-items-center rounded-full bg-hero font-display text-2xl font-extrabold text-grey-800">{user.name[0]}</span>
        <div>
          <p className="text-lg font-bold">{user.name}</p>
          <p className="text-sm text-grey-600">{user.email}{demo ? ' · demo account' : ''}</p>
          {!demo && <Link to="/account/security" className="text-sm font-bold text-orange-text">Sign-in and security</Link>}
        </div>
      </Card>

      <section className="mt-8" aria-labelledby="addresses-h">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="addresses-h" className="text-2xl font-extrabold">Addresses</h2>
          <Button size="sm" variant="ghost" onClick={() => setEditing('new')} disabled={addresses.length >= 10}><Icon name="plus" className="h-4 w-4" /> Add address</Button>
        </div>
        <p className="mt-1 text-sm text-grey-600">Up to 10. Choose any of them at checkout; your default is picked first.</p>
        {addresses.length === 0 && (
          <Card className="mt-3 p-6 text-center">
            <p className="font-bold">No saved addresses yet</p>
            <p className="mt-1 text-sm text-grey-600">Add home, your hostel, college or office, with a pin riders can find.</p>
            <Button className="mt-3" onClick={() => setEditing('new')}>Add your first address</Button>
          </Card>
        )}
        <ul className="mt-3 grid gap-3 sm:grid-cols-2">
          {addresses.map((a) => (
            <li key={a.id}>
              <Card className="flex h-full flex-col gap-3 p-4">
                <div className="flex items-start gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-sun/20 text-orange-text"><Icon name={KIND_ICON[a.kind] ?? 'pin'} className="h-5 w-5" /></span>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 font-bold">
                      {a.label}
                      {a.label !== KIND_LABEL[a.kind] && <span className="text-xs font-semibold text-grey-600">{KIND_LABEL[a.kind]}</span>}
                      {a.isDefault && <Pill tone="green">Default</Pill>}
                    </p>
                    <p className="text-sm text-grey-600">{addressSummary(a)}</p>
                    {a.instructions && <p className="mt-1 text-sm text-grey-600"><span className="font-semibold text-grey-800">For the rider:</span> {a.instructions}</p>}
                  </div>
                </div>
                <div className="mt-auto flex flex-wrap gap-1">
                  <button onClick={() => setEditing(a)} className="h-9 rounded-full px-3 text-sm font-bold hover:bg-grey-800/5" aria-label={`Edit address ${a.label}`}>Edit</button>
                  {!a.isDefault && <button onClick={() => makeDefault(a)} className="h-9 rounded-full px-3 text-sm font-bold hover:bg-grey-800/5" aria-label={`Make ${a.label} the default address`}>Make default</button>}
                  <button onClick={() => setConfirming(a)} className="ml-auto h-9 rounded-full px-3 text-sm font-bold text-red-text hover:bg-red/10" aria-label={`Delete address ${a.label}`}>Delete</button>
                </div>
              </Card>
            </li>
          ))}
        </ul>

        <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title={editing === 'new' ? 'Add an address' : 'Edit address'} wide>
          <div className="relative p-5 sm:p-6">
            <CloseButton onClick={() => setEditing(null)} className="absolute right-3 top-3" />
            <h2 className="mb-4 text-2xl font-extrabold">{editing === 'new' ? 'Add an address' : 'Edit address'}</h2>
            {editing && (
              <AddressForm
                key={editing === 'new' ? 'new' : editing.id}
                address={editing === 'new' ? null : editing}
                demo={demo}
                onSaved={(saved) => {
                  if (editing === 'new' && saved) dispatch(setAddress(saved.id));
                  setEditing(null);
                }}
                onCancel={() => setEditing(null)}
              />
            )}
          </div>
        </Modal>
        <Modal open={Boolean(confirming)} onClose={() => setConfirming(null)} title="Delete address">
          <div className="p-6">
            <h2 className="text-2xl font-extrabold">Delete {confirming?.label}?</h2>
            <p className="mt-2 text-grey-600">Orders already placed keep their address.{confirming?.isDefault ? ' Your oldest other address becomes the default.' : ''}</p>
            <div className="mt-5 flex gap-2">
              <Button variant="danger" onClick={() => remove(confirming)}>Delete</Button>
              <Button variant="ghost" onClick={() => setConfirming(null)}>Keep it</Button>
            </div>
          </div>
        </Modal>
      </section>

      <section className="mt-8">
        <h2 className="text-2xl font-extrabold">App credit</h2>
        <p className="text-sm text-grey-600">Credits from resolved complaints apply to your next pay-on-delivery order.</p>
        <div className="mt-3 space-y-2">
          {credits.length ? credits.map((c) => (
            <Card key={c.id} className="flex items-center justify-between p-4">
              <span className="font-bold">{rupees(c.amountPaise)}</span>
              <Pill tone={c.usedOrderId ? 'grey' : 'green'}>{c.usedOrderId ? `Used on #${c.usedOrderId}` : `Expires ${new Date(c.expiresAt).toLocaleDateString()}`}</Pill>
            </Card>
          )) : <p className="text-grey-600">No credit right now.</p>}
        </div>
      </section>
    </div>
  );
};

export default Profile;
