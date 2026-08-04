import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canDropCardOnColumn,
  ensureOrderInPreparation,
  executeCalendarMove,
} from './order-calendar-move';
import type { ApiClient } from '@flower/api-client';

function mockClient(handlers: {
  reserve?: () => Promise<{ status: string }>;
  claim?: () => Promise<{ status: string }>;
  start?: () => Promise<{ status: string }>;
  release?: () => Promise<{ status: string }>;
}) {
  return {
    reserveOrder: handlers.reserve ?? (async () => ({ status: 'RESERVED' })),
    claimOrder: handlers.claim ?? (async () => ({ status: 'RESERVED' })),
    startOrderPreparation: handlers.start ?? (async () => ({ status: 'IN_PREPARATION' })),
    releaseAssignment: handlers.release ?? (async () => ({ status: 'CONFIRMED' })),
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

test('executeCalendarMove reserves before claim when moving NEW to IN_WORK', async () => {
  const calls: string[] = [];
  await executeCalendarMove(
    mockClient({
      reserve: async () => {
        calls.push('reserve');
        return { status: 'RESERVED' };
      },
      claim: async () => {
        calls.push('claim');
        return { status: 'RESERVED' };
      },
      start: async () => {
        calls.push('start');
        return { status: 'IN_PREPARATION' };
      },
    }),
    {
      organizationId: 'org',
      storeId: 'store',
      card: { id: 'order-1', status: 'CONFIRMED', column: 'NEW' } as never,
      fromColumn: 'NEW',
      toColumn: 'IN_WORK',
    },
  );
  assert.deepEqual(calls, ['reserve', 'claim', 'start']);
});

test('executeCalendarMove does not claim when reservation fails', async () => {
  let claimed = false;
  await assert.rejects(() =>
    executeCalendarMove(
      mockClient({
        reserve: async () => {
          throw new Error('not enough stock');
        },
        claim: async () => {
          claimed = true;
          return { status: 'RESERVED' };
        },
      }),
      {
        organizationId: 'org',
        storeId: 'store',
        card: { id: 'order-1', status: 'CONFIRMED', column: 'NEW' } as never,
        fromColumn: 'NEW',
        toColumn: 'IN_WORK',
      },
    ),
  );
  assert.equal(claimed, false);
});

test('executeCalendarMove rolls back claim when start preparation fails', async () => {
  let released = false;
  await assert.rejects(() =>
    executeCalendarMove(
      mockClient({
        reserve: async () => ({ status: 'RESERVED' }),
        claim: async () => ({ status: 'RESERVED' }),
        start: async () => {
          throw new Error('start failed');
        },
        release: async () => {
          released = true;
          return { status: 'RESERVED' };
        },
      }),
      {
        organizationId: 'org',
        storeId: 'store',
        card: { id: 'order-1', status: 'CONFIRMED', column: 'NEW' } as never,
        fromColumn: 'NEW',
        toColumn: 'IN_WORK',
      },
    ),
  );
  assert.equal(released, true);
});

test('executeCalendarMove releases assignment when moving IN_WORK to NEW', async () => {
  let released = false;
  await executeCalendarMove(
    mockClient({
      release: async () => {
        released = true;
        return { status: 'RESERVED' };
      },
    }),
    {
      organizationId: 'org',
      storeId: 'store',
      card: { id: 'order-1', status: 'RESERVED', column: 'IN_WORK' } as never,
      fromColumn: 'IN_WORK',
      toColumn: 'NEW',
    },
  );
  assert.equal(released, true);
});

test('executeCalendarMove blocks IN_WORK to NEW when preparation already started', async () => {
  await assert.rejects(
    () =>
      executeCalendarMove(
        mockClient({}),
        {
          organizationId: 'org',
          storeId: 'store',
          card: { id: 'order-1', status: 'IN_PREPARATION', column: 'IN_WORK' } as never,
          fromColumn: 'IN_WORK',
          toColumn: 'NEW',
        },
      ),
    /сборка уже начата/i,
  );
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

test('canDropCardOnColumn allows IN_WORK to NEW when preparation not started', () => {
  assert.equal(
    canDropCardOnColumn('IN_WORK', 'NEW', {
      ...pickupReady,
      column: 'IN_WORK',
      status: 'RESERVED',
    } as never),
    true,
  );
});

test('canDropCardOnColumn blocks IN_WORK to NEW when IN_PREPARATION', () => {
  assert.equal(
    canDropCardOnColumn('IN_WORK', 'NEW', {
      ...pickupReady,
      column: 'IN_WORK',
      status: 'IN_PREPARATION',
    } as never),
    false,
  );
});

test('canDropCardOnColumn blocks skipping columns for delivery', () => {
  assert.equal(
    canDropCardOnColumn('IN_WORK', 'WITH_COURIER', { ...deliveryReady, column: 'IN_WORK' } as never),
    false,
  );
});
