import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const tempDir = mkdtempSync(path.join(tmpdir(), 'workflow-dynamic-next-'));

const dynamicOutputSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  required: ['outcome'],
  properties: {
    outcome: { type: 'string' },
    next: { type: 'string' },
    selected_steps: { type: 'array', items: { type: 'string' } },
    artifacts: { type: 'array' },
    results: { type: 'array' },
    blocker: { type: 'object' },
  },
  additionalProperties: false,
};
writeFileSync(path.join(tempDir, 'dynamic-output-schema.json'), `${JSON.stringify(dynamicOutputSchema, null, 2)}\n`);

function outputContract() {
  return { template: '../../shared/templates/implementation-plan-template.md', schema: 'dynamic-output-schema.json' };
}

function workflow(next = '${{ output.next }}') {
  return {
    workflow: {
      name: 'dynamic-next-spec',
      version: 1,
      start: 'selector',
      done: 'done',
      blocked: 'blocked',
      steps: {
        selector: {
          name: 'Selector',
          kind: 'worker',
          input: { state: ['planning_draft'], prompt: 'Select next.' },
          output: outputContract(),
          next,
        },
        review_a: { name: 'Review A', kind: 'worker', input: {}, output: outputContract(), next: 'join' },
        review_b: { name: 'Review B', kind: 'worker', input: {}, output: outputContract(), next: 'join' },
        join: { name: 'Join', kind: 'worker', input: {}, output: outputContract(), next: 'done' },
        done: { name: 'Done', kind: 'done', input: { prompt: 'Done.' } },
        blocked: { name: 'Blocked', kind: 'blocked', input: { prompt: 'Blocked.' } },
      },
    },
  };
}

function baton(overrides = {}) {
  return {
    cursor: 'selector',
    status: 'running',
    state: {
      artifacts: [],
      results: [],
      planning_draft: { selected_reviewers: ['review_a', 'review_b'] },
    },
    ...overrides,
  };
}

function writeJson(fileName, value) {
  const filePath = path.join(tempDir, fileName);
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
  return filePath;
}

function runCli(label, mode, batonDoc, expectSuccess = true, workflowDoc = workflow(), workerOutput) {
  const batonPath = writeJson(`${label}-baton.json`, batonDoc);
  const workflowPath = writeJson(`${label}-workflow.json`, workflowDoc);
  const args = ['develop/scripts/workflow-interpreter.mjs', mode, workflowPath, batonPath];
  if (workerOutput !== undefined) args.push(writeJson(`${label}-output.json`, workerOutput));
  const result = spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8' });
  assert.equal(
    result.status === 0,
    expectSuccess,
    `${label} expected ${expectSuccess ? 'success' : 'failure'}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
  );
  return expectSuccess ? JSON.parse(result.stdout) : result;
}

function runApply(label, batonDoc, workerOutput, expectSuccess = true, workflowDoc = workflow()) {
  return runCli(label, 'apply', batonDoc, expectSuccess, workflowDoc, workerOutput);
}

function runInspect(label, batonDoc, expectSuccess = true, workflowDoc = workflow()) {
  return runCli(label, 'inspect', batonDoc, expectSuccess, workflowDoc);
}

after(() => rmSync(tempDir, { recursive: true, force: true }));

test('dynamic output string routes to the selected existing step', () => {
  const response = runApply('output-string', baton(), { outcome: 'ready', next: 'review_a' });
  assert.equal(response.baton.cursor, 'review_a');
  assert.equal(response.steps[0].id, 'review_a');
});

test('dynamic output array prepares and executes parallel steps like static array next', () => {
  const prepared = runApply('output-array-prepare', baton(), { outcome: 'ready', selected_steps: ['review_a', 'review_b'] }, true, workflow('${{ output.selected_steps }}'));
  assert.deepEqual(prepared.steps.map((step) => step.id), ['review_a', 'review_b']);
  assert.equal(prepared.baton.cursor, 'selector');
  assert.deepEqual(
    runInspect('output-array-inspect-prepared', prepared.baton, true, workflow('${{ output.selected_steps }}')).steps.map((step) => step.id),
    ['review_a', 'review_b'],
  );

  const joined = runApply(
    'output-array-join',
    prepared.baton,
    {
      steps: {
        review_a: { outcome: 'ready', next: 'join', results: [{ type: 'review', summary: 'a' }] },
        review_b: { outcome: 'ready', next: 'join', results: [{ type: 'review', summary: 'b' }] },
      },
    },
    true,
    workflow('${{ output.selected_steps }}'),
  );
  assert.equal(joined.baton.cursor, 'join');
  assert.deepEqual(joined.baton.state.results.map((result) => result.summary), ['a', 'b']);
});

test('dynamic input projected state path routes correctly', () => {
  const response = runApply('input-path', baton(), { outcome: 'ready' }, true, workflow('${{ input.planning_draft.selected_reviewers }}'));
  assert.deepEqual(response.steps.map((step) => step.id), ['review_a', 'review_b']);
});

test('dynamic input path not projected errors deterministically', () => {
  const workflowDoc = workflow('${{ input.planning_draft.selected_reviewers }}');
  workflowDoc.workflow.steps.selector.input.state = [];
  const result = runApply('input-not-projected', baton(), { outcome: 'ready' }, false, workflowDoc);
  assert.match(result.stderr, /could not resolve missing path 'input.planning_draft'/);
});

test('dynamic next rejects unknown target, empty arrays, and duplicate ids', () => {
  assert.match(runApply('unknown-target', baton(), { outcome: 'ready', next: 'missing' }, false).stderr, /target not found: missing/);
  assert.match(
    runApply('empty-array', baton(), { outcome: 'ready', selected_steps: [] }, false, workflow('${{ output.selected_steps }}')).stderr,
    /must resolve to a non-empty array/,
  );
  assert.match(
    runApply('duplicate-array', baton(), { outcome: 'ready', selected_steps: ['review_a', 'review_a'] }, false, workflow('${{ output.selected_steps }}')).stderr,
    /duplicate target 'review_a'/,
  );
});

test('static literal next and old next.by map still work', () => {
  const literal = runApply('literal-next', baton(), { outcome: 'ready', next: 'ignored' }, true, workflow('review_a'));
  assert.equal(literal.baton.cursor, 'review_a');

  const mappedWorkflow = workflow({ by: 'outcome', map: { ready: 'review_b', blocked: 'blocked' } });
  const mapped = runApply('mapped-next', baton(), { outcome: 'ready' }, true, mappedWorkflow);
  assert.equal(mapped.baton.cursor, 'review_b');
});
