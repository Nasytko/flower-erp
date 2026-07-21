/** Default env for API tests — must be imported before AppModule. */
process.env.JWT_ACCESS_SECRET ??= 'test-access-secret-minimum-32-characters-long';
process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret-minimum-32-characters-long';
process.env.ALLOW_OWNER_BOOTSTRAP ??= 'true';

export function ensureTestEnv(): void {
  process.env.JWT_ACCESS_SECRET ??= 'test-access-secret-minimum-32-characters-long';
  process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret-minimum-32-characters-long';
}
