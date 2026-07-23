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
  type WorkspaceOrderCard,
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

  async getToday(organizationId: string, storeId: string) {
    this.assertWorkspaceAccess();
    await this.organizations.getStore(organizationId, storeId);
    const now = this.clock.now();
    const soonMinutes = this.env.WORKSPACE_READY_SOON_MINUTES;
    const sectionLimit = this.env.WORKSPACE_SECTION_LIMIT;
    const membershipId = getRequestContext()?.auth?.membershipId ?? null;
    const permissions = getRequestContext()?.auth?.permissions ?? [];

    const [counters, overdue, soon, unassigned, inPreparation, ready, attentionItems, lowStock] =
      await Promise.all([
        this.reads.countWorkspaceBuckets({
          organizationId,
          storeId,
          now,
          soonMinutes,
        }),
        this.reads.listWorkspaceOrders({
          organizationId,
          storeId,
          filter: 'overdue',
          now,
          soonMinutes,
          offset: 0,
          limit: sectionLimit,
        }),
        this.reads.listWorkspaceOrders({
          organizationId,
          storeId,
          filter: 'soon',
          now,
          soonMinutes,
          offset: 0,
          limit: sectionLimit,
        }),
        this.reads.listWorkspaceOrders({
          organizationId,
          storeId,
          filter: 'unassigned',
          now,
          soonMinutes,
          offset: 0,
          limit: sectionLimit,
        }),
        this.reads.listWorkspaceOrders({
          organizationId,
          storeId,
          filter: 'in_preparation',
          now,
          soonMinutes,
          offset: 0,
          limit: sectionLimit,
        }),
        this.reads.listWorkspaceOrders({
          organizationId,
          storeId,
          filter: 'ready',
          now,
          soonMinutes,
          offset: 0,
          limit: sectionLimit,
        }),
        this.reads.listAttentionItems({
          organizationId,
          storeId,
          now,
          soonMinutes,
          lowStockThreshold: this.env.WORKSPACE_LOW_STOCK_THRESHOLD,
        }),
        this.reads.listLowStockWarnings({
          organizationId,
          storeId,
          threshold: this.env.WORKSPACE_LOW_STOCK_THRESHOLD,
        }),
      ]);

    const mapCards = (rows: typeof overdue.rows): WorkspaceOrderCard[] =>
      rows
        .map((row) =>
          enrichWorkspaceCard(row, now, soonMinutes, membershipId, false),
        )
        .sort(compareWorkspacePriority);

    return {
      serverNow: now.toISOString(),
      sectionLimit,
      counters: {
        overdue: { count: counters.overdue, filterLink: 'overdue' },
        soon: { count: counters.soon, filterLink: 'soon' },
        unassigned: { count: counters.unassigned, filterLink: 'unassigned' },
        inPreparation: {
          count: counters.in_preparation,
          filterLink: 'in_preparation',
        },
        ready: { count: counters.ready, filterLink: 'ready' },
        today: { count: counters.today, filterLink: 'today' },
        partiallyReserved: {
          count: counters.partially_reserved,
          filterLink: 'partially_reserved',
        },
      },
      sections: {
        overdue: mapCards(overdue.rows),
        soon: mapCards(soon.rows),
        unassigned: mapCards(unassigned.rows),
        inPreparation: mapCards(inPreparation.rows),
        ready: mapCards(ready.rows),
      },
      attentionItems,
      lowStockWarnings: lowStock,
      quickActions: this.quickActions(permissions),
    };
  }

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

  async getOperations(organizationId: string, storeId: string) {
    this.assertOperationsAccess();
    await this.organizations.getStore(organizationId, storeId);
    const now = this.clock.now();
    const [kpis, attentionItems] = await Promise.all([
      this.reads.getOperationalKpis({ organizationId, storeId, now }),
      this.reads.listAttentionItems({
        organizationId,
        storeId,
        now,
        soonMinutes: this.env.WORKSPACE_READY_SOON_MINUTES,
        lowStockThreshold: this.env.WORKSPACE_LOW_STOCK_THRESHOLD,
      }),
    ]);

    return {
      serverNow: now.toISOString(),
      kpis,
      attentionItems,
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

  async getInventoryOpsAttention(organizationId: string, storeId: string) {
    this.assertOperationsAccess();
    await this.organizations.getStore(organizationId, storeId);
    return {
      serverNow: this.clock.now().toISOString(),
      items: await this.reads.listInventoryOpsAttention({ organizationId, storeId }),
    };
  }

  async getInventoryTransit(organizationId: string, storeId: string) {
    this.assertOperationsAccess();
    await this.organizations.getStore(organizationId, storeId);
    return {
      serverNow: this.clock.now().toISOString(),
      items: await this.reads.listInventoryTransit({ organizationId, storeId }),
    };
  }

  async getInventoryLosses(organizationId: string, storeId: string) {
    this.assertOperationsAccess();
    await this.organizations.getStore(organizationId, storeId);
    const permissions = getRequestContext()?.auth?.permissions ?? [];
    const includeCost = hasPermission(permissions, ['inventory-adjustments:view-cost']);
    return {
      serverNow: this.clock.now().toISOString(),
      costRedacted: !includeCost,
      items: await this.reads.listInventoryLosses({ organizationId, storeId, includeCost }),
    };
  }

  async getInventoryCountProgress(organizationId: string, storeId: string) {
    this.assertOperationsAccess();
    await this.organizations.getStore(organizationId, storeId);
    return {
      serverNow: this.clock.now().toISOString(),
      items: await this.reads.listInventoryCountProgress({ organizationId, storeId }),
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

  private assertOperationsAccess(): void {
    const permissions = getRequestContext()?.auth?.permissions ?? [];
    if (!hasAnyPermission(permissions, ['operations:read', 'orders:read'])) {
      throw new ForbiddenException({
        code: 'ACCESS_DENIED',
        message:
          permissions.length === 0
            ? 'Authentication context missing (operations:read required)'
            : 'operations:read required',
      });
    }
  }

  private quickActions(permissions: readonly string[]) {
    const actions: Array<{ code: string; label: string; requires: string }> = [];
    if (hasPermission(permissions, ['orders:assign', 'orders:prepare'])) {
      actions.push({
        code: 'CLAIM_NEXT',
        label: 'Claim next',
        requires: 'orders:assign+orders:prepare',
      });
    }
    if (hasPermission(permissions, ['orders:create'])) {
      actions.push({ code: 'CREATE_ORDER', label: 'New order', requires: 'orders:create' });
    }
    if (hasPermission(permissions, ['sales:create'])) {
      actions.push({ code: 'CREATE_SALE', label: 'New sale', requires: 'sales:create' });
    }
    if (hasPermission(permissions, ['supply:receive'])) {
      actions.push({
        code: 'RECEIVE_SUPPLY',
        label: 'Receive supply',
        requires: 'supply:receive',
      });
    }
    return actions;
  }
}
