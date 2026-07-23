import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomBytes } from 'node:crypto';
import type { ApiEnv } from '@flower/config';
import { API_ENV } from '../../../infrastructure/infrastructure.module';

export type AccessTokenPayload = {
  sub: string;
  sid: string;
  mid: string;
  oid: string;
};

@Injectable()
export class JwtTokenService {
  constructor(
    private readonly jwt: JwtService,
    @Inject(API_ENV) private readonly env: ApiEnv,
  ) {}

  signAccessToken(payload: AccessTokenPayload): string {
    return this.jwt.sign(payload, {
      secret: this.env.JWT_ACCESS_SECRET,
      expiresIn: this.env.JWT_ACCESS_TTL_SECONDS,
    });
  }

  verifyAccessToken(token: string): AccessTokenPayload {
    return this.jwt.verify<AccessTokenPayload>(token, {
      secret: this.env.JWT_ACCESS_SECRET,
    });
  }

  createRefreshToken(): string {
    return randomBytes(48).toString('base64url');
  }

  refreshExpiresAt(now: Date): Date {
    return new Date(now.getTime() + this.env.JWT_REFRESH_TTL_DAYS * 86_400_000);
  }
}
