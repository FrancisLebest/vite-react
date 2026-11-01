import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import multer from 'multer';
import type { RequestHandler } from 'express';
import { MB, tmpDir } from '../media/process.js';

fs.mkdirSync(tmpDir, { recursive: true });

const diskStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, tmpDir),
  filename: (_req, file, cb) => cb(null, `${crypto.randomUUID()}${path.extname(file.originalname || '').slice(0, 10)}`),
});

/** Single-file multipart parser storing to a temp dir; temp files are removed when the response ends. */
export function singleUpload(field: string, maxBytes = 100 * MB): RequestHandler {
  const mw = multer({
    storage: diskStorage,
    limits: { fileSize: maxBytes, files: 1, fields: 20, fieldSize: 64 * 1024 },
  }).single(field);
  return (req, res, next) => {
    res.on('close', () => {
      if (req.file?.path) fsp.rm(req.file.path, { force: true }).catch(() => undefined);
    });
    mw(req, res, next);
  };
}
