import assert from 'node:assert/strict';
import test from 'node:test';
import {
  RetailPricingMode,
  calculateRetailLineTotal,
  defaultRetailPricingMode,
} from '../../src/modules/master-data/domain/master-data-rules.js';
import { ItemType } from '../../src/modules/master-data/domain/master-data-rules.js';

test('defaultRetailPricingMode maps flower to unit and material to service', () => {
  assert.equal(defaultRetailPricingMode(ItemType.FLOWER), RetailPricingMode.UNIT);
  assert.equal(defaultRetailPricingMode(ItemType.MATERIAL), RetailPricingMode.SERVICE);
});

test('calculateRetailLineTotal multiplies flowers by quantity', () => {
  assert.equal(calculateRetailLineTotal('2.50', RetailPricingMode.UNIT, '3'), '7.50');
});

test('calculateRetailLineTotal uses flat fee for services', () => {
  assert.equal(calculateRetailLineTotal('5.00', RetailPricingMode.SERVICE, '1'), '5.00');
  assert.equal(calculateRetailLineTotal('5.00', RetailPricingMode.SERVICE, '2'), '10.00');
});
