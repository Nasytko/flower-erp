import assert from 'node:assert/strict';
import test from 'node:test';
import {
  expandRecipeForQuantity,
  mergeIssueLines,
} from '../../src/modules/master-data/domain/recipe-issue-lines.js';

test('expandRecipeForQuantity scales component quantities', () => {
  assert.deepEqual(
    expandRecipeForQuantity('2', [
      { componentItemId: 'rose', quantity: '3' },
      { componentItemId: 'ribbon', quantity: '1' },
    ]),
    [
      { itemId: 'rose', quantity: '6.00' },
      { itemId: 'ribbon', quantity: '2.00' },
    ],
  );
});

test('mergeIssueLines sums quantities for the same item', () => {
  assert.deepEqual(
    mergeIssueLines([
      { itemId: 'rose', quantity: '3' },
      { itemId: 'rose', quantity: '2' },
      { itemId: 'ribbon', quantity: '1' },
    ]),
    [
      { itemId: 'rose', quantity: '5.00' },
      { itemId: 'ribbon', quantity: '1.00' },
    ],
  );
});
