/**
 * Local environment overrides — edit this file (do not commit secrets).
 *
 * API_URL: base URL of the StudyHub backend WITHOUT `/api/v1`.
 *   - null  → automatic dev default (Android emulator: http://10.0.2.2:4000,
 *             iOS simulator: http://localhost:4000), see src/config.ts
 *   - real device on the same Wi-Fi: 'http://192.168.1.20:4000' (your computer's LAN IP)
 *   - production: 'https://api.example.com' (HTTPS is mandatory in release builds)
 */
export const API_URL: string | null = null;

/** Optional production URL used automatically in release builds (__DEV__ === false). */
export const PRODUCTION_API_URL: string | null = null;
