import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { Button, Card, Icon, Input, Spinner, cx } from '../ui';
import { Check, Select } from '../auth/Fields';
import Stepper from './Stepper';
import DocumentCard from './DocumentCard';
import StatusPanel from './StatusPanel';
import { loadOnboarding, restartApplication, saveProfile, saveVehicle, submitApplication } from '../../store/slices/onboarding';
import { isDemoSession } from '../../store/slices/auth';
import { addToast } from '../../store/slices/toast';

const READY = ['pending', 'approved', 'expiring', 'renewal-pending'];

/** The value a field shows, from the saved answers. */
const initial = (field, view) => {
  const src = field.from === 'vehicle' ? view.vehicle : view.profile;
  if (field.type === 'location') return { lat: src?.lat ?? '', lng: src?.lng ?? '' };
  if (field.type === 'checkbox') return Boolean(src?.[field.stored ?? field.name]);
  if (field.secret) return '';
  const v = src?.[field.name];
  return v === null || v === undefined ? '' : String(v);
};

/**
 * A step-by-step application that saves as it goes. steps: [{ id, label, title, sub,
 * save: 'profile' | 'vehicle', fields }] plus the documents and review steps it adds itself.
 * Each field: { name, label, type, options, hint, validate(value, values), from, secret }.
 */
export default function Wizard({ kind, title, intro, steps: formSteps, homePath }) {
  const dispatch = useDispatch();
  const { view, loading, saving, error } = useSelector((s) => s.onboarding[kind]);
  const [current, setCurrent] = useState(0);
  const demo = isDemoSession();
  useEffect(() => {
    if (!demo) dispatch(loadOnboarding({ kind }));
  }, [dispatch, kind, demo]);

  const steps = useMemo(() => {
    if (!view) return [];
    const gapFields = new Set(view.checklist.profile.map((g) => g.field));
    const docsDone = view.checklist.documents.every((d) => !d.required || READY.includes(d.state));
    return [
      ...formSteps.map((s) => ({ ...s, complete: s.fields.every((f) => !(f.gapFields ?? [f.name]).some((g) => gapFields.has(g))) && view.status !== 'NOT_STARTED' })),
      { id: 'documents', label: 'Documents', complete: docsDone },
      { id: 'review', label: 'Review and submit', complete: !['NOT_STARTED', 'DRAFT', 'ACTION_REQUIRED'].includes(view.status) },
    ];
  }, [view, formSteps]);

  if (demo) {
    return (
      <div className="page py-10">
        <Card className="max-w-xl p-6">
          <h1 className="text-2xl font-extrabold">{title}</h1>
          <p className="mt-2 text-grey-600">The demo {kind} is already approved, so there is nothing to fill in. Create a real {kind} account to try the application, uploads and review.</p>
          <Link to={homePath} className="mt-4 inline-flex h-11 items-center rounded-full bg-grey-800 px-5 font-bold text-white">Open the demo console</Link>
        </Card>
      </div>
    );
  }
  if (loading || !view) {
    return <div className="grid min-h-[50vh] place-items-center text-orange-text" role="status">{error ? <p className="text-red-text">{error.message}</p> : <Spinner className="h-8 w-8" />}</div>;
  }

  const editing = view.canEdit;
  const step = steps[Math.min(current, steps.length - 1)];
  const go = (i) => {
    setCurrent(i);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="page page-narrow py-8">
      <p className="text-sm font-extrabold uppercase tracking-[0.16em] text-orange-text">{kind === 'seller' ? 'Seller application' : 'Delivery partner application'}</p>
      <h1 className="mt-1 page-title">{title}</h1>
      <p className="mt-2 max-w-2xl text-grey-600">{intro}</p>

      {view.status !== 'NOT_STARTED' && (
        <div className="mt-6">
          <StatusPanel view={view} home={homePath} onRestart={() => dispatch(restartApplication({ kind }))} />
        </div>
      )}

      {editing ? (
        <div className="mt-6 grid gap-6">
          <Stepper steps={steps} current={current} onPick={go} />
          <Card className="p-5 sm:p-7">
            {step.id === 'documents' ? (
              <Documents kind={kind} view={view} onNext={() => go(current + 1)} />
            ) : step.id === 'review' ? (
              <Review kind={kind} view={view} steps={steps} saving={saving} onFix={go} formSteps={formSteps} />
            ) : (
              <FormStep key={step.id} kind={kind} step={step} view={view} saving={saving} onNext={() => go(current + 1)} />
            )}
          </Card>
        </div>
      ) : (
        <div className="mt-6 grid gap-4">
          <h2 className="text-2xl font-extrabold">Your documents</h2>
          <DocumentList kind={kind} view={view} canUpload={view.canUpload} />
        </div>
      )}
    </div>
  );
}

