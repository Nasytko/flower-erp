import { Global, Module } from '@nestjs/common';
import { loadApiEnv, type ApiEnv } from '@flower/config';
import { PrismaModule } from './prisma/prisma.module';
import { SystemClock } from './clock/system-clock';
import { AUDIT_PORT } from './audit/audit.port';
import { PrismaAuditAdapter } from './audit/prisma-audit.adapter';
import { UNIT_OF_WORK } from './persistence/unit-of-work.port';
import { PrismaUnitOfWork } from './persistence/prisma-unit-of-work';
import { CLOCK_PORT } from '@flower/shared-kernel';
import { Argon2PasswordService } from './security/password.service';

export const API_ENV = Symbol('API_ENV');

@Global()
@Module({
  imports: [PrismaModule],
  providers: [
    {
      provide: API_ENV,
      useFactory: (): ApiEnv => loadApiEnv(),
    },
    Argon2PasswordService,
    { provide: CLOCK_PORT, useClass: SystemClock },
    { provide: AUDIT_PORT, useClass: PrismaAuditAdapter },
    { provide: UNIT_OF_WORK, useClass: PrismaUnitOfWork },
  ],
  exports: [PrismaModule, API_ENV, Argon2PasswordService, CLOCK_PORT, AUDIT_PORT, UNIT_OF_WORK],
})
export class InfrastructureModule {}
