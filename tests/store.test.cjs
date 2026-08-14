'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { VaultStore } = require('../src/main/store.cjs');

const fakeSafeStorage = {
  isEncryptionAvailable: () => true,
  encryptString: (text) => Buffer.from([...text].reverse().join(''), 'utf8'),
  decryptString: (buffer) => [...buffer.toString('utf8')].reverse().join('')
};

function createFixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nezumi-subscription-'));
  const dataFile = path.join(directory, 'vault.json');
  const store = new VaultStore({ dataFile, safeStorage: fakeSafeStorage });
  store.load();
  return { directory, dataFile, store };
}

test('vault encrypts account, password, address and notes at rest', (context) => {
  const fixture = createFixture();
  context.after(() => fs.rmSync(fixture.directory, { recursive: true, force: true }));
  const saved = fixture.store.saveRecord(null, {
    hasSubscription: true, title: '测试订阅', categoryId: 'cloud', account: 'account@example.test', password: 'secret-123', passwordTouched: true,
    address: 'https://example.test/account', expiresAt: '2026-09-01', amount: 18.8, currency: 'CNY', billingCycle: 'monthly', notes: '自动续费'
  });
  const raw = fs.readFileSync(fixture.dataFile, 'utf8');
  assert.equal(raw.includes('account@example.test'), false);
  assert.equal(raw.includes('secret-123'), false);
  assert.equal(raw.includes('https://example.test/account'), false);
  assert.equal(raw.includes('自动续费'), false);
  assert.equal(saved.account, 'account@example.test');
  assert.equal(saved.password, 'secret-123');
  assert.equal(fixture.store.bootstrap().records[0].password, 'secret-123');
});

test('editing with an untouched password preserves the existing encrypted value', (context) => {
  const fixture = createFixture();
  context.after(() => fs.rmSync(fixture.directory, { recursive: true, force: true }));
  const saved = fixture.store.saveRecord(null, {
    hasSubscription: true, title: 'A', categoryId: 'work', password: 'preserve-me', passwordTouched: true, expiresAt: '2026-09-01', amount: 1
  });
  fixture.store.saveRecord(saved.id, {
    hasSubscription: true, title: 'A+', categoryId: 'work', password: '', passwordTouched: false, expiresAt: '2026-10-01', amount: 2
  });
  const updated = fixture.store.bootstrap().records.find((item) => item.id === saved.id);
  assert.equal(updated.password, 'preserve-me');
});

test('deleting a category moves its records to the first remaining category', (context) => {
  const fixture = createFixture();
  context.after(() => fs.rmSync(fixture.directory, { recursive: true, force: true }));
  const saved = fixture.store.saveRecord(null, {
    hasSubscription: true, title: '媒体', categoryId: 'media', expiresAt: '2026-09-01', amount: 1
  });
  fixture.store.deleteCategory('media');
  const moved = fixture.store.bootstrap().records.find((item) => item.id === saved.id);
  assert.equal(moved.categoryId, 'work');
});

test('prepaid record persists without requiring subscription fields', (context) => {
  const fixture = createFixture();
  context.after(() => fs.rmSync(fixture.directory, { recursive: true, force: true }));
  const saved = fixture.store.saveRecord(null, {
    title: 'DeepSeek', categoryId: 'work', account: 'deepseek@example.test', password: 'api-secret', passwordTouched: true, isPrepaid: true
  });
  assert.equal(saved.hasSubscription, false);
  assert.equal(saved.isPrepaid, true);
  assert.equal(saved.expiresAt, '');
  assert.equal(saved.amount, 0);
  assert.equal(saved.billingCycle, 'none');
  const raw = fs.readFileSync(fixture.dataFile, 'utf8');
  assert.equal(raw.includes('api-secret'), false);
  assert.equal(raw.includes('deepseek@example.test'), false);
});

