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
  assert.match(read('src', 'renderer', 'index.html'), />NEZUMI SUBSCRIPTION<\/small>/);
  assert.doesNotMatch(read('src', 'renderer', 'index.html'), /SUBSCRIPTION CRYSTAL/);
  for (const file of [
    ['README.md'],
    ['src', 'main', 'main.cjs'],
    ['src', 'shared', 'workbook.cjs'],
    ['src', 'renderer', 'index.html']
  ]) {
    assert.match(read(...file), /账耗/);
  }
});

test('Windows distribution uses an assisted NSIS installer', () => {
  assert.equal(pkg.scripts.dist, 'electron-builder --win nsis --x64');
  assert.equal(pkg.scripts['desktop:update'], undefined);
  assert.deepEqual(pkg.build.win.target, [{ target: 'nsis', arch: ['x64'] }]);
  assert.equal(pkg.build.portable, undefined);
  assert.equal(pkg.build.nsis.artifactName, '账耗-Setup-${version}.${ext}');
  assert.equal(pkg.build.nsis.oneClick, false);
  assert.equal(pkg.build.nsis.allowToChangeInstallationDirectory, true);
  assert.equal(pkg.build.nsis.createDesktopShortcut, true);
  assert.equal(pkg.build.nsis.createStartMenuShortcut, true);
  assert.equal(pkg.build.nsis.shortcutName, '账耗');
});

test('internal identity uses the current product name', () => {
  assert.equal(pkg.name, 'nezumi-subscription');
  assert.equal(pkg.build.appId, 'local.nezumi.subscription');
});
