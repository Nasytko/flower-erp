import assert from 'node:assert/strict';
import test from 'node:test';
import { canDropCardOnColumn, ensureOrderInPreparation } from './order-calendar-move';
import type { ApiClient } from '@flower/api-client';

function mockClient(handlers: {
  reserve?: () => Promise<{ status: string }>;
  start?: () => Promise<{ status: string }>;
}) {
  return {
    reserveOrder: handlers.reserve ?? (async () => ({ status: 'RESERVED' })),
    startOrderPreparation: handlers.start ?? (async () => ({ status: 'IN_PREPARATION' })),
  } as unknown as ApiClient;
}

test('ensureOrderInPreparation reserves CONFIRMED then starts preparation', async () => {
  let reserved = false;
  let started = false;
  await ensureOrderInPreparation(
    mockClient({
      reserve: async () => {
        reserved = true;
        return { status: 'RESERVED' };
      },
      start: async () => {
        started = true;
        return { status: 'IN_PREPARATION' };
      },
    }),
    'org',
    'store',
    'order-1',
    'CONFIRMED',
  );
  assert.equal(reserved, true);
  assert.equal(started, true);
});

test('ensureOrderInPreparation skips reserve when already RESERVED', async () => {
  let reserved = false;
  let started = false;
  await ensureOrderInPreparation(
    mockClient({
      reserve: async () => {
        reserved = true;
        return { status: 'RESERVED' };
      },
      start: async () => {
        started = true;
        return { status: 'IN_PREPARATION' };
      },
    }),
    'org',
    'store',
    'order-1',
    'RESERVED',
  );
  assert.equal(reserved, false);
  assert.equal(started, true);
});

test('ensureOrderInPreparation is noop for IN_PREPARATION', async () => {
  let reserved = false;
  await ensureOrderInPreparation(
    mockClient({
      reserve: async () => {
        reserved = true;
        return { status: 'RESERVED' };
      },
    }),
    'org',
    'store',
    'order-1',
    'IN_PREPARATION',
  );
  assert.equal(reserved, false);
});

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
