import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { CLOCK_PORT, type ClockPort } from '@flower/shared-kernel';
import { AUDIT_PORT, type AuditPort } from '../../../infrastructure/audit/audit.port';
import { getRequestContext } from '../../../infrastructure/context/request-context';
import { UNIT_OF_WORK, type UnitOfWork } from '../../../infrastructure/persistence/unit-of-work.port';
import { OrganizationUseCases } from '../../organization/application/organization.use-cases';
import {
  assertCustomerName,
  assertPhone,
  DomainError,
} from '../domain/order-rules';
import {
  CustomerPhoneConflictError,
  ORDER_REPOSITORY,
  type CustomerView,
  type OrderRepository,
} from './ports/order.repository';

function mapDomain(error: unknown): never {
  if (error instanceof CustomerPhoneConflictError) {
    throw new ConflictException({
      code: 'CUSTOMER_PHONE_TAKEN',
      message: error.message,
    });
  }
  if (error instanceof DomainError) {
    throw new BadRequestException({ code: error.code, message: error.message });
  }
  throw error;
}

@Injectable()
export class CustomerUseCases {
  constructor(
    @Inject(ORDER_REPOSITORY) private readonly orders: OrderRepository,
    private readonly organizations: OrganizationUseCases,
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(AUDIT_PORT) private readonly audit: AuditPort,
    @Inject(CLOCK_PORT) private readonly clock: ClockPort,
  ) {}

  async createCustomer(input: {
    organizationId: string;
    name: string;
    phone: string;
    email?: string | null;
    notes?: string | null;
    preferredLanguage?: string | null;
  }): Promise<CustomerView> {
    try {
      await this.organizations.getOrganization(input.organizationId);
      assertCustomerName(input.name);
      assertPhone(input.phone);
      const ctx = getRequestContext();

      return await this.uow.runInTransaction(async () => {
        const customer = await this.orders.createCustomer({
          id: randomUUID(),
          organizationId: input.organizationId,
          name: input.name.trim(),
          phone: input.phone.trim(),
          email: input.email?.trim() || null,
          notes: input.notes?.trim() || null,
          preferredLanguage: input.preferredLanguage?.trim() || null,
        });

        await this.audit.append({
          organizationId: input.organizationId,
          actorId: ctx?.actorId ?? null,
          action: 'CUSTOMER_CREATED',
          entityType: 'Customer',
          entityId: customer.id,
          afterState: customer as unknown as Record<string, unknown>,
          requestId: ctx?.requestId ?? 'unknown',
          occurredAt: this.clock.now(),
        });

        return customer;
      });
    } catch (error) {
      mapDomain(error);
    }
  }

  async updateCustomer(input: {
    organizationId: string;
    customerId: string;
    name?: string;
    phone?: string;
    email?: string | null;
    notes?: string | null;
    preferredLanguage?: string | null;
  }): Promise<CustomerView> {
    try {
      const existing = await this.requireCustomer(input.organizationId, input.customerId);
      if (input.name !== undefined) assertCustomerName(input.name);
      if (input.phone !== undefined) assertPhone(input.phone);
      const ctx = getRequestContext();

      return await this.uow.runInTransaction(async () => {
        const updated = await this.orders.updateCustomer(input.organizationId, input.customerId, {
          name: input.name?.trim(),
          phone: input.phone?.trim(),
          email: input.email === undefined ? undefined : input.email?.trim() || null,
          notes: input.notes === undefined ? undefined : input.notes?.trim() || null,
          preferredLanguage:
            input.preferredLanguage === undefined
              ? undefined
              : input.preferredLanguage?.trim() || null,
        });

        await this.audit.append({
          organizationId: input.organizationId,
          actorId: ctx?.actorId ?? null,
          action: 'CUSTOMER_UPDATED',
          entityType: 'Customer',
          entityId: updated.id,
          beforeState: existing as unknown as Record<string, unknown>,
          afterState: updated as unknown as Record<string, unknown>,
          requestId: ctx?.requestId ?? 'unknown',
          occurredAt: this.clock.now(),
        });

        return updated;
      });
    } catch (error) {
      mapDomain(error);
    }
  }

  async archiveCustomer(organizationId: string, customerId: string): Promise<CustomerView> {
    try {
      const existing = await this.requireCustomer(organizationId, customerId);
      if (existing.status === 'ARCHIVED') {
        throw new BadRequestException({
          code: 'CUSTOMER_ALREADY_ARCHIVED',
          message: 'Customer is already archived',
        });
      }
      const ctx = getRequestContext();

      return await this.uow.runInTransaction(async () => {
        const archived = await this.orders.archiveCustomer(organizationId, customerId);

        await this.audit.append({
          organizationId,
          actorId: ctx?.actorId ?? null,
          action: 'CUSTOMER_ARCHIVED',
          entityType: 'Customer',
          entityId: archived.id,
          beforeState: existing as unknown as Record<string, unknown>,
          afterState: archived as unknown as Record<string, unknown>,
          requestId: ctx?.requestId ?? 'unknown',
          occurredAt: this.clock.now(),
        });

        return archived;
      });
    } catch (error) {
      mapDomain(error);
    }
  }

  async listCustomers(
    organizationId: string,
    filter?: { status?: string; search?: string },
  ): Promise<CustomerView[]> {
    await this.organizations.getOrganization(organizationId);
    return this.orders.listCustomers(organizationId, filter);
  }

  async getCustomer(organizationId: string, customerId: string): Promise<CustomerView> {
    return this.requireCustomer(organizationId, customerId);
  }

  private async requireCustomer(organizationId: string, customerId: string): Promise<CustomerView> {
    const customer = await this.orders.getCustomer(organizationId, customerId);
    if (!customer) {
      throw new NotFoundException({ code: 'CUSTOMER_NOT_FOUND', message: 'Customer not found' });
    }
    return customer;
  }
}
