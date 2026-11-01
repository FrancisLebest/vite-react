/**
 * Push notifications through Firebase Cloud Messaging HTTP v1 (Android + iOS via APNs-through-FCM).
 * Configured with a Google service-account JSON (FCM_CREDENTIALS_JSON — raw JSON or base64 — or FCM_CREDENTIALS_FILE).
 * When not configured, every call is a no-op (logged at debug level).
 */
import fs from 'node:fs';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { pool } from '../db/pool.js';
import { logger } from '../lib/logger.js';

type ServiceAccount = { client_email: string; private_key: string; token_uri?: string; project_id?: string };

export type PushMessage = {
  title: string;
  body: string;
  data?: Record<string, string | null | undefined>;
  badge?: number;
};

type PushConfig = { projectId: string; credentials: ServiceAccount; apiUrl: string } | null;

function loadConfig(): PushConfig {
  try {
    let raw = config.FCM_CREDENTIALS_JSON;
    if (!raw && config.FCM_CREDENTIALS_FILE) raw = fs.readFileSync(config.FCM_CREDENTIALS_FILE, 'utf8');
    if (!raw) return null;
    const text = raw.trim().startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
    const credentials = JSON.parse(text) as ServiceAccount;
    const projectId = config.FCM_PROJECT_ID || credentials.project_id;
    if (!projectId || !credentials.client_email || !credentials.private_key) {
      logger.warn('FCM credentials incomplete (need project id, client_email, private_key): push disabled');
      return null;
    }
    return { projectId, credentials, apiUrl: config.FCM_API_URL.replace(/\/+$/, '') };
  } catch (err) {
    logger.error({ err }, 'Invalid FCM credentials: push disabled');
    return null;
  }
}

let pushConfig: PushConfig = loadConfig();
let cachedToken: { value: string; expiresAt: number } | null = null;
const inflight = new Set<Promise<unknown>>();

/** Overrides the configuration at runtime (used by tests); pass null to disable. */
export function configurePush(cfg: PushConfig): void {
  pushConfig = cfg;
  cachedToken = null;
}

export function isPushEnabled(): boolean {
  return pushConfig !== null;
}

/** Resolves when every queued push has been attempted (tests / graceful shutdown). */
export async function flushPush(): Promise<void> {
  while (inflight.size) await Promise.allSettled([...inflight]);
}

async function accessToken(cfg: NonNullable<PushConfig>): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;
  const tokenUri = cfg.credentials.token_uri || 'https://oauth2.googleapis.com/token';
  const now = Math.floor(Date.now() / 1000);
  const assertion = jwt.sign(
    { iss: cfg.credentials.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging', aud: tokenUri, iat: now, exp: now + 3600 },
    cfg.credentials.private_key,
    { algorithm: 'RS256' },
  );
  const res = await fetch(tokenUri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  });
  if (!res.ok) throw new Error(`FCM OAuth token request failed: ${res.status} ${await res.text()}`);
  const body = (await res.json()) as { access_token: string; expires_in?: number };
  cachedToken = { value: body.access_token, expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000 };
  return body.access_token;
}

function isInvalidTokenError(status: number, body: any): boolean {
  const err = body?.error;
  const codes: string[] = (err?.details ?? []).map((d: any) => d?.errorCode).filter(Boolean);
  if (codes.includes('UNREGISTERED') || codes.includes('INVALID_ARGUMENT')) return status === 404 || status === 400;
  return status === 404 && err?.status === 'NOT_FOUND';
}

async function sendToToken(cfg: NonNullable<PushConfig>, token: string, msg: PushMessage): Promise<'ok' | 'invalid' | 'error'> {
  const data: Record<string, string> = {};
  for (const [k, v] of Object.entries(msg.data ?? {})) if (v !== null && v !== undefined) data[k] = String(v);
  const payload = {
    message: {
      token,
      notification: { title: msg.title, body: msg.body },
      data,
      android: { priority: 'HIGH', notification: { sound: 'default', channel_id: 'default' } },
      apns: { headers: { 'apns-priority': '10' }, payload: { aps: { sound: 'default', ...(msg.badge !== undefined ? { badge: msg.badge } : {}) } } },
    },
  };
  const send = async () =>
    fetch(`${cfg.apiUrl}/v1/projects/${encodeURIComponent(cfg.projectId)}/messages:send`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${await accessToken(cfg)}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  let res = await send();
  if (res.status === 401) {
    cachedToken = null;
    res = await send();
  }
  if (res.ok) return 'ok';
  const body = await res.json().catch(() => null);
  if (isInvalidTokenError(res.status, body)) return 'invalid';
  logger.warn({ status: res.status, body }, 'FCM send failed');
  return 'error';
}

async function deliver(userIds: string[], msg: PushMessage): Promise<void> {
  const cfg = pushConfig;
  if (!cfg) {
    logger.debug({ userIds, title: msg.title }, 'Push skipped (FCM not configured)');
    return;
  }
  const { rows } = await pool.query('SELECT token FROM push_tokens WHERE user_id = ANY($1::uuid[])', [userIds]);
  const invalid: string[] = [];
  for (const { token } of rows) {
    try {
      if ((await sendToToken(cfg, token, msg)) === 'invalid') invalid.push(token);
    } catch (err) {
      logger.warn({ err }, 'Push delivery error');
    }
  }
  if (invalid.length) {
    await pool.query('DELETE FROM push_tokens WHERE token = ANY($1::text[])', [invalid]);
    logger.info({ count: invalid.length }, 'Removed invalid push tokens');
  }
}

/** Fire-and-forget push to one or more users. Never throws. */
export function sendPush(userIds: string | string[], msg: PushMessage): void {
  const ids = (Array.isArray(userIds) ? userIds : [userIds]).filter(Boolean);
  if (!ids.length) return;
  const p = deliver(ids, msg).catch((err) => logger.error({ err }, 'Push failed'));
  inflight.add(p);
  void p.finally(() => inflight.delete(p));
}
