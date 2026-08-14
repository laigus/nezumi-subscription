const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const zlib = require('node:zlib');

const root = path.join(__dirname, '..');

function decodeRgbaPng(png) {
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  const chunks = [];

  for (let offset = 8; offset < png.length;) {
    const length = png.readUInt32BE(offset);
    const type = png.toString('ascii', offset + 4, offset + 8);
    if (type === 'IDAT') chunks.push(png.subarray(offset + 8, offset + 8 + length));
    offset += length + 12;
    if (type === 'IEND') break;
  }

  const encoded = zlib.inflateSync(Buffer.concat(chunks));
  const stride = width * 4;
  const pixels = Buffer.alloc(stride * height);

  for (let y = 0; y < height; y += 1) {
    const filter = encoded[y * (stride + 1)];
    const source = y * (stride + 1) + 1;
    const target = y * stride;
    for (let x = 0; x < stride; x += 1) {
      const raw = encoded[source + x];
      const left = x >= 4 ? pixels[target + x - 4] : 0;
      const up = y > 0 ? pixels[target + x - stride] : 0;
      const upperLeft = y > 0 && x >= 4 ? pixels[target + x - stride - 4] : 0;
      let value = raw;
      if (filter === 1) value += left;
      else if (filter === 2) value += up;
      else if (filter === 3) value += Math.floor((left + up) / 2);
      else if (filter === 4) {
        const estimate = left + up - upperLeft;
        const leftDistance = Math.abs(estimate - left);
        const upDistance = Math.abs(estimate - up);
        const upperLeftDistance = Math.abs(estimate - upperLeft);
        value += leftDistance <= upDistance && leftDistance <= upperLeftDistance
          ? left
          : upDistance <= upperLeftDistance ? up : upperLeft;
      } else assert.equal(filter, 0, `unsupported PNG filter ${filter}`);
      pixels[target + x] = value & 0xff;
    }
  }

  return { width, height, pixels };
}

test('generated icon master is a square RGBA PNG with a transparent outer background', () => {
  const png = fs.readFileSync(path.join(root, 'build', 'icon.png'));
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(png.toString('ascii', 12, 16), 'IHDR');
  assert.equal(png.readUInt32BE(16), 1024);
  assert.equal(png.readUInt32BE(20), 1024);
  assert.equal(png[24], 8);
  assert.equal(png[25], 6);
  assert.equal(png[28], 0);

  const { width, height, pixels } = decodeRgbaPng(png);
  const alphaAt = (x, y) => pixels[(y * width + x) * 4 + 3];
  for (let x = 0; x < width; x += 1) {
    assert.equal(alphaAt(x, 0), 0);
    assert.equal(alphaAt(x, height - 1), 0);
  }
  for (let y = 0; y < height; y += 1) {
    assert.equal(alphaAt(0, y), 0);
    assert.equal(alphaAt(width - 1, y), 0);
  }
  assert.ok(alphaAt(Math.floor(width / 2), Math.floor(height / 2)) > 0);
});

test('Windows icon contains every supported desktop size', () => {
  const ico = fs.readFileSync(path.join(root, 'build', 'icon.ico'));
  assert.equal(ico.readUInt16LE(0), 0);
  assert.equal(ico.readUInt16LE(2), 1);
  const count = ico.readUInt16LE(4);
  assert.equal(count, 9);
  const sizes = [];
  for (let index = 0; index < count; index += 1) {
    const offset = 6 + index * 16;
    const width = ico[offset] || 256;
    const height = ico[offset + 1] || 256;
    assert.equal(width, height);
    assert.equal(ico.readUInt16LE(offset + 6), 32);
    const byteLength = ico.readUInt32LE(offset + 8);
    const imageOffset = ico.readUInt32LE(offset + 12);
    assert.ok(byteLength > 0);
    assert.ok(imageOffset + byteLength <= ico.length);
    sizes.push(width);
  }
  assert.deepEqual(sizes.sort((a, b) => a - b), [16, 20, 24, 32, 40, 48, 64, 128, 256]);
});

test('packaging uses the generated Windows icon', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.equal(pkg.build.win.icon, 'build/icon.ico');
  assert.ok(pkg.build.files.includes('build/icon.ico'));
});