test('workbook import appends records, creates categories and encrypts plaintext fields', (context) => {
  const fixture = createFixture();
  context.after(() => fs.rmSync(fixture.directory, { recursive: true, force: true }));

  const result = fixture.store.importRecords({
    categories: [{ name: '导入类别' }],
    records: [{
      sourceSheet: '导入类别', sourceRow: 2, categoryName: '导入类别', hasSubscription: true, isPrepaid: true, title: '导入订阅',
      account: 'import@example.test', password: 'import-secret', passwordTouched: true, address: 'https://example.test/import',
      expiresAt: '2026-10-01', billingCycle: 'monthly', amount: '12.5', currency: 'CNY', notes: '表格导入'
    }]
  });

  assert.equal(result.recordCount, 1);
  assert.equal(result.categoryCount, 1);
  const imported = fixture.store.bootstrap().records.find((record) => record.title === '导入订阅');
  assert.equal(imported.account, 'import@example.test');
  assert.equal(imported.password, 'import-secret');
  assert.equal(imported.hasSubscription, true);
  assert.equal(imported.isPrepaid, true);
  assert.equal(fixture.store.bootstrap().categories.some((category) => category.name === '导入类别'), true);
  const raw = fs.readFileSync(fixture.dataFile, 'utf8');
  assert.equal(raw.includes('import@example.test'), false);
  assert.equal(raw.includes('import-secret'), false);
});

test('invalid workbook row leaves the vault unchanged', (context) => {
  const fixture = createFixture();
  context.after(() => fs.rmSync(fixture.directory, { recursive: true, force: true }));
  const before = fixture.store.bootstrap();

  assert.throws(() => fixture.store.importRecords({
    categories: [{ name: '新类别' }],
    records: [{ sourceSheet: '新类别', sourceRow: 3, categoryName: '新类别', hasSubscription: true, title: '缺少日期', expiresAt: '', amount: 1 }]
  }), /工作表“新类别”第 3 行：开启订阅后需要填写有效的到期日/);
  assert.deepEqual(fixture.store.bootstrap(), before);
});

test('theme opacity persists and removed preferences are cleaned from disk', (context) => {
  const fixture = createFixture();
  context.after(() => fs.rmSync(fixture.directory, { recursive: true, force: true }));
  assert.equal(fixture.store.bootstrap().preferences.interfaceOpacity, 100);
  const updated = fixture.store.updatePreferences({ interfaceOpacity: 68 });
  assert.equal(updated.interfaceOpacity, 68);
  fixture.store.updatePreferences({ interfaceOpacity: 49 });
  assert.equal(fixture.store.bootstrap().preferences.interfaceOpacity, 68);
  const raw = JSON.parse(fs.readFileSync(fixture.dataFile, 'utf8'));
  raw.preferences.removedThemeOption = true;
  fs.writeFileSync(fixture.dataFile, JSON.stringify(raw), 'utf8');
  fixture.store.load();
  assert.equal(fixture.store.bootstrap().preferences.interfaceOpacity, 68);
  assert.equal(Object.hasOwn(fixture.store.bootstrap().preferences, 'removedThemeOption'), false);
  assert.equal(Object.hasOwn(JSON.parse(fs.readFileSync(fixture.dataFile, 'utf8')).preferences, 'removedThemeOption'), false);
});

test('categories can move up and down without changing their records', (context) => {
  const fixture = createFixture();
  context.after(() => fs.rmSync(fixture.directory, { recursive: true, force: true }));
  const before = fixture.store.bootstrap().categories.map((category) => category.id);
  fixture.store.moveCategory('media', -1);
  assert.deepEqual(fixture.store.bootstrap().categories.map((category) => category.id), ['media', 'work', ...before.slice(2)]);
  fixture.store.moveCategory('media', 1);
  assert.deepEqual(fixture.store.bootstrap().categories.map((category) => category.id), before);
});

test('last successful exchange rates are stored for offline reuse', (context) => {
  const fixture = createFixture();
  context.after(() => fs.rmSync(fixture.directory, { recursive: true, force: true }));
  const saved = fixture.store.saveExchangeRates({
    date: '2026-08-13', updatedAt: '2026-08-14T00:00:00.000Z', source: 'frankfurter',
    cnyPerUnit: { CNY: 1, USD: 6.9, EUR: 7.9, JPY: 0.043, HKD: 0.88 }
  });
  fixture.store.load();
  assert.deepEqual(fixture.store.bootstrap().exchangeRates, saved);
});
