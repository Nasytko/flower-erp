import { Injectable, Inject } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import type { ApiEnv } from '@flower/config';
import { API_ENV } from '../infrastructure.module';

/** AES-256-GCM encryption for TOTP secrets at rest. */
@Injectable()
export class TotpCryptoService {
  private readonly key: Buffer;

  constructor(@Inject(API_ENV) env: ApiEnv) {
    this.key = scryptSync(env.JWT_ACCESS_SECRET, 'flower-totp-v1', 32);
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, encrypted]).toString('base64url');
  }

  decrypt(payload: string): string {
    const buf = Buffer.from(payload, 'base64url');
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const encrypted = buf.subarray(28);
    const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
  }
}
