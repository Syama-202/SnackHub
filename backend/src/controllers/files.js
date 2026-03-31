// GET /files/:token: a private document through a signed, five-minute link (utils/signedUrl.js).
// The link was handed out only after the API checked the viewer could see this document; the
// file comes from private storage, never from a static folder, and every view is audited.
// The response cannot be cached, sniffed into another type or run as a page.
import { AppError } from '../utils/AppError.js';
import { verifyFileLink } from '../utils/signedUrl.js';
import { KINDS, kindDb } from '../utils/applicants.js';
import { auditLogModel } from '../models/identity/auditLog.js';

const EXT = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

export function filesController({ env, dbs, storage }) {
  async function show(req, res) {
    const link = verifyFileLink(env, req.params.token);
    const photo = link && /^complaint-photo:(\d+)$/.exec(link.ref);
    if (photo) return sendPhoto(res, link, Number(photo[1]));
    const m = link && /^(seller|rider)-doc:(\d+)$/.exec(link.ref);
    if (!m) throw new AppError(404, 'NOT_FOUND', 'This link has expired. Open the document again from the app.');
    const [, kind, id] = m;
    const doc = await KINDS[kind].documents.findById(kindDb(dbs, kind), Number(id));
    if (!doc) throw new AppError(404, 'NOT_FOUND', 'Document not found');
    const bytes = await storage.read(doc.storageKey);
    await auditLogModel.append(dbs.identity, { actorId: link.viewerId, action: 'document.view', target: `${kind}-doc-${doc.id}`, after: { docType: doc.docType, own: link.viewerId === doc.userId } });
    send(res, bytes, doc.mime, `${doc.docType.toLowerCase()}-v${doc.version}.${EXT[doc.mime]}`);
  }

  /** A complaint photo, for the staff member the link was signed for. */
  async function sendPhoto(res, link, evidenceId) {
    const row = await dbs.ordering('complaint_evidence').where({ id: evidenceId, kind: 'PHOTO' }).first();
    if (!row) throw new AppError(404, 'NOT_FOUND', 'Photo not found');
    const meta = typeof row.content === 'string' ? JSON.parse(row.content) : (row.content ?? {});
    const bytes = await storage.read(row.storage_key);
    await auditLogModel.append(dbs.identity, { actorId: link.viewerId, action: 'complaint.photo.view', target: `complaint-${row.complaint_id}` });
    send(res, bytes, meta.mime ?? 'image/jpeg', `complaint-${row.complaint_id}-${row.id}.${EXT[meta.mime] ?? 'jpg'}`);
  }

  function send(res, bytes, mime, filename) {
    res.set({
      'Content-Type': mime,
      'Content-Length': String(bytes.length),
      'Content-Disposition': `inline; filename="${filename}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
      'Cross-Origin-Resource-Policy': 'same-origin',
      'Referrer-Policy': 'no-referrer',
    });
    res.send(bytes);
  }
  return { show };
}