function FormStep({ kind, step, view, saving, onNext }) {
  const dispatch = useDispatch();
  const [values, setValues] = useState(() => Object.fromEntries(step.fields.map((f) => [f.name, initial(f, view)])));
  const [errors, setErrors] = useState({});
  const set = (name, v) => setValues((s) => ({ ...s, [name]: v }));

  const save = async (e) => {
    e.preventDefault();
    const errs = {};
    for (const f of step.fields) {
      const msg = f.validate?.(values[f.name], values);
      if (msg) errs[f.name] = msg;
    }
    setErrors(errs);
    if (Object.keys(errs).length) return;
    // only answers that were given; an empty field is left as it was
    const body = {};
    for (const f of step.fields) {
      const v = values[f.name];
      if (f.skip) continue;
      if (f.type === 'location') {
        if (v.lat !== '' && v.lng !== '') Object.assign(body, { lat: Number(v.lat), lng: Number(v.lng) });
      } else if (f.type === 'checkbox') body[f.name] = Boolean(v);
      else if (v !== '' && v !== undefined) body[f.name] = f.type === 'number' ? Number(v) : f.transform ? f.transform(v) : v;
    }
    const res = await dispatch(step.save === 'vehicle' ? saveVehicle({ body }) : saveProfile({ kind, body }));
    if (res.meta.requestStatus === 'fulfilled') {
      dispatch(addToast({ type: 'success', title: 'Saved', message: 'You can come back to it any time.' }));
      onNext();
    } else {
      const byField = Object.fromEntries((Array.isArray(res.payload?.details) ? res.payload.details : []).map((d) => [d.field, d.message]));
      setErrors(Object.keys(byField).length ? byField : { _form: res.payload?.message });
    }
  };

  return (
    <form onSubmit={save} noValidate>
      <h2 className="text-2xl font-extrabold">{step.title}</h2>
      {step.sub && <p className="mt-1 text-grey-600">{step.sub}</p>}
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        {step.fields.map((f) => (
          <Field key={f.name} field={f} value={values[f.name]} onChange={(v) => set(f.name, v)} error={errors[f.name]} view={view} />
        ))}
      </div>
      {errors._form && <p className="mt-4 rounded-xl bg-red/10 p-3 text-sm font-semibold text-red-text" role="alert">{errors._form}</p>}
      <div className="mt-6 flex flex-wrap gap-2">
        <Button type="submit" loading={saving}>Save and continue <Icon name="arrowRight" className="h-4 w-4" /></Button>
      </div>
    </form>
  );
}

