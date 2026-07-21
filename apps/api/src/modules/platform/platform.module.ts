import { Module } from '@nestjs/common';
import { AUDIT_QUERY_PORT } from '../../infrastructure/audit/audit-query.port';
import { PrismaAuditQueryAdapter } from '../../infrastructure/audit/prisma-audit-query.adapter';
import { AuthModule } from '../auth/auth.module';
import { IdentityModule } from '../identity/identity.module';
import { AuditQueryUseCases } from './application/audit-query.use-cases';
import { AuditController } from './presentation/audit.controller';

@Module({
  imports: [AuthModule, IdentityModule],
  controllers: [AuditController],
  providers: [
    AuditQueryUseCases,
    { provide: AUDIT_QUERY_PORT, useClass: PrismaAuditQueryAdapter },
  ],
  exports: [AuthModule, IdentityModule, AuditQueryUseCases],
})
export class PlatformModule {}
