import { BadRequestException, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';

export type HardDeleteEntityType =
  | 'ITEM'
  | 'SUPPLIER'
  | 'CATEGORY'
  | 'INVENTORY_POLICY'
  | 'CUSTOMER'
  | 'USER'
  | 'COURIER'
  | 'PAYMENT_METHOD';

function inUse(message: string): never {
  throw new BadRequestException({ code: 'ENTITY_IN_USE', message });
}

@Injectable()
export class EntityHardDeleteService {
  constructor(private readonly prisma: PrismaService) {}

  async delete(organizationId: string, entityType: HardDeleteEntityType, entityId: string) {
    switch (entityType) {
      case 'ITEM':
        return this.deleteItem(organizationId, entityId);
      case 'SUPPLIER':
        return this.deleteSupplier(organizationId, entityId);
      case 'CATEGORY':
        return this.deleteCategory(organizationId, entityId);
      case 'INVENTORY_POLICY':
        return this.deletePolicy(organizationId, entityId);
      case 'CUSTOMER':
        return this.deleteCustomer(organizationId, entityId);
      case 'USER':
        return this.deleteOrgUser(organizationId, entityId);
      case 'COURIER':
        return this.deleteCourier(organizationId, entityId);
      case 'PAYMENT_METHOD':
        return this.deletePaymentMethod(organizationId, entityId);
      default:
        throw new BadRequestException({
          code: 'UNSUPPORTED_ENTITY',
          message: 'Unsupported entity type for deletion',
        });
    }
  }

  private client() {
    return this.prisma;
  }

  private async deleteItem(organizationId: string, itemId: string) {
    const item = await this.client().item.findFirst({ where: { id: itemId, organizationId } });
    if (!item) {
      throw new BadRequestException({ code: 'ITEM_NOT_FOUND', message: 'Item not found' });
    }

    const [
      orderLines,
      supplyLines,
      batches,
      reservations,
      writeOffs,
      saleLines,
    ] = await Promise.all([
      this.client().orderCompositionItem.count({ where: { itemId, organizationId } }),
      this.client().supplyItem.count({ where: { itemId, organizationId } }),
      this.client().inventoryBatch.count({ where: { itemId, organizationId } }),
      this.client().inventoryReservation.count({ where: { itemId, organizationId } }),
      this.client().writeOffItem.count({ where: { itemId, organizationId } }),
      this.client().saleLine.count({ where: { itemId, organizationId } }),
    ]);

    if (orderLines > 0) inUse('Товар используется в заказах — удаление невозможно');
    if (supplyLines > 0 || batches > 0) inUse('Товар есть в приёмках или на остатках — удаление невозможно');
    if (reservations > 0) inUse('Товар зарезервирован — удаление невозможно');
    if (writeOffs > 0) inUse('Товар фигурирует в списаниях — удаление невозможно');
    if (saleLines > 0) inUse('Товар использован в продажах — удаление невозможно');

    await this.client().$transaction([
      this.client().itemRecipeLine.deleteMany({
        where: {
          organizationId,
          OR: [{ parentItemId: itemId }, { componentItemId: itemId }],
        },
      }),
      this.client().itemRetailPrice.deleteMany({ where: { organizationId, itemId } }),
      this.client().inventoryBalance.deleteMany({ where: { organizationId, itemId } }),
      this.client().inventoryMovement.deleteMany({ where: { organizationId, itemId } }),
      this.client().item.delete({ where: { id: itemId } }),
    ]);
  }

  private async deleteSupplier(organizationId: string, supplierId: string) {
    const supplier = await this.client().supplier.findFirst({
      where: { id: supplierId, organizationId },
    });
    if (!supplier) {
      throw new BadRequestException({ code: 'SUPPLIER_NOT_FOUND', message: 'Supplier not found' });
    }
    const supplies = await this.client().supply.count({ where: { organizationId, supplierId } });
    if (supplies > 0) inUse('У поставщика есть приёмки — удаление невозможно');
    await this.client().supplier.delete({ where: { id: supplierId } });
  }

  private async deleteCategory(organizationId: string, categoryId: string) {
    const category = await this.client().itemCategory.findFirst({
      where: { id: categoryId, organizationId },
    });
    if (!category) {
      throw new BadRequestException({ code: 'CATEGORY_NOT_FOUND', message: 'Category not found' });
    }
    const [children, items] = await Promise.all([
      this.client().itemCategory.count({ where: { organizationId, parentId: categoryId } }),
      this.client().item.count({ where: { organizationId, categoryId } }),
    ]);
    if (children > 0) inUse('В категории есть подкатегории — удаление невозможно');
    if (items > 0) inUse('В категории есть товары — удаление невозможно');
    await this.client().itemCategory.delete({ where: { id: categoryId } });
  }

  private async deletePolicy(organizationId: string, policyId: string) {
    const policy = await this.client().inventoryPolicy.findFirst({
      where: { id: policyId, organizationId },
    });
    if (!policy) {
      throw new BadRequestException({ code: 'POLICY_NOT_FOUND', message: 'Policy not found' });
    }
    const items = await this.client().item.count({ where: { organizationId, inventoryPolicyId: policyId } });
    if (items > 0) inUse('Политика используется товарами — удаление невозможно');
    await this.client().inventoryPolicy.delete({ where: { id: policyId } });
  }

  private async deleteCustomer(organizationId: string, customerId: string) {
    const customer = await this.client().customer.findFirst({
      where: { id: customerId, organizationId },
    });
    if (!customer) {
      throw new BadRequestException({ code: 'CUSTOMER_NOT_FOUND', message: 'Customer not found' });
    }
    const orders = await this.client().order.count({ where: { organizationId, customerId } });
    if (orders > 0) inUse('У клиента есть заказы — удаление невозможно');
    await this.client().customer.delete({ where: { id: customerId } });
  }

  private async deleteOrgUser(organizationId: string, userId: string) {
    const membership = await this.client().organizationMembership.findFirst({
      where: { organizationId, userId },
      include: { roles: { include: { role: true } } },
    });
    if (!membership) {
      throw new BadRequestException({ code: 'USER_NOT_IN_ORG', message: 'User is not in this organization' });
    }
    const isDirector = membership.roles.some(
      (row: { role: { code: string } }) => row.role.code === 'DIRECTOR',
    );
    if (isDirector) {
      const directors = await this.client().membershipRole.count({
        where: {
          membership: { organizationId, status: 'ACTIVE' },
          role: { organizationId, code: 'DIRECTOR', status: 'ACTIVE', isSystem: true },
        },
      });
      if (directors <= 1) {
        inUse('Нельзя удалить последнего директора организации');
      }
    }

    await this.client().$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.membershipRole.deleteMany({ where: { membershipId: membership.id } });
      await tx.userStoreAccess.deleteMany({ where: { membershipId: membership.id } });
      await tx.organizationMembership.delete({ where: { id: membership.id } });

      const otherMemberships = await tx.organizationMembership.count({ where: { userId } });
      if (otherMemberships === 0) {
        await tx.session.deleteMany({ where: { userId } });
        await tx.user.delete({ where: { id: userId } });
      }
    });
  }

  private async deleteCourier(organizationId: string, courierId: string) {
    const courier = await this.client().courierProfile.findFirst({
      where: { id: courierId, organizationId },
    });
    if (!courier) {
      throw new BadRequestException({ code: 'COURIER_NOT_FOUND', message: 'Courier not found' });
    }
    const deliveries = await this.client().deliveryAssignment.count({
      where: { organizationId, courierProfileId: courierId },
    });
    if (deliveries > 0) inUse('У курьера есть доставки — удаление невозможно');
    await this.client().courierProfile.delete({ where: { id: courierId } });
  }

  private async deletePaymentMethod(organizationId: string, methodId: string) {
    const method = await this.client().paymentMethod.findFirst({
      where: { id: methodId, organizationId },
    });
    if (!method) {
      throw new BadRequestException({
        code: 'PAYMENT_METHOD_NOT_FOUND',
        message: 'Payment method not found',
      });
    }
    const payments = await this.client().payment.count({ where: { organizationId, methodId } });
    if (payments > 0) inUse('Способ оплаты использовался в платежах — удаление невозможно');
    await this.client().paymentMethod.delete({ where: { id: methodId } });
  }
}
