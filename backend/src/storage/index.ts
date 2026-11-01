import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { config } from '../config.js';
import { logger } from '../lib/logger.js';

export interface Storage {
  readonly driver: 'local' | 's3';
  /** Stores a local file under `key` (the source file is left untouched). */
  putFile(key: string, filePath: string, contentType: string): Promise<void>;
  delete(key: string): Promise<void>;
  url(key: string): string;
  /** Copies a stored object to a local file. */
  download(key: string, destPath: string): Promise<void>;
}

export const uploadRoot = path.resolve(config.UPLOAD_DIR);

class LocalStorage implements Storage {
  readonly driver = 'local' as const;
  async putFile(key: string, filePath: string): Promise<void> {
    const dest = this.resolve(key);
    await fsp.mkdir(path.dirname(dest), { recursive: true });
    await fsp.copyFile(filePath, dest);
  }
  async delete(key: string): Promise<void> {
    await fsp.rm(this.resolve(key), { force: true });
  }
  url(key: string): string {
    return `${config.PUBLIC_URL}/uploads/${key}`;
  }
  async download(key: string, destPath: string): Promise<void> {
    await fsp.copyFile(this.resolve(key), destPath);
  }
  private resolve(key: string): string {
    const p = path.resolve(uploadRoot, key);
    if (!p.startsWith(uploadRoot + path.sep)) throw new Error('Invalid storage key');
    return p;
  }
}

class S3Storage implements Storage {
  readonly driver = 's3' as const;
  private client: S3Client;
  private bucket: string;
  private publicBase: string;

  constructor() {
    if (!config.S3_BUCKET) throw new Error('S3_BUCKET is required when STORAGE_DRIVER=s3');
    this.bucket = config.S3_BUCKET;
    this.client = new S3Client({
      region: config.S3_REGION,
      endpoint: config.S3_ENDPOINT || undefined,
      forcePathStyle: config.S3_FORCE_PATH_STYLE,
      credentials:
        config.S3_ACCESS_KEY_ID && config.S3_SECRET_ACCESS_KEY
          ? { accessKeyId: config.S3_ACCESS_KEY_ID, secretAccessKey: config.S3_SECRET_ACCESS_KEY }
          : undefined,
    });
    const base =
      config.S3_PUBLIC_URL ||
      (config.S3_ENDPOINT
        ? `${config.S3_ENDPOINT.replace(/\/+$/, '')}/${this.bucket}`
        : `https://${this.bucket}.s3.${config.S3_REGION}.amazonaws.com`);
    this.publicBase = base.replace(/\/+$/, '');
  }

  async putFile(key: string, filePath: string, contentType: string): Promise<void> {
    const { size } = await fsp.stat(filePath);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: fs.createReadStream(filePath),
        ContentLength: size,
        ContentType: contentType,
        CacheControl: 'public, max-age=31536000, immutable',
      }),
    );
  }
  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
  url(key: string): string {
    return `${this.publicBase}/${key}`;
  }
  async download(key: string, destPath: string): Promise<void> {
    const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    if (!res.Body) throw new Error(`Empty S3 object ${key}`);
    await pipeline(res.Body as NodeJS.ReadableStream, fs.createWriteStream(destPath));
  }
}

export const storage: Storage = config.STORAGE_DRIVER === 's3' ? new S3Storage() : new LocalStorage();

export function mediaUrl(key: string | null | undefined): string | null {
  return key ? storage.url(key) : null;
}

export function newKey(folder: string, ext: string): string {
  const d = new Date();
  const ym = `${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  return `${folder}/${ym}/${crypto.randomUUID()}${ext}`;
}

/** Best-effort deletion (used after DB commits). */
export function deleteKeys(keys: (string | null | undefined)[]): void {
  for (const key of keys) {
    if (!key) continue;
    storage.delete(key).catch((err) => logger.warn({ err, key }, 'Failed to delete stored media'));
  }
}
