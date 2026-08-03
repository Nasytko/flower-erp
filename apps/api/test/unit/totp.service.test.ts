import assert from 'node:assert/strict';
import test from 'node:test';
import { TotpService } from '../../src/modules/auth/infrastructure/totp.service.js';

test('TotpService generates and verifies tokens', () => {
  const service = new TotpService();
  const secret = service.generateSecret();
  const token = service.generateToken(secret);
  assert.equal(service.verify(secret, token), true);
  assert.equal(service.verify(secret, '000000'), false);
});

test('TotpService keyUri includes login and issuer', () => {
  const service = new TotpService();
  const uri = service.keyUri('anna.florist', 'JBSWY3DPEHPK3PXP');
  assert.match(uri, /otpauth:\/\/totp\//);
  assert.match(uri, /anna\.florist/);
});
