import type { ErrorRequestHandler, RequestHandler } from 'express';
import multer from 'multer';
import { ZodError } from 'zod';
import { ApiError, errorBody } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { formatZodError } from '../lib/validate.js';

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json(errorBody('NOT_FOUND', `Route ${req.method} ${req.path} not found`));
};

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (res.headersSent) return;
  if (err instanceof ApiError) {
    res.status(err.status).json(errorBody(err.code, err.message, err.details));
    return;
  }
  if (err instanceof ZodError) {
    res.status(400).json(errorBody('VALIDATION_ERROR', 'Invalid input', formatZodError(err)));
    return;
  }
  if (err instanceof multer.MulterError) {
    const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    const message = err.code === 'LIMIT_FILE_SIZE' ? 'File too large' : `Upload error: ${err.message}`;
    res.status(status).json(errorBody('VALIDATION_ERROR', message, { field: err.field, code: err.code }));
    return;
  }
  // body-parser errors
  if (err?.type === 'entity.parse.failed') {
    res.status(400).json(errorBody('VALIDATION_ERROR', 'Malformed JSON body'));
    return;
  }
  if (err?.type === 'entity.too.large') {
    res.status(413).json(errorBody('VALIDATION_ERROR', 'Request body too large'));
    return;
  }
  // PostgreSQL errors
  if (err?.code === '23505') {
    res.status(409).json(errorBody('CONFLICT', 'Resource already exists', { constraint: err.constraint }));
    return;
  }
  if (err?.code === '22P02' || err?.code === '23514') {
    res.status(400).json(errorBody('VALIDATION_ERROR', 'Invalid input'));
    return;
  }
  if (err?.code === '23503') {
    res.status(404).json(errorBody('NOT_FOUND', 'Referenced resource not found'));
    return;
  }
  logger.error({ err, path: req.path, method: req.method }, 'Unhandled error');
  res.status(500).json(errorBody('INTERNAL', 'Internal server error'));
};
