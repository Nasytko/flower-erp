import assert from 'node:assert/strict';
import test from 'node:test';
import {
  compareWorkspacePriority,
  computeUrgency,
  resolvePrimaryAction,
  workspacePriority,
  type WorkspaceOrderCard,
} from '../../src/modules/analytics/domain/urgency.js';

test('computeUrgency levels from readyAt', () => {
  const now = new Date('2026-07-16T12:00:00.000Z');
  assert.equal(computeUrgency(null, now, 30), 'NORMAL');
  assert.equal(computeUrgency(new Date('2026-07-16T11:00:00.000Z'), now, 30), 'OVERDUE');
  assert.equal(computeUrgency(new Date('2026-07-16T12:10:00.000Z'), now, 30), 'URGENT');
  assert.equal(computeUrgency(new Date('2026-07-16T12:25:00.000Z'), now, 30), 'SOON');
  assert.equal(computeUrgency(new Date('2026-07-16T14:00:00.000Z'), now, 30), 'NORMAL');
});

test('workspacePriority overdue before soon before prep', () => {
  const now = new Date('2026-07-16T12:00:00.000Z');
  assert.equal(workspacePriority('RESERVED', new Date('2026-07-16T11:00:00.000Z'), now, 30), 0);
  assert.equal(workspacePriority('RESERVED', new Date('2026-07-16T12:20:00.000Z'), now, 30), 1);
  assert.equal(workspacePriority('IN_PREPARATION', null, now, 30), 2);
});

test('compareWorkspacePriority sorts by priority then readyAt', () => {
  const base = {
    number: 'A',
    status: 'RESERVED',
    type: 'PICKUP',
    occasion: 'OTHER',
    customerNameSnapshot: null,
    assignedFloristId: null,
    hasActiveAssignment: false,
    hasDeficit: false,
    version: 1,
    urgency: 'NORMAL' as const,
    primaryAction: 'CLAIM' as const,
  };
  const a: WorkspaceOrderCard = {
    ...base,
    id: '1',
    number: 'B',
    readyAt: new Date('2026-07-16T13:00:00.000Z'),
    priority: 1,
  };
  const b: WorkspaceOrderCard = {
    ...base,
    id: '2',
    number: 'A',
    readyAt: new Date('2026-07-16T12:30:00.000Z'),
    priority: 1,
  };
  const c: WorkspaceOrderCard = {
    ...base,
    id: '3',
    number: 'C',
    readyAt: null,
    priority: 0,
  };
  const sorted = [a, b, c].sort(compareWorkspacePriority);
  assert.deepEqual(
    sorted.map((x) => x.id),
    ['3', '2', '1'],
  );
});

test('resolvePrimaryAction for florist work states', () => {
  assert.equal(
    resolvePrimaryAction({
      status: 'RESERVED',
      hasActiveAssignment: false,
      assignedToCurrentUser: false,
      hasActiveSale: false,
    }),
    'CLAIM',
  );
  assert.equal(
    resolvePrimaryAction({
      status: 'RESERVED',
      hasActiveAssignment: true,
      assignedToCurrentUser: true,
      hasActiveSale: false,
    }),
    'START_PREPARATION',
  );
  assert.equal(
    resolvePrimaryAction({
      status: 'IN_PREPARATION',
      hasActiveAssignment: true,
      assignedToCurrentUser: true,
      hasActiveSale: false,
    }),
    'EDIT_ACTUAL',
  );
  assert.equal(
    resolvePrimaryAction({
      status: 'READY',
      hasActiveAssignment: true,
      assignedToCurrentUser: true,
      hasActiveSale: false,
    }),
    'CREATE_SALE',
  );
  assert.equal(
    resolvePrimaryAction({
      status: 'READY',
      hasActiveAssignment: true,
      assignedToCurrentUser: true,
      hasActiveSale: true,
    }),
    'VIEW',
  );
});
