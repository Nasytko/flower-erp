import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveOrderBoardColumn } from '../../src/modules/orders/domain/order-board-column';

describe('resolveOrderBoardColumn', () => {
  it('maps unassigned confirmed order to NEW', () => {
    assert.equal(
      resolveOrderBoardColumn({
        status: 'CONFIRMED',
        type: 'PICKUP',
        hasActiveAssignment: false,
        deliveryStatus: null,
      }),
      'NEW',
    );
  });

  it('maps in-preparation order to IN_WORK', () => {
    assert.equal(
      resolveOrderBoardColumn({
        status: 'IN_PREPARATION',
        type: 'PICKUP',
        hasActiveAssignment: true,
        deliveryStatus: null,
      }),
      'IN_WORK',
    );
  });

  it('maps ready pickup to READY', () => {
    assert.equal(
      resolveOrderBoardColumn({
        status: 'READY',
        type: 'PICKUP',
        hasActiveAssignment: true,
        deliveryStatus: null,
      }),
      'READY',
    );
  });

  it('maps delivery in transit to WITH_COURIER even when order is READY', () => {
    assert.equal(
      resolveOrderBoardColumn({
        status: 'READY',
        type: 'DELIVERY',
        hasActiveAssignment: true,
        deliveryStatus: 'IN_TRANSIT',
      }),
      'WITH_COURIER',
    );
  });

  it('maps cancelled order to CANCELLED', () => {
    assert.equal(
      resolveOrderBoardColumn({
        status: 'CANCELLED',
        type: 'PICKUP',
        hasActiveAssignment: false,
        deliveryStatus: null,
      }),
      'CANCELLED',
    );
  });

  it('maps completed order to HANDED_OFF', () => {
    assert.equal(
      resolveOrderBoardColumn({
        status: 'COMPLETED',
        type: 'DELIVERY',
        hasActiveAssignment: false,
        deliveryStatus: 'DELIVERED',
      }),
      'HANDED_OFF',
    );
  });
});
