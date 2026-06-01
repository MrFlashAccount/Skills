import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const tempDir = mkdtempSync(path.join(tmpdir(), 'workflow-parallel-check-'));
writeFileSync(path.join(tempDir, 'output.md'), '## Output contract\nReturn markdown.\n');
writeFileSync(path.join(tempDir, 'loop-output.schema.json'), `${JSON.stringify({
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  required: ['outcome'],
  properties: {
    outcome: { enum: ['ready', 'retry'] },
    artifacts: { type: 'array' },
    results: { type: 'array' },
  },
  additionalProperties: false,
}, null, 2)}\n`);
const renderWorkflowPaths = [];

function outputContract() {
  return { template: 'output.md' };
}

const emptyState = { artifacts: [], results: [] };

const parallelWorkflowDoc = {
    name: 'parallel-spec',
    version: 1,
    start: 'prepare',
    done: 'done',
    blocked: 'blocked',
    steps: {
      prepare: {
        name: 'Prepare',
        kind: 'worker',
        input: { prompt: 'Prepare branch.' },
        output: outputContract(),
        next: ['branch_a', 'branch_b'],
      },
      branch_a: {
        name: 'Branch A',
        kind: 'worker',
        input: { prompt: 'Run branch A.' },
        output: outputContract(),
        next: 'join',
      },
      branch_b: {
        name: 'Branch B',
        kind: 'worker',
        input: { prompt: 'Run branch B.' },
        output: outputContract(),
        next: 'join',
      },
      join: {
        name: 'Join',
        kind: 'worker',
        input: { state: ['branch_a', 'branch_b'], prompt: 'Read branch states and decide.' },
        output: outputContract(),
        next: 'done',
      },
      done: { name: 'Done', kind: 'done', input: { prompt: 'Finished.' } },
      blocked: { name: 'Blocked', kind: 'blocked', input: { prompt: 'Blocked.' } },
    },

};

function safeName(label) {
  return label.replace(/[^a-z0-9_-]+/gi, '-');
}

function writeJson(fileName, value) {
  const filePath = path.join(tempDir, fileName);
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
  return filePath;
}

function baton(overrides = {}) {
  return {
    cursor: 'worker_step',
    status: 'running',
    state: structuredClone(emptyState),
    ...overrides,
  };
}

function output(overrides = {}) {
  return { outcome: 'ready', artifacts: [{ type: 'packet', summary: 'minimal packet' }], ...overrides };
}

function runNode(args, cwd = root) {
  return spawnSync(process.execPath, args, { cwd, encoding: 'utf8' });
}