function Field({ field: f, value, onChange, error, view }) {
  const id = `f-${f.name}`;
  const wide = f.wide ? 'sm:col-span-2' : '';
  if (f.type === 'select') {
    return (
      <Select label={f.label} id={id} value={value} onChange={(e) => onChange(e.target.value)} error={error} hint={f.hint} className={wide}>
        <option value="">Choose…</option>
        {f.options.map(([v, l]) => (
          <option key={v} value={v}>{l}</option>
        ))}
      </Select>
    );
  }
  if (f.type === 'cards') {
    return (
      <fieldset className="sm:col-span-2">
        <legend className="mb-2 text-sm font-bold text-grey-800">{f.label}</legend>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {f.options.map(([v, l, icon, note]) => (
            <label key={v} className={cx('flex cursor-pointer items-start gap-3 rounded-2xl border-2 bg-white p-3 transition', value === v ? 'border-orange' : 'border-transparent ring-1 ring-grey-800/10')}>
              <input type="radio" name={f.name} value={v} checked={value === v} onChange={() => onChange(v)} className="sr-only" />
              <span className={cx('grid h-10 w-10 shrink-0 place-items-center rounded-xl', value === v ? 'bg-primary' : 'bg-grey-50')}><Icon name={icon} /></span>
              <span>
                <span className="block font-bold">{l}</span>
                {note && <span className="block text-xs text-grey-600">{note}</span>}
              </span>
            </label>
          ))}
        </div>
        {error && <span className="mt-1 block text-sm font-semibold text-red-text" role="alert">{error}</span>}
      </fieldset>
    );
  }
  if (f.type === 'checkbox') return <div className="sm:col-span-2"><Check id={id} label={f.label} checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} error={error} /></div>;
  if (f.type === 'hours') {
    const [from = '', to = ''] = String(value || '').split('-');
    return (
      <fieldset className={wide}>
        <legend className="mb-1.5 text-sm font-bold text-grey-800">{f.label}</legend>
        <div className="grid grid-cols-2 gap-2">
          <Input type="time" aria-label="Opens at" id={`${id}-from`} value={from} onChange={(e) => onChange(`${e.target.value}-${to}`)} />
          <Input type="time" aria-label="Closes at" id={`${id}-to`} value={to} onChange={(e) => onChange(`${from}-${e.target.value}`)} />
        </div>
        {error && <span className="mt-1 block text-sm font-semibold text-red-text" role="alert">{error}</span>}
      </fieldset>
    );
  }
  if (f.type === 'location') {
    const locate = () =>
      navigator.geolocation?.getCurrentPosition(
        (p) => onChange({ lat: p.coords.latitude.toFixed(6), lng: p.coords.longitude.toFixed(6) }),
        () => onChange(value),
        { enableHighAccuracy: true, timeout: 10_000 },
      );
    return (
      <fieldset className="sm:col-span-2">
        <legend className="mb-1.5 text-sm font-bold text-grey-800">{f.label}</legend>
        <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
          <Input aria-label="Latitude" placeholder="Latitude, like 16.3067" inputMode="decimal" id={`${id}-lat`} value={value.lat} onChange={(e) => onChange({ ...value, lat: e.target.value })} />
          <Input aria-label="Longitude" placeholder="Longitude, like 80.4365" inputMode="decimal" id={`${id}-lng`} value={value.lng} onChange={(e) => onChange({ ...value, lng: e.target.value })} />
          <Button type="button" variant="ghost" onClick={locate}><Icon name="pin" className="h-4 w-4" /> Use where I am</Button>
        </div>
        <span className="mt-1 block text-sm text-grey-600">{f.hint}</span>
        {error && <span className="mt-1 block text-sm font-semibold text-red-text" role="alert">{error}</span>}
      </fieldset>
    );
  }
  const saved = f.secret && (f.from === 'vehicle' ? view.vehicle : view.profile)?.[f.secret];
  return (
    <Input
      label={f.label}
      id={id}
      type={f.type ?? 'text'}
      inputMode={f.inputMode}
      autoComplete={f.autoComplete ?? 'off'}
      placeholder={f.placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      error={error}
      hint={saved ? `Saved as ${saved}; type it again only to change it` : f.hint}
      className={wide}
      min={f.min}
      max={f.max}
      step={f.step}
    />
  );
}

