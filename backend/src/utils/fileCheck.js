// What an uploaded file really is, from its first bytes. The name, extension and the
// Content-Type the browser sent are ignored: a renamed .exe is refused whatever it claims.
// PDFs that can run code (JavaScript, launch actions, embedded files) are refused too.
const SIGNATURES = [
  { mime: 'application/pdf', test: (b) => b.subarray(0, 5).toString('latin1') === '%PDF-' },
  { mime: 'image/jpeg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: 'image/png', test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { mime: 'image/webp', test: (b) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP' },
];

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const ACTIVE_PDF = /\/(JavaScript|JS|Launch|EmbeddedFile|OpenAction\s*<<[^>]*\/S\s*\/JavaScript)\b/;

/** { mime } for an accepted file, or { error } with a plain reason. */
export function inspectUpload(buffer) {
  if (!buffer?.length) return { error: 'The file is empty' };
  if (buffer.length > MAX_UPLOAD_BYTES) return { error: 'The file is larger than 5 MB' };
  const match = SIGNATURES.find((s) => s.test(buffer));
  if (!match) return { error: 'Upload a PDF, JPEG, PNG or WebP file' };
  if (match.mime === 'application/pdf') {
    if (!buffer.subarray(-1024).toString('latin1').includes('%%EOF')) return { error: 'This PDF looks damaged; export it again' };
    if (ACTIVE_PDF.test(buffer.toString('latin1'))) return { error: 'This PDF contains scripts or attachments; print it to a plain PDF and try again' };
  }
  return { mime: match.mime };
}
