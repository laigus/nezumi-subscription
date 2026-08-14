'use strict';

const ExcelJS = require('exceljs');

const WORKBOOK_COLUMNS = [
  { header: '名称', key: 'title', width: 24 },
  { header: '账号', key: 'account', width: 28 },
  { header: '密码', key: 'password', width: 26 },
  { header: '登录 / 订阅地址', key: 'address', width: 36 },
  { header: '订阅', key: 'hasSubscription', width: 10 },
  { header: '到期日', key: 'expiresAt', width: 14 },
  { header: '账期', key: 'billingCycle', width: 12 },
  { header: '金额', key: 'amount', width: 14 },
  { header: '币种', key: 'currency', width: 10 },
  { header: '已充值', key: 'isPrepaid', width: 12 },
  { header: '备注', key: 'notes', width: 34 }
];

const BILLING_CYCLE_LABELS = {
  monthly: '每月',
  quarterly: '每季度',
  yearly: '每年',
  once: '一次性'
};

const BILLING_CYCLE_VALUES = new Map([
  ['每月', 'monthly'], ['月', 'monthly'], ['monthly', 'monthly'],
  ['每季度', 'quarterly'], ['季度', 'quarterly'], ['quarterly', 'quarterly'],
  ['每年', 'yearly'], ['年', 'yearly'], ['yearly', 'yearly'],
  ['一次性', 'once'], ['一次', 'once'], ['once', 'once']
]);

const HEADER_ALIASES = {
  title: ['名称', '记录名称'],
  account: ['账号', '用户名', '邮箱'],
  password: ['密码'],
  address: ['登录/订阅地址', '地址', '登录地址', '订阅地址'],
  hasSubscription: ['订阅', '有订阅', '是否订阅'],
  expiresAt: ['到期日', '到期日期'],
  billingCycle: ['账期', '计费周期'],
  amount: ['金额', '订阅金额'],
  currency: ['币种', '货币'],
  isPrepaid: ['已充值', '充值', '按量消费'],
  notes: ['备注']
};

const MAX_IMPORT_RECORDS = 10000;

