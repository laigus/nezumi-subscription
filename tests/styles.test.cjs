'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const css = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'styles.css'), 'utf8');

function fontSizeFor(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const block = css.match(new RegExp(`${escaped}\\s*\\{([^}]+)\\}`));
  assert.ok(block, `Missing CSS rule for ${selector}`);
  const size = block[1].match(/font-size:\s*(\d+)px/);
  assert.ok(size, `Missing font size for ${selector}`);
  return Number(size[1]);
}

test('main view keeps labels and record details readable', () => {
  const minimums = new Map([
    ['.category-button', 13],
    ['.stat-card span', 12],
    ['.stat-card small', 11],
    ['.list-heading select', 12],
    ['.record-column-headings', 11],
    ['.filter-button', 12],
    ['.credential-value', 13],
    ['.expiry-date', 13]
  ]);
  for (const [selector, minimum] of minimums) {
    assert.ok(fontSizeFor(selector) >= minimum, `${selector} must be at least ${minimum}px`);
  }
});

test('record editor keeps optional feature controls, labels and inputs readable', () => {
  const minimums = new Map([
    ['.field', 13],
    ['.feature-toggle strong', 14],
    ['.feature-toggle small', 12],
    ['.field input, .field select, .field textarea, .category-add-row input[type="text"], .category-add-row > input:not([type="color"])', 13]
  ]);
  for (const [selector, minimum] of minimums) {
    assert.ok(fontSizeFor(selector) >= minimum, `${selector} must be at least ${minimum}px`);
  }
});

test('category manager uses a styled compact scrollbar', () => {
  assert.match(css, /\.category-editor-list::-webkit-scrollbar\s*\{[^}]*width:\s*7px/s);
  assert.match(css, /\.category-editor-list::-webkit-scrollbar-thumb\s*\{[^}]*linear-gradient/s);
});

test('record editor uses an inset glass scrollbar', () => {
  assert.match(css, /\.record-modal::-webkit-scrollbar\s*\{[^}]*width:\s*8px/s);
  assert.match(css, /\.record-modal::-webkit-scrollbar-track\s*\{[^}]*background:\s*transparent/s);
  assert.match(css, /\.record-modal::-webkit-scrollbar-thumb\s*\{[^}]*border:\s*2px solid transparent[^}]*linear-gradient/s);
});
