// One document file per request, held in memory (at most 5 MB) so it can be inspected before
// anything is written: its real type from its bytes, then a malware scan, then private
// storage. The text fields that come with it are validated by zod like any other body.
import multer from 'multer';
import { AppError } from '../utils/AppError.js';
import { MAX_UPLOAD_BYTES } from '../utils/fileCheck.js';

const parser = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1, fields: 8, fieldSize: 512, parts: 10, fieldNameSize: 40 },
}).single('file');

export function uploadOne(req, res, next) {
  parser(req, res, (err) => {
    if (!err) {
      if (!req.file) return next(new AppError(422, 'FILE_REQUIRED', 'Choose a file to upload'));
      return next();
    }
    if (err.code === 'LIMIT_FILE_SIZE') return next(new AppError(413, 'FILE_TOO_LARGE', 'The file is larger than 5 MB'));
    if (err instanceof multer.MulterError) return next(new AppError(422, 'UPLOAD_INVALID', 'Send one file in the "file" field'));
    next(new AppError(400, 'UPLOAD_INVALID', 'The upload could not be read'));
  });
}
