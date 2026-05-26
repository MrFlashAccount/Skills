import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const tempDir = mkdtempSync(path.join(tmpdir(), 'workflow-schema-check-'));
const devHarnessWorkflowPath = path.join(root, 'develop/dev-harness.workflow.json');

const schemaWorkflowDoc = {
  workflow: {
    name: 'schema-spec',
    version: 1,
    start: 'worker_step',
    done: 'done',
    blocked: 'blocked',
    steps: {
      worker_step: {
        name: 'Worker step',
        kind: 'worker',
        input: { template: 'worker.md', role: 'backend', state: ['artifacts'], prompt: 'Run worker.' },
        output: { schema: 'worker-output.json' },
        next: { by: 'outcome', map: { ready: 'approval_step', retry: { target: 'worker_step', maxAttempts: 2, onLimit: 'blocked' }, blocked: 'blocked' } },
      },
      approval_step: {
        name: 'Approval step',
        kind: 'approval',
        input: { state: ['artifacts'], prompt: 'Approve.' },
        next: { by: 'approval', map: { approved: 'direct_next_worker', rejected: 'worker_step', blocked: 'blocked' } },
      },
      direct_next_worker: {
        name: 'Direct next worker',
        kind: 'worker',
        input: { template: 'direct.md', state: ['results'] },
        output: { schema: 'worker-output.json' },
        next: 'done',
      },
      done: { name: 'Done', kind: 'done', input: { prompt: 'Finished.' } },
      blocked: { name: 'Blocked', kind: 'blocked', input: { prompt: 'Blocked.' } },
    },
  },
};

const e2eWorkflowDoc = {
  workflow: {
    name: 'deterministic-e2e-spec',
    version: 1,
    start: 'worker_step',
    done: 'done',
    blocked: 'blocked',
    steps: {
      worker_step: {
        name: 'Worker step',
        kind: 'worker',
        input: { template: 'worker.md', role: 'backend', state: ['artifacts'], prompt: 'Run worker.' },
        output: { schema: 'worker-output.json' },
        next: {
          by: 'outcome',
          map: {
            ready: 'approval_step',
            retry: { target: 'worker_step', maxAttempts: 2, onLimit: 'blocked' },
            blocked: 'blocked',
          },
        },
      },
      approval_step: {
        name: 'Approval step',
        kind: 'approval',
        input: { state: ['artifacts'], prompt: 'Approve.' },
        next: { by: 'approval', map: { approved: 'implementation_worker', rejected: 'worker_step', blocked: 'blocked' } },
      },
      implementation_worker: {
        name: 'Implementation worker',
        kind: 'worker',
        input: { template: 'implementation.md', state: ['artifacts', 'results'] },
        output: { schema: 'worker-output.json' },
        next: 'review_worker',
      },
      review_worker: {
        name: 'Review worker',
        kind: 'worker',
        input: { template: 'review.md', state: ['artifacts', 'results'] },
        output: { schema: 'worker-output.json' },
        next: { by: 'outcome', map: { ready: 'done', blocked: 'blocked' } },
      },
      done: { name: 'Done', kind: 'done', input: { prompt: 'Finished.' } },
      blocked: { name: 'Blocked', kind: 'blocked', input: { prompt: 'Blocked.' } },
    },
  },
};

const emptyState = { artifacts: [], results: [] };

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
  assert.ok(response.directive, `check '${label}' returned no directive`);
  return response;
}

function runInspect(label, batonDoc, expectSuccess = true, workflowDoc = schemaWorkflowDoc) {
  const prefix = safeName(label);
  const batonPath = writeJson(`${prefix}-baton.json`, batonDoc);
  const wfPath = writeJson(`${prefix}-workflow.json`, workflowDoc);
  const before = readFileSync(batonPath, 'utf8');

  const result = runNode(['develop/scripts/workflow-interpreter.mjs', 'inspect', wfPath, batonPath]);
  const response = expectCliResult(label, result, expectSuccess);
  assert.equal(readFileSync(batonPath, 'utf8'), before, `check '${label}' mutated baton file during inspect`);
  return response;
}

