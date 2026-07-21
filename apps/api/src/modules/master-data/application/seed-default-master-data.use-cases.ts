import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  INVENTORY_POLICY_PRESETS,
  InventoryPolicyPresetCode,
  ItemType,
  MasterDataStatus,
} from '../domain/master-data-rules';
import {
  INVENTORY_POLICY_REPOSITORY,
  UNIT_OF_MEASURE_REPOSITORY,
  type InventoryPolicyRepository,
  type UnitOfMeasureRepository,
} from './ports/repositories';

/**
 * Intentionally does not open a UnitOfWork: organization provisioning invokes it
 * from its already active transaction.
 */
@Injectable()
export class SeedDefaultMasterDataUseCases {
  constructor(
    @Inject(UNIT_OF_MEASURE_REPOSITORY) private readonly units: UnitOfMeasureRepository,
    @Inject(INVENTORY_POLICY_REPOSITORY) private readonly policies: InventoryPolicyRepository,
  ) {}

  async seedDefaults(organizationId: string): Promise<void> {
    const units = [
      { name: 'Штука', symbol: 'шт', quantityScale: 0 },
      { name: 'Ветка', symbol: 'ветка', quantityScale: 0 },
      { name: 'Метр', symbol: 'метр', quantityScale: 2 },
    ];
    for (const unit of units) {
      if (!(await this.units.existsSymbol(organizationId, unit.symbol))) {
        await this.units.create({
          id: randomUUID(),
          organizationId,
          ...unit,
          status: MasterDataStatus.ACTIVE,
        });
      }
    }

    for (const presetCode of Object.values(InventoryPolicyPresetCode)) {
      if (await this.policies.findByPresetCode(organizationId, presetCode)) continue;
      const preset = INVENTORY_POLICY_PRESETS[presetCode];
      await this.policies.create({
        id: randomUUID(),
        organizationId,
        ...preset,
        itemType: preset.itemType as ItemType,
        presetCode,
        status: MasterDataStatus.ACTIVE,
      });
    }
  }
}
