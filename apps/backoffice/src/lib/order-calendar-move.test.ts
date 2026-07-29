import assert from 'node:assert/strict';
import test from 'node:test';
import { canDropCardOnColumn } from './order-calendar-move';

const pickupReady = {
  id: '1',
  type: 'PICKUP',
} as const;

const deliveryReady = {
  id: '2',
  type: 'DELIVERY',
  deliveryId: 'd1',
} as const;

test('canDropCardOnColumn allows pickup READY to HANDED_OFF skip', () => {
  assert.equal(
    canDropCardOnColumn('READY', 'HANDED_OFF', { ...pickupReady, column: 'READY' } as never),
    true,
  );
});

test('canDropCardOnColumn blocks pickup onto WITH_COURIER', () => {
  assert.equal(
    canDropCardOnColumn('READY', 'WITH_COURIER', { ...pickupReady, column: 'READY' } as never),
    false,
  );
});

test('canDropCardOnColumn allows adjacent NEW to IN_WORK', () => {
  assert.equal(
    canDropCardOnColumn('NEW', 'IN_WORK', { ...pickupReady, column: 'NEW' } as never),
    true,
  );
});

test('canDropCardOnColumn blocks skipping columns for delivery', () => {
  assert.equal(
    canDropCardOnColumn('IN_WORK', 'WITH_COURIER', { ...deliveryReady, column: 'IN_WORK' } as never),
    false,
  );
});
