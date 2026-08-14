'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { normalizeRecord } = require('../shared/domain.cjs');
const { DEFAULT_EXCHANGE_RATES, normalizeExchangeRates } = require('../shared/exchange-rates.cjs');

const DEFAULT_CATEGORIES = [
  { id: 'work', name: '工作', color: '#72A7FF' },
  { id: 'media', name: '影音', color: '#B38AFF' },
  { id: 'cloud', name: '云服务', color: '#55DCE7' },
  { id: 'study', name: '学习', color: '#6CE2AA' },
  { id: 'life', name: '生活', color: '#FFB86B' }
];

const DEFAULT_PREFERENCES = {
  reminderDays: 14,
  soundEnabled: true,
  pinned: true,
  interfaceOpacity: 100,
  lastNotifiedDate: ''
};

function defaultData() {
  return {
    version: 3,
    categories: structuredClone(DEFAULT_CATEGORIES),
    records: [],
    preferences: { ...DEFAULT_PREFERENCES },
    exchangeRates: structuredClone(DEFAULT_EXCHANGE_RATES)
  };
}

class VaultStore {
  constructor({ dataFile, safeStorage }) {
    this.dataFile = dataFile;
    this.safeStorage = safeStorage;
    this.data = defaultData();
  }

  load() {
    fs.mkdirSync(path.dirname(this.dataFile), { recursive: true });
    if (!fs.existsSync(this.dataFile)) {
      this.persist();
      return;
    }
    try {
      const parsed = JSON.parse(fs.readFileSync(this.dataFile, 'utf8'));
      const sourceRecords = Array.isArray(parsed.records) ? parsed.records : [];
      const sourcePreferences = parsed.preferences && typeof parsed.preferences === 'object' ? parsed.preferences : {};
      const preferences = Object.fromEntries(Object.keys(DEFAULT_PREFERENCES).map((key) => [
        key,
        Object.hasOwn(sourcePreferences, key) ? sourcePreferences[key] : DEFAULT_PREFERENCES[key]
      ]));
      const hadUnknownPreferences = Object.keys(sourcePreferences).some((key) => !Object.hasOwn(DEFAULT_PREFERENCES, key));
      if (!Number.isInteger(preferences.interfaceOpacity) || preferences.interfaceOpacity < 50 || preferences.interfaceOpacity > 100) {
        preferences.interfaceOpacity = DEFAULT_PREFERENCES.interfaceOpacity;
      }
      this.data = {
        version: 3,
        categories: Array.isArray(parsed.categories) && parsed.categories.length ? parsed.categories : structuredClone(DEFAULT_CATEGORIES),
        records: sourceRecords,
        preferences,
        exchangeRates: normalizeExchangeRates(parsed.exchangeRates)
      };
      if (!parsed.exchangeRates || hadUnknownPreferences) this.persist();
    } catch (error) {
      const brokenPath = `${this.dataFile}.broken-${Date.now()}`;
      fs.copyFileSync(this.dataFile, brokenPath);
      this.data = defaultData();
      this.persist();
      throw new Error(`数据文件格式异常，原文件已保留为 ${path.basename(brokenPath)}`);
    }
  }

  persist() {
    const tempFile = `${this.dataFile}.tmp`;
    fs.writeFileSync(tempFile, JSON.stringify(this.data, null, 2), { encoding: 'utf8', mode: 0o600 });
    if (fs.existsSync(this.dataFile)) {
      const backupFile = `${this.dataFile}.bak`;
      fs.copyFileSync(this.dataFile, backupFile);
    }
    fs.renameSync(tempFile, this.dataFile);
  }

  seal(value) {
    const text = String(value || '');
    if (!text) return '';
    if (!this.safeStorage.isEncryptionAvailable()) {
      throw new Error('系统凭据加密服务暂未就绪，请重新登录 Windows 后再试');
    }
    return `enc:v1:${this.safeStorage.encryptString(text).toString('base64')}`;
  }

  unseal(value) {
    const text = String(value || '');
    if (!text) return '';
    if (!text.startsWith('enc:v1:')) return text;
    try {
      return this.safeStorage.decryptString(Buffer.from(text.slice(7), 'base64'));
    } catch {
      return '';
    }
  }

  publicRecord(item) {
    return {
      id: item.id,
      title: item.title,
      categoryId: item.categoryId,
      account: this.unseal(item.account),
      password: this.unseal(item.password),
      address: this.unseal(item.address),
      hasSubscription: Boolean(item.hasSubscription),
      isPrepaid: Boolean(item.isPrepaid),
      expiresAt: item.expiresAt,
      amount: item.amount,
      currency: item.currency,
      billingCycle: item.billingCycle,
      notes: this.unseal(item.notes),
      createdAt: item.createdAt,
      updatedAt: item.updatedAt
    };
  }

  bootstrap() {
    return {
      categories: structuredClone(this.data.categories),
      records: this.data.records.map((item) => this.publicRecord(item)),
      preferences: { ...this.data.preferences },
      exchangeRates: structuredClone(this.data.exchangeRates)
    };
  }

  storedRecord(clean, existing, now) {
    const password = clean.passwordTouched ? this.seal(clean.password) : (existing?.password || '');
    return {
      id: existing?.id || crypto.randomUUID(),
      title: clean.title,
      categoryId: clean.categoryId,
      account: this.seal(clean.account),
      password,
      address: this.seal(clean.address),
      hasSubscription: clean.hasSubscription,
      isPrepaid: clean.isPrepaid,
      expiresAt: clean.expiresAt,
      amount: clean.amount,
      currency: clean.currency,
      billingCycle: clean.billingCycle,
      notes: this.seal(clean.notes),
      createdAt: existing?.createdAt || now,
      updatedAt: now
    };
  }

