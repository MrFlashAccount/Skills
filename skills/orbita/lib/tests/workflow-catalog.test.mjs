import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test, { after } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const tempDir = mkdtempSync(path.join(tmpdir(), 'workflow-catalog-'));

after(() => rmSync(tempDir, { recursive: true, force: true }));

function runCatalog(args) {
  return spawnSync(process.execPath, ['skills/orbita/lib/entrypoints/cli/workflow-catalog.mjs', ...args], {
    cwd: root,
    encoding: 'utf8',
  });
}

test('workflow catalog lists checked-in workflows from top-level descriptions', () => {
  const result = runCatalog(['list', '--json']);

  assert.equal(result.status, 0, result.stderr);
  const parsed = JSON.parse(result.stdout);
  const names = parsed.workflows.map((workflow) => workflow.name);

  assert.deepEqual(names, ['dev-harness', 'research-critic', 'workflow-authoring']);
  assert.deepEqual(
    parsed.workflows.map((workflow) => workflow.path),
    [
      'workflows/dev-harness/workflow.json',
      'workflows/research-critic/workflow.json',
      'workflows/workflow-authoring/workflow.json',
    ],
  );
  assert.match(parsed.workflows.find((workflow) => workflow.name === 'workflow-authoring').description, /Create or materially update workflow-runner workflows/);
});

test('workflow catalog human output includes exact workflow paths', () => {
  const result = runCatalog(['list', '--human']);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /dev-harness - /);
  assert.match(result.stdout, /workflow: workflows\/dev-harness\/workflow\.json/);
});

test('workflow catalog resolves exact and fuzzy workflow names', () => {
  const exact = runCatalog(['resolve', 'dev harness', '--json']);
  assert.equal(exact.status, 0, exact.stderr);
  assert.deepEqual(JSON.parse(exact.stdout), {
    status: 'single',
    query: 'dev harness',
    candidates: [
      {
        name: 'dev-harness',
        description: JSON.parse(readFileSync(path.join(root, 'workflows/dev-harness/workflow.json'), 'utf8')).description,
        path: 'workflows/dev-harness/workflow.json',
      },
    ],
  });

  const fuzzy = runCatalog(['resolve', 'authoring', '--json']);
  assert.equal(fuzzy.status, 0, fuzzy.stderr);
  const parsed = JSON.parse(fuzzy.stdout);
  assert.equal(parsed.status, 'single');
  assert.equal(parsed.candidates[0].name, 'workflow-authoring');
});

test('workflow catalog reports no match for unknown workflow names', () => {
  const result = runCatalog(['resolve', 'not-a-real-workflow', '--json']);

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), {
    status: 'none',
    query: 'not-a-real-workflow',
    candidates: [],
  });
});

test('workflow catalog rejects catalog workflows without top-level description', () => {
  const workflowsRoot = path.join(tempDir, 'workflows');
  const workflowDir = path.join(workflowsRoot, 'missing-description');
  mkdirSync(workflowDir, { recursive: true });
  writeFileSync(path.join(workflowDir, 'workflow.json'), `${JSON.stringify({
    name: 'missing-description',
    version: 1,
    start: 'done',
    done: 'done',
    blocked: 'blocked',
    steps: {
      done: { name: 'Done', kind: 'done' },
      blocked: { name: 'Blocked', kind: 'blocked' },
    },
  }, null, 2)}\n`);

  const result = runCatalog(['list', '--json', '--workflows-root', workflowsRoot]);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /workflow-catalog: workflow is missing top-level description/);
});
