import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import multer from 'multer';
import { env } from '../config/env.js';
import {
  ALLOWED_IMAGE_TYPES,
  ERROR_CODES,
  UPLOAD_DIR,
  UPLOAD_PUBLIC_PREFIX,
} from '../config/constants.js';
import { ApiError } from '../utils/ApiError.js';

const storage = multer.diskStorage({
  destination(_req, _file, cb) {
    const now = new Date();
    const yyyy = String(now.getUTCFullYear());
    const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
    const dir = path.join(UPLOAD_DIR, yyyy, mm);
    fs.mkdir(dir, { recursive: true }, (err) => cb(err, dir));
  },
  filename(_req, file, cb) {
    // Random name; the extension comes from the validated MIME type, never the client's name.
    cb(null, `${crypto.randomBytes(16).toString('hex')}${ALLOWED_IMAGE_TYPES[file.mimetype]}`);
  },
});

function fileFilter(_req, file, cb) {
  if (Object.hasOwn(ALLOWED_IMAGE_TYPES, file.mimetype)) return cb(null, true);
  return cb(
    ApiError.unprocessable(
      'Only JPEG, PNG and WebP images are allowed',
      ERROR_CODES.UPLOAD_INVALID_TYPE,
      [{ field: file.fieldname, message: `Unsupported file type: ${file.mimetype}` }],
    ),
  );
}

const multerInstance = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: Math.floor(env.UPLOAD_MAX_MB * 1024 * 1024),
    files: env.UPLOAD_MAX_FILES,
  },
});

function translateMulterError(err) {
  if (!(err instanceof multer.MulterError)) return err;
  switch (err.code) {
    case 'LIMIT_FILE_SIZE':
      return ApiError.unprocessable(
        `Each image must be at most ${env.UPLOAD_MAX_MB} MB`,
        ERROR_CODES.UPLOAD_TOO_LARGE,
        [{ field: err.field, message: 'File too large' }],
      );
    case 'LIMIT_FILE_COUNT':
    case 'LIMIT_UNEXPECTED_FILE':
      return ApiError.unprocessable(
        `Upload at most ${env.UPLOAD_MAX_FILES} images in the expected field`,
        ERROR_CODES.UPLOAD_TOO_MANY_FILES,
        [{ field: err.field, message: 'Too many files or unexpected field' }],
      );
    default:
      return ApiError.unprocessable(err.message, ERROR_CODES.UPLOAD_ERROR, [
        { field: err.field, message: err.code },
      ]);
  }
}

/** Wraps a multer middleware so its errors become ApiErrors (422) for the error handler. */
function wrap(middleware) {
  return (req, res, next) => {
    middleware(req, res, (err) => (err ? next(translateMulterError(err)) : next()));
  };
}

/**
 * Accepts up to UPLOAD_MAX_FILES images in `field` (multipart/form-data).
 * Saved files are on req.files; use toPublicPath() to store them.
 * @param {string} [field]
 */
export const uploadImages = (field = 'images') =>
  wrap(multerInstance.array(field, env.UPLOAD_MAX_FILES));

/** Accepts one image in `field`; the file is on req.file. */
export const uploadSingleImage = (field = 'image') => wrap(multerInstance.single(field));

/** Converts a saved multer file into its public URL path, e.g. /uploads/2026/11/ab12.jpg */
export function toPublicPath(file) {
  const relative = path.relative(UPLOAD_DIR, file.path).split(path.sep).join('/');
  return `${UPLOAD_PUBLIC_PREFIX}/${relative}`;
}

/** Deletes the files multer saved for this request (used when the request then fails). */
export async function discardUploadedFiles(req) {
  const files = [...(req.files ?? []), ...(req.file ? [req.file] : [])];
  await Promise.all(files.map((f) => fs.promises.rm(f.path, { force: true })));
}

/**
 * Error middleware placed after a route that accepts uploads: removes the saved files when
 * validation or the handler fails, then passes the error on.
 */
export function discardUploadsOnError(err, req, _res, next) {
  discardUploadedFiles(req).finally(() => next(err));
}
