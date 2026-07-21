import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { AuditLogView, AuditQueryFilter, AuditQueryPort } from './audit-query.port';

@Injectable()
export class PrismaAuditQueryAdapter implements AuditQueryPort {
  constructor(private readonly prisma: PrismaService) {}

  async list(filter: AuditQueryFilter): Promise<AuditLogView[]> {
    const rows = await this.prisma.auditLog.findMany({
      where: {
        organizationId: filter.organizationId,
        ...(filter.storeId ? { storeId: filter.storeId } : {}),
        ...(filter.action ? { action: filter.action } : {}),
        ...(filter.entityType ? { entityType: filter.entityType } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(filter.limit ?? 50, 200),
    });
    return rows.map((row) => ({
      id: row.id,
      organizationId: row.organizationId,
      storeId: row.storeId,
      actorId: row.actorId,
      action: row.action,
      entityType: row.entityType,
      entityId: row.entityId,
      requestId: row.requestId,
      createdAt: row.createdAt.toISOString(),
    }));
  }
}
