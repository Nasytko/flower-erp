import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { resolvePrismaClient } from '../../../infrastructure/persistence/prisma-transaction-context';
import type {
  OrganizationRepository,
  PaginatedResult,
  PaginationInput,
} from '../application/ports/repositories';
import {
  OrganizationStatus,
  type OrganizationProps,
} from '../domain/organization-rules';
import type { Organization as PrismaOrganization } from '@prisma/client';

function mapOrg(row: PrismaOrganization): OrganizationProps {
  return {
    id: row.id,
    name: row.name,
    status: row.status as OrganizationStatus,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

@Injectable()
export class PrismaOrganizationRepository implements OrganizationRepository {
  constructor(private readonly prisma: PrismaService) {}

  private client() {
    return resolvePrismaClient(this.prisma);
  }

  async create(data: {
    id: string;
    name: string;
    status: OrganizationStatus;
  }): Promise<OrganizationProps> {
    const row = await this.client().organization.create({
      data: {
        id: data.id,
        name: data.name,
        status: data.status,
      },
    });
    return mapOrg(row);
  }

  async findById(id: string): Promise<OrganizationProps | null> {
    const row = await this.client().organization.findUnique({ where: { id } });
    return row ? mapOrg(row) : null;
  }

  async list(pagination: PaginationInput): Promise<PaginatedResult<OrganizationProps>> {
    const skip = (pagination.page - 1) * pagination.pageSize;
    const [totalItems, rows] = await Promise.all([
      this.client().organization.count(),
      this.client().organization.findMany({
        orderBy: { createdAt: 'desc' },
        skip,
        take: pagination.pageSize,
      }),
    ]);
    return {
      items: rows.map(mapOrg),
      totalItems,
      page: pagination.page,
      pageSize: pagination.pageSize,
    };
  }

  async findManyByIds(
    ids: string[],
    pagination: PaginationInput,
  ): Promise<PaginatedResult<OrganizationProps>> {
    if (ids.length === 0) {
      return { items: [], totalItems: 0, page: pagination.page, pageSize: pagination.pageSize };
    }
    const skip = (pagination.page - 1) * pagination.pageSize;
    const where = { id: { in: ids } };
    const [totalItems, rows] = await Promise.all([
      this.client().organization.count({ where }),
      this.client().organization.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pagination.pageSize,
      }),
    ]);
    return {
      items: rows.map(mapOrg),
      totalItems,
      page: pagination.page,
      pageSize: pagination.pageSize,
    };
  }

  async updateStatus(id: string, status: OrganizationStatus): Promise<OrganizationProps> {
    const row = await this.client().organization.update({
      where: { id },
      data: { status },
    });
    return mapOrg(row);
  }
}
