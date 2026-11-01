import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    globalSetup: ['tests/global-setup.ts'],
    setupFiles: ['tests/setup.ts'],
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5433/studyhub_test',
      JWT_SECRET: 'test-secret-test-secret-test-secret',
      BCRYPT_ROUNDS: '4',
      PUBLIC_URL: 'http://test.local',
      UPLOAD_DIR: 'tmp/test-uploads',
      TMP_DIR: 'tmp/test-tmp',
      RATE_LIMIT_ENABLED: 'false',
      STORAGE_DRIVER: 'local',
    },
  },
});
