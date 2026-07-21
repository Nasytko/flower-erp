import assert from 'node:assert/strict';
import test from 'node:test';
import { Money } from './money.js';

test('0.1 + 0.2 is exact as decimal string', () => {
  const sum = new Money('0.1').plus('0.2');
  assert.equal(sum.toFixed(2), '0.30');
  assert.equal(sum.toFixed(1), '0.3');
});

test('percentage discount rounds half-up to 2 places', () => {
  // 10% of 99.99 = 9.999 → 10.00
  const discount = new Money('99.99').mul('10').div('100').round(2);
  assert.equal(discount.toFixed(2), '10.00');
});

test('partial payments sum without drift', () => {
  let paid = Money.zero();
  const parts = ['33.33', '33.33', '33.34'];
  for (const p of parts) {
    paid = paid.plus(p);
  }
  assert.equal(paid.toFixed(2), '100.00');
});

test('many line amounts do not accumulate float error', () => {
  let total = Money.zero();
  for (let i = 0; i < 100; i += 1) {
    total = total.plus('0.10');
  }
  assert.equal(total.toFixed(2), '10.00');
});

test('BYN scale two decimals', () => {
  assert.equal(new Money('1.005').round(2).toFixed(2), '1.01');
  assert.equal(new Money('1.004').round(2).toFixed(2), '1.00');
});
