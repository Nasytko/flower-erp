import { Injectable } from '@nestjs/common';
import { generateSecret, generateSync, generateURI, verifySync } from 'otplib';

const TOTP_ISSUER = 'Floro';

@Injectable()
export class TotpService {
  generateSecret(): string {
    return generateSecret();
  }

  keyUri(login: string, secret: string): string {
    return generateURI({ issuer: TOTP_ISSUER, label: login, secret });
  }

  verify(secret: string, token: string): boolean {
    const normalized = token.replace(/\s/g, '');
    if (!/^\d{6}$/.test(normalized)) {
      return false;
    }
    const result = verifySync({ secret, token: normalized });
    return result.valid;
  }

  /** Test helper — generate a token for the current time step. */
  generateToken(secret: string): string {
    return generateSync({ secret });
  }
}
