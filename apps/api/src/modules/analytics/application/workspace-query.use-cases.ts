import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { hasAnyPermission, hasPermission } from '@flower/permissions';
import type { ApiEnv } from '@flower/config';
import { CLOCK_PORT, type ClockPort } from '@flower/shared-kernel';
import { API_ENV } from '../../../infrastructure/infrastructure.module';
import { getRequestContext } from '../../../infrastructure/context/request-context';
import { OrganizationUseCases } from '../../organization/application/organization.use-cases';
import {
  compareWorkspacePriority,
  enrichWorkspaceCard,
} from '../domain/urgency';
import {
  WORKSPACE_READ_REPOSITORY,
  type WorkspaceFilter,
  type WorkspaceReadRepository,
} from './ports/workspace-read.repository';

@Injectable()
export class WorkspaceQueryUseCases {
  constructor(
    @Inject(WORKSPACE_READ_REPOSITORY) private readonly reads: WorkspaceReadRepository,
    @Inject(CLOCK_PORT) private readonly clock: ClockPort,
    @Inject(API_ENV) private readonly env: ApiEnv,
    private readonly organizations: OrganizationUseCases,
  ) {}

  async listWorkspaceOrders(input: {
    organizationId: string;
    storeId: string;
    filter: WorkspaceFilter;
    offset: number;
    limit: number;
  }) {
    this.assertWorkspaceAccess();
    await this.organizations.getStore(input.organizationId, input.storeId);
    const now = this.clock.now();
    const soonMinutes = this.env.WORKSPACE_READY_SOON_MINUTES;
    const membershipId = getRequestContext()?.auth?.membershipId ?? null;
    const limit = Math.min(
      Math.max(input.limit, 1),
      this.env.WORKSPACE_SECTION_LIMIT * 5,
    );
    const offset = Math.max(input.offset, 0);

    const result = await this.reads.listWorkspaceOrders({
      organizationId: input.organizationId,
      storeId: input.storeId,
      filter: input.filter,
      now,
      soonMinutes,
      offset,
      limit,
    });

    const items = result.rows
      .map((row) => enrichWorkspaceCard(row, now, soonMinutes, membershipId, false))
      .sort(compareWorkspacePriority);

    return {
      serverNow: now.toISOString(),
      filter: input.filter,
      offset,
      limit,
      total: result.total,
      items,
    };
  }

  async getWorkOrder(organizationId: string, storeId: string, orderId: string) {
    this.assertWorkspaceAccess();
    await this.organizations.getStore(organizationId, storeId);
    const now = this.clock.now();
    const soonMinutes = this.env.WORKSPACE_READY_SOON_MINUTES;
    const membershipId = getRequestContext()?.auth?.membershipId ?? null;

    const projection = await this.reads.getWorkOrder({
      organizationId,
      storeId,
      orderId,
    });
    if (!projection) {
      throw new NotFoundException({ code: 'ORDER_NOT_FOUND', message: 'Order not found' });
    }

    const hasActiveSale = Boolean(
      projection.paymentSummary.saleId &&
        projection.paymentSummary.saleStatus !== 'ANNULLED',
    );
    const card = enrichWorkspaceCard(
      projection.order,
      now,
      soonMinutes,
      membershipId,
      hasActiveSale,
    );

    return {
      serverNow: now.toISOString(),
      version: projection.order.version,
      order: card,
      plannedLines: projection.plannedLines,
      actualLines: projection.actualLines,
      paymentSummary: projection.paymentSummary,
      primaryAction: card.primaryAction,
      urgency: card.urgency,
    };
  }

  async getOperationalStock(organizationId: string, storeId: string) {
    this.assertWorkspaceAccess();
    await this.organizations.getStore(organizationId, storeId);
    const permissions = getRequestContext()?.auth?.permissions ?? [];
    const includeCost = hasPermission(permissions, ['inventory:view-cost']);
    const now = this.clock.now();
    const items = await this.reads.listOperationalStock({
      organizationId,
      storeId,
      includeCost,
    });
    return {
      serverNow: now.toISOString(),
      costRedacted: !includeCost,
      items,
    };
  }

  private assertWorkspaceAccess(): void {
    const permissions = getRequestContext()?.auth?.permissions ?? [];
    if (!hasAnyPermission(permissions, ['workspace:read', 'orders:read'])) {
      throw new ForbiddenException({
        code: 'ACCESS_DENIED',
        message:
          permissions.length === 0
            ? 'Authentication context missing (workspace:read or orders:read required)'
            : 'workspace:read or orders:read required',
      });
    }
  }
}