  saveRecord(id, input) {
    const clean = normalizeRecord(input);
    if (!this.data.categories.some((category) => category.id === clean.categoryId)) {
      clean.categoryId = this.data.categories[0]?.id || 'work';
    }

    const now = new Date().toISOString();
    const existingIndex = id ? this.data.records.findIndex((item) => item.id === id) : -1;
    const existing = existingIndex >= 0 ? this.data.records[existingIndex] : null;
    const next = this.storedRecord(clean, existing, now);
    if (existingIndex >= 0) this.data.records[existingIndex] = next;
    else this.data.records.push(next);
    this.persist();
    return this.publicRecord(next);
  }

  importRecords(input = {}) {
    const incomingCategories = Array.isArray(input.categories) ? input.categories : [];
    const incomingRecords = Array.isArray(input.records) ? input.records : [];
    const categories = structuredClone(this.data.categories);
    const categoryByName = new Map(categories.map((category) => [category.name.toLocaleLowerCase('zh-CN'), category]));
    let createdCategoryCount = 0;

    const ensureCategory = (value) => {
      const name = String(value || '未分类').trim().slice(0, 20) || '未分类';
      const key = name.toLocaleLowerCase('zh-CN');
      if (categoryByName.has(key)) return categoryByName.get(key);
      const palette = DEFAULT_CATEGORIES[categories.length % DEFAULT_CATEGORIES.length];
      const category = { id: crypto.randomUUID(), name, color: palette.color };
      categories.push(category);
      categoryByName.set(key, category);
      createdCategoryCount += 1;
      return category;
    };

    incomingCategories.forEach((category) => ensureCategory(category?.name));
    const now = new Date().toISOString();
    const records = [];
    for (const item of incomingRecords) {
      const category = ensureCategory(item.categoryName);
      let clean;
      try {
        clean = normalizeRecord({ ...item, categoryId: category.id, passwordTouched: true });
      } catch (error) {
        const location = item.sourceSheet && item.sourceRow ? `工作表“${item.sourceSheet}”第 ${item.sourceRow} 行：` : '';
        throw new Error(`${location}${error.message}`);
      }
      records.push(this.storedRecord(clean, null, now));
    }

    const previous = this.data;
    this.data = {
      ...previous,
      categories,
      records: [...previous.records, ...records]
    };
    try {
      this.persist();
    } catch (error) {
      this.data = previous;
      throw error;
    }
    return { recordCount: records.length, categoryCount: createdCategoryCount };
  }

  deleteRecord(id) {
    const before = this.data.records.length;
    this.data.records = this.data.records.filter((item) => item.id !== id);
    if (before !== this.data.records.length) this.persist();
    return before !== this.data.records.length;
  }

  saveCategory(input) {
    const name = String(input?.name || '').trim().slice(0, 20);
    const color = /^#[0-9a-f]{6}$/i.test(String(input?.color || '')) ? input.color.toUpperCase() : '#72A7FF';
    if (!name) throw new Error('类别名称不能为空');
    const existing = input.id && this.data.categories.find((category) => category.id === input.id);
    if (existing) {
      existing.name = name;
      existing.color = color;
    } else {
      this.data.categories.push({ id: crypto.randomUUID(), name, color });
    }
    this.persist();
    return structuredClone(this.data.categories);
  }

  deleteCategory(id) {
    if (this.data.categories.length <= 1) throw new Error('至少保留一个类别');
    const category = this.data.categories.find((item) => item.id === id);
    if (!category) return structuredClone(this.data.categories);
    this.data.categories = this.data.categories.filter((item) => item.id !== id);
    const fallbackId = this.data.categories[0].id;
    this.data.records.forEach((item) => {
      if (item.categoryId === id) item.categoryId = fallbackId;
    });
    this.persist();
    return structuredClone(this.data.categories);
  }

  moveCategory(id, offset) {
    const index = this.data.categories.findIndex((category) => category.id === id);
    const step = Number(offset);
    if (step !== -1 && step !== 1) return structuredClone(this.data.categories);
    const targetIndex = index + step;
    if (index < 0 || targetIndex < 0 || targetIndex >= this.data.categories.length) return structuredClone(this.data.categories);
    const [category] = this.data.categories.splice(index, 1);
    this.data.categories.splice(targetIndex, 0, category);
    this.persist();
    return structuredClone(this.data.categories);
  }

  saveExchangeRates(input) {
    this.data.exchangeRates = normalizeExchangeRates(input, this.data.exchangeRates);
    this.persist();
    return structuredClone(this.data.exchangeRates);
  }

  updatePreferences(patch) {
    const next = { ...this.data.preferences };
    if (typeof patch.soundEnabled === 'boolean') next.soundEnabled = patch.soundEnabled;
    if (typeof patch.pinned === 'boolean') next.pinned = patch.pinned;
    if (Number.isInteger(patch.interfaceOpacity) && patch.interfaceOpacity >= 50 && patch.interfaceOpacity <= 100) next.interfaceOpacity = patch.interfaceOpacity;
    if (Number.isInteger(patch.reminderDays) && patch.reminderDays >= 1 && patch.reminderDays <= 90) next.reminderDays = patch.reminderDays;
    if (typeof patch.lastNotifiedDate === 'string') next.lastNotifiedDate = patch.lastNotifiedDate;
    this.data.preferences = next;
    this.persist();
    return { ...next };
  }
}

module.exports = { DEFAULT_CATEGORIES, DEFAULT_PREFERENCES, VaultStore, defaultData };
