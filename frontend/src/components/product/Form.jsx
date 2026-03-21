import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button, Input } from '../ui';
import { Select, fieldErrors } from '../auth/Fields';
import { CATEGORIES, CATEGORY_LABELS, SHAPES, MIN_PRICE_PAISE, MAX_PRICE_PAISE } from '@shared/domain/menu';

const rupees = z.coerce.number().min(MIN_PRICE_PAISE / 100, `At least ₹${MIN_PRICE_PAISE / 100}`).max(MAX_PRICE_PAISE / 100, `At most ₹${MAX_PRICE_PAISE / 100}`);
const Schema = z
  .object({
    title: z.string().trim().min(3, 'At least 3 letters').max(160),
    category: z.enum(CATEGORIES),
    servingTemp: z.enum(['HOT', 'AMBIENT']),
    prepMinutes: z.coerce.number().int().min(1, '1 to 60 minutes').max(60, '1 to 60 minutes'),
    price: rupees,
    mrp: z.union([z.literal(''), rupees]).optional(),
    weight: z.string().trim().max(20).optional(),
    spice: z.coerce.number().int().min(0).max(3),
    shape: z.enum(SHAPES),
    description: z.string().trim().max(500).optional(),
  })
  .refine((v) => v.mrp === '' || v.mrp === undefined || Number(v.mrp) >= v.price, { message: 'The MRP cannot be below the price', path: ['mrp'] });

const toPaise = (r) => Math.round(Number(r) * 100);

/**
 * Add or edit a snack (doc 11.2). Prices are typed in rupees and sent as paise; the server
 * checks every field again. A new snack starts unlisted with no stock.
 */
export default function ProductForm({ product, onSave, onCancel }) {
  const editing = Boolean(product);
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(Schema),
    defaultValues: {
      title: product?.title ?? '',
      category: product?.category ?? 'namkeen',
      servingTemp: product?.servingTemp ?? 'AMBIENT',
      prepMinutes: product?.prepMinutes ?? 5,
      price: product ? product.pricePaise / 100 : '',
      mrp: product?.mrpPaise ? product.mrpPaise / 100 : '',
      weight: product?.weight ?? '',
      spice: product?.spice ?? 0,
      shape: product?.art?.shape ?? 'pile',
      description: product?.description ?? '',
    },
  });

  const submit = async (v) => {
    const body = {
      title: v.title,
      category: v.category,
      servingTemp: v.servingTemp,
      prepMinutes: v.prepMinutes,
      pricePaise: toPaise(v.price),
      spice: v.spice,
      shape: v.shape,
      ...(v.weight ? { weight: v.weight } : {}),
      ...(v.description ? { description: v.description } : {}),
      ...(v.mrp !== '' && v.mrp !== undefined ? { mrpPaise: toPaise(v.mrp) } : editing ? { mrpPaise: null } : {}),
    };
    try {
      await onSave(body);
    } catch (e) {
      const byField = fieldErrors(e);
      const map = { pricePaise: 'price', mrpPaise: 'mrp' };
      for (const [f, m] of Object.entries(byField)) setError(map[f] ?? f, { message: m });
      if (!Object.keys(byField).length) setError('root', { message: e.message });
    }
  };

  return (
    <form onSubmit={handleSubmit(submit)} className="grid gap-3 sm:grid-cols-2" noValidate>
      <Input className="sm:col-span-2" label="Name" placeholder="Mirchi bajji" {...register('title')} error={errors.title?.message} />
      <Select label="Kind" {...register('category')} error={errors.category?.message}>
        {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
      </Select>
      <Select label="Served" {...register('servingTemp')} error={errors.servingTemp?.message} hint="Hot snacks go only up to 3 km">
        <option value="AMBIENT">Sweet or dry (room temperature)</option>
        <option value="HOT">Hot</option>
      </Select>
      <Input label="Price (₹)" inputMode="decimal" {...register('price')} error={errors.price?.message} />
      <Input label="MRP (₹, optional)" inputMode="decimal" {...register('mrp')} error={errors.mrp?.message} />
      <Input label="Prep time (minutes)" inputMode="numeric" {...register('prepMinutes')} error={errors.prepMinutes?.message} />
      <Input label="Pack size (optional)" placeholder="200 g or 4 pcs" {...register('weight')} error={errors.weight?.message} />
      <Select label="Spice" {...register('spice')} error={errors.spice?.message}>
        {['None', 'Mild', 'Medium', 'Hot'].map((l, i) => <option key={l} value={i}>{l}</option>)}
      </Select>
      <Select label="Drawing (until you add a photo)" {...register('shape')} error={errors.shape?.message}>
        {SHAPES.map((s) => <option key={s} value={s}>{s}</option>)}
      </Select>
      <Input className="sm:col-span-2" label="Description (optional)" {...register('description')} error={errors.description?.message} />
      {errors.root && <p role="alert" className="sm:col-span-2 rounded-xl bg-red/10 p-3 text-sm font-semibold text-red-text">{errors.root.message}</p>}
      <div className="flex flex-wrap gap-2 sm:col-span-2">
        <Button type="submit" loading={isSubmitting}>{editing ? 'Save changes' : 'Add snack'}</Button>
        <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
      {!editing && <p className="text-xs text-grey-600 sm:col-span-2">New snacks start unlisted with no stock. Add stock, then tick “Listed” to show it to customers.</p>}
    </form>
  );
}
