const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');
const pkg = JSON.parse(read('package.json'));

test('user-facing brand is consistent across the application', () => {
  assert.equal(pkg.build.productName, '账耗');
  assert.equal(pkg.author, '账耗');
  assert.equal(pkg.build.portable.artifactName, '账耗-${version}.exe');
  assert.match(read('src', 'renderer', 'index.html'), />NEZUMI SUBSCRIPTION<\/small>/);
  assert.doesNotMatch(read('src', 'renderer', 'index.html'), /SUBSCRIPTION CRYSTAL/);
  for (const file of [
    ['README.md'],
    ['src', 'main', 'main.cjs'],
    ['src', 'shared', 'workbook.cjs'],
    ['src', 'renderer', 'index.html'],
    ['scripts', 'create-desktop-shortcut.ps1']
  ]) {
    assert.match(read(...file), /账耗/);
  }
});

test('internal identity uses the current product name', () => {
  assert.equal(pkg.name, 'nezumi-subscription');
  assert.equal(pkg.build.appId, 'local.nezumi.subscription');
});
