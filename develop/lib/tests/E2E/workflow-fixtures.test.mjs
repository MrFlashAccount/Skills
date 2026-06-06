import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';
import { fileURLToPath } from 'node:url';
import { resolveRunPaths } from '../../persistence/run-state/paths.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const fixturesDir = path.join(root, 'develop/lib/tests/E2E/fixtures');
const outputsDir = path.join(fixturesDir, 'outputs');
const tempDir = mkdtempSync(path.join(tmpdir(), 'workflow-e2e-fixtures-'));
let runCounter = 0;
const leaseTokensByRunId = new Map();

function fixture(name) {
  return path.join(fixturesDir, name);
}

function output(name) {
  return path.join(outputsDir, name);
}

function runDir(label) {
  runCounter += 1;
  const runId = `workflow-e2e-${process.pid}-${runCounter}-${label}`;
  const runDir = resolveRunPaths({ runId }).runDir;
  rmSync(runDir, { recursive: true, force: true });
  return { runId, runDir };
}

function runId(run) {
  return typeof run === 'string' ? run : run.runId;
}

function runPath(run) {
  return typeof run === 'string' ? run : run.runDir;
}

function valueAfter(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function claimRunForRunnerArgs(args) {
  const runIdValue = valueAfter(args, '--run-id');
  if (!runIdValue) return undefined;
  const known = leaseTokensByRunId.get(runIdValue);
  if (known) return known;
  const createArgs = ['develop/lib/entrypoints/cli/workflow-runs.mjs', 'create', '--claim', '--run-id', runIdValue];
  const workflow = valueAfter(args, '--workflow');
  if (workflow !== undefined) createArgs.push('--workflow', workflow);
  const created = spawnSync(process.execPath, createArgs, { cwd: root, encoding: 'utf8' });
  assert.equal(created.status, 0, `claim ${runIdValue} failed\nstdout:\n${created.stdout}\nstderr:\n${created.stderr}`);
  const token = JSON.parse(created.stdout).leaseToken;
  leaseTokensByRunId.set(runIdValue, token);
  return token;
}

function withLeaseToken(args, token) {
  if (!token || args.includes('--lease-token')) return args;
  return [...args, '--lease-token', token];
}

function runRunner(args) {
  const token = claimRunForRunnerArgs(args);
  return spawnSync(process.execPath, ['develop/lib/entrypoints/cli/workflow-runner.mjs', ...withLeaseToken(args, token)], {
    cwd: root,
    encoding: 'utf8',
  });
}

function expectRunner(args, label) {
  const result = runRunner(args);
  assert.equal(result.status, 0, `${label} failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  return JSON.parse(result.stdout);
}

function expectRunnerFailure(args, label) {
  const result = runRunner(args);
  assert.notEqual(result.status, 0, `${label} unexpectedly succeeded\nstdout:\n${result.stdout}`);
  return result;
}

function next(run, workflow, extra = []) {
  return expectRunner(['next', '--run-id', runId(run), '--workflow', workflow, ...extra], `next ${path.basename(workflow)}`);
}

function continueWith(run, workflow, refs, label = 'continue') {
  const normalized = Array.isArray(refs) ? refs : [refs];
  return expectRunner(['continue', '--run-id', runId(run), '--workflow', workflow, ...normalized.flatMap((ref) => ['--output', ref])], label);
}

function instructions(run, stepId) {
  const result = runRunner(['instructions', '--run-id', runId(run), '--step-id', stepId]);
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

function readBaton(run) {
  return JSON.parse(readFileSync(path.join(runPath(run), 'baton.json'), 'utf8'));
}

function readHistory(run) {
  return readFileSync(path.join(runPath(run), 'history.md'), 'utf8');
}

function writeRunArtifact(run, artifactPath, content) {
  const fullPath = path.join(runPath(run), artifactPath);
  mkdirSync(path.dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, content);
}

after(() => rmSync(tempDir, { recursive: true, force: true }));

test('E2E fixture: long happy path loops through review revision and preserves latest state', () => {
  const workflow = fixture('long-revision.workflow.json');
  const run = runDir('long-revision');

  const first = next(run, workflow);
  assert.equal(first.status, 'needs_host_actions');
  assert.deepEqual(first.requests.map((request) => request.id), ['plan']);
  assert.match(instructions(run, 'plan'), /# Plan/);

  writeRunArtifact(run, 'plan/artifacts/plan.md', 'Plan artifact content for approval.\n');
  const planned = continueWith(run, workflow, output('plan-ready.json'), 'continue plan');
  assert.equal(planned.baton.cursor, 'approval_gate');
  assert.equal(planned.requests[0].action, 'wait_for_approval');
  assert.equal(planned.baton.state.plan.artifacts[0].summary, 'plan v1');

  const approved = continueWith(run, workflow, output('approval-approved.json'), 'continue approval');
  assert.equal(approved.baton.cursor, 'implement');
  assert.equal(approved.baton.state.approval_gate.approval, 'approved');
  assert.match(instructions(run, 'implement'), /"approval_gate"/);

  assert.equal(continueWith(run, workflow, output('implement-v1.json'), 'continue implementation v1').baton.cursor, 'review');
  const revision = continueWith(run, workflow, output('review-retry.json'), 'continue review retry');
  assert.equal(revision.baton.cursor, 'implement');
  assert.equal(revision.baton.state.review.results[0].summary, 'needs revision');

  assert.equal(continueWith(run, workflow, output('implement-v2.json'), 'continue implementation v2').baton.cursor, 'review');
  const done = continueWith(run, workflow, output('review-ready.json'), 'continue review ready');
  assert.equal(done.status, 'done');
  assert.equal(done.baton.cursor, 'done');
  assert.equal(done.baton.state.implement.results[0].summary, 'implementation v2');
  assert.equal(done.baton.state.results.at(-1).summary, 'accepted');
  assert.match(readHistory(run), /id=review action=run_worker/);
});

test('E2E fixture: DevHarness-style artifact path exposes actual content to downstream review instructions', () => {
  const workflow = fixture('long-revision.workflow.json');
  const run = runDir('artifact-content');

  next(run, workflow);
  writeRunArtifact(run, 'plan/artifacts/plan.md', 'Plan artifact content for approval.\n');
  continueWith(run, workflow, output('plan-ready.json'), 'continue plan for artifact content');
  continueWith(run, workflow, output('approval-approved.json'), 'continue approval for artifact content');

  writeRunArtifact(run, 'implement/artifacts/packet.md', 'Concrete implementation artifact content for reviewer.\n');
  const implementOutputPath = path.join(tempDir, 'implement-with-readable-artifact.json');
  writeFileSync(implementOutputPath, `${JSON.stringify({
    outcome: 'ready',
    results: [{ type: 'implementation', summary: 'implementation with readable artifact' }],
    artifacts: [{ id: 'packet', content_type: 'text/markdown', path: 'implement/artifacts/packet.md', summary: 'readable packet' }],
  }, null, 2)}\n`);

  const reviewRequest = continueWith(run, workflow, implementOutputPath, 'continue implementation readable artifact');
  assert.equal(reviewRequest.baton.cursor, 'review');
  const reviewInstructions = instructions(run, 'review');
  assert.match(reviewInstructions, /### Projected artifact content/);
  assert.match(reviewInstructions, /Concrete implementation artifact content for reviewer\./);
});

test('E2E fixture: match route covers retry loop and blocked terminal variant', () => {
  const workflow = fixture('route-retry-blocked.workflow.json');
  const retryRun = runDir('route-retry');

  assert.deepEqual(next(retryRun, workflow).requests.map((request) => request.id), ['triage']);
  const retry = continueWith(retryRun, workflow, output('triage-retry.json'), 'continue triage retry');
  assert.equal(retry.status, 'needs_host_actions');
  assert.equal(retry.baton.cursor, 'triage');
  assert.equal(retry.baton.state.triage.results[0].summary, 'needs another pass');

  const ready = continueWith(retryRun, workflow, output('triage-ready.json'), 'continue triage ready');
  assert.equal(ready.baton.cursor, 'resolve');
  assert.match(instructions(retryRun, 'resolve'), /ready for resolution/);
  const done = continueWith(retryRun, workflow, output('worker-ready.json'), 'continue resolve ready');
  assert.equal(done.status, 'done');

  const blockedRun = runDir('route-blocked');
  next(blockedRun, workflow);
  const blocked = continueWith(blockedRun, workflow, output('triage-blocked.json'), 'continue triage blocked');
  assert.equal(blocked.status, 'blocked');
  assert.equal(blocked.baton.cursor, 'blocked');
  assert.deepEqual(blocked.baton.blocker, { reason: 'missing decision' });
  assert.match(readHistory(blockedRun), /blocker: \{"reason":"missing decision"\}/);
});

test('E2E fixture: mixed static and match fanout requires named branch outputs and exposes join state', () => {
  const workflow = fixture('parallel-mixed.workflow.json');
  const run = runDir('parallel-mixed');

  next(run, workflow);
  const branched = continueWith(run, workflow, output('parallel-prepare-ready.json'), 'continue prepare fanout');
  assert.equal(branched.status, 'needs_host_actions');
  assert.equal(branched.baton.cursor, 'prepare');
  assert.deepEqual(branched.requests.map((request) => request.id), ['lint', 'build']);
  assert.equal(branched.baton.state.prepare.results[0].summary, 'fanout ready');
  assert.match(instructions(run, 'lint'), /fanout ready/);

  const joined = continueWith(run, workflow, [
    `lint=${output('lint-ready.json')}`,
    `build=${output('build-ready.json')}`,
  ], 'continue named branches');
  assert.equal(joined.baton.cursor, 'join');
  assert.equal(joined.baton.state.lint.results[0].summary, 'lint clean');
  assert.equal(joined.baton.state.build.results[0].summary, 'build green');
  const joinInstructions = instructions(run, 'join');
  assert.match(joinInstructions, /lint clean/);
  assert.match(joinInstructions, /build green/);

  const done = continueWith(run, workflow, output('join-ready.json'), 'continue join');
  assert.equal(done.status, 'done');
  assert.match(readHistory(run), /output: lint=.*lint-ready\.json, build=.*build-ready\.json/);

  const unnamedRun = runDir('parallel-unnamed-output');
  next(unnamedRun, workflow);
  continueWith(unnamedRun, workflow, output('parallel-prepare-ready.json'), 'continue unnamed setup');
  const unnamed = expectRunnerFailure(['continue', '--run-id', runId(unnamedRun), '--workflow', workflow, '--output', output('lint-ready.json')], 'unnamed parallel output');
  assert.match(unnamed.stderr, /parallel host outputs must use --output <step-id>=<path>/);
});

test('E2E fixture: output schema retries preserve baton attempts, then valid output advances', () => {
  const workflow = fixture('schema-retry.workflow.json');
  const run = runDir('schema-retry');

  next(run, workflow);
  const retry = continueWith(run, workflow, output('schema-invalid.json'), 'continue invalid schema once');
  assert.equal(retry.status, 'needs_host_actions');
  assert.equal(retry.baton.cursor, 'schema_worker');
  assert.equal(retry.baton.state.attempts['schema_worker:output.schema'], 1);
  assert.match(instructions(run, 'schema_worker'), /Previous output failed output\.schema validation/);
  assert.match(instructions(run, 'schema_worker'), /must be equal to constant/);

  const valid = continueWith(run, workflow, output('schema-valid.json'), 'continue valid schema');
  assert.equal(valid.status, 'done');
  assert.equal(valid.baton.state.schema_worker.ticket, 'TCK-123');
  assert.equal(valid.baton.state.attempts['schema_worker:output.schema'], 1);

  const failureRun = runDir('schema-failure');
  next(failureRun, workflow);
  continueWith(failureRun, workflow, output('schema-invalid.json'), 'schema failure attempt one');
  continueWith(failureRun, workflow, output('schema-invalid.json'), 'schema failure attempt two');
  const failed = expectRunnerFailure(['continue', '--run-id', runId(failureRun), '--workflow', workflow, '--output', output('schema-invalid.json')], 'schema failure attempt three');
  assert.match(failed.stderr, /output schema validation failed for step 'schema_worker' after 3 attempts/);
  assert.equal(readBaton(failureRun).state.attempts['schema_worker:output.schema'], 2);
});

test('E2E fixture: approval-first workflow preserves startup prompt for first worker only through fanout and final approval', () => {
  const workflow = fixture('approval-first-fanout.workflow.json');
  const run = runDir('approval-first');
  const userPrompt = 'Original startup request. Preserve this only for prepare.';

  const intake = next(run, workflow, ['--user-prompt', userPrompt]);
  assert.equal(intake.requests[0].id, 'intake_approval');
  assert.equal(intake.baton.user_prompt, userPrompt);
  assert.equal(intake.baton.user_prompt_target, 'prepare');
  assert.doesNotMatch(instructions(run, 'intake_approval'), /Original startup request/);

  const preparedRequest = continueWith(run, workflow, output('approval-approved.json'), 'continue intake approval');
  assert.equal(preparedRequest.baton.cursor, 'prepare');
  const prepareInstructions = instructions(run, 'prepare');
  assert.match(prepareInstructions, /## User prompt/);
  assert.match(prepareInstructions, /Original startup request/);

  const fanout = continueWith(run, workflow, output('parallel-prepare-ready.json'), 'continue prepare to fanout');
  assert.equal(fanout.baton.user_prompt_injected, true);
  assert.deepEqual(fanout.requests.map((request) => request.id), ['branch_a', 'branch_b']);
  assert.doesNotMatch(instructions(run, 'branch_a'), /Original startup request/);
  assert.doesNotMatch(instructions(run, 'branch_b'), /Original startup request/);

  const joinedRequest = continueWith(run, workflow, [
    `branch_a=${output('lint-ready.json')}`,
    `branch_b=${output('build-ready.json')}`,
  ], 'continue approval-first branches');
  assert.equal(joinedRequest.baton.cursor, 'join');
  assert.doesNotMatch(instructions(run, 'join'), /Original startup request/);

  const finalApproval = continueWith(run, workflow, output('join-ready.json'), 'continue approval-first join');
  assert.equal(finalApproval.baton.cursor, 'final_approval');
  assert.equal(finalApproval.requests[0].action, 'wait_for_approval');
  assert.match(instructions(run, 'final_approval'), /joined cleanly/);

  const done = continueWith(run, workflow, output('approval-approved.json'), 'continue final approval');
  assert.equal(done.status, 'done');
  assert.equal(done.baton.user_prompt, userPrompt);
  assert.equal(done.baton.user_prompt_injected, true);
});
