import { Injectable } from '@nestjs/common';
import type { Prisma as PrismaNS } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { resolvePrismaClient } from '../persistence/prisma-transaction-context';
import type { AuditAppendCommand, AuditPort } from './audit.port';
import { getRequestContext } from '../context/request-context';

function toJson(
  value: Record<string, unknown> | null | undefined,
): PrismaNS.InputJsonValue | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  return value as PrismaNS.InputJsonValue;
}

@Injectable()
export class PrismaAuditAdapter implements AuditPort {
  constructor(private readonly prisma: PrismaService) {}

  async append(entry: AuditAppendCommand): Promise<void> {
    const client = resolvePrismaClient(this.prisma);
    const ctx = getRequestContext();

    await client.auditLog.create({
      data: {
        id: randomUUID(),
        organizationId: entry.organizationId,
        storeId: entry.storeId ?? null,
        actorId: entry.actorId ?? ctx?.actorId ?? null,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        beforeState: toJson(entry.beforeState ?? undefined),
        afterState: toJson(entry.afterState ?? undefined),
        reason: entry.reason ?? null,
        requestId: entry.requestId || ctx?.requestId || 'unknown',
        ipAddress: entry.ipAddress ?? null,
        userAgent: entry.userAgent ?? null,
        createdAt: entry.occurredAt ?? new Date(),
      },
    });
  }
}