function runApply(label, batonDoc, workerOutput, expectSuccess = true, workflowDoc = schemaWorkflowDoc) {
  const prefix = safeName(label);
  const batonPath = writeJson(`${prefix}-baton.json`, batonDoc);
  const outputPath = writeJson(`${prefix}-output.json`, workerOutput);
  const wfPath = writeJson(`${prefix}-workflow.json`, workflowDoc);
  const before = readFileSync(batonPath, 'utf8');

  const result = runNode(['develop/scripts/workflow-interpreter.mjs', 'apply', wfPath, batonPath, outputPath]);
  const response = expectCliResult(label, result, expectSuccess);
  assert.equal(readFileSync(batonPath, 'utf8'), before, `check '${label}' mutated baton file during apply`);
  return response;
}

function scriptedApplyLoop(label, workflowDoc, initialBaton, scriptedOutputs, { maxSteps = 12 } = {}) {
  const history = [];
  let currentBaton = structuredClone(initialBaton);
  let currentDirective = runInspect(`${label}-inspect-0`, currentBaton, true, workflowDoc).directive;

  for (let index = 0; index < maxSteps; index += 1) {
    history.push({ cursor: currentBaton.cursor, action: currentDirective.action });
    if (currentDirective.action === 'stop_done' || currentDirective.action === 'stop_blocked') {
      return { baton: currentBaton, directive: currentDirective, history };
    }

    const queue = scriptedOutputs[currentBaton.cursor];
    assert.ok(Array.isArray(queue) && queue.length > 0, `no scripted output for ${currentBaton.cursor}`);
    const workerOutput = queue.shift();
    const response = runApply(`${label}-apply-${index}-${currentBaton.cursor}`, currentBaton, workerOutput, true, workflowDoc);
    currentBaton = response.baton;
    currentDirective = response.directive;
  }

  assert.fail(`scripted workflow did not reach a terminal action within ${maxSteps} steps`);
}

