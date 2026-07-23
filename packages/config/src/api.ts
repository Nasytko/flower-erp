import { z } from 'zod';

const booleanFromString = z
  .union([z.boolean(), z.string()])
  .transform((value) => {
    if (typeof value === 'boolean') {
      return value;
    }
    return value === 'true' || value === '1';
  });

export const apiEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  API_PREFIX: z.string().default('api/v1'),
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:3000')
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
    ),
  BODY_LIMIT: z.string().default('1mb'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  /** Runtime application DB user (DML). Prefer least privilege. */
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  /**
   * Migration DB user (DDL). Falls back to DATABASE_URL only in local development
   * when explicitly identical; production must set a dedicated migrate URL.
   */
  DATABASE_MIGRATE_URL: z.string().min(1).optional(),
  SWAGGER_ENABLED: booleanFromString.default(false),
  SWAGGER_PATH: z.string().default('docs'),
  /** JWT access token signing secret (min 32 chars). */
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  /** Refresh token HMAC/pepper for hashing before DB storage. */
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
  JWT_REFRESH_TTL_DAYS: z.coerce.number().int().positive().default(14),
  /** Optional comma-separated signing key ids for rotation (kid:secret pairs) — v1 uses single secret. */
  JWT_SIGNING_KEYS: z.string().optional(),
  AUTH_LOGIN_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
  AUTH_LOGIN_LOCKOUT_MINUTES: z.coerce.number().int().positive().default(15),
  AUTH_RATE_LIMIT_LOGIN_PER_MINUTE: z.coerce.number().int().positive().default(10),
  AUTH_RATE_LIMIT_REFRESH_PER_MINUTE: z.coerce.number().int().positive().default(30),
  AUTH_COOKIE_SECURE: booleanFromString.optional(),
  AUTH_COOKIE_SAME_SITE: z.enum(['strict', 'lax', 'none']).default('lax'),
  ALLOW_OWNER_BOOTSTRAP: booleanFromString.default(false),
  /** Discount percent above which sales:discount-override is required. */
  SALES_DISCOUNT_OVERRIDE_PERCENT: z.coerce.number().min(0).max(100).default(20),
  /** Minutes before readyAt when urgency becomes SOON/URGENT. */
  WORKSPACE_READY_SOON_MINUTES: z.coerce.number().int().positive().default(30),
  /** Max cards per Today section bucket. */
  WORKSPACE_SECTION_LIMIT: z.coerce.number().int().positive().default(20),
  /** Available qty at or below this triggers operational low-stock warning (not a purchase order). */
  WORKSPACE_LOW_STOCK_THRESHOLD: z.coerce.number().min(0).default(5),
  /** Minutes before windowStart for suggested requiredDispatchAt. */
  DELIVERY_DISPATCH_BUFFER_MINUTES: z.coerce.number().int().positive().default(30),
  /** Minutes before windowStart when delivery urgency becomes SOON. */
  DELIVERY_READY_SOON_MINUTES: z.coerce.number().int().positive().default(45),
});

export type ApiEnv = z.infer<typeof apiEnvSchema>;

export function loadApiEnv(env: NodeJS.ProcessEnv = process.env): ApiEnv {
  const result = apiEnvSchema.safeParse(env);
  if (!result.success) {
    const names = [
      ...new Set(result.error.issues.map((issue) => issue.path.join('.') || '(root)')),
    ];
    const details = result.error.issues
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ');
    throw new Error(
      `Invalid API environment. Missing or invalid variables: ${names.join(', ')}. Details: ${details}`,
    );
  }

  const parsed = result.data;
  if (parsed.NODE_ENV === 'production' && !env.DATABASE_MIGRATE_URL) {
    // Runtime boot does not require migrate URL; migrations run separately.
  }

  if (parsed.NODE_ENV === 'production' && parsed.SWAGGER_ENABLED !== true) {
    // default: swagger off in production via schema default false
  }

  return parsed;
}
