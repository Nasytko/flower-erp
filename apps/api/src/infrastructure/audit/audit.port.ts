/**
 * Audit port — append-only audit trail.
 * Persistence is owned by the platform/audit infrastructure adapter.
 * Domain and organization application code must not import Audit Prisma models.
 */
export type AuditAppendCommand = {
  organizationId: string;
  storeId?: string | null;
  actorId?: string | null;
  action: string;
  entityType: string;
  entityId: string;
  beforeState?: Record<string, unknown> | null;
  afterState?: Record<string, unknown> | null;
  reason?: string | null;
  requestId: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  occurredAt?: Date;
};

/** @deprecated Use AuditAppendCommand — kept for gradual migration of callers */
export type AuditEntry = AuditAppendCommand & {
  resourceType?: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
};

export interface AuditPort {
  append(entry: AuditAppendCommand): Promise<void>;
}

export const AUDIT_PORT = Symbol('AUDIT_PORT');
