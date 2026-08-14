'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'src', 'renderer', 'index.html'), 'utf8');
const renderer = fs.readFileSync(path.join(root, 'src', 'renderer', 'renderer.js'), 'utf8');
const preload = fs.readFileSync(path.join(root, 'src', 'main', 'preload.cjs'), 'utf8');
const main = fs.readFileSync(path.join(root, 'src', 'main', 'main.cjs'), 'utf8');
const css = fs.readFileSync(path.join(root, 'src', 'renderer', 'styles.css'), 'utf8');

test('one table button opens import and export options', () => {
  assert.match(html, /id="dataMenuButton"/);
  assert.match(html, /id="importDataOption"/);
  assert.match(html, /id="exportDataOption"/);
  assert.doesNotMatch(html, /id="importDataButton"|id="exportDataButton"/);
  assert.match(renderer, /api\.importWorkbook\(\)/);
  assert.match(renderer, /api\.exportWorkbook\(\)/);
  assert.match(preload, /vault:import-workbook/);
  assert.match(preload, /vault:export-workbook/);
});

test('records use optional subscription and prepaid switches instead of record types', () => {
  assert.match(html, /id="hasSubscriptionInput"/);
  assert.match(html, /id="subscriptionFields"/);
  assert.match(html, /id="isPrepaidInput"/);
  assert.doesNotMatch(html, /name="recordType"|普通账号|订阅账号/);
  assert.match(renderer, /hasSubscription: \$\('#hasSubscriptionInput'\)\.checked/);
  assert.match(renderer, /isPrepaid: \$\('#isPrepaidInput'\)\.checked/);
});

test('blank credentials render as dashes and rows do not repeat field labels', () => {
  assert.match(html, /id="recordColumnHeadings"/);
  assert.match(renderer, /const account = item\.account \|\| '-'/);
  assert.match(renderer, /const password = item\.password \|\| '-'/);
  assert.doesNotMatch(renderer, /未填写账号|未填写密码|无到期日|无费用/);
  assert.doesNotMatch(renderer, /class="cell-label"|class="credential-tag"/);
});

test('record features are not repeated beside the category and prepaid appears on the right', () => {
  assert.doesNotMatch(renderer, /record-feature-badge|const badges/);
  assert.match(renderer, /const prepaidText = item\.isPrepaid \? '<span class="prepaid-text">充值<\/span>'/);
  assert.match(renderer, /class="amount-cell"[^\n]+prepaidText/);
});

test('subscription filter composes with category and search filters', () => {
  assert.match(html, /id="subscriptionFilterButton"/);
  assert.match(renderer, /subscriptionMatch = !state\.subscriptionOnly \|\| item\.hasSubscription/);
  assert.match(renderer, /categoryMatch && subscriptionMatch && \(!query \|\| text\.includes\(query\)\)/);
});

test('category order controls persist through a dedicated IPC method', () => {
  assert.match(renderer, /data-category-action="move-up"/);
  assert.match(renderer, /data-category-action="move-down"/);
  assert.match(renderer, /api\.moveCategory\(/);
  assert.match(preload, /vault:category:move/);
  assert.match(main, /ipcMain\.handle\('vault:category:move'/);
});

test('exchange rates refresh and theme only exposes interface opacity', () => {
  const themeMarkup = html.match(/<div id="themeModal"[\s\S]*?<\/section>\s*<\/div>/)?.[0] ?? '';
  assert.match(main, /net\.fetch\(EXCHANGE_RATE_URL/);
  assert.match(main, /exchange-rates:refresh/);
  assert.match(renderer, /monthlyEquivalentCny/);
  assert.match(themeMarkup, /id="interfaceOpacityInput"/);
  assert.match(themeMarkup, /class="modal-footer theme-footer"/);
  assert.doesNotMatch(themeMarkup, /type="checkbox"/);
  assert.match(renderer, /updatePreferences\(\{ interfaceOpacity: 100 \}\)/);
});

test('modal mask stays inside the main shell and remains lightly transparent', () => {
  assert.match(css, /\.modal-layer\s*\{[^}]*inset:\s*68px[^}]*background:\s*rgba\(4,12,22,\.30\)/s);
});