function expectCliResult(label, result, expectSuccess) {
  const succeeded = result.status === 0;
  assert.equal(
    succeeded,
    expectSuccess,
    `check '${label}' expected ${expectSuccess ? 'success' : 'failure'} but got ${result.status}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
  );

  if (!expectSuccess) return { stdout: result.stdout, stderr: result.stderr };

  const response = JSON.parse(result.stdout);
  assert.ok(response.baton, `check '${label}' returned no baton`);
  assert.ok(response.steps[0], `check '${label}' returned no step`);
  return response;
}

function runInspect(label, batonDoc, expectSuccess = true, workflowDoc = parallelWorkflowDoc) {
  const prefix = safeName(label);
  const batonPath = writeJson(`${prefix}-baton.json`, batonDoc);
  const wfPath = writeJson(`${prefix}-workflow.json`, workflowDoc);
  const before = readFileSync(batonPath, 'utf8');

  const result = runNode(['develop/lib/entrypoints/cli/workflow-interpreter.mjs', 'inspect', wfPath, batonPath]);
  const response = expectCliResult(label, result, expectSuccess);
  assert.equal(readFileSync(batonPath, 'utf8'), before, `check '${label}' mutated baton file during inspect`);
  return response;
}

function runApply(label, batonDoc, workerOutput, expectSuccess = true, workflowDoc = parallelWorkflowDoc) {
  const prefix = safeName(label);
  const batonPath = writeJson(`${prefix}-baton.json`, batonDoc);
  const outputPath = writeJson(`${prefix}-output.json`, workerOutput);
  const wfPath = writeJson(`${prefix}-workflow.json`, workflowDoc);
  const before = readFileSync(batonPath, 'utf8');

  const result = runNode(['develop/lib/entrypoints/cli/workflow-interpreter.mjs', 'apply', wfPath, batonPath, outputPath]);
  const response = expectCliResult(label, result, expectSuccess);
  assert.equal(readFileSync(batonPath, 'utf8'), before, `check '${label}' mutated baton file during apply`);
  return response;
}

function runRender(label, batonDoc, expectSuccess = true, workflowDoc = parallelWorkflowDoc) {
  const prefix = safeName(label);
  const batonPath = writeJson(`${prefix}-baton.json`, batonDoc);
  const wfPath = writeJson(`${prefix}-workflow.json`, workflowDoc);
  const before = readFileSync(batonPath, 'utf8');

  const result = runNode(['develop/lib/entrypoints/cli/workflow-interpreter.mjs', 'render', wfPath, batonPath]);
  const response = expectCliResult(label, result, expectSuccess);
  assert.equal(readFileSync(batonPath, 'utf8'), before, `check '${label}' mutated baton file during render`);
  return response;
}

after(() => {
  rmSync(tempDir, { recursive: true, force: true });
  for (const filePath of renderWorkflowPaths) rmSync(filePath, { force: true });
});

test('runtime: sequential string next still advances to one target', () => {
  const response = runApply('parallel-sequential-string-next', baton({ cursor: 'branch_a' }), output({ outcome: 'ready' }));

  assert.equal(response.baton.cursor, 'join');
  assert.equal(response.steps[0].id, 'join');
  assert.equal(response.steps[0].action, 'run_worker');
  assert.deepEqual(response.baton.state.branch_a.outcome, 'ready');
});

test('runtime: next array returns multiple branch steps without pending branch state', () => {
  const response = runApply('parallel-start', baton({ cursor: 'prepare' }), output({ outcome: 'ready' }));

  assert.equal(response.baton.cursor, 'prepare');
  assert.deepEqual(response.steps.map((step) => step.id), ['branch_a', 'branch_b']);
  assert.deepEqual(response.steps.map((step) => step.action), ['run_worker', 'run_worker']);
  assert.equal(Object.hasOwn(response.baton, 'parallel'), false);
  assert.deepEqual(response.baton.state.prepare.outcome, 'ready');
});

test('runtime: parallel step outputs write separate state and advance to explicit join', () => {
  const pending = runApply('parallel-to-pending', baton({ cursor: 'prepare' }), output({ outcome: 'ready' })).baton;
  const response = runApply(
    'parallel-complete',
    pending,
    {
      steps: {
        branch_a: output({ outcome: 'ready', results: [{ type: 'branch', summary: 'A' }] }),
        branch_b: output({ outcome: 'ready', results: [{ type: 'branch', summary: 'B' }] }),
      },
    },
  );

  assert.equal(response.baton.cursor, 'join');
  assert.equal(response.steps[0].id, 'join');
  assert.equal(response.steps[0].action, 'run_worker');
  assert.equal(response.baton.state.branch_a.results[0].summary, 'A');
  assert.equal(response.baton.state.branch_b.results[0].summary, 'B');
  assert.equal(Object.hasOwn(response.baton, 'parallel'), false);
});


test('e2e: wrapper can render parallel branch prompts, collect branch outputs, and render join state', () => {
  const workflowDoc = structuredClone(parallelWorkflowDoc);
  workflowDoc.name = 'parallel-render-spec';
  workflowDoc.steps.branch_a.input.state = ['prepare'];
  workflowDoc.steps.branch_b.input.state = ['prepare'];

  const pending = runApply('parallel-e2e-start', baton({ cursor: 'prepare' }), output({
    outcome: 'ready',
    results: [{ type: 'prepare', summary: 'ready to branch' }],
  }), true, workflowDoc).baton;

  const branchRender = runRender('parallel-e2e-render-branches', pending, true, workflowDoc);
  assert.deepEqual(branchRender.steps.map((step) => step.id), ['branch_a', 'branch_b']);
  assert.match(branchRender.steps[0].compiledPrompt.prompt, /# Branch A/);
  assert.match(branchRender.steps[0].compiledPrompt.prompt, /"prepare"/);
  assert.match(branchRender.steps[0].compiledPrompt.prompt, /ready to branch/);
  assert.match(branchRender.steps[1].compiledPrompt.prompt, /# Branch B/);

  const joined = runApply('parallel-e2e-collect-branches', pending, {
    steps: {
      branch_a: output({ outcome: 'ready', results: [{ type: 'branch', summary: 'A says go' }] }),
      branch_b: output({ outcome: 'ready', results: [{ type: 'branch', summary: 'B says go' }] }),
    },
  }, true, workflowDoc).baton;

  assert.equal(joined.cursor, 'join');
  const joinRender = runRender('parallel-e2e-render-join', joined, true, workflowDoc);
  assert.equal(joinRender.steps[0].id, 'join');
  assert.equal(joinRender.steps[0].action, 'run_worker');
  assert.match(joinRender.steps[0].compiledPrompt.prompt, /"branch_a"/);
  assert.match(joinRender.steps[0].compiledPrompt.prompt, /A says go/);
  assert.match(joinRender.steps[0].compiledPrompt.prompt, /"branch_b"/);
  assert.match(joinRender.steps[0].compiledPrompt.prompt, /B says go/);
});

test('runtime: join step can read parallel branch state and continue to done', () => {
  const pending = runApply('parallel-join-pending', baton({ cursor: 'prepare' }), output({ outcome: 'ready' })).baton;
  const joined = runApply(
    'parallel-join-arrive',
    pending,
    { steps: { branch_a: output({ outcome: 'ready' }), branch_b: output({ outcome: 'ready' }) } },
  ).baton;
  const response = runApply('parallel-join-complete', joined, output({ outcome: 'ready', results: [{ type: 'join', summary: 'joined' }] }));

  assert.equal(response.baton.cursor, 'done');
  assert.equal(response.steps[0].action, 'stop_done');
  assert.equal(response.baton.state.join.results[0].summary, 'joined');
});

test('schema validation: parallel next rejects empty arrays and duplicate targets', () => {
  const emptyNextWorkflowDoc = structuredClone(parallelWorkflowDoc);
  emptyNextWorkflowDoc.steps.prepare.next = [];
  const empty = runInspect('parallel-empty-next', baton({ cursor: 'prepare' }), false, emptyNextWorkflowDoc);
  assert.match(empty.stderr, /workflow failed schema validation/);

  const duplicateNextWorkflowDoc = structuredClone(parallelWorkflowDoc);
  duplicateNextWorkflowDoc.steps.prepare.next = ['branch_a', 'branch_a'];
  const duplicate = runInspect('parallel-duplicate-next', baton({ cursor: 'prepare' }), false, duplicateNextWorkflowDoc);
  assert.match(duplicate.stderr, /workflow failed schema validation/);
});

test('runtime validation: parallel branches reject nested parallel and non-join shapes', () => {
  const nestedWorkflowDoc = structuredClone(parallelWorkflowDoc);
  nestedWorkflowDoc.steps.branch_a.next = ['join'];
  const nested = runInspect('parallel-nested-rejected', baton({ cursor: 'prepare' }), false, nestedWorkflowDoc);
  assert.match(nested.stderr, /cannot start nested parallel steps/);

  const matchCasesBranchWorkflowDoc = structuredClone(parallelWorkflowDoc);
  matchCasesBranchWorkflowDoc.steps.branch_a.next = { match: '${{ output.outcome }}', cases: { ready: 'join' } };
  const matchCases = runInspect('parallel-matchCases-branch-rejected', baton({ cursor: 'prepare' }), false, matchCasesBranchWorkflowDoc);
  assert.match(matchCases.stderr, /must use a string next to an explicit join step/);
});

test('runtime: repeated sequential loop execution still overwrites latest per-step state', () => {
  const workflowDoc = structuredClone(parallelWorkflowDoc);
  workflowDoc.start = 'worker_step';
  workflowDoc.steps.worker_step = {
    name: 'Worker step',
    kind: 'worker',
    input: { prompt: 'Run worker.' },
    output: { ...outputContract(), schema: 'loop-output.schema.json' },
    next: { match: '${{ output.outcome }}', cases: { ready: 'join', retry: 'worker_step' } },
  };

  const first = runApply('loop-latest-first', baton(), output({ outcome: 'retry', results: [{ type: 'try', summary: 'first' }] }), true, workflowDoc).baton;
  const second = runApply('loop-latest-second', first, output({ outcome: 'ready', results: [{ type: 'try', summary: 'second' }] }), true, workflowDoc).baton;

  assert.equal(second.cursor, 'join');
  assert.equal(second.state.worker_step.results[0].summary, 'second');
  assert.equal(second.state.results.at(-1).summary, 'second');
});
