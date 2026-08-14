'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { daysUntil, expiryState, isSafeWebAddress, monthlyEquivalent, normalizeRecord, parseLocalDate } = require('../src/shared/domain.cjs');
const { roundedWindowShape, shapeContainsPoint } = require('../src/shared/window-shape.cjs');

const NOW = new Date(2026, 7, 12, 9, 30);

test('local calendar dates remain stable across time-of-day boundaries', () => {
  assert.equal(daysUntil('2026-08-12', NOW), 0);
  assert.equal(daysUntil('2026-08-13', NOW), 1);
  assert.equal(daysUntil('2026-08-11', NOW), -1);
  assert.equal(parseLocalDate('2026-02-30'), null);
});

test('expiry state separates expired, urgent, soon and normal subscriptions', () => {
  assert.equal(expiryState('2026-08-10', 14, NOW).level, 'expired');
  assert.equal(expiryState('2026-08-12', 14, NOW).level, 'urgent');
  assert.equal(expiryState('2026-08-15', 14, NOW).level, 'urgent');
  assert.equal(expiryState('2026-08-20', 14, NOW).level, 'soon');
  assert.equal(expiryState('2026-09-20', 14, NOW).level, 'normal');
});

test('monthly equivalent respects each billing cycle', () => {
  assert.equal(monthlyEquivalent(120, 'yearly'), 10);
  assert.equal(monthlyEquivalent(30, 'quarterly'), 10);
  assert.equal(monthlyEquivalent(12, 'monthly'), 12);
  assert.equal(monthlyEquivalent(999, 'once'), 0);
  assert.equal(monthlyEquivalent(999, 'none'), 0);
});

test('optional subscription validation trims input and rejects invalid amounts and dates', () => {
  const clean = normalizeRecord({ hasSubscription: true, title: '  云服务  ', expiresAt: '2026-09-01', amount: '29.999', billingCycle: 'yearly' });
  assert.equal(clean.title, '云服务');
  assert.equal(clean.amount, 30);
  assert.equal(clean.hasSubscription, true);
  assert.throws(() => normalizeRecord({ hasSubscription: true, title: '', expiresAt: '2026-09-01', amount: 1 }), /名称/);
  assert.throws(() => normalizeRecord({ hasSubscription: true, title: 'A', expiresAt: 'bad', amount: 1 }), /到期日/);
  assert.throws(() => normalizeRecord({ hasSubscription: true, title: 'A', expiresAt: '2026-09-01', amount: -1 }), /金额/);
});

test('record without subscription can still be marked as prepaid', () => {
  const clean = normalizeRecord({ title: ' DeepSeek ', isPrepaid: true, expiresAt: 'bad', amount: 'bad', billingCycle: 'yearly' });
  assert.equal(clean.title, 'DeepSeek');
  assert.equal(clean.hasSubscription, false);
  assert.equal(clean.isPrepaid, true);
  assert.equal(clean.expiresAt, '');
  assert.equal(clean.amount, 0);
  assert.equal(clean.billingCycle, 'none');
});

test('only HTTP(S) addresses can be opened externally', () => {
  assert.equal(isSafeWebAddress('https://example.test/account'), true);
  assert.equal(isSafeWebAddress('http://localhost:3000'), true);
  assert.equal(isSafeWebAddress('file:///etc/passwd'), false);
  assert.equal(isSafeWebAddress('javascript:alert(1)'), false);
});

test('native rounded shape removes corner pixels while retaining window edges', () => {
  const shape = roundedWindowShape(1180, 760, 28);
  assert.equal(shapeContainsPoint(shape, 0, 0), false);
  assert.equal(shapeContainsPoint(shape, 3, 3), false);
  assert.equal(shapeContainsPoint(shape, 1176, 3), false);
  assert.equal(shapeContainsPoint(shape, 3, 756), false);
  assert.equal(shapeContainsPoint(shape, 1176, 756), false);
  assert.equal(shapeContainsPoint(shape, 590, 0), true);
  assert.equal(shapeContainsPoint(shape, 0, 380), true);
  assert.equal(shapeContainsPoint(shape, 1179, 380), true);
  assert.equal(shapeContainsPoint(shape, 590, 759), true);
});
