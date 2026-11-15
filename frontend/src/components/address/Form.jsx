import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ADDRESS_KINDS, ADDRESS_LIMITS, KIND_LABEL } from '@shared/domain/addresses';
import { CITIES, cityById } from '@shared/domain/cities';
import { distanceM } from '@shared/domain/geo';
import { addAddress, describePin, searchPlaces, updateAddress, selectDeliveryPoint } from '../../store/slices/profile';
import { addToast } from '../../store/slices/toast';
import { hasWebGL } from '../../hooks';
import { Button, Icon, Input, cx } from '../ui';

const PinMap = lazy(() => import('./PinMap'));

export const KIND_ICON = { HOME: 'home', HOSTEL: 'key', COLLEGE: 'file', OFFICE: 'box', OTHER: 'pin' };

const len = (k, msg) => z.string().trim().min(ADDRESS_LIMITS[k][0], msg).max(ADDRESS_LIMITS[k][1], `Keep it under ${ADDRESS_LIMITS[k][1]} characters`);
const optional = (k) => z.union([z.literal(''), len(k, 'Too short')]);

// the same limits the API checks (shared/domain/addresses.js)
const Schema = z
  .object({
    kind: z.enum(ADDRESS_KINDS),
    label: z.union([z.literal(''), len('label', 'Use at least 2 letters')]),
    line: len('line', 'Add the street and area'),
    pincode: z.union([z.literal(''), z.string().trim().regex(/^[1-9][0-9]{5}$/, 'A pincode is six digits and does not start with 0')]),
    house: optional('house'),
    floor: optional('floor'),
    landmark: optional('landmark'),
    instructions: optional('instructions'),
    city: z.string().refine((id) => Boolean(cityById(id)), 'Pick a city'),
    isDefault: z.boolean(),
  })
  .refine((v) => v.kind !== 'OTHER' || v.label, { message: 'Give this place a name', path: ['label'] });

const nearestCity = (p) => CITIES.reduce((best, c) => (distanceM(c, p) < distanceM(best, p) ? c : best));
const blank = (v) => (v.trim() === '' ? null : v.trim());

/**
 * Add or edit a saved address. The pin is set by searching for a place, by the phone's
 * location, or by dragging it on the map; the street line can be filled from the pin. Every
 * field the rider needs at the door (flat, floor, landmark, instructions) is here.
 */
