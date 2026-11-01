import { execFile } from 'node:child_process';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { promisify } from 'node:util';
import sharp from 'sharp';
import { config } from '../config.js';
import { ApiError, badRequest } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { deleteKeys, newKey, storage } from '../storage/index.js';

const run = promisify(execFile);

export const tmpDir = path.resolve(config.TMP_DIR || path.join(os.tmpdir(), 'studyhub-uploads'));

export type MediaKind = 'video' | 'image' | 'audio';

export const MB = 1024 * 1024;
export const SIZE_LIMITS: Record<MediaKind, number> = {
  video: 100 * MB,
  image: 10 * MB,
  audio: 20 * MB,
};

const VIDEO_MIME = new Set(['video/mp4', 'video/quicktime', 'video/x-m4v', 'video/mov']);
const VIDEO_EXT = new Set(['.mp4', '.mov', '.m4v', '.qt']);
const IMAGE_MIME = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif']);
const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.heic', '.heif']);
const AUDIO_MIME = new Set([
  'audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/m4a', 'audio/x-m4a', 'audio/aac', 'audio/wav', 'audio/x-wav',
  'audio/wave', 'audio/ogg', 'audio/webm', 'audio/3gpp', 'video/3gpp',
]);
const AUDIO_EXT = new Set(['.mp3', '.m4a', '.aac', '.wav', '.ogg', '.oga', '.webm', '.3gp', '.amr']);

export type StoredMedia = {
  kind: MediaKind;
  key: string;
  thumbnailKey: string | null;
  durationSec: number | null;
  width: number | null;
  height: number | null;
};

/** Detects the media kind from the declared mimetype, falling back to the file extension. */
export function detectKind(file: Express.Multer.File): MediaKind | null {
  const mime = (file.mimetype || '').toLowerCase();
  const ext = path.extname(file.originalname || '').toLowerCase();
  const generic = mime === '' || mime === 'application/octet-stream';
  if (VIDEO_MIME.has(mime) || (generic && VIDEO_EXT.has(ext))) return 'video';
  if (IMAGE_MIME.has(mime) || (generic && IMAGE_EXT.has(ext))) return 'image';
  if (AUDIO_MIME.has(mime) || (generic && AUDIO_EXT.has(ext))) return 'audio';
  return null;
}

type Probe = {
  streams?: { codec_type?: string; width?: number; height?: number; tags?: Record<string, string>; side_data_list?: { rotation?: number }[] }[];
  format?: { duration?: string };
};

export async function probe(file: string): Promise<Probe> {
  try {
    const { stdout } = await run(
      config.FFPROBE_PATH,
      ['-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', file],
      { timeout: 30_000, maxBuffer: 10 * MB },
    );
    return JSON.parse(stdout) as Probe;
  } catch (err) {
    logger.debug({ err }, 'ffprobe failed');
    throw badRequest('Unreadable media file');
  }
}

function tmpPath(ext: string) {
  return path.join(tmpDir, `${crypto.randomUUID()}${ext}`);
}

async function processVideo(file: Express.Multer.File, keys: string[]): Promise<StoredMedia> {
  const info = await probe(file.path);
  const video = info.streams?.find((s) => s.codec_type === 'video');
  if (!video) throw badRequest('The uploaded file has no video stream');
  const duration = info.format?.duration ? Number(info.format.duration) : null;
  let width = video.width ?? null;
  let height = video.height ?? null;
  const rotation = Math.abs(
    Number(video.side_data_list?.find((d) => d.rotation !== undefined)?.rotation ?? video.tags?.rotate ?? 0),
  );
  if (rotation === 90 || rotation === 270) [width, height] = [height, width];

  const tmpFiles: string[] = [];
  try {
    // Remux to MP4 with the moov atom up front so clients can start playback while downloading.
    let videoFile = file.path;
    let ext = path.extname(file.originalname || '').toLowerCase() || '.mp4';
    let contentType = file.mimetype && file.mimetype !== 'application/octet-stream' ? file.mimetype : 'video/mp4';
    const remuxed = tmpPath('.mp4');
    try {
      await run(config.FFMPEG_PATH, ['-v', 'error', '-y', '-i', file.path, '-map', '0:v:0', '-map', '0:a:0?', '-c', 'copy', '-movflags', '+faststart', remuxed], {
        timeout: 120_000,
      });
      tmpFiles.push(remuxed);
      videoFile = remuxed;
      ext = '.mp4';
      contentType = 'video/mp4';
    } catch (err) {
      logger.warn({ err }, 'Video remux failed, storing original file');
    }

    const thumb = tmpPath('.jpg');
    const at = duration && duration > 2 ? 1 : duration ? duration / 3 : 0;
    let thumbnailKey: string | null = null;
    try {
      await run(config.FFMPEG_PATH, ['-v', 'error', '-y', '-ss', at.toFixed(2), '-i', file.path, '-frames:v', '1', '-vf', "scale='min(720,iw)':-2", '-q:v', '3', thumb], {
        timeout: 60_000,
      });
      tmpFiles.push(thumb);
      thumbnailKey = newKey('thumbnails', '.jpg');
      await storage.putFile(thumbnailKey, thumb, 'image/jpeg');
      keys.push(thumbnailKey);
    } catch (err) {
      logger.warn({ err }, 'Thumbnail generation failed');
      thumbnailKey = null;
    }

    const key = newKey('videos', ext);
    await storage.putFile(key, videoFile, contentType);
    keys.push(key);
    return {
      kind: 'video',
      key,
      thumbnailKey,
      durationSec: duration !== null && Number.isFinite(duration) ? Math.round(duration * 100) / 100 : null,
      width,
      height,
    };
  } finally {
    await Promise.all(tmpFiles.map((f) => fsp.rm(f, { force: true })));
  }
}