function Documents({ kind, view, onNext }) {
  const required = view.checklist.documents.filter((d) => d.required);
  const missing = required.filter((d) => !READY.includes(d.state));
  return (
    <div>
      <h2 className="text-2xl font-extrabold">Documents</h2>
      <p className="mt-1 text-grey-600">
        {view.requirements.length ? 'Upload a clear photo or PDF of each. Only the documents that apply to your answers are listed.' : 'Fill in the earlier steps first; the documents you need depend on your answers.'}
      </p>
      <div className="mt-5 grid gap-3">
        <DocumentList kind={kind} view={view} canUpload={view.canUpload} />
      </div>
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Button onClick={onNext} disabled={missing.length > 0}>Continue to review <Icon name="arrowRight" className="h-4 w-4" /></Button>
        {missing.length > 0 && <span className="text-sm text-grey-600">{missing.length} required document{missing.length === 1 ? '' : 's'} still to upload</span>}
      </div>
    </div>
  );
}

function DocumentList({ kind, view, canUpload }) {
  const byType = new Map(view.documents.map((d) => [d.docType, d]));
  const states = new Map(view.checklist.documents.map((d) => [d.docType, d.state]));
  return (
    <div className="grid gap-3">
      {view.requirements.map((r) => (
        <DocumentCard key={r.docType} kind={kind} requirement={r} doc={byType.get(r.docType)} checklistState={states.get(r.docType)} canUpload={canUpload} canWithdraw={view.canEdit} />
      ))}
    </div>
  );
}

function Review({ kind, view, steps, saving, onFix, formSteps }) {
  const dispatch = useDispatch();
  const [error, setError] = useState(null);
  const gaps = view.checklist.profile;
  const docs = view.checklist.documents;
  const stepOf = (field) => formSteps.findIndex((s) => s.fields.some((f) => (f.gapFields ?? [f.name]).includes(field)));
  const ready = view.checklist.ready;
  return (
    <div>
      <h2 className="text-2xl font-extrabold">Review and submit</h2>
      <p className="mt-1 text-grey-600">Check the list. Once submitted, your answers and documents are locked while the team reviews them.</p>
      <ul className="mt-5 grid gap-2">
        {steps.slice(0, -1).map((s, i) => (
          <li key={s.id} className="flex items-center justify-between gap-3 rounded-2xl bg-white/80 p-3 ring-1 ring-grey-800/10">
            <span className="flex items-center gap-2 font-bold">
              <Icon name={s.complete ? 'check' : 'alert'} className={cx('h-5 w-5', s.complete ? 'text-emerald-600' : 'text-orange-text')} /> {s.label}
            </span>
            {!s.complete && <Button variant="quiet" size="sm" onClick={() => onFix(i)}>Finish</Button>}
          </li>
        ))}
      </ul>
      {gaps.length > 0 && (
        <div className="mt-4 rounded-2xl bg-sun/20 p-4 text-sm">
          <b>Still to fill in:</b>
          <ul className="mt-1 flex flex-wrap gap-2">
            {gaps.map((g) => (
              <li key={g.field}>
                <button type="button" className="rounded-full bg-white px-3 py-1 font-bold" onClick={() => onFix(Math.max(0, stepOf(g.field)))}>{g.label}</button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {docs.some((d) => d.required && !READY.includes(d.state)) && (
        <div className="mt-4 rounded-2xl bg-sun/20 p-4 text-sm">
          <b>Documents still needed:</b> {docs.filter((d) => d.required && !READY.includes(d.state)).map((d) => d.label).join(', ')}
        </div>
      )}
      {error && <p className="mt-4 rounded-xl bg-red/10 p-3 text-sm font-semibold text-red-text" role="alert">{error}</p>}
      <Button
        size="lg"
        className="mt-6 w-full"
        disabled={!ready}
        loading={saving}
        onClick={async () => {
          setError(null);
          const res = await dispatch(submitApplication({ kind }));
          if (submitApplication.fulfilled.match(res)) {
            dispatch(addToast({ type: 'success', title: 'Application submitted', message: 'We will email you when it changes.' }));
            window.scrollTo({ top: 0, behavior: 'smooth' });
          } else setError(res.payload?.message);
        }}
      >
        {view.status === 'ACTION_REQUIRED' ? 'Submit again' : 'Submit for review'}
      </Button>
    </div>
  );
}
