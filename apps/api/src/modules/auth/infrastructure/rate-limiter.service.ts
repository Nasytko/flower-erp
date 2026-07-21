import { Injectable } from '@nestjs/common';
import type { ApiEnv } from '@flower/config';

type Bucket = { count: number; resetAt: number };

@Injectable()
export class InMemoryRateLimiter {
  private readonly buckets = new Map<string, Bucket>();

  constructor(private readonly env: ApiEnv) {}

  consume(key: string, limit: number, windowMs = 60_000): boolean {
    const now = Date.now();
    const bucket = this.buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      this.buckets.set(key, { count: 1, resetAt: now + windowMs });
      return true;
    }
    if (bucket.count >= limit) return false;
    bucket.count += 1;
    return true;
  }

  loginKey(ip: string, login: string): string {
    return `login:${ip}:${login}`;
  }

  refreshKey(ip: string, sessionId: string | undefined): string {
    return `refresh:${ip}:${sessionId ?? 'unknown'}`;
  }

  loginLimit(): number {
    return this.env.AUTH_RATE_LIMIT_LOGIN_PER_MINUTE;
  }

  refreshLimit(): number {
    return this.env.AUTH_RATE_LIMIT_REFRESH_PER_MINUTE;
  }
}
