import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { addAddress, deleteAddress, fetchCredits } from '../../store/slices/profile';
import { setAddress } from '../../store/slices/ui';
import { addToast } from '../../store/slices/toast';
import { isDemoSession } from '../../store/slices/auth';
import { rupees } from '@shared/domain/money';
import { CITIES, cityById } from '@shared/domain/cities';
import { Link } from 'react-router-dom';
import { Button, Card, Input, Icon, Pill } from '../../components/ui';

// Same shape the backend validates with zod (doc 5.1: shared schemas where possible)
const AddressSchema = z.object({
  label: z.string().trim().min(2, 'Give it a short name, like Home').max(30),
  line: z.string().trim().min(8, 'Add the street and area').max(255),
  city: z.string().refine((id) => Boolean(cityById(id)), 'Pick a city'),
});

const Profile = () => {
  const dispatch = useDispatch();
  const user = useSelector((state) => state.auth.user);
  const { addresses, credits } = useSelector((state) => state.profile);
  const selectedId = useSelector((state) => state.ui.addressId);
  const [adding, setAdding] = useState(false);
  // the exact pin from the phone's location; without it the address uses the city centre
  const [pin, setPin] = useState(null);
  const [locating, setLocating] = useState(false);
  const demo = isDemoSession();
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm({ resolver: zodResolver(AddressSchema), defaultValues: { city: '' } });

  useEffect(() => {
    dispatch(fetchCredits());
  }, [dispatch]);

  const remove = async (id) => {
    try {
      await dispatch(deleteAddress(id)).unwrap();
      const next = addresses.find((a) => a.id !== id);
      if (id === selectedId && next) dispatch(setAddress(next.id));
    } catch (e) {
      dispatch(addToast({ type: 'error', title: 'Address not deleted', message: e.message }));
    }
  };

  const locate = () => {
    if (!('geolocation' in navigator)) return dispatch(addToast({ type: 'error', title: 'Location not available', message: 'This browser cannot share a location.' }));
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLocating(false);
        setPin({ lat: +p.coords.latitude.toFixed(6), lng: +p.coords.longitude.toFixed(6), accuracyM: Math.round(p.coords.accuracy) });
      },
      () => {
        setLocating(false);
        dispatch(addToast({ type: 'error', title: 'No location', message: 'Allow location for SnackHub, or save the address with the city centre pin.' }));
      },
      { enableHighAccuracy: true, timeout: 15000 },
    );
    return undefined;
  };

  const onSubmit = async (v) => {
    try {
      const c = cityById(v.city);
      const at = pin ? { lat: pin.lat, lng: pin.lng } : { lat: c.lat, lng: c.lng };
      await dispatch(addAddress({ label: v.label, line: demo ? `${v.line} (demo)` : v.line, cityId: v.city, ...at })).unwrap();
      dispatch(addToast({ type: 'success', title: 'Address saved' }));
      reset();
      setPin(null);
      setAdding(false);
    } catch (e) {
      dispatch(addToast({ type: 'error', title: 'Address not saved', message: e.message }));
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

      <section className="mt-8">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-extrabold">Addresses</h2>
          {!adding && <Button size="sm" variant="ghost" onClick={() => setAdding(true)}><Icon name="plus" className="h-4 w-4" /> Add address</Button>}
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {addresses.map((a) => (
            <Card key={a.id} className="flex items-start gap-3 p-4">
              <Icon name="pin" className="mt-0.5 h-5 w-5 text-orange-text" />
              <div className="flex-1">
                <p className="font-bold">{a.label}</p>
                <p className="text-sm text-grey-600">{a.line}</p>
              </div>
              <button onClick={() => remove(a.id)} className="h-9 rounded-full px-3 text-sm font-bold text-red-text hover:bg-red/10" aria-label={`Delete address ${a.label}`}>Delete</button>
            </Card>
          ))}
        </div>
        {adding && (
          <Card className="mt-4 p-5">
            <form onSubmit={handleSubmit(onSubmit)} noValidate className="grid gap-4 sm:grid-cols-2">
              <Input label="Label" placeholder="Home" {...register('label')} error={errors.label?.message} />
              <label className="block">
                <span className="mb-1.5 block text-sm font-bold">City</span>
                <select {...register('city')} className="h-11 w-full rounded-xl border border-grey-800/15 bg-white px-3" aria-invalid={Boolean(errors.city)}>
                  <option value="">Choose a city</option>
                  {[...CITIES].sort((a, b) => a.name.localeCompare(b.name)).map((c) => <option key={c.id} value={c.id}>{c.name}, {c.state}</option>)}
                </select>
                {errors.city && <span className="mt-1 block text-sm font-semibold text-red-text">{errors.city.message}</span>}
              </label>
              <Input className="sm:col-span-2" label="Street and area" placeholder="House no., street, area" {...register('line')} error={errors.line?.message} />
              <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-grey-50 p-3 text-sm sm:col-span-2">
                <Button type="button" size="sm" variant="ghost" loading={locating} onClick={locate}><Icon name="pin" className="h-4 w-4" /> Use my current location</Button>
                <span className="text-grey-600" aria-live="polite">
                  {pin ? `Pin set to your location (within about ${pin.accuracyM} m).` : 'Without your location the pin is the city centre, and riders and delivery times are judged from there.'}
                </span>
              </div>
              <div className="flex gap-2 sm:col-span-2">
                <Button type="submit" loading={isSubmitting}>Save address</Button>
                <Button type="button" variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
              </div>
            </form>
          </Card>
        )}
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