function sheetName(value, usedNames = new Set()) {
  const clean = String(value || '未分类')
    .replace(/[\\/*?:[\]]/g, ' ')
    .replace(/^'+|'+$/g, '')
    .replace(/\s+/g, ' ')
    .trim() || '未分类';
  let candidate = clean.slice(0, 31);
  let suffix = 2;
  while (usedNames.has(candidate.toLocaleLowerCase('zh-CN'))) {
    const tail = ` (${suffix})`;
    candidate = `${clean.slice(0, 31 - tail.length)}${tail}`;
    suffix += 1;
  }
  usedNames.add(candidate.toLocaleLowerCase('zh-CN'));
  return candidate;
}

function dateFromKey(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12);
}

function dateKey(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    const date = new Date(Math.round((value - 25569) * 86400000));
    return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
  }
  const text = cellText(value).trim();
  const match = text.match(/^(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})日?$/);
  if (!match) return text;
  return `${match[1]}-${String(match[2]).padStart(2, '0')}-${String(match[3]).padStart(2, '0')}`;
}

function cellText(value) {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return dateKey(value);
  if (typeof value !== 'object') return String(value);
  if (Array.isArray(value.richText)) return value.richText.map((part) => part.text || '').join('');
  if (value.text !== undefined) return String(value.text);
  if (value.hyperlink) return String(value.hyperlink);
  if (value.result !== undefined) return cellText(value.result);
  return '';
}

function normalizedHeader(value) {
  return cellText(value).replace(/\s+/g, '').trim().toLocaleLowerCase('zh-CN');
}

function headerIndexes(row) {
  const raw = new Map();
  row.eachCell({ includeEmpty: false }, (cell, columnNumber) => raw.set(normalizedHeader(cell.value), columnNumber));
  return Object.fromEntries(Object.entries(HEADER_ALIASES).map(([key, aliases]) => {
    const index = aliases.map((alias) => raw.get(normalizedHeader(alias))).find(Boolean) || 0;
    return [key, index];
  }));
}

function normalizeBoolean(value, fallback, label) {
  const text = cellText(value).replace(/\s+/g, '').toLocaleLowerCase('zh-CN');
  if (!text) return Boolean(fallback);
  if (['是', '有', 'true', '1', 'yes'].includes(text)) return true;
  if (['否', '无', 'false', '0', 'no'].includes(text)) return false;
  throw new Error(`${label}应填写“是”或“否”`);
}

function normalizeBillingCycle(value, isSubscription) {
  if (!isSubscription) return 'none';
  const text = cellText(value).replace(/\s+/g, '').toLocaleLowerCase('zh-CN');
  if (!text) return 'monthly';
  const cycle = BILLING_CYCLE_VALUES.get(text);
  if (!cycle) throw new Error('账期应为每月、每季度、每年或一次性');
  return cycle;
}

function createReadableWorkbook(data) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = '账耗';
  workbook.lastModifiedBy = '账耗';
  workbook.created = new Date();
  workbook.modified = new Date();
  workbook.subject = '账号与订阅明文导出';
  workbook.description = '每个类别使用独立工作表；可编辑后重新导入账耗。';

  const categories = Array.isArray(data?.categories) ? data.categories : [];
  const records = Array.isArray(data?.records) ? data.records : [];
  const categoryIds = new Set(categories.map((category) => category.id));
  const groups = categories.map((category) => ({ ...category, records: records.filter((record) => record.categoryId === category.id) }));
  const uncategorized = records.filter((record) => !categoryIds.has(record.categoryId));
  if (uncategorized.length || !groups.length) groups.push({ id: '', name: '未分类', color: '#7FA2D9', records: uncategorized });

  const usedNames = new Set();
  for (const category of groups) {
    const name = sheetName(category.name, usedNames);
    const color = /^#[0-9A-F]{6}$/i.test(category.color || '') ? category.color.slice(1).toUpperCase() : '7FA2D9';
    const worksheet = workbook.addWorksheet(name, {
      properties: { defaultRowHeight: 23, tabColor: { argb: `FF${color}` } },
      views: [{ state: 'frozen', ySplit: 1, showGridLines: false }],
      pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 }
    });
    worksheet.columns = WORKBOOK_COLUMNS.map((column) => ({ ...column }));

    for (const record of category.records) {
      const hasSubscription = Boolean(record.hasSubscription);
      worksheet.addRow({
        title: record.title || '',
        account: record.account || null,
        password: record.password || null,
        address: record.address || null,
        hasSubscription: hasSubscription ? '是' : '否',
        expiresAt: hasSubscription ? dateFromKey(record.expiresAt) : null,
        billingCycle: hasSubscription ? (BILLING_CYCLE_LABELS[record.billingCycle] || '') : null,
        amount: hasSubscription ? Number(record.amount) || 0 : null,
        currency: hasSubscription ? record.currency || 'CNY' : null,
        isPrepaid: record.isPrepaid ? '是' : '否',
        notes: record.notes || null
      });
    }

    const lastRow = Math.max(1, worksheet.rowCount);
    worksheet.autoFilter = `A1:K${lastRow}`;
    worksheet.pageSetup.printTitlesRow = '1:1';
    worksheet.getRow(1).height = 28;
    worksheet.getRow(1).eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF173B62' } };
      cell.font = { name: 'Microsoft YaHei UI', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.alignment = { vertical: 'middle', horizontal: 'left' };
      cell.border = { bottom: { style: 'medium', color: { argb: `FF${color}` } } };
    });
    for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
      const row = worksheet.getRow(rowNumber);
      row.height = 25;
      row.font = { name: 'Microsoft YaHei UI', size: 11, color: { argb: 'FF203247' } };
      row.alignment = { vertical: 'middle' };
      if (rowNumber % 2 === 0) {
        row.eachCell({ includeEmpty: true }, (cell) => {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F7FB' } };
        });
      }
      row.getCell(4).alignment = { vertical: 'middle', wrapText: true };
      row.getCell(11).alignment = { vertical: 'middle', wrapText: true };
    }
    worksheet.getColumn('expiresAt').numFmt = 'yyyy-mm-dd';
    worksheet.getColumn('amount').numFmt = '#,##0.00';
    for (const key of ['account', 'password', 'address', 'notes']) worksheet.getColumn(key).numFmt = '@';
    worksheet.dataValidations.add('E2:E10001', { type: 'list', allowBlank: false, formulae: ['"是,否"'] });
    worksheet.dataValidations.add('G2:G10001', { type: 'list', allowBlank: true, formulae: ['"每月,每季度,每年,一次性"'] });
    worksheet.dataValidations.add('J2:J10001', { type: 'list', allowBlank: false, formulae: ['"是,否"'] });
  }

  return workbook;
}

async function writeReadableWorkbook(filePath, data) {
  const workbook = createReadableWorkbook(data);
  await workbook.xlsx.writeFile(filePath);
  return { sheetCount: workbook.worksheets.length, recordCount: Array.isArray(data?.records) ? data.records.length : 0 };
}

async function readReadableWorkbook(filePath) {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.readFile(filePath);
  } catch (error) {
    throw new Error(`表格读取失败：${error.message}`);
  }

  const categories = [];
  const records = [];
  let ignoredSheetCount = 0;
  for (const worksheet of workbook.worksheets) {
    const indexes = headerIndexes(worksheet.getRow(1));
    if (!indexes.title) {
      ignoredSheetCount += 1;
      continue;
    }
    const categoryName = String(worksheet.name || '未分类').trim().slice(0, 20) || '未分类';
    categories.push({ name: categoryName });

    for (let rowNumber = 2; rowNumber <= worksheet.actualRowCount; rowNumber += 1) {
      const row = worksheet.getRow(rowNumber);
      const value = (key) => indexes[key] ? row.getCell(indexes[key]).value : '';
      const raw = {
        title: cellText(value('title')).trim(),
        account: cellText(value('account')).trim(),
        password: cellText(value('password')),
        address: cellText(value('address')).trim(),
        hasSubscription: value('hasSubscription'),
        expiresAt: dateKey(value('expiresAt')),
        billingCycle: cellText(value('billingCycle')).trim(),
        amount: cellText(value('amount')).replaceAll(',', '').trim(),
        currency: cellText(value('currency')).trim().toUpperCase(),
        isPrepaid: value('isPrepaid'),
        notes: cellText(value('notes')).trim()
      };
      if (Object.values(raw).every((item) => cellText(item) === '')) continue;
      try {
        const inferredSubscription = raw.expiresAt || raw.billingCycle || raw.amount !== '' || raw.currency;
        raw.hasSubscription = normalizeBoolean(raw.hasSubscription, inferredSubscription, '订阅');
        raw.isPrepaid = normalizeBoolean(raw.isPrepaid, false, '已充值');
        raw.billingCycle = normalizeBillingCycle(raw.billingCycle, raw.hasSubscription);
      } catch (error) {
        throw new Error(`工作表“${worksheet.name}”第 ${rowNumber} 行：${error.message}`);
      }
      records.push({
        ...raw,
        categoryName,
        currency: raw.currency || 'CNY',
        passwordTouched: true,
        sourceSheet: worksheet.name,
        sourceRow: rowNumber
      });
      if (records.length > MAX_IMPORT_RECORDS) throw new Error(`单次最多导入 ${MAX_IMPORT_RECORDS} 条记录`);
    }
  }

  if (!categories.length) throw new Error('没有找到包含“名称”列的类别工作表');
  return { categories, records, ignoredSheetCount };
}

module.exports = {
  BILLING_CYCLE_LABELS,
  MAX_IMPORT_RECORDS,
  WORKBOOK_COLUMNS,
  createReadableWorkbook,
  readReadableWorkbook,
  sheetName,
  writeReadableWorkbook
};
