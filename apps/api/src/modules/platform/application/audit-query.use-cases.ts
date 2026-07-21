import { Inject, Injectable } from '@nestjs/common';
import { AUDIT_QUERY_PORT, type AuditQueryPort } from '../../../infrastructure/audit/audit-query.port';

@Injectable()
export class AuditQueryUseCases {
  constructor(@Inject(AUDIT_QUERY_PORT) private readonly audit: AuditQueryPort) {}

  listAudit(
    organizationId: string,
    query?: { storeId?: string; action?: string; entityType?: string; limit?: number },
  ) {
    return this.audit.list({
      organizationId,
      storeId: query?.storeId,
      action: query?.action,
      entityType: query?.entityType,
      limit: query?.limit,
    });
  }
}
