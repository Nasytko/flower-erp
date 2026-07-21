import { createApiClient } from '@flower/api-client';
import type { ApiClient } from '@flower/api-client';
import { loadBackofficeEnv } from '@flower/config';
import { getAccessToken } from './auth-session';

let client: ApiClient | null = null;

export function getApiClient(): ApiClient {
  if (client) {
    return client;
  }
  const env = loadBackofficeEnv({
    NODE_ENV: process.env.NODE_ENV,
    NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL,
    NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME,
  });
  client = createApiClient({
    baseUrl: env.NEXT_PUBLIC_API_BASE_URL,
    getAccessToken,
    credentials: 'include',
  });
  return client;
}

export function resetApiClient(): void {
  client = null;
}
