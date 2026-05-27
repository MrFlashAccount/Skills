import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

const validatorsDir = path.resolve(import.meta.dirname, '../dist/validators');
const reviewerSelectionValidatorPath = path.join(validatorsDir, 'dev-harness/reviewer-selection-output.mjs');

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
    assert.doesNotMatch(code, /^import\b/m, `${file} must not statically import runtime dependencies`);
    assert.doesNotMatch(code, /\bimport\s*\(/, `${file} must not dynamically import runtime dependencies`);
    assert.doesNotMatch(code, /\brequire\s*\(/, `${file} must not require runtime dependencies`);
    assert.doesNotMatch(code, /\bcreateRequire\b/, `${file} must not create CommonJS require shims`);
    assert.doesNotMatch(code, /ajv\/dist\/runtime/, `${file} must not reference AJV runtime helpers`);
  }
});

test('generated DevHarness reviewer-selection validator enforces reviewer enum and fields', async () => {
  const { default: validate } = await import(pathToFileURL(reviewerSelectionValidatorPath));
  const valid = {
    outcome: 'ready_for_review',
    review_plan: {
      reviewers: [
        {
          role: 'security',
          reason: 'Touches trust boundaries.',
          surfaces: ['auth middleware', 'API request handling'],
          required: true,
        },
      ],
    },
  };

  assert.equal(validate(valid), true, JSON.stringify(validate.errors));
  assert.equal(validate({ ...valid, review_plan: { reviewers: [{ ...valid.review_plan.reviewers[0], role: 'staff-backend' }] } }), false);
  assert.equal(validate({ ...valid, review_plan: { reviewers: [{ ...valid.review_plan.reviewers[0], surfaces: [] }] } }), false);
});