after(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

test('schema workflow fixture: DevHarness JSON is accepted without DevHarness-specific interpreter semantics', () => {
  const batonPath = writeJson('dev-harness-baton.json', { cursor: 'research', status: 'running', state: structuredClone(emptyState) });
  const response = expectCliResult(
    'dev-harness-fixture',
    runNode(['develop/scripts/workflow-interpreter.mjs', 'inspect', devHarnessWorkflowPath, batonPath]),
    true,
  );
  assert.equal(response.directive.id, 'research');
  assert.equal(response.directive.action, 'run_worker');
  assert.equal(response.directive.vertex.kind, 'worker');
  assert.deepEqual(response.directive.vertex.input.state, ['artifacts', 'results']);
});

test('e2e: scripted wrapper runs worker to approval to worker/review to done', () => {
  const final = scriptedApplyLoop('e2e-happy-path', e2eWorkflowDoc, baton(), {
    worker_step: [output({ outcome: 'ready', artifacts: [{ id: 'worker-packet', type: 'packet', summary: 'ready for approval' }] })],
    approval_step: [{ approval: 'approved', results: [{ type: 'approval', summary: 'approved' }] }],
    implementation_worker: [output({ outcome: 'implemented', results: [{ type: 'implementation', summary: 'implemented' }] })],
    review_worker: [output({ outcome: 'ready', results: [{ type: 'review', summary: 'reviewed' }] })],
  });

  assert.equal(final.directive.action, 'stop_done');
  assert.equal(final.baton.cursor, 'done');
  assert.deepEqual(final.history.map((entry) => entry.cursor), [
    'worker_step',
    'approval_step',
    'implementation_worker',
    'review_worker',
    'done',
  ]);
  assert.deepEqual(final.history.map((entry) => entry.action), [
    'run_worker',
    'wait_for_approval',
    'run_worker',
    'run_worker',
    'stop_done',
  ]);
  assert.equal(final.baton.state.artifacts.find((artifact) => artifact.id === 'worker-packet').summary, 'ready for approval');
  assert.equal(final.baton.state.results.at(-1).type, 'review');
});

test('e2e: approval rejection loops back to worker before successful done', () => {
  const final = scriptedApplyLoop('e2e-rejection-rework', e2eWorkflowDoc, baton(), {
    worker_step: [
      output({ outcome: 'ready', artifacts: [{ id: 'draft', type: 'packet', summary: 'draft' }] }),
      output({ outcome: 'ready', artifacts: [{ id: 'draft', type: 'packet', summary: 'reworked' }] }),
    ],
    approval_step: [
      { approval: 'rejected', results: [{ type: 'approval', summary: 'needs rework' }] },
      { approval: 'approved', results: [{ type: 'approval', summary: 'approved after rework' }] },
    ],
    implementation_worker: [output({ outcome: 'implemented' })],
    review_worker: [output({ outcome: 'ready' })],
  });

  assert.equal(final.directive.action, 'stop_done');
  assert.deepEqual(final.history.map((entry) => entry.cursor), [
    'worker_step',
    'approval_step',
    'worker_step',
    'approval_step',
    'implementation_worker',
    'review_worker',
    'done',
  ]);
  assert.equal(final.baton.state.artifacts.find((artifact) => artifact.id === 'draft').summary, 'reworked');
});

test('e2e: scripted blocked branch reaches stop_blocked with blocker carried on baton', () => {
  const final = scriptedApplyLoop('e2e-blocked-branch', e2eWorkflowDoc, baton(), {
    worker_step: [output({ outcome: 'blocked', blocker: { reason: 'missing dependency' } })],
  });

  assert.equal(final.directive.action, 'stop_blocked');
  assert.equal(final.baton.cursor, 'blocked');
  assert.deepEqual(final.baton.blocker, { reason: 'missing dependency' });
  assert.deepEqual(final.history.map((entry) => entry.cursor), ['worker_step', 'blocked']);
});

test('inspect: worker kind resolves to run_worker and preserves input data', () => {
  const response = runInspect('inspect-worker', baton());
  assert.equal(response.directive.id, 'worker_step');
  assert.equal(response.directive.action, 'run_worker');
  assert.equal(response.directive.vertex.kind, 'worker');
  assert.equal(response.directive.vertex.input.role, 'backend');
});

test('inspect: approval kind resolves to wait_for_approval', () => {
  const response = runInspect('inspect-approval', baton({ cursor: 'approval_step' }));
  assert.equal(response.directive.id, 'approval_step');
  assert.equal(response.directive.action, 'wait_for_approval');
});

test('inspect: done and blocked kinds resolve to stop directives', () => {
  const done = runInspect('inspect-done', baton({ cursor: 'done', status: 'done' }));
  const blocked = runInspect('inspect-blocked', baton({ cursor: 'blocked', status: 'blocked' }));
  assert.equal(done.directive.action, 'stop_done');
  assert.equal(blocked.directive.action, 'stop_blocked');
});

test('apply: mapped next by worker output field advances to selected target', () => {
  const response = runApply('map-by-outcome', baton(), output());
  assert.equal(response.baton.cursor, 'approval_step');
  assert.equal(response.baton.status, 'running');
  assert.equal(response.directive.action, 'wait_for_approval');
  assert.equal(response.baton.state.artifacts.at(-1).type, 'packet');
});

test('apply: mapped next by approval output field advances to selected target', () => {
  const response = runApply('map-by-approval', baton({ cursor: 'approval_step' }), { approval: 'approved', results: [{ type: 'approval', summary: 'yes' }] });
  assert.equal(response.baton.cursor, 'direct_next_worker');
  assert.equal(response.directive.action, 'run_worker');
  assert.equal(response.baton.state.results.at(-1).type, 'approval');
});

test('apply: string next advances without consulting transition value', () => {
  const response = runApply('string-next', baton({ cursor: 'direct_next_worker' }), output({ outcome: 'anything' }));
  assert.equal(response.baton.cursor, 'done');
  assert.equal(response.baton.status, 'done');
  assert.equal(response.directive.action, 'stop_done');
});

test('apply: retry policy persists attempt counters until maxAttempts then uses onLimit', () => {
  const first = runApply('retry-first', baton(), output({ outcome: 'retry' }));
  assert.equal(first.baton.cursor, 'worker_step');
  assert.deepEqual(first.baton.state.attempts, { 'worker_step:outcome:retry->worker_step': 1 });

  const second = runApply('retry-second', first.baton, output({ outcome: 'retry' }));
  assert.equal(second.baton.cursor, 'worker_step');
  assert.deepEqual(second.baton.state.attempts, { 'worker_step:outcome:retry->worker_step': 2 });

  const limited = runApply('retry-limit', second.baton, output({ outcome: 'retry' }));
  assert.equal(limited.baton.cursor, 'blocked');
  assert.equal(limited.baton.status, 'blocked');
  assert.deepEqual(limited.baton.state.attempts, { 'worker_step:outcome:retry->worker_step': 2 });
});

test('runtime: dangling workflow targets fail when the resolver uses them', () => {
  const workflowDoc = structuredClone(schemaWorkflowDoc);
  workflowDoc.workflow.steps.worker_step.next.map.ready = 'missing_target';
  const result = runApply('dangling-target', baton(), output(), false, workflowDoc);
  assert.match(result.stderr, /transition target not found in workflow: missing_target/);
});

test('runtime: dangling retry limit targets fail when the resolver uses them', () => {
  const workflowDoc = structuredClone(schemaWorkflowDoc);
  workflowDoc.workflow.steps.worker_step.next.map.retry.onLimit = 'missing_blocked';
  const first = runApply('dangling-retry-limit-first', baton(), output({ outcome: 'retry' }), true, workflowDoc);
  const second = runApply('dangling-retry-limit-second', first.baton, output({ outcome: 'retry' }), true, workflowDoc);
  const limited = runApply('dangling-retry-limit', second.baton, output({ outcome: 'retry' }), false, workflowDoc);
  assert.match(limited.stderr, /transition target not found in workflow: missing_blocked/);
});

test('schema validation: unsupported legacy vocabulary is rejected by the workflow schema', () => {
  const workflowDoc = structuredClone(schemaWorkflowDoc);
  workflowDoc.workflow.steps.worker_step.kind = 'subagent';
  workflowDoc.workflow.steps.worker_step.outcomes = { ready: 'approval_step' };
  const result = runInspect('legacy-vocabulary', baton(), false, workflowDoc);
  assert.match(result.stderr, /workflow failed schema validation/);
});

test('schema validation: nonterminal workflow steps require next in the workflow schema', () => {
  const workflowDoc = structuredClone(schemaWorkflowDoc);
  delete workflowDoc.workflow.steps.worker_step.next;
  const result = runInspect('missing-next', baton(), false, workflowDoc);
  assert.match(result.stderr, /workflow failed schema validation/);
});

test('validation: worker and approval transition vocabularies stay distinct', () => {
  const workerUsingApproval = runApply('worker-using-approval', baton(), { approval: 'approved' }, false);
  const approvalUsingOutcome = runApply('approval-using-outcome', baton({ cursor: 'approval_step' }), { outcome: 'approved' }, false);
  assert.match(workerUsingApproval.stderr, /worker cursor 'worker_step' must use outcome/);
  assert.match(approvalUsingOutcome.stderr, /approval cursor 'approval_step' must use approval/);
});

test('validation: unknown mapped value and unknown cursor are rejected', () => {
  assert.match(runApply('unknown-map-value', baton(), output({ outcome: 'missing' }), false).stderr, /not allowed/);
  assert.match(runInspect('unknown-cursor', baton({ cursor: 'missing_step' }), false).stderr, /baton cursor not found/);
});

test('cli: positional paths may begin with dash', () => {
  writeFileSync(path.join(tempDir, '--workflow.json'), `${JSON.stringify(schemaWorkflowDoc, null, 2)}\n`);
  writeFileSync(path.join(tempDir, '--baton.json'), `${JSON.stringify(baton(), null, 2)}\n`);

  const result = runNode(
    [path.join(root, 'develop/scripts/workflow-interpreter.mjs'), 'inspect', '--workflow.json', '--baton.json'],
    tempDir,
  );
  const response = expectCliResult('inspect-dash-prefixed-paths', result, true);
  assert.equal(response.directive.id, 'worker_step');
});

test('cli: schema validation rejects wrong arity with mode-specific usage', () => {
  const inspect = runNode(['develop/scripts/workflow-interpreter.mjs', 'inspect', 'workflow.json']);
  const apply = runNode(['develop/scripts/workflow-interpreter.mjs', 'apply', 'workflow.json', 'baton.json']);
  const legacy = runNode(['develop/scripts/workflow-interpreter.mjs', 'workflow.json', 'baton.json']);

  assert.equal(inspect.status, 1);
  assert.match(inspect.stderr, /workflow-interpreter: usage: node scripts\/workflow-interpreter\.mjs inspect <workflow\.json> <baton\.json>/);

  assert.equal(apply.status, 1);
  assert.match(apply.stderr, /workflow-interpreter: usage: node scripts\/workflow-interpreter\.mjs apply <workflow\.json> <baton\.json> <worker-output\.json>/);

  assert.equal(legacy.status, 1);
  assert.match(legacy.stderr, /workflow-interpreter: usage: node scripts\/workflow-interpreter\.mjs inspect <workflow\.json> <baton\.json> \| apply <workflow\.json> <baton\.json> <worker-output\.json>/);
});
