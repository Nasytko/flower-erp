import assert from 'node:assert/strict';
import test from 'node:test';
import {
  allocateSequentialCode,
  formatSequentialCode,
  parseSequentialCodeSeq,
} from '../../src/infrastructure/ids/allocate-sequential-code.js';

test('formatSequentialCode uses zero-padded counter', () => {
  assert.equal(formatSequentialCode('ITM', 3), 'ITM-0003');
  assert.equal(formatSequentialCode('BOQ', 42), 'BOQ-0042');
});

test('parseSequentialCodeSeq reads simple codes and ignores legacy date format', () => {
  assert.equal(parseSequentialCodeSeq('ITM-0012', 'ITM'), 12);
  assert.equal(parseSequentialCodeSeq('ITM-20260724-0012', 'ITM'), null);
});

test('allocateSequentialCode increments from existing prefix list', async () => {
  const taken = new Set(['ITM-0001', 'ITM-0002']);
  const number = await allocateSequentialCode(
    'ITM',
    async (candidate) => taken.has(candidate),
    {
      listExistingWithPrefix: async () => ['ITM-0001', 'ITM-0002', 'ITM-20260724-0099'],
    },
  );
  assert.equal(number, 'ITM-0003');
});
