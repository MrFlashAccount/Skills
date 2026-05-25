#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const tempDir = mkdtempSync(path.join(tmpdir(), 'dev-harness-check-'));
const workflowPath = path.join(root, 'develop/dev-harness.workflow.json');
const baseWorkflowDoc = JSON.parse(readFileSync(workflowPath, 'utf8'));
const emptyState = Object.freeze({ artifacts: [], results: [], history: [], attempts: {} });
let scenarioCount = 0;

function clone(value) {
  return structuredClone(value);
}

function safeName(label) {
  return label.replace(/[^a-z0-9_-]+/gi, '-');
}

function writeJson(fileName, value) {
  const filePath = path.join(tempDir, fileName);
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
  return filePath;
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function baton(overrides = {}) {
  return {
    cursor: 'research',
    status: 'running',
    state: clone(emptyState),
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

function expectResult(label, result, expectSuccess) {
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
  const result = runNode(['develop/dev-harness-step.mjs', 'inspect', wfPath, batonPath]);
  const response = expectResult(label, result, expectSuccess);
  assert.equal(readFileSync(batonPath, 'utf8'), before, `check '${label}' mutated baton file during inspect`);
  return response;
}

function runApply(label, batonDoc, workerOutput, expectSuccess = true, workflowDoc = baseWorkflowDoc) {
  const prefix = safeName(label);
  const batonPath = writeJson(`${prefix}-baton.json`, batonDoc);
  const outputPath = writeJson(`${prefix}-output.json`, workerOutput);
  const wfPath = workflowDoc === baseWorkflowDoc ? workflowPath : writeJson(`${prefix}-workflow.json`, workflowDoc);
  const before = readFileSync(batonPath, 'utf8');
  const result = runNode(['develop/dev-harness-step.mjs', 'apply', wfPath, batonPath, outputPath]);
  const response = expectResult(label, result, expectSuccess);
  assert.equal(readFileSync(batonPath, 'utf8'), before, `check '${label}' mutated baton file during apply`);
  return response;
}

function scenario(label, fn) {
  scenarioCount += 1;
  try {
    fn();
  } catch (error) {
    process.stderr.write(`check '${label}' failed\n`);
    throw error;
  }
}

try {
  scenario('schema: malformed workflow shape rejected', () => {
    runInspect('schema-malformed-workflow', baton(), false, { workflow: { name: 'bad' } });
  });

  scenario('schema: malformed baton shape rejected', () => {
    runInspect('schema-malformed-baton', { cursor: 'research', state: clone(emptyState) }, false);
  });

  scenario('schema: malformed worker output shape rejected', () => {
    runApply('schema-malformed-output', baton(), { outcome: 42 }, false);
  });

  scenario('schema: extra top-level baton field rejected', () => {
    runInspect('schema-extra-top-level-field', baton({ next: 'approve_research' }), false);
  });

  scenario('schema: missing required baton state field rejected', () => {
    runInspect('schema-missing-state-field', baton({ state: { artifacts: [], results: [], history: [] } }), false);
  });

  scenario('inspect: initial cursor resolves to run-worker directive', () => {
    const initial = baton();
    const response = runInspect('inspect-initial-run-worker', initial);
    assert.equal(response.directive.id, 'research');
    assert.equal(response.directive.action, 'run_worker');
    assert.deepEqual(response.baton, initial);
  });

  scenario('inspect: approval cursor resolves to wait-for-approval directive', () => {
    const response = runInspect(
      'inspect-approval-wait',
      baton({ cursor: 'approve_research', state: { ...clone(emptyState), artifacts: [artifact('research')] } }),
    );
    assert.equal(response.directive.id, 'approve_research');
    assert.equal(response.directive.action, 'wait_for_approval');
  });

  scenario('inspect: terminal done cursor resolves to stop_done directive', () => {
    const response = runInspect('inspect-done-stop', baton({ cursor: 'done', status: 'done' }));
    assert.equal(response.directive.id, 'done');
    assert.equal(response.directive.action, 'stop_done');
  });

  scenario('inspect: blocked cursor resolves to stop_blocked directive', () => {
    const response = runInspect('inspect-blocked-stop', baton({ cursor: 'blocked', status: 'blocked' }));
    assert.equal(response.directive.id, 'blocked');
    assert.equal(response.directive.action, 'stop_blocked');
  });

  scenario('inspect: unknown cursor rejected', () => {
    runInspect('inspect-unknown-cursor', baton({ cursor: 'missing_step' }), false);
  });

  scenario('apply: worker produces required artifact and advances cursor', () => {
    const response = runApply('apply-worker-advances', baton(), output());
    assert.equal(response.baton.cursor, 'approve_research');
    assert.equal(response.baton.status, 'running');
    assert.equal(response.directive.action, 'wait_for_approval');
    assert.equal(response.baton.state.artifacts.at(-1).type, 'research');
  });

  scenario('apply: approval output produces approval artifact and advances cursor', () => {
    const response = runApply(
      'apply-approval-advances',
      baton({ cursor: 'approve_research', state: { ...clone(emptyState), artifacts: [artifact('research')] } }),
      { approval: 'approved', artifacts: [artifact('research_approval', 'approved')] },
    );
    assert.equal(response.baton.cursor, 'architecture');
    assert.equal(response.directive.action, 'run_worker');
    assert.equal(response.baton.state.artifacts.at(-1).type, 'research_approval');
    assert.ok(!('approval' in response.baton), 'approval state leaked to top-level baton');
  });

  scenario('apply: results are appended and existing results preserved', () => {
    const response = runApply(
      'apply-results-preserved',
      baton({ state: { ...clone(emptyState), results: [{ type: 'existing_result', summary: 'keep me' }] } }),
      output({ results: [{ type: 'research_summary', summary: 'operator note' }] }),
    );
    assert.deepEqual(response.baton.state.results.map((item) => item.type), ['existing_result', 'research_summary']);
  });

  scenario('apply: existing artifact with same id is replaced and other artifacts preserved', () => {
    const response = runApply(
      'apply-artifact-replace-by-id',
      baton({ state: { ...clone(emptyState), artifacts: [{ id: 'research-main', type: 'research', summary: 'stale' }, artifact('context')] } }),
      output({ artifacts: [{ id: 'research-main', type: 'research', summary: 'fresh' }] }),
    );
    assert.equal(response.baton.state.artifacts.length, 2);
    assert.equal(response.baton.state.artifacts.find((item) => item.id === 'research-main').summary, 'fresh');
    assert.ok(response.baton.state.artifacts.some((item) => item.type === 'context'));
  });

  scenario('apply: history event appended on successful apply', () => {
    const response = runApply('apply-history-appended', baton(), output());
    const event = response.baton.state.history.at(-1);
    assert.equal(event.event, 'handoff_applied');
    assert.equal(event.cursor, 'research');
    assert.equal(event.target, 'approve_research');
    assert.equal(event.handoff, 'ready_for_approval');
    assert.equal(event.status, 'running');
    assert.match(event.at, /^\d{4}-\d{2}-\d{2}T/);
  });

  scenario('apply negative: wrong handoff label rejected', () => {
    runApply('apply-wrong-handoff-label', baton(), output({ outcome: 'approved' }), false);
  });

  scenario('apply negative: missing required produced artifact rejected', () => {
    runApply('apply-missing-produced-artifact', baton(), output({ artifacts: [] }), false);
  });

  scenario('apply negative: stale existing artifact does not satisfy current produced artifact', () => {
    runApply(
      'apply-stale-existing-artifact-not-enough',
      baton({ state: { ...clone(emptyState), artifacts: [artifact('research', 'old research')] } }),
      output({ artifacts: [] }),
      false,
    );
  });

  scenario('apply negative: missing required taken artifact rejected', () => {
    runApply(
      'apply-missing-taken-artifact',
      baton({ cursor: 'approve_research' }),
      { approval: 'approved', artifacts: [artifact('research_approval')] },
      false,
    );
  });

  scenario('apply negative: worker step using approval rejected', () => {
    runApply('apply-worker-using-approval', baton(), { approval: 'approved', artifacts: [artifact('research')] }, false);
  });

  scenario('apply negative: approval step using outcome rejected', () => {
    runApply(
      'apply-approval-using-outcome',
      baton({ cursor: 'approve_research', state: { ...clone(emptyState), artifacts: [artifact('research')] } }),
      { outcome: 'approved', artifacts: [artifact('research_approval')] },
      false,
    );
  });

  scenario('apply negative: output with wrong type rejected', () => {
    runApply('apply-output-wrong-type', baton(), output({ results: 'not-an-array' }), false);
  });

  scenario('apply negative: target cursor missing in workflow rejected', () => {
    const workflowDoc = clone(baseWorkflowDoc);
    workflowDoc.workflow.steps.research.outcomes.ready_for_approval = 'missing_target';
    runApply('apply-missing-target-cursor', baton(), output(), false, workflowDoc);
  });

  scenario('persistence: failed apply does not mutate input baton file', () => {
    runApply('persistence-failed-apply-no-mutate', baton(), output({ outcome: 'not_allowed' }), false);
  });

  scenario('persistence: inspect does not mutate input baton file', () => {
    runInspect('persistence-inspect-no-mutate', baton());
  });

  scenario('terminal: blocker output sets blocker status and cursor', () => {
    const blocker = { reason: 'dependency unavailable' };
    const response = runApply('terminal-blocker-output', baton(), output({ outcome: 'blocked', blocker }));
    assert.equal(response.baton.cursor, 'blocked');
    assert.equal(response.baton.status, 'blocked');
    assert.deepEqual(response.baton.blocker, blocker);
    assert.equal(response.directive.action, 'stop_blocked');
  });

  scenario('terminal: done path reaches done status', () => {
    const response = runApply(
      'terminal-done-status',
      baton({ cursor: 'review', state: { ...clone(emptyState), artifacts: [artifact('implementation')] } }),
      { outcome: 'passed', artifacts: [artifact('review')] },
    );
    assert.equal(response.baton.cursor, 'done');
    assert.equal(response.baton.status, 'done');
    assert.equal(response.directive.action, 'stop_done');
  });

  console.log(`dev-harness static checks passed (${scenarioCount} scenarios)`);
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
