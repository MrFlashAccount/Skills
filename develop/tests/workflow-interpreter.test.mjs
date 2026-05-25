import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const tempDir = mkdtempSync(path.join(tmpdir(), 'dev-harness-check-'));
const workflowPath = path.join(root, 'develop/dev-harness.workflow.json');
const baseWorkflowDoc = JSON.parse(readFileSync(workflowPath, 'utf8'));
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
    cursor: 'research',
    status: 'running',
    state: structuredClone(emptyState),
    ...overrides,
  };
}

function output(overrides = {}) {
  return {
    outcome: 'ready_for_approval',
    artifacts: [{ type: 'research', summary: 'minimal research packet' }],
    ...overrides,
  };
}

function artifact(type, summary = `${type} artifact`) {
  return { type, summary };
}

function runNode(args) {
  return spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8' });
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

function runInspect(label, batonDoc, expectSuccess = true, workflowDoc = baseWorkflowDoc) {
  const prefix = safeName(label);
  const batonPath = writeJson(`${prefix}-baton.json`, batonDoc);
  const wfPath = workflowDoc === baseWorkflowDoc ? workflowPath : writeJson(`${prefix}-workflow.json`, workflowDoc);
  const before = readFileSync(batonPath, 'utf8');

  const result = runNode(['develop/scripts/workflow-interpreter.mjs', 'inspect', wfPath, batonPath]);
  const response = expectCliResult(label, result, expectSuccess);
  assert.equal(readFileSync(batonPath, 'utf8'), before, `check '${label}' mutated baton file during inspect`);
  return response;
}

function runApply(label, batonDoc, workerOutput, expectSuccess = true, workflowDoc = baseWorkflowDoc) {
  const prefix = safeName(label);
  const batonPath = writeJson(`${prefix}-baton.json`, batonDoc);
  const outputPath = writeJson(`${prefix}-output.json`, workerOutput);
  const wfPath = workflowDoc === baseWorkflowDoc ? workflowPath : writeJson(`${prefix}-workflow.json`, workflowDoc);
  const before = readFileSync(batonPath, 'utf8');

  const result = runNode(['develop/scripts/workflow-interpreter.mjs', 'apply', wfPath, batonPath, outputPath]);
  const response = expectCliResult(label, result, expectSuccess);
  assert.equal(readFileSync(batonPath, 'utf8'), before, `check '${label}' mutated baton file during apply`);
  return response;
}

after(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

const malformedInputCases = [
  {
    name: 'schema: malformed workflow shape rejected',
    run: () => runInspect('schema-malformed-workflow', baton(), false, { workflow: { name: 'bad' } }),
  },
  {
    name: 'schema: malformed baton shape rejected',
    run: () => runInspect('schema-malformed-baton', { cursor: 'research', state: structuredClone(emptyState) }, false),
  },
  {
    name: 'schema: malformed worker output shape rejected',
    run: () => runApply('schema-malformed-output', baton(), { outcome: 42 }, false),
  },
  {
    name: 'schema: extra top-level baton field rejected',
    run: () => runInspect('schema-extra-top-level-field', baton({ next: 'approve_research' }), false),
  },
  {
    name: 'schema: missing required baton state field rejected',
    run: () => runInspect('schema-missing-state-field', baton({ state: { artifacts: [] } }), false),
  },
  {
    name: 'schema: baton state history rejected',
    run: () => runInspect('schema-history-state-rejected', baton({ state: { ...structuredClone(emptyState), history: [] } }), false),
  },
  {
    name: 'schema: baton state attempts rejected',
    run: () => runInspect('schema-attempts-state-rejected', baton({ state: { ...structuredClone(emptyState), attempts: {} } }), false),
  },
];

for (const { name, run } of malformedInputCases) {
  test(name, run);
}

test('inspect: initial cursor resolves to run-worker directive', () => {
  const initial = baton();
  const response = runInspect('inspect-initial-run-worker', initial);
  assert.equal(response.directive.id, 'research');
  assert.equal(response.directive.action, 'run_worker');
  assert.equal(response.directive.vertex.kind, 'subagent');
  assert.equal(response.directive.vertex.template, 'dev_harness.research');
  assert.deepEqual(response.baton, initial);
});

test('inspect: positional paths may begin with dash', () => {
  writeFileSync(path.join(tempDir, '--workflow.json'), `${JSON.stringify(baseWorkflowDoc, null, 2)}\n`);
  writeFileSync(path.join(tempDir, '--baton.json'), `${JSON.stringify(baton(), null, 2)}\n`);

  const result = spawnSync(
    process.execPath,
    [path.join(root, 'develop/scripts/workflow-interpreter.mjs'), 'inspect', '--workflow.json', '--baton.json'],
    { cwd: tempDir, encoding: 'utf8' },
  );
  const response = expectCliResult('inspect-dash-prefixed-paths', result, true);
  assert.equal(response.directive.id, 'research');
});

test('inspect: approval cursor resolves to wait-for-approval directive', () => {
  const response = runInspect(
    'inspect-approval-wait',
    baton({ cursor: 'approve_research', state: { ...structuredClone(emptyState), artifacts: [artifact('research')] } }),
  );
  assert.equal(response.directive.id, 'approve_research');
  assert.equal(response.directive.action, 'wait_for_approval');
  assert.deepEqual(response.directive.vertex.takesArtifacts, ['research']);
});

test('inspect: terminal done cursor resolves to stop_done directive', () => {
  const response = runInspect('inspect-done-stop', baton({ cursor: 'done', status: 'done' }));
  assert.equal(response.directive.id, 'done');
  assert.equal(response.directive.action, 'stop_done');
});

test('inspect: blocked cursor resolves to stop_blocked directive', () => {
  const response = runInspect('inspect-blocked-stop', baton({ cursor: 'blocked', status: 'blocked' }));
  assert.equal(response.directive.id, 'blocked');
  assert.equal(response.directive.action, 'stop_blocked');
});

test('inspect: unknown cursor rejected', () => {
  runInspect('inspect-unknown-cursor', baton({ cursor: 'missing_step' }), false);
});

test('apply: worker produces required artifact and advances cursor', () => {
  const response = runApply('apply-worker-advances', baton(), output());
  assert.equal(response.baton.cursor, 'approve_research');
  assert.equal(response.baton.status, 'running');
  assert.equal(response.directive.action, 'wait_for_approval');
  assert.equal(response.baton.state.artifacts.at(-1).type, 'research');
});

test('apply: approval output produces approval artifact and advances cursor', () => {
  const response = runApply(
    'apply-approval-advances',
    baton({ cursor: 'approve_research', state: { ...structuredClone(emptyState), artifacts: [artifact('research')] } }),
    { approval: 'approved', artifacts: [artifact('research_approval', 'approved')] },
  );
  assert.equal(response.baton.cursor, 'architecture');
  assert.equal(response.directive.action, 'run_worker');
  assert.equal(response.baton.state.artifacts.at(-1).type, 'research_approval');
  assert.ok(!('approval' in response.baton), 'approval state leaked to top-level baton');
});

test('apply: results are appended and existing results preserved', () => {
  const response = runApply(
    'apply-results-preserved',
    baton({ state: { ...structuredClone(emptyState), results: [{ type: 'existing_result', summary: 'keep me' }] } }),
    output({ results: [{ type: 'research_summary', summary: 'operator note' }] }),
  );
  assert.deepEqual(response.baton.state.results.map((item) => item.type), ['existing_result', 'research_summary']);
});

test('apply: existing artifact with same id is replaced and other artifacts preserved', () => {
  const response = runApply(
    'apply-artifact-replace-by-id',
    baton({
      state: {
        ...structuredClone(emptyState),
        artifacts: [{ id: 'research-main', type: 'research', summary: 'stale' }, artifact('context')],
      },
    }),
    output({ artifacts: [{ id: 'research-main', type: 'research', summary: 'fresh' }] }),
  );
  assert.equal(response.baton.state.artifacts.length, 2);
  assert.equal(response.baton.state.artifacts.find((item) => item.id === 'research-main').summary, 'fresh');
  assert.ok(response.baton.state.artifacts.some((item) => item.type === 'context'));
});

const rejectedApplyCases = [
  {
    name: 'apply negative: wrong outcome label rejected',
    run: () => runApply('apply-wrong-outcome-label', baton(), output({ outcome: 'approved' }), false),
  },
  {
    name: 'apply negative: missing required produced artifact rejected',
    run: () => runApply('apply-missing-produced-artifact', baton(), output({ artifacts: [] }), false),
  },
  {
    name: 'apply negative: stale existing artifact does not satisfy current produced artifact',
    run: () => runApply(
      'apply-stale-existing-artifact-not-enough',
      baton({ state: { ...structuredClone(emptyState), artifacts: [artifact('research', 'old research')] } }),
      output({ artifacts: [] }),
      false,
    ),
  },
  {
    name: 'apply negative: missing required taken artifact rejected',
    run: () => runApply(
      'apply-missing-taken-artifact',
      baton({ cursor: 'approve_research' }),
      { approval: 'approved', artifacts: [artifact('research_approval')] },
      false,
    ),
  },
  {
    name: 'apply negative: worker step using approval rejected',
    run: () => runApply('apply-worker-using-approval', baton(), { approval: 'approved', artifacts: [artifact('research')] }, false),
  },
  {
    name: 'apply negative: approval step using outcome rejected',
    run: () => runApply(
      'apply-approval-using-outcome',
      baton({ cursor: 'approve_research', state: { ...structuredClone(emptyState), artifacts: [artifact('research')] } }),
      { outcome: 'approved', artifacts: [artifact('research_approval')] },
      false,
    ),
  },
  {
    name: 'apply negative: output with wrong type rejected',
    run: () => runApply('apply-output-wrong-type', baton(), output({ results: 'not-an-array' }), false),
  },
  {
    name: 'apply negative: target cursor missing in workflow rejected',
    run: () => {
      const workflowDoc = structuredClone(baseWorkflowDoc);
      workflowDoc.workflow.steps.research.outcomes.ready_for_approval = 'missing_target';
      runApply('apply-missing-target-cursor', baton(), output(), false, workflowDoc);
    },
  },
];

for (const { name, run } of rejectedApplyCases) {
  test(name, run);
}

test('persistence: failed apply does not mutate input baton file', () => {
  runApply('persistence-failed-apply-no-mutate', baton(), output({ outcome: 'not_allowed' }), false);
});

test('persistence: inspect does not mutate input baton file', () => {
  runInspect('persistence-inspect-no-mutate', baton());
});

test('terminal: blocker output sets blocker status and cursor', () => {
  const blocker = { reason: 'dependency unavailable' };
  const response = runApply('terminal-blocker-output', baton(), output({ outcome: 'blocked', blocker }));
  assert.equal(response.baton.cursor, 'blocked');
  assert.equal(response.baton.status, 'blocked');
  assert.deepEqual(response.baton.blocker, blocker);
  assert.equal(response.directive.action, 'stop_blocked');
});

test('terminal: done path reaches done status', () => {
  const response = runApply(
    'terminal-done-status',
    baton({ cursor: 'review', state: { ...structuredClone(emptyState), artifacts: [artifact('implementation')] } }),
    { outcome: 'passed', artifacts: [artifact('review')] },
  );
  assert.equal(response.baton.cursor, 'done');
  assert.equal(response.baton.status, 'done');
  assert.equal(response.directive.action, 'stop_done');
});
