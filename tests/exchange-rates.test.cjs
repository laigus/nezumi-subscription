'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  DEFAULT_EXCHANGE_RATES,
  convertToCny,
  exchangeRatesNeedRefresh,
  normalizeExchangeRates,
  parseFrankfurterRates
} = require('../src/shared/exchange-rates.cjs');

test('Frankfurter rates are inverted into CNY per currency unit', () => {
  const now = new Date('2026-08-14T00:00:00.000Z');
  const rates = parseFrankfurterRates({
    base: 'CNY',
    date: '2026-08-13',
    rates: { USD: 0.145, EUR: 0.126, JPY: 23.1, HKD: 1.134 }
  }, now);

  assert.equal(rates.date, '2026-08-13');
  assert.equal(rates.updatedAt, now.toISOString());
  assert.equal(rates.source, 'frankfurter');
  assert.ok(Math.abs(rates.cnyPerUnit.USD - (1 / 0.145)) < 1e-7);
  assert.ok(Math.abs(convertToCny(10, 'USD', rates) - (10 / 0.145)) < 1e-6);
});

test('invalid or missing rates fall back to the last cached values', () => {
  const cached = normalizeExchangeRates({
    date: '2026-08-12',
    updatedAt: '2026-08-12T00:00:00.000Z',
    source: 'frankfurter',
    cnyPerUnit: { CNY: 1, USD: 7, EUR: 8, JPY: 0.05, HKD: 0.9 }
  });
  const normalized = normalizeExchangeRates({ cnyPerUnit: { USD: -1 } }, cached);
  assert.equal(normalized.cnyPerUnit.USD, 7);
  assert.equal(normalized.cnyPerUnit.EUR, 8);
  assert.equal(normalized.date, '2026-08-12');
  assert.equal(convertToCny(100, 'JPY', normalized), 5);
  assert.equal(normalizeExchangeRates().cnyPerUnit.USD, DEFAULT_EXCHANGE_RATES.cnyPerUnit.USD);
});

test('cached rates refresh only after twelve hours', () => {
  const rates = normalizeExchangeRates({
    updatedAt: '2026-08-14T00:00:00.000Z',
    cnyPerUnit: DEFAULT_EXCHANGE_RATES.cnyPerUnit
  });
  assert.equal(exchangeRatesNeedRefresh(rates, new Date('2026-08-14T11:59:59.000Z')), false);
  assert.equal(exchangeRatesNeedRefresh(rates, new Date('2026-08-14T12:00:00.000Z')), true);
  assert.equal(exchangeRatesNeedRefresh(DEFAULT_EXCHANGE_RATES, new Date('2026-08-14T00:00:00.000Z')), true);
});
