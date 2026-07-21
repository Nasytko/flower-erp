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

export type AuditQueryFilter = {
  organizationId: string;
  storeId?: string;
  action?: string;
  entityType?: string;
  limit?: number;
};

export interface AuditQueryPort {
  list(filter: AuditQueryFilter): Promise<AuditLogView[]>;
}

export const AUDIT_QUERY_PORT = Symbol('AUDIT_QUERY_PORT');
