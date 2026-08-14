'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const ExcelJS = require('exceljs');
const { readReadableWorkbook, sheetName, writeReadableWorkbook } = require('../src/shared/workbook.cjs');

function workbookFixture() {
  return {
    categories: [
      { id: 'mail', name: '邮箱', color: '#72A7FF' },
      { id: 'ai', name: 'AI 服务', color: '#B38AFF' }
    ],
    records: [
      { title: 'Gmail', categoryId: 'mail', account: 'user@example.test', password: 'readable-password', address: 'https://mail.example.test', hasSubscription: false, isPrepaid: false, notes: '邮箱' },
      { title: 'DeepSeek', categoryId: 'ai', hasSubscription: false, isPrepaid: true, notes: '按量消费' },
      { title: 'AI Pro', categoryId: 'ai', account: 'ai@example.test', password: 'plain-secret', address: 'https://ai.example.test/account', hasSubscription: true, isPrepaid: false, expiresAt: '2026-09-01', billingCycle: 'monthly', amount: 19.9, currency: 'USD', notes: '自动续费' }
    ]
  };
}

test('workbook export creates one readable worksheet per category', async (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'subscription-workbook-'));
  const file = path.join(directory, 'export.xlsx');
  context.after(() => fs.rmSync(directory, { recursive: true, force: true }));

  const result = await writeReadableWorkbook(file, workbookFixture());
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(file);

  assert.equal(result.sheetCount, 2);
  assert.deepEqual(workbook.worksheets.map((sheet) => sheet.name), ['邮箱', 'AI 服务']);
  assert.equal(workbook.getWorksheet('邮箱').getCell('A2').value, 'Gmail');
  assert.equal(workbook.getWorksheet('邮箱').getCell('C2').value, 'readable-password');
  assert.equal(workbook.getWorksheet('邮箱').getCell('E2').value, '否');
  assert.equal(workbook.getWorksheet('邮箱').getCell('F2').value, null);
  assert.equal(workbook.getWorksheet('邮箱').getCell('H2').value, null);
  assert.equal(workbook.getWorksheet('AI 服务').getCell('A2').value, 'DeepSeek');
  assert.equal(workbook.getWorksheet('AI 服务').getCell('B2').value, null);
  assert.equal(workbook.getWorksheet('AI 服务').getCell('C2').value, null);
  assert.equal(workbook.getWorksheet('AI 服务').getCell('J2').value, '是');
  assert.equal(workbook.getWorksheet('AI 服务').getCell('E3').value, '是');
  assert.equal(workbook.getWorksheet('AI 服务').getCell('H3').value, 19.9);
  assert.equal(workbook.getWorksheet('AI 服务').views[0].state, 'frozen');
});

test('workbook import reads exported sheets back as plaintext records', async (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'subscription-workbook-'));
  const file = path.join(directory, 'roundtrip.xlsx');
  context.after(() => fs.rmSync(directory, { recursive: true, force: true }));

  await writeReadableWorkbook(file, workbookFixture());
  const parsed = await readReadableWorkbook(file);

  assert.deepEqual(parsed.categories.map((item) => item.name), ['邮箱', 'AI 服务']);
  assert.equal(parsed.records[0].categoryName, '邮箱');
  assert.equal(parsed.records[0].password, 'readable-password');
  assert.equal(parsed.records[1].title, 'DeepSeek');
  assert.equal(parsed.records[1].isPrepaid, true);
  assert.equal(parsed.records[1].hasSubscription, false);
  assert.equal(parsed.records[2].hasSubscription, true);
  assert.equal(parsed.records[2].expiresAt, '2026-09-01');
  assert.equal(parsed.records[2].billingCycle, 'monthly');
  assert.equal(parsed.records[2].amount, '19.9');
});

test('worksheet names remove Excel-invalid characters and remain unique', () => {
  const names = new Set();
  assert.equal(sheetName('工作/账号', names), '工作 账号');
  assert.equal(sheetName('工作/账号', names), '工作 账号 (2)');
  assert.equal(sheetName('A'.repeat(40), names).length, 31);
});
