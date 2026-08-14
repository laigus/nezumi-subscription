'use strict';

const EXCHANGE_RATE_URL = 'https://api.frankfurter.dev/v1/latest?base=CNY&symbols=USD,EUR,JPY,HKD';
const SUPPORTED_CURRENCIES = ['CNY', 'USD', 'EUR', 'JPY', 'HKD'];
const REFRESH_INTERVAL_MS = 12 * 60 * 60 * 1000;

const DEFAULT_EXCHANGE_RATES = {
  base: 'CNY',
  date: '',
  updatedAt: '',
  source: 'builtin',
  cnyPerUnit: {
    CNY: 1,
    USD: 6.91,
    EUR: 7.94,
    JPY: 0.0433,
    HKD: 0.882
  }
};

function positiveRate(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function normalizeExchangeRates(input = {}, fallback = DEFAULT_EXCHANGE_RATES) {
  const fallbackRates = fallback?.cnyPerUnit || DEFAULT_EXCHANGE_RATES.cnyPerUnit;
  const inputRates = input?.cnyPerUnit || {};
  return {
    base: 'CNY',
    date: /^\d{4}-\d{2}-\d{2}$/.test(String(input.date || '')) ? String(input.date) : String(fallback.date || ''),
    updatedAt: Number.isFinite(Date.parse(input.updatedAt)) ? new Date(input.updatedAt).toISOString() : String(fallback.updatedAt || ''),
    source: input.source === 'frankfurter' ? 'frankfurter' : String(fallback.source || 'builtin'),
    cnyPerUnit: Object.fromEntries(SUPPORTED_CURRENCIES.map((currency) => [
      currency,
      currency === 'CNY' ? 1 : positiveRate(inputRates[currency], positiveRate(fallbackRates[currency], DEFAULT_EXCHANGE_RATES.cnyPerUnit[currency]))
    ]))
  };
}

function parseFrankfurterRates(payload, now = new Date()) {
  if (!payload || payload.base !== 'CNY' || !payload.rates) throw new Error('汇率响应格式不正确');
  const cnyPerUnit = { CNY: 1 };
  for (const currency of SUPPORTED_CURRENCIES.slice(1)) {
    const unitsPerCny = Number(payload.rates[currency]);
    if (!Number.isFinite(unitsPerCny) || unitsPerCny <= 0) throw new Error(`缺少 ${currency} 汇率`);
    cnyPerUnit[currency] = Math.round((1 / unitsPerCny) * 100000000) / 100000000;
  }
  return normalizeExchangeRates({
    date: payload.date,
    updatedAt: now.toISOString(),
    source: 'frankfurter',
    cnyPerUnit
  });
}

function convertToCny(amount, currency, exchangeRates) {
  const value = Number(amount) || 0;
  const normalized = normalizeExchangeRates(exchangeRates);
  const rate = normalized.cnyPerUnit[SUPPORTED_CURRENCIES.includes(currency) ? currency : 'CNY'];
  return value * rate;
}

function exchangeRatesNeedRefresh(exchangeRates, now = new Date()) {
  const normalized = normalizeExchangeRates(exchangeRates);
  const updatedAt = Date.parse(normalized.updatedAt);
  return !Number.isFinite(updatedAt) || now.getTime() - updatedAt >= REFRESH_INTERVAL_MS;
}

module.exports = {
  DEFAULT_EXCHANGE_RATES,
  EXCHANGE_RATE_URL,
  REFRESH_INTERVAL_MS,
  SUPPORTED_CURRENCIES,
  convertToCny,
  exchangeRatesNeedRefresh,
  normalizeExchangeRates,
  parseFrankfurterRates
};
