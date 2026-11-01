import {API_ORIGIN} from '../config';
import {ApiClient} from './client';
import {createEndpoints} from './endpoints';
import {keychainTokenStorage} from './tokenStorage';

/** App-wide API client (tokens in Keychain / Keystore). */
export const client = new ApiClient({
  baseUrl: API_ORIGIN,
  storage: keychainTokenStorage,
});

export const api = createEndpoints(client);

export * from './types';
export {ApiClient, buildQuery} from './client';
export type {TokenStorage} from './client';
export {
  ApiError,
  errorMessage,
  fieldErrors,
  isApiError,
  normalizeError,
} from './errors';
export {createEndpoints} from './endpoints';
