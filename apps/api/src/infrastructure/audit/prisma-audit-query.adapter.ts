import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type {
  AuditEntityFilter,
  AuditLogDetailView,
  AuditQueryFilter,
  AuditQueryPort,
} from './audit-query.port';

function jsonObject(value: Prisma.JsonValue | null): Record<string, unknown> | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

@Injectable()
export class PrismaAuditQueryAdapter implements AuditQueryPort {
  constructor(private readonly prisma: PrismaService) {}

  async list(filter: AuditQueryFilter): Promise<AuditLogDetailView[]> {
    return this.queryRows({
      organizationId: filter.organizationId,
      storeId: filter.storeId,
      entityId: filter.entityId,
      action: filter.action,
      entityType: filter.entityType,
      limit: filter.limit,
    });
  }

  async listForEntity(filter: AuditEntityFilter): Promise<AuditLogDetailView[]> {
    return this.queryRows({
      organizationId: filter.organizationId,
      entityType: filter.entityType,
      entityId: filter.entityId,
      limit: filter.limit,
    });
  }

  private async queryRows(input: {
    organizationId: string;
    storeId?: string;
    entityId?: string;
    action?: string;
    entityType?: string;
    limit?: number;
  }): Promise<AuditLogDetailView[]> {
    const rows = await this.prisma.auditLog.findMany({
      where: {
        organizationId: input.organizationId,
        ...(input.storeId ? { storeId: input.storeId } : {}),
        ...(input.entityId ? { entityId: input.entityId } : {}),
        ...(input.action ? { action: input.action } : {}),
        ...(input.entityType ? { entityType: input.entityType } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(input.limit ?? 50, 200),
    });

    const actorIds = [...new Set(rows.map((row) => row.actorId).filter(Boolean))] as string[];
    const actors =
      actorIds.length > 0
        ? await this.prisma.user.findMany({
            where: { id: { in: actorIds } },
            select: { id: true, displayName: true },
          })
        : [];
    const actorNames = new Map(actors.map((user) => [user.id, user.displayName]));

    return rows.map((row) => ({
      id: row.id,
      organizationId: row.organizationId,
      storeId: row.storeId,
      actorId: row.actorId,
      actorDisplayName: row.actorId ? (actorNames.get(row.actorId) ?? null) : null,
      action: row.action,
      entityType: row.entityType,
      entityId: row.entityId,
      requestId: row.requestId,
      reason: row.reason,
      beforeState: jsonObject(row.beforeState),
      afterState: jsonObject(row.afterState),
      createdAt: row.createdAt.toISOString(),
    }));
  }
}