async function processImage(file: Express.Multer.File, keys: string[], opts: { square?: number } = {}): Promise<StoredMedia> {
  let meta: Awaited<ReturnType<ReturnType<typeof sharp>["metadata"]>>;
  try {
    meta = await sharp(file.path).metadata();
  } catch {
    throw badRequest('Unsupported or corrupted image');
  }
  const out = tmpPath(meta.format === 'gif' && !opts.square ? '.gif' : '.jpg');
  try {
    let width: number | null;
    let height: number | null;
    if (meta.format === 'gif' && !opts.square) {
      await fsp.copyFile(file.path, out);
      width = meta.width ?? null;
      height = meta.pageHeight ?? meta.height ?? null;
    } else {
      // Re-encode: applies EXIF orientation, strips metadata (GPS...), bounds dimensions.
      let pipeline = sharp(file.path).rotate();
      pipeline = opts.square
        ? pipeline.resize(opts.square, opts.square, { fit: 'cover' })
        : pipeline.resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true });
      const info = await pipeline.flatten({ background: '#ffffff' }).jpeg({ quality: 85, mozjpeg: true }).toFile(out);
      width = info.width;
      height = info.height;
    }
    const isGif = out.endsWith('.gif');
    const key = newKey(opts.square ? 'avatars' : 'images', isGif ? '.gif' : '.jpg');
    await storage.putFile(key, out, isGif ? 'image/gif' : 'image/jpeg');
    keys.push(key);
    return { kind: 'image', key, thumbnailKey: null, durationSec: null, width, height };
  } catch (err) {
    if (err instanceof ApiError) throw err;
    logger.warn({ err }, 'Image processing failed');
    throw badRequest('Unsupported or corrupted image');
  } finally {
    await fsp.rm(out, { force: true });
  }
}

async function processAudio(file: Express.Multer.File, keys: string[]): Promise<StoredMedia> {
  const info = await probe(file.path);
  if (!info.streams?.some((s) => s.codec_type === 'audio')) throw badRequest('The uploaded file has no audio stream');
  const duration = info.format?.duration ? Number(info.format.duration) : null;
  const ext = path.extname(file.originalname || '').toLowerCase() || '.m4a';
  const key = newKey('audio', AUDIO_EXT.has(ext) ? ext : '.m4a');
  await storage.putFile(key, file.path, file.mimetype || 'audio/mp4');
  keys.push(key);
  return {
    kind: 'audio',
    key,
    thumbnailKey: null,
    durationSec: duration !== null && Number.isFinite(duration) ? Math.round(duration * 100) / 100 : null,
    width: null,
    height: null,
  };
}

/**
 * Validates + processes an uploaded file and stores the result.
 * On failure, anything already stored is deleted.
 */
export async function storeMedia(
  file: Express.Multer.File,
  allowed: MediaKind[] = ['video', 'image', 'audio'],
): Promise<StoredMedia> {
  const kind = detectKind(file);
  if (!kind || !allowed.includes(kind)) {
    throw badRequest(`Unsupported media type "${file.mimetype}". Allowed: ${allowed.join(', ')}`);
  }
  if (file.size > SIZE_LIMITS[kind]) {
    throw new ApiError('VALIDATION_ERROR', `File too large: ${kind} must be ≤ ${SIZE_LIMITS[kind] / MB} MB`, undefined, 413);
  }
  const keys: string[] = [];
  try {
    if (kind === 'video') return await processVideo(file, keys);
    if (kind === 'image') return await processImage(file, keys);
    return await processAudio(file, keys);
  } catch (err) {
    deleteKeys(keys);
    throw err;
  }
}

/** Avatars: square 512px JPEG. */
export async function storeAvatar(file: Express.Multer.File): Promise<string> {
  if (detectKind(file) !== 'image') throw badRequest('Avatar must be an image (jpeg, png, webp, gif)');
  if (file.size > 5 * MB) throw new ApiError('VALIDATION_ERROR', 'Avatar must be ≤ 5 MB', undefined, 413);
  const keys: string[] = [];
  const res = await processImage(file, keys, { square: 512 });
  return res.key;
}
