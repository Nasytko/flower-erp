import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import { createHmac } from 'node:crypto';

/** Centralized Argon2id parameters — see docs/architecture/security.md */
export const ARGON2_OPTIONS: argon2.Options & { type: typeof argon2.argon2id } = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
};

@Injectable()
export class Argon2PasswordService {
  private dummyHashPromise: Promise<string> | null = null;

  private async getDummyHash(): Promise<string> {
    if (!this.dummyHashPromise) {
      this.dummyHashPromise = argon2.hash('timing-safe-dummy', ARGON2_OPTIONS);
    }
    return this.dummyHashPromise;
  }

  hash(password: string): Promise<string> {
    return argon2.hash(password, ARGON2_OPTIONS);
  }

  async verify(hash: string, password: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, password, ARGON2_OPTIONS);
    } catch {
      return false;
    }
  }

  async verifyUnknownUser(password: string): Promise<boolean> {
    const dummy = await this.getDummyHash();
    return this.verify(dummy, password);
  }
}

export function hashRefreshToken(secret: string, token: string): string {
  return createHmac('sha256', secret).update(token).digest('hex');
}
