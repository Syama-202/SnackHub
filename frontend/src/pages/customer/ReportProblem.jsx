import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { fetchOrder, fileComplaint } from '../../store/slices/order';
import { isDemoSession } from '../../store/slices/auth';
import { COMPLAINT_TYPES } from '@shared/domain/triage';
import { rupees } from '@shared/domain/money';
import { Button, Card, Icon, Pill, cx } from '../../components/ui';

const Schema = z
  .object({
    category: z.enum(['FOOD_QUALITY', 'DELIVERY', 'OTHER']),
    subtype: z.string().min(1, 'Pick what went wrong'),
    // RHF gives an array for several checkboxes, a single value or false for one
    itemIds: z.preprocess((v) => (Array.isArray(v) ? v : typeof v === 'string' ? [v] : []), z.array(z.coerce.number())),
    description: z.string().trim().max(500, 'Keep it under 500 characters').optional(),
    photoCount: z.number().min(0).max(3),
  })
  .refine((v) => v.category !== 'FOOD_QUALITY' || v.photoCount > 0, { message: 'Add 1 to 3 photos for food quality reports', path: ['photoCount'] });

/** Report a problem (doc 10.7): one complaint per order per category. */
export default function ReportProblem() {
  const { id } = useParams();
  const dispatch = useDispatch();
  const order = useSelector((state) => state.orders.byId[id]);
  useEffect(() => {
    dispatch(fetchOrder(id));
  }, [dispatch, id]);
  const [result, setResult] = useState(null);
  const [serverError, setServerError] = useState(null);
  const [photos, setPhotos] = useState([]);
  const { register, handleSubmit, watch, setValue, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(Schema),
    defaultValues: { category: 'FOOD_QUALITY', subtype: '', itemIds: [], description: '', photoCount: 0 },
  });
  const category = watch('category');
  const type = COMPLAINT_TYPES[category];

  const onPhotos = (e) => {
    const files = [...e.target.files].slice(0, 3);
    setPhotos(files.map((f) => ({ name: f.name, url: URL.createObjectURL(f), file: f })));
    setValue('photoCount', files.length, { shouldValidate: true });
  };

  const onSubmit = async (v) => {
    setServerError(null);
    try {
      // a real account uploads the photos; the demo mock only needs their count
      const c = await dispatch(fileComplaint({ id, ...v, files: photos.map((p) => p.file), demo: isDemoSession() })).unwrap();
      setResult(c);
    } catch (e) {
      setServerError(e.message);
    }
  };

  if (result)
    return (
      <div className="mx-auto max-w-xl px-4 pt-10 text-center">
        <div className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-emerald-500 text-white"><Icon name="check" className="h-10 w-10" /></div>
        <h1 className="mt-5 text-3xl font-extrabold">{result.autoDecided ? 'Sorted. Credit added.' : 'Complaint received'}</h1>
        <p className="mt-2 text-grey-600">
          {result.autoDecided
            ? 'The order timeline supported your report, so we resolved it straight away. The credit applies to your next pay-on-delivery order.'
            : 'An admin will look at the order timeline and your report. We will notify you when it is resolved.'}
        </p>
        <Card className="mt-6 p-4 text-left text-sm">
          <p><b>What the system checked:</b> promised and delivered times, shop and rider delay, the pickup seal check, and the delivery code and geofence results.</p>
          <p className="mt-2"><b>Status:</b> <Pill tone={result.autoDecided ? 'green' : 'sun'}>{result.status.replace('_', ' ').toLowerCase()}</Pill></p>
        </Card>
        <Link to={`/orders/${id}`}><Button className="mt-6">Back to order</Button></Link>
      </div>
    );

  return (
    <div className="mx-auto max-w-3xl px-4 pt-6">
      <Link to={`/orders/${id}`} className="inline-flex h-11 items-center gap-1 text-sm font-bold text-grey-600"><Icon name="arrowLeft" className="h-4 w-4" /> Order #{id}</Link>
      <h1 className="text-4xl font-extrabold">Report a problem</h1>
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="mt-6 space-y-6">
        <Card className="p-5">
          <fieldset>
            <legend className="text-lg font-extrabold">What kind of problem?</legend>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              {Object.entries(COMPLAINT_TYPES).map(([k, t]) => (
                <label key={k} className={cx('cursor-pointer rounded-2xl border-2 p-3', category === k ? 'border-orange bg-sun/10' : 'border-grey-800/10')}>
                  <input type="radio" value={k} {...register('category', { onChange: () => setValue('subtype', '') })} className="sr-only" />
                  <span className="block font-bold">{t.label}</span>
                  <span className="text-xs text-grey-600">Report within {t.window}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset className="mt-5">
            <legend className="font-bold">What went wrong?</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {Object.entries(type.subtypes).map(([k, l]) => (
                <label key={k} className={cx('cursor-pointer rounded-full px-4 py-2 text-sm font-bold ring-1', watch('subtype') === k ? 'bg-grey-800 text-white ring-grey-800' : 'bg-white ring-grey-800/15')}>
                  <input type="radio" value={k} {...register('subtype')} className="sr-only" />
                  {l}
                </label>
              ))}
            </div>
            {errors.subtype && <p className="mt-1 text-sm font-semibold text-red-text">{errors.subtype.message}</p>}
          </fieldset>
        </Card>

        {category === 'FOOD_QUALITY' && order && (
          <Card className="p-5">
            <fieldset>
              <legend className="font-bold">Which items?</legend>
              <div className="mt-2 grid gap-2">
                {order.items.map((i) => (
                  <label key={i.productId} className="flex items-center gap-3 rounded-xl bg-grey-50 p-3">
                    <input type="checkbox" value={i.productId} {...register('itemIds')} className="h-4 w-4 accent-orange-deep" />
                    <span className="flex-1">{i.title} × {i.qty}</span>
                    <span className="text-sm font-bold">{rupees(i.unitPricePaise * i.qty)}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="mt-4">
              <label className="font-bold" htmlFor="photos">Photos (1 to 3, required)</label>
              <input id="photos" type="file" accept="image/*" multiple onChange={onPhotos} className="mt-2 block w-full text-sm file:mr-3 file:h-10 file:rounded-full file:border-0 file:bg-sun file:px-4 file:font-bold" />
              <div className="mt-2 flex gap-2">{photos.map((p) => <img key={p.url} src={p.url} alt={`Uploaded ${p.name}`} className="h-20 w-20 rounded-xl object-cover" />)}</div>
              {errors.photoCount && <p className="mt-1 text-sm font-semibold text-red-text">{errors.photoCount.message}</p>}
              <p className="mt-1 text-xs text-grey-600">Photos stay on this device in the demo.</p>
            </div>
          </Card>
        )}

        <Card className="p-5">
          <label className="font-bold" htmlFor="desc">Anything else? (optional)</label>
          <textarea id="desc" rows={3} {...register('description')} className="mt-2 w-full rounded-xl border border-grey-800/15 p-3 focus:border-orange focus:outline-none focus:ring-4 focus:ring-orange/15" />
          {errors.description && <p className="text-sm font-semibold text-red-text">{errors.description.message}</p>}
        </Card>

        {serverError && <p role="alert" className="rounded-2xl bg-red/10 p-3 font-semibold text-red-text">{serverError}</p>}
        <Button type="submit" size="lg" loading={isSubmitting}>Submit report</Button>
      </form>
    </div>
  );
}
