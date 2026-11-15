import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Button, Icon, Input, Pill, cx } from '../ui';
import { documentLink, uploadDocument, uploadKey, withdrawDocument } from '../../store/slices/onboarding';
import { addToast } from '../../store/slices/toast';

const ACCEPT = 'application/pdf,image/jpeg,image/png,image/webp';
const MAX = 5 * 1024 * 1024;

export const STATE_LOOK = {
  missing: ['grey', 'Not uploaded'],
  pending: ['sun', 'Waiting for review'],
  'renewal-pending': ['sun', 'Renewal waiting for review'],
  approved: ['green', 'Approved'],
  expiring: ['orange', 'Expires soon'],
  rejected: ['red', 'Needs a new upload'],
  expired: ['red', 'Expired'],
};

const today = () => new Date().toISOString().slice(0, 10);

/**
 * One document: what it is, where it stands, and its upload form. The browser checks the
 * type and size first for a quick answer, but the server decides from the file's bytes.
 */
export default function DocumentCard({ kind, requirement, doc, checklistState, canUpload, canWithdraw }) {
  const dispatch = useDispatch();
  const upload = useSelector((s) => s.onboarding.uploads[uploadKey(kind, requirement.docType)]);
  const [open, setOpen] = useState(!doc || checklistState === 'rejected' || checklistState === 'expired');
  const [fields, setFields] = useState({ number: '', issuer: '', issuedOn: '', expiresOn: '' });
  const [file, setFile] = useState(null);
  const [error, setError] = useState(null);
  const [look, text] = STATE_LOOK[checklistState] ?? STATE_LOOK.missing;
  const set = (k) => (e) => setFields((f) => ({ ...f, [k]: e.target.value }));
  const busy = upload && upload.pct !== null && !upload.error;

  const pick = (e) => {
    const f = e.target.files?.[0];
    setError(null);
    const problem = !f ? null : !ACCEPT.split(',').includes(f.type) ? 'Choose a PDF, JPEG, PNG or WebP file' : f.size > MAX ? 'This file is larger than 5 MB; scan it at a lower resolution' : null;
    setError(problem);
    setFile(f && !problem ? f : null);
  };

  const send = async (e) => {
    e.preventDefault();
    setError(null);
    if (requirement.number && !new RegExp(requirement.number.pattern).test(fields.number.trim().toUpperCase())) return setError(`${requirement.number.label}: ${requirement.number.hint}`);
    if (requirement.expires && !fields.expiresOn) return setError('Enter the expiry date');
    const res = await dispatch(uploadDocument({ kind, docType: requirement.docType, file, fields: { ...fields, number: fields.number.trim().toUpperCase() } }));
    if (uploadDocument.fulfilled.match(res)) {
      setFile(null);
      setFields({ number: '', issuer: '', issuedOn: '', expiresOn: '' });
      setOpen(false);
      dispatch(addToast({ type: 'success', title: `${requirement.label} uploaded`, message: 'It is waiting for review.' }));
    } else {
      const details = Array.isArray(res.payload?.details) ? res.payload.details.map((d) => d.message).join('. ') : null;
      setError(details || res.payload?.message);
    }
  };

  const view = async () => {
    const res = await dispatch(documentLink({ kind, id: doc.id }));
    if (documentLink.fulfilled.match(res)) window.open(res.payload.url, '_blank', 'noopener');
  };

  return (
    <div className={cx('rounded-2xl border bg-white/80 p-4 shadow-sm', checklistState === 'rejected' || checklistState === 'expired' ? 'border-red/40' : 'border-grey-800/10')}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="flex flex-wrap items-center gap-2 font-display text-lg font-semibold">
            <Icon name="file" className="h-5 w-5 text-orange-text" /> {requirement.label}
            <Pill tone={requirement.required ? 'dark' : 'grey'}>{requirement.required ? 'Required' : 'Optional'}</Pill>
          </h3>
          <p className="mt-1 text-sm text-grey-600">{requirement.help}</p>
        </div>
        <Pill tone={look}>{text}</Pill>
      </div>

      {doc && (
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-grey-600">
          <span>Version {doc.version}</span>
          {doc.number && <span>No. {doc.number}</span>}
          {doc.expiresOn && <span className={cx(doc.expiry === 'expired' && 'font-semibold text-red-text', doc.expiry === 'expiring' && 'font-semibold text-orange-text')}>{doc.expiry === 'expired' ? 'Expired' : 'Expires'} {doc.expiresOn}{doc.daysLeft !== null && doc.daysLeft >= 0 ? ` (${doc.daysLeft} days)` : ''}</span>}
          {doc.scanStatus === 'not_scanned' && <span title="No virus scanner is set up on this server">Not virus-scanned</span>}
          <button type="button" onClick={view} className="font-semibold text-orange-text">View</button>
          {canWithdraw && doc.status === 'PENDING' && (
            <button type="button" onClick={() => dispatch(withdrawDocument({ kind, id: doc.id }))} className="font-semibold text-grey-600">Remove</button>
          )}
        </div>
      )}
      {doc?.status === 'REJECTED' && (
        <p className="mt-3 rounded-xl bg-red/10 p-3 text-sm text-red-text" role="alert">
          <b>Why it was not accepted:</b> {doc.rejectionReason}
        </p>
      )}

      {canUpload && !open && (
        <Button type="button" variant="ghost" size="sm" className="mt-3" onClick={() => setOpen(true)}>
          <Icon name="upload" className="h-4 w-4" /> {doc ? 'Upload a new version' : 'Upload'}
        </Button>
      )}
      {canUpload && open && (
        <form onSubmit={send} className="mt-4 grid gap-3 sm:grid-cols-2" noValidate>
          {requirement.number && <Input label={requirement.number.label} value={fields.number} onChange={set('number')} hint={requirement.number.hint} id={`${requirement.docType}-number`} autoComplete="off" />}
          {requirement.issuer && <Input label="Issued by" value={fields.issuer} onChange={set('issuer')} id={`${requirement.docType}-issuer`} />}
          {requirement.issued && <Input label="Issue date" type="date" max={today()} value={fields.issuedOn} onChange={set('issuedOn')} id={`${requirement.docType}-issued`} />}
          {requirement.expires && <Input label="Expiry date" type="date" min={today()} value={fields.expiresOn} onChange={set('expiresOn')} id={`${requirement.docType}-expires`} />}
          <label className="sm:col-span-2" htmlFor={`${requirement.docType}-file`}>
            <span className="mb-1.5 block text-sm font-semibold text-grey-800">File (PDF, JPEG, PNG or WebP, up to 5 MB)</span>
            <input id={`${requirement.docType}-file`} type="file" accept={ACCEPT} onChange={pick} className="block w-full rounded-xl border border-dashed border-grey-800/25 bg-white p-3 text-sm file:mr-3 file:rounded-full file:border-0 file:bg-grey-800 file:px-4 file:py-2 file:font-semibold file:text-white" />
          </label>
          {busy && (
            <div className="sm:col-span-2" role="status" aria-live="polite">
              <div className="h-2 overflow-hidden rounded-full bg-grey-800/10"><div className="h-full rounded-full bg-gradient-to-r from-sun to-orange transition-all" style={{ width: `${upload.pct}%` }} /></div>
              <p className="mt-1 text-xs text-grey-600">Uploading {upload.pct}%</p>
            </div>
          )}
          {(error || upload?.error) && <p className="rounded-xl bg-red/10 p-3 text-sm font-semibold text-red-text sm:col-span-2" role="alert">{error || upload.error}</p>}
          <div className="flex gap-2 sm:col-span-2">
            <Button type="submit" size="sm" disabled={!file || busy} loading={busy}>Upload</Button>
            {doc && <Button type="button" variant="quiet" size="sm" onClick={() => setOpen(false)}>Cancel</Button>}
          </div>
        </form>
      )}
    </div>
  );
}
