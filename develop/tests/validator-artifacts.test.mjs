import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const validatorsDir = path.resolve(import.meta.dirname, '../dist/validators');

function validatorFiles(dir = validatorsDir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return validatorFiles(entryPath);
    if (!entry.isFile() || !entry.name.endsWith('.mjs')) return [];
    return [entryPath];
  });
}

test('generated validators are self-contained ESM runtime artifacts', () => {
  const files = validatorFiles();
  assert.ok(files.length > 0, 'expected generated validator artifacts');

  for (const file of files) {
    const code = readFileSync(file, 'utf8');
    assert.doesNotMatch(code, /\bimport\b/, `${file} must not import runtime dependencies`);
    assert.doesNotMatch(code, /\brequire\s*\(/, `${file} must not require runtime dependencies`);
    assert.doesNotMatch(code, /ajv\/dist\/runtime/, `${file} must not reference AJV runtime helpers`);
  }
});
