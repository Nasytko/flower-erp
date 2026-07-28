export type AuditLogView = {
  id: string;
  organizationId: string;
  storeId: string | null;
  actorId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  requestId: string;
  createdAt: string;
};

export type AuditLogDetailView = AuditLogView & {
  reason: string | null;
  beforeState: Record<string, unknown> | null;
  afterState: Record<string, unknown> | null;
  actorDisplayName: string | null;
};

export type AuditQueryFilter = {
  organizationId: string;
  storeId?: string;
  entityId?: string;
  action?: string;
  entityType?: string;
  limit?: number;
};

export type AuditEntityFilter = {
  organizationId: string;
  entityType: string;
  entityId: string;
  limit?: number;
};

export interface AuditQueryPort {
  list(filter: AuditQueryFilter): Promise<AuditLogDetailView[]>;
  listForEntity(filter: AuditEntityFilter): Promise<AuditLogDetailView[]>;
}

export const AUDIT_QUERY_PORT = Symbol('AUDIT_QUERY_PORT');
