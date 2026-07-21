import { Injectable } from '@nestjs/common';
import type { Prisma, Supplier as PrismaSupplier } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { resolvePrismaClient } from '../../../infrastructure/persistence/prisma-transaction-context';
import type {
  PaginatedResult,
  PaginationInput,
  SupplierListFilter,
  SupplierRepository,
} from '../application/ports/repositories';
import {
  MasterDataStatus,
  type SupplierProps,
} from '../domain/master-data-rules';

function mapSupplier(row: PrismaSupplier): SupplierProps {
  return {
    id: row.id,
    organizationId: row.organizationId,
    name: row.name,
    code: row.code,
    country: row.country,
    phone: row.phone,
    email: row.email,
    contactPerson: row.contactPerson,
    comment: row.comment,
    status: row.status as MasterDataStatus,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

@Injectable()
export class PrismaSupplierRepository implements SupplierRepository {
  constructor(private readonly prisma: PrismaService) {}

  private client() {
    return resolvePrismaClient(this.prisma);
  }

  async create(data: {
    id: string;
    organizationId: string;
    name: string;
    code: string;
    country: string | null;
    phone: string | null;
    email: string | null;
    contactPerson: string | null;
    comment: string | null;
    status: MasterDataStatus;
  }): Promise<SupplierProps> {
    const row = await this.client().supplier.create({ data });
    return mapSupplier(row);
  }

  async findById(organizationId: string, id: string): Promise<SupplierProps | null> {
    const row = await this.client().supplier.findFirst({
      where: { id, organizationId },
    });
    return row ? mapSupplier(row) : null;
  }

  async list(
    organizationId: string,
    pagination: PaginationInput,
    filter: SupplierListFilter,
  ): Promise<PaginatedResult<SupplierProps>> {
    const where: Prisma.SupplierWhereInput = {
      organizationId,
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.name
        ? { name: { contains: filter.name, mode: 'insensitive' } }
        : {}),
    };
    const skip = (pagination.page - 1) * pagination.pageSize;
    const [totalItems, rows] = await Promise.all([
      this.client().supplier.count({ where }),
      this.client().supplier.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pagination.pageSize,
      }),
    ]);
    return {
      items: rows.map(mapSupplier),
      totalItems,
      page: pagination.page,
      pageSize: pagination.pageSize,
    };
  }

  async updateStatus(
    organizationId: string,
    id: string,
    status: MasterDataStatus,
  ): Promise<SupplierProps> {
    await this.client().supplier.updateMany({
      where: { id, organizationId },
      data: { status },
    });
    const row = await this.findById(organizationId, id);
    if (!row) {
      throw new Error('Supplier missing after status update');
    }
    return row;
  }

  async existsCode(organizationId: string, code: string): Promise<boolean> {
    const row = await this.client().supplier.findFirst({
      where: { organizationId, code },
      select: { id: true },
    });
    return Boolean(row);
  }
}
