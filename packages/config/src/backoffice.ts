import { z } from 'zod';

export const backofficeEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  /** Explicit deploy target for UI hints; defaults from NODE_ENV when omitted. */
  NEXT_PUBLIC_APP_ENV: z.enum(['development', 'staging', 'production']).optional(),
  NEXT_PUBLIC_API_BASE_URL: z.string().url().default('http://localhost:3001/api/v1'),
  NEXT_PUBLIC_APP_NAME: z.string().default('Floro'),
});

export type BackofficeEnv = z.infer<typeof backofficeEnvSchema>;

export function loadBackofficeEnv(
  env: Record<string, string | undefined> = process.env,
): BackofficeEnv {
  const result = backofficeEnvSchema.safeParse(env);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid backoffice environment: ${details}`);
  }
  return result.data;
}