export default function AddressForm({ address = null, onSaved, onCancel }) {
  const dispatch = useDispatch();
  const here = useSelector(selectDeliveryPoint);
  const editing = Boolean(address);
  const [pin, setPin] = useState(() => (address ? { lat: address.lat, lng: address.lng } : { lat: here.lat, lng: here.lng }));
  const [pinSet, setPinSet] = useState(editing);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);
  const cityPicked = useRef(editing);
  const map = hasWebGL();

  const { register, handleSubmit, watch, setValue, getValues, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(Schema),
    defaultValues: {
      kind: address?.kind ?? 'HOME',
      label: address?.kind === 'OTHER' || (address && address.label !== KIND_LABEL[address.kind]) ? address.label : '',
      line: address?.line ?? '',
      pincode: address?.pincode ?? '',
      house: address?.house ?? '',
      floor: address?.floor ?? '',
      landmark: address?.landmark ?? '',
      instructions: address?.instructions ?? '',
      city: address?.cityId && cityById(address.cityId) ? address.cityId : nearestCity(pin).id,
      isDefault: Boolean(address?.isDefault),
    },
  });
  const kind = watch('kind');

  // the city follows the pin until the person picks one themselves
  useEffect(() => {
    if (!cityPicked.current) setValue('city', nearestCity(pin).id);
  }, [pin, setValue]);

  /** Moves the pin; fills an empty street line and pincode from what is known at that point. */
  const placePin = async (p, line, postcode) => {
    setPin(p);
    setPinSet(true);
    if (postcode && !getValues('pincode')) setValue('pincode', postcode, { shouldValidate: true });
    if (getValues('line').trim() && getValues('pincode')) return;
    if (line) {
      if (!getValues('line').trim()) setValue('line', line.slice(0, 255), { shouldValidate: true });
      return;
    }
    try {
      const found = await dispatch(describePin(p)).unwrap();
      if (found?.line && !getValues('line').trim()) setValue('line', found.line.slice(0, 255), { shouldValidate: true });
      if (/^[1-9][0-9]{5}$/.test(found?.postcode ?? '') && !getValues('pincode')) setValue('pincode', found.postcode, { shouldValidate: true });
    } catch {
      // nothing known for this pin: the person types it
    }
  };

  const search = async (e) => {
    e?.preventDefault();
    if (query.trim().length < 3) return;
    setSearching(true);
    try {
      setResults(await dispatch(searchPlaces(query.trim())).unwrap());
    } catch (err) {
      setResults(null);
      dispatch(addToast({ type: 'error', title: 'Search did not work', message: err.message }));
    } finally {
      setSearching(false);
    }
  };

  const locate = () => {
    if (!('geolocation' in navigator)) return dispatch(addToast({ type: 'error', title: 'Location not available', message: 'This browser cannot share a location. Search for the place or drag the pin.' }));
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLocating(false);
        placePin({ lat: +p.coords.latitude.toFixed(6), lng: +p.coords.longitude.toFixed(6) });
      },
      () => {
        setLocating(false);
        dispatch(addToast({ type: 'error', title: 'No location', message: 'Allow location for SnackHub, or search for the place.' }));
      },
      { enableHighAccuracy: true, timeout: 15000 },
    );
    return undefined;
  };

  const onSubmit = async (v) => {
    const body = {
      kind: v.kind,
      ...(v.label ? { label: v.label.trim() } : {}),
      line: v.line.trim(),
      pincode: blank(v.pincode),
      house: blank(v.house),
      floor: blank(v.floor),
      landmark: blank(v.landmark),
      instructions: blank(v.instructions),
      cityId: v.city,
      lat: pin.lat,
      lng: pin.lng,
      ...(v.isDefault && !address?.isDefault ? { isDefault: true } : {}),
    };
    try {
      let saved;
      if (editing) {
        const list = await dispatch(updateAddress({ id: address.id, ...body, ...(v.label ? {} : { label: KIND_LABEL[v.kind] }) })).unwrap();
        saved = list.find((a) => a.id === address.id);
      } else {
        saved = await dispatch(addAddress(body)).unwrap();
      }
      dispatch(addToast({ type: 'success', title: editing ? 'Address updated' : 'Address saved', message: editing ? 'Orders already placed keep the address they were placed with.' : undefined }));
      onSaved?.(saved);
    } catch (err) {
      dispatch(addToast({ type: 'error', title: 'Address not saved', message: err.message }));
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="grid gap-4">
      <fieldset>
        <legend className="mb-1.5 text-sm font-semibold">What kind of place?</legend>
        <div className="flex flex-wrap gap-2">
          {ADDRESS_KINDS.map((k) => (
            <label key={k} className={cx('inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-full border-2 px-3 text-sm font-semibold transition has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-orange/25', kind === k ? 'border-orange bg-sun/15' : 'border-grey-800/10 hover:border-grey-800/25')}>
              <input type="radio" value={k} {...register('kind')} className="sr-only" />
              <Icon name={KIND_ICON[k]} className="h-4 w-4" /> {KIND_LABEL[k]}
            </label>
          ))}
        </div>
      </fieldset>
      <Input
        label={kind === 'OTHER' ? 'Name this place' : 'Name (optional)'}
        placeholder={kind === 'OTHER' ? "Parents' house" : KIND_LABEL[kind]}
        {...register('label')}
        error={errors.label?.message}
      />

      <div className="grid gap-2 rounded-2xl bg-grey-50 p-3">
        <p className="text-sm font-semibold">Where is it?</p>
        <div className="grid gap-2 sm:flex">
          <label htmlFor="place-q" className="sr-only">Search for a place</label>
          <input
            id="place-q"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && search(e)}
            placeholder="Search an area, street or building"
            className="h-11 w-full min-w-0 rounded-xl border border-grey-800/15 bg-white px-3.5 focus:border-orange focus:outline-none focus:ring-4 focus:ring-orange/15"
          />
          <div className="grid shrink-0 grid-cols-2 gap-2 sm:flex">
            <Button type="button" variant="ghost" className="whitespace-nowrap" onClick={search} loading={searching} disabled={query.trim().length < 3}><Icon name="search" className="h-4 w-4" /> Search</Button>
            <Button type="button" variant="ghost" className="whitespace-nowrap" onClick={locate} loading={locating}><Icon name="pin" className="h-4 w-4" /> My location</Button>
          </div>
        </div>
        {results && (
          <ul className="grid gap-1" aria-label="Places found">
            {results.length === 0 && <li className="text-sm text-grey-600">Nothing found. Try a nearby landmark, or drag the pin.</li>}
            {results.map((r, i) => (
              <li key={`${r.lat},${r.lng},${i}`}>
                <button type="button" onClick={() => (placePin({ lat: r.lat, lng: r.lng }, r.line, r.postcode), setResults(null))} className="flex w-full items-start gap-2 rounded-xl bg-white px-3 py-2 text-left text-sm hover:bg-sun/15">
                  <Icon name="pin" className="mt-0.5 h-4 w-4 shrink-0 text-orange-text" />
                  <span><span className="block font-semibold">{r.name}</span><span className="block text-grey-600">{r.line}</span></span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {map ? (
          <Suspense fallback={<div className="grid h-[260px] place-items-center rounded-2xl bg-[#EEE9E0] text-sm text-grey-600">Loading the map…</div>}>
            <PinMap pin={pin} onChange={(p) => placePin(p)} />
          </Suspense>
        ) : (
          <p className="text-sm text-grey-600">This device cannot show the map. Search for the place or use your location to set the pin.</p>
        )}
        <p className="text-xs text-grey-600" aria-live="polite">
          {pinSet ? 'Pin set. Drag it onto your building if it is off; riders and delivery times go by the pin.' : 'Search, use your location, or drag the pin onto your building.'}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Input className="sm:col-span-2" label="Street and area" placeholder="Street, area, town" {...register('line')} error={errors.line?.message} />
        <Input label="Pincode" inputMode="numeric" maxLength={6} placeholder="522002" hint="Some shops deliver only to the pincodes they list." {...register('pincode')} error={errors.pincode?.message} />
        <Input label="Flat, house or room (optional)" placeholder="Flat 4B, Sai Residency" {...register('house')} error={errors.house?.message} />
        <Input label="Floor (optional)" placeholder="2" {...register('floor')} error={errors.floor?.message} />
        <Input label="Landmark (optional)" placeholder="Opposite the temple" {...register('landmark')} error={errors.landmark?.message} />
        <label className="block">
          <span className="mb-1.5 block text-sm font-semibold">City</span>
          <select
            {...register('city', { onChange: () => (cityPicked.current = true) })}
            className="field h-11"
            aria-invalid={Boolean(errors.city)}
          >
            {[...CITIES].sort((a, b) => a.name.localeCompare(b.name)).map((c) => <option key={c.id} value={c.id}>{c.name}, {c.state}</option>)}
          </select>
          {errors.city && <span className="mt-1 block text-sm font-semibold text-red-text">{errors.city.message}</span>}
        </label>
        <Input
          className="sm:col-span-2"
          label="Instructions for the rider (optional)"
          placeholder="Ring the bell twice, leave it with security"
          hint="Riders see this after pickup. Never write your delivery code or payment details here."
          {...register('instructions')}
          error={errors.instructions?.message}
        />
      </div>

      {!address?.isDefault && (
        <label className="flex items-center gap-3 text-sm font-semibold">
          <input type="checkbox" {...register('isDefault')} className="h-5 w-5 accent-orange-deep" />
          Make this my default address
        </label>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" loading={isSubmitting}>{editing ? 'Save changes' : 'Save address'}</Button>
        {onCancel && <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>}
      </div>
    </form>
  );
}
