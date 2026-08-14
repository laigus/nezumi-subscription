'use strict';

const DAY_MS = 24 * 60 * 60 * 1000;

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseLocalDate(dateText) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateText || ''))) return null;
  const [year, month, day] = dateText.split('-').map(Number);
  const value = new Date(year, month - 1, day, 12, 0, 0, 0);
  if (value.getFullYear() !== year || value.getMonth() !== month - 1 || value.getDate() !== day) return null;
  return value;
}

function daysUntil(dateText, now = new Date()) {
  const target = parseLocalDate(dateText);
  if (!target) return Number.POSITIVE_INFINITY;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / DAY_MS);
}

function expiryState(dateText, reminderDays = 14, now = new Date()) {
  const days = daysUntil(dateText, now);
  if (!Number.isFinite(days)) return { level: 'unknown', days, label: '日期待确认' };
  if (days < 0) return { level: 'expired', days, label: `已过期 ${Math.abs(days)} 天` };
  if (days === 0) return { level: 'urgent', days, label: '今天到期' };
  if (days <= 3) return { level: 'urgent', days, label: `${days} 天后到期` };
  if (days <= reminderDays) return { level: 'soon', days, label: `${days} 天后到期` };
  return { level: 'normal', days, label: `${days} 天后到期` };
}

function monthlyEquivalent(amount, billingCycle) {
  const value = Number(amount) || 0;
  const factors = { monthly: 1, quarterly: 1 / 3, yearly: 1 / 12, once: 0, none: 0 };
  return value * (factors[billingCycle] ?? 1);
}

function normalizeRecord(input = {}) {
  const title = String(input.title || '').trim();
  const hasSubscription = Boolean(input.hasSubscription);
  const isPrepaid = Boolean(input.isPrepaid);
  const expiresAt = hasSubscription ? String(input.expiresAt || '').trim() : '';
  const amount = hasSubscription ? Number(input.amount) : 0;
  if (!title) throw new Error('记录名称不能为空');
  if (hasSubscription && !parseLocalDate(expiresAt)) throw new Error('开启订阅后需要填写有效的到期日');
  if (hasSubscription && (!Number.isFinite(amount) || amount < 0)) throw new Error('金额必须是大于或等于 0 的数字');
  return {
    title: title.slice(0, 80),
    categoryId: String(input.categoryId || ''),
    account: String(input.account || '').trim().slice(0, 240),
    password: String(input.password || ''),
    passwordTouched: Boolean(input.passwordTouched),
    address: String(input.address || '').trim().slice(0, 1000),
    hasSubscription,
    isPrepaid,
    expiresAt,
    amount: hasSubscription ? Math.round(amount * 100) / 100 : 0,
    currency: ['CNY', 'USD', 'EUR', 'JPY', 'HKD'].includes(input.currency) ? input.currency : 'CNY',
    billingCycle: hasSubscription && ['monthly', 'quarterly', 'yearly', 'once'].includes(input.billingCycle) ? input.billingCycle : 'none',
    notes: String(input.notes || '').trim().slice(0, 2000)
  };
}

function isSafeWebAddress(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

module.exports = {
  DAY_MS,
  daysUntil,
  expiryState,
  isSafeWebAddress,
  localDateKey,
  monthlyEquivalent,
  normalizeRecord,
  parseLocalDate
};
