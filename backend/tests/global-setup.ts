import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

export const FIXTURES = path.resolve('tmp/fixtures');

export default async function setup() {
  const url = process.env.TEST_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5433/studyhub_test';
  // Fresh schema for every run.
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  await client.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await client.end();

  process.env.DATABASE_URL = url;
  process.env.JWT_SECRET ??= 'test-secret-test-secret-test-secret';
  process.env.NODE_ENV = 'test';
  const { migrate } = await import('../src/db/migrate.js');
  const { pool } = await import('../src/db/pool.js');
  await migrate(pool);
  await pool.end();

  // Media fixtures generated with ffmpeg.
  fs.rmSync(path.resolve('tmp/test-uploads'), { recursive: true, force: true });
  fs.mkdirSync(FIXTURES, { recursive: true });
  const video = path.join(FIXTURES, 'tiny.mp4');
  if (!fs.existsSync(video)) {
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc=duration=3:size=320x240:rate=15', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=3', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', video]);
  }
  const image = path.join(FIXTURES, 'image.png');
  if (!fs.existsSync(image)) {
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc=size=640x480', '-frames:v', '1', image]);
  }
  const audio = path.join(FIXTURES, 'voice.m4a');
  if (!fs.existsSync(audio)) {
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'sine=frequency=300:duration=2', '-c:a', 'aac', audio]);
  }
  // iPhone-like HEVC .mov (1280x960), must be transcoded to H.264 720p.
  const hevc = path.join(FIXTURES, 'hevc.mov');
  if (!fs.existsSync(hevc)) {
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc=duration=2:size=1280x960:rate=10', '-f', 'lavfi', '-i', 'sine=frequency=500:duration=2', '-c:v', 'libx265', '-x265-params', 'log-level=error', '-tag:v', 'hvc1', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', hevc]);
  }
  fs.writeFileSync(path.join(FIXTURES, 'fake.mp4'), 'this is not a video');
}
