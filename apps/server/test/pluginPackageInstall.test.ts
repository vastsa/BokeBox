import assert from 'node:assert/strict';
import { deflateRawSync } from 'node:zlib';
import test from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  extractZipBuffer,
  listZipEntries,
} from '../src/services/plugins/zipExtract.js';
import { resolvePluginRoot } from '../src/services/plugins/pluginPackageInstall.js';

function u16(n: number): Buffer {
  const b = Buffer.alloc(2);
  b.writeUInt16LE(n, 0);
  return b;
}
function u32(n: number): Buffer {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n, 0);
  return b;
}

/** 构造仅含 store/deflate 的极简 zip */
function buildZip(
  files: Array<{ name: string; data: Buffer; method?: 0 | 8 }>,
): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const file of files) {
    const nameBuf = Buffer.from(file.name, 'utf8');
    const method = file.method ?? 0;
    const compressed =
      method === 8 ? deflateRawSync(file.data) : file.data;
    const local = Buffer.concat([
      u32(0x04034b50),
      u16(20), // version needed
      u16(0x800), // utf8 flag
      u16(method),
      u16(0),
      u16(0),
      u32(0), // crc skip
      u32(compressed.length),
      u32(file.data.length),
      u16(nameBuf.length),
      u16(0),
      nameBuf,
      compressed,
    ]);
    const central = Buffer.concat([
      u32(0x02014b50),
      u16(20),
      u16(20),
      u16(0x800),
      u16(method),
      u16(0),
      u16(0),
      u32(0),
      u32(compressed.length),
      u32(file.data.length),
      u16(nameBuf.length),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(0),
      u32(offset),
      nameBuf,
    ]);
    locals.push(local);
    centrals.push(central);
    offset += local.length;
  }

  const centralDir = Buffer.concat(centrals);
  const localDir = Buffer.concat(locals);
  const eocd = Buffer.concat([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(files.length),
    u16(files.length),
    u32(centralDir.length),
    u32(localDir.length),
    u16(0),
  ]);
  return Buffer.concat([localDir, centralDir, eocd]);
}

test('listZipEntries + extractZipBuffer 可解压 store 条目', async () => {
  const zip = buildZip([
    { name: 'plugin.json', data: Buffer.from('{"id":"demo"}', 'utf8') },
    { name: 'index.js', data: Buffer.from('export default {}', 'utf8') },
  ]);
  const entries = listZipEntries(zip);
  assert.equal(entries.length, 2);
  assert.equal(entries[0]?.name, 'plugin.json');

  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'bokebox-zip-'));
  try {
    const result = await extractZipBuffer(zip, dir);
    assert.equal(result.files, 2);
    const text = await fs.readFile(path.join(dir, 'plugin.json'), 'utf8');
    assert.equal(text, '{"id":"demo"}');
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('extractZipBuffer 拒绝路径穿越', async () => {
  const zip = buildZip([
    { name: '../evil.js', data: Buffer.from('x', 'utf8') },
  ]);
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'bokebox-zip-'));
  try {
    await assert.rejects(() => extractZipBuffer(zip, dir), /穿越|逃逸|非法/);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('resolvePluginRoot 支持单层包裹目录', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'bokebox-plugin-'));
  try {
    const nested = path.join(root, 'echo-plugin');
    await fs.mkdir(nested);
    await fs.writeFile(path.join(nested, 'plugin.json'), '{}');
    const resolved = await resolvePluginRoot(root);
    assert.equal(resolved, nested);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
