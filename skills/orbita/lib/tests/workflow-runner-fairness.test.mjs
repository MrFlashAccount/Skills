// Freezes worker-lease fairness boundaries around runner actions before deeper ownership refactors.
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';
import { continueRun as runnerContinue, loadInstructions as runnerLoadInstructions, next as runnerNext, writeOutput as runnerWriteOutput } from '../entrypoints/workflow-runner-command.mjs';
import { WORKFLOW_RUNNER_COMMAND as workflowRunnerCommand } from '../entrypoints/internal/runner/runner-command-builder.mjs';
import { claimWorkflowRunAtRoot, registerWorkflowRunAtRoot } from '../persistence/run-state/workflow-runs.mjs';
import { hashLeaseToken } from '../persistence/run-state/lease-authority.mjs';
import { resolveRunPaths } from '../persistence/run-state/paths.mjs';

const tempDir = mkdtempSync(path.join(tmpdir(), 'workflow-runner-fairness-'));
writeFileSync(path.join(tempDir, 'output.md'), '## Output contract\nReturn markdown.\n');

const workflowDoc = {
  name: 'runner-fairness-check',
  version: 1,
  start: 'prepare',
  done: 'done',
  blocked: 'blocked',
  steps: {
    prepare: {
      name: 'Prepare',
      kind: 'worker',
      input: { prompt: 'Prepare.' },
      output: { template: 'output.md' },
      next: 'done',
    },
    done: { name: 'Done', kind: 'done', input: { prompt: 'Finished.' } },
    blocked: { name: 'Blocked', kind: 'blocked', input: { prompt: 'Blocked.' } },
  },
};

function writeJson(filePath, value) {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function runCase(label, workflowPath) {
  const runId = `workflow-runner-fairness-${process.pid}-${label}`;
  const runDir = resolveRunPaths({ runId, workflowPath }).runDir;
  rmSync(runDir, { recursive: true, force: true });
  return { runId, runDir };
}

function readIfExists(filePath) {
  return existsSync(filePath) ? readFileSync(filePath, 'utf8') : undefined;
}

function snapshotRunState(paths) {
  const indexContent = readIfExists(paths.runsIndexPath);
  return {
    runDirExists: existsSync(paths.runDir),
    runnerDirExists: existsSync(paths.runnerDir),
    continueLockExists: existsSync(paths.continueLockPath),
    instructionsDirExists: existsSync(paths.instructionsDir),
    baton: readIfExists(paths.batonPath),
    history: readIfExists(paths.historyPath),
    indexEntry: indexContent === undefined ? undefined : JSON.parse(indexContent).runs[paths.runId],
  };
}

function workerOutput(summary) {
  return { outcome: 'ready', results: [{ type: 'check', summary }] };
}

function debugSummaryFileFor({ runId, workflowPath, stepId, text = 'worker debug summary\n' }) {
  const debugSummaryFile = path.join(resolveRunPaths({ runId, workflowPath }).runDir, stepId, 'debug-summary.md');
  mkdirSync(path.dirname(debugSummaryFile), { recursive: true });
  writeFileSync(debugSummaryFile, text);
  return debugSummaryFile;
}

async function writeCurrentOutput({ runId, workflowPath, leaseToken, summary, now = new Date('2026-06-01T10:00:02.000Z') }) {
  return runnerWriteOutput({
    runId,
    workflowPath,
    stepId: 'prepare',
    json: JSON.stringify(workerOutput(summary)),
    debugSummaryFile: debugSummaryFileFor({ runId, workflowPath, stepId: 'prepare' }),
    leaseToken,
    now,
  });
}

after(() => rmSync(tempDir, { recursive: true, force: true }));

test('runner fairness: missing-token API next does not create runtime artifacts for an unregistered run', async () => {
  const workflowPath = path.join(tempDir, 'missing-token-next-no-artifacts.json');
  writeJson(workflowPath, workflowDoc);
  const { runId } = runCase('missing-token-next-no-artifacts', workflowPath);
  const paths = resolveRunPaths({ runId, workflowPath });
  const before = snapshotRunState(paths);

  await assert.rejects(
    () => runnerNext({ runId, workflowPath, now: new Date('2026-06-01T10:00:01.000Z') }),
    /workflow run token is required/,
  );

  assert.deepEqual(snapshotRunState(paths), before);
});

test('runner fairness: unauthorized API next does not mutate baton, history, or runs index', async () => {
  const workflowPath = path.join(tempDir, 'unauthorized-next-no-mutation.json');
  writeJson(workflowPath, workflowDoc);
  const { runId } = runCase('unauthorized-next-no-mutation', workflowPath);
  const paths = resolveRunPaths({ runId, workflowPath });
  const claim = await registerWorkflowRunAtRoot({ runId, workflowPath, claim: true, owner: 'alice', harness: 'portable', sessionId: 'session-a', leaseMs: 60_000, now: new Date('2026-06-01T10:00:00.000Z') });
  const before = snapshotRunState(paths);

  await assert.rejects(
    () => runnerNext({ runId, workflowPath, owner: 'bob', harness: 'portable', sessionId: 'session-b', now: new Date('2026-06-01T10:00:01.000Z') }),
    /workflow run token is required/,
  );

  assert.deepEqual(snapshotRunState(paths), before);
});

test('runner fairness: unauthorized API continue does not update status early or mutate state', async () => {
  const workflowPath = path.join(tempDir, 'unauthorized-continue-no-mutation.json');
  writeJson(workflowPath, workflowDoc);
  const { runId } = runCase('unauthorized-continue-no-mutation', workflowPath);
  const paths = resolveRunPaths({ runId, workflowPath });
  const claim = await registerWorkflowRunAtRoot({ runId, workflowPath, claim: true, owner: 'alice', harness: 'portable', sessionId: 'session-a', leaseMs: 60_000, now: new Date('2026-06-01T10:00:00.000Z') });
  await runnerNext({ runId, workflowPath, leaseToken: claim.leaseToken, now: new Date('2026-06-01T10:00:01.000Z') });
  for (const leaseToken of ['wrong-token', '<lease-token>', `${claim.leaseToken.slice(0, 12)}…truncated`, `model-invented-token-${process.pid}`]) {
    const before = snapshotRunState(paths);
    await assert.rejects(
      () => runnerContinue({ runId, workflowPath, leaseToken, now: new Date('2026-06-01T10:00:02.000Z') }),
      /workflow run is occupied/,
    );
    assert.deepEqual(snapshotRunState(paths), before);
  }
});

test('runner fairness: expired worker lease does not alter lifecycle status', async () => {
  const workflowPath = path.join(tempDir, 'expired-lease-no-status-mutation.json');
  writeJson(workflowPath, workflowDoc);
  const { runId } = runCase('expired-lease-no-status-mutation', workflowPath);
  const paths = resolveRunPaths({ runId, workflowPath });
  await registerWorkflowRunAtRoot({ runId, workflowPath, status: 'needs_host_actions', claim: true, owner: 'alice', harness: 'portable', sessionId: 'session-a', leaseMs: 1_000, now: new Date('2026-06-01T10:00:00.000Z') });
  const before = snapshotRunState(paths);

  await assert.rejects(
    () => runnerNext({ runId, workflowPath, leaseToken: 'expired-token', now: new Date('2026-06-01T10:00:02.000Z') }),
    /workflow run lease is stale/,
  );

  assert.deepEqual(snapshotRunState(paths), before);
});

test('runner fairness: stale tokenless claim does not rotate saved token before host continue', async () => {
  const workflowPath = path.join(tempDir, 'stale-tokenless-claim-no-rotation-before-continue.json');
  writeJson(workflowPath, workflowDoc);
  const { runId } = runCase('stale-tokenless-claim-no-rotation-before-continue', workflowPath);
  const paths = resolveRunPaths({ runId, workflowPath });
  const claim = await registerWorkflowRunAtRoot({ runId, workflowPath, claim: true, owner: 'alice', harness: 'portable', sessionId: 'session-a', leaseMs: 1_000, now: new Date('2026-06-01T10:00:00.000Z') });
  await runnerNext({ runId, workflowPath, leaseToken: claim.leaseToken, now: new Date('2026-06-01T10:00:00.500Z') });
  const beforeLease = snapshotRunState(paths).indexEntry.workerLease;

  const staleClaim = await claimWorkflowRunAtRoot({ runId, workflowPath, owner: 'alice', harness: 'portable', sessionId: 'session-a', leaseMs: 60_000, now: new Date('2026-06-01T11:00:02.000Z') });

  assert.equal(staleClaim.ok, false);
  assert.equal(staleClaim.reason, 'stale');
  assert.equal(snapshotRunState(paths).indexEntry.workerLease.tokenHash, beforeLease.tokenHash);

  await writeCurrentOutput({ runId, workflowPath, leaseToken: claim.leaseToken, summary: 'stale token continue output', now: new Date('2026-06-01T11:00:02.500Z') });
  const continued = await runnerContinue({ runId, workflowPath, leaseToken: claim.leaseToken, now: new Date('2026-06-01T11:00:03.000Z') });

  assert.equal(continued.status, 'done');
  assert.equal(continued.baton.cursor, 'done');
  const afterLease = snapshotRunState(paths).indexEntry.workerLease;
  assert.equal(afterLease.tokenHash, beforeLease.tokenHash);
  assert.equal(afterLease.leaseExpiresAt, '2026-06-01T12:00:03.000Z');
});

test('runner fairness: next renews matching lease authority on successful render', async () => {
  const workflowPath = path.join(tempDir, 'next-renews-lease-authority.json');
  writeJson(workflowPath, workflowDoc);
  const { runId } = runCase('next-renews-lease-authority', workflowPath);
  const paths = resolveRunPaths({ runId, workflowPath });
  const claim = await registerWorkflowRunAtRoot({ runId, workflowPath, claim: true, owner: 'alice', harness: 'portable', sessionId: 'session-a', leaseMs: 1_000, now: new Date('2026-06-01T10:00:00.000Z') });

  await runnerNext({ runId, workflowPath, leaseToken: claim.leaseToken, now: new Date('2026-06-01T10:00:00.500Z') });

  const lease = snapshotRunState(paths).indexEntry.workerLease;
  assert.equal(lease.tokenHash, hashLeaseToken(claim.leaseToken));
  assert.equal(lease.leaseExpiresAt, '2026-06-01T11:00:00.500Z');
});

test('runner fairness: loadInstructions renews matching lease authority on successful read', async () => {
  const workflowPath = path.join(tempDir, 'load-instructions-renews-lease-authority.json');
  writeJson(workflowPath, workflowDoc);
  const { runId } = runCase('load-instructions-renews-lease-authority', workflowPath);
  const paths = resolveRunPaths({ runId, workflowPath });
  const claim = await registerWorkflowRunAtRoot({ runId, workflowPath, claim: true, owner: 'alice', harness: 'portable', sessionId: 'session-a', leaseMs: 60_000, now: new Date('2026-06-01T10:00:00.000Z') });
  await runnerNext({ runId, workflowPath, leaseToken: claim.leaseToken, now: new Date('2026-06-01T10:00:01.000Z') });

  const instructions = await runnerLoadInstructions({ runId, workflowPath, stepId: 'prepare', leaseToken: claim.leaseToken, now: new Date('2026-06-01T10:05:00.000Z') });

  assert.match(instructions, /Prepare\./);
  const lease = snapshotRunState(paths).indexEntry.workerLease;
  assert.equal(lease.tokenHash, hashLeaseToken(claim.leaseToken));
  assert.equal(lease.leaseExpiresAt, '2026-06-01T11:05:00.000Z');
});

test('runner fairness: writeOutput renews matching lease authority on accepted output', async () => {
  const workflowPath = path.join(tempDir, 'write-output-renews-lease-authority.json');
  writeJson(workflowPath, workflowDoc);
  const { runId } = runCase('write-output-renews-lease-authority', workflowPath);
  const paths = resolveRunPaths({ runId, workflowPath });
  const claim = await registerWorkflowRunAtRoot({ runId, workflowPath, claim: true, owner: 'alice', harness: 'portable', sessionId: 'session-a', leaseMs: 60_000, now: new Date('2026-06-01T10:00:00.000Z') });
  await runnerNext({ runId, workflowPath, leaseToken: claim.leaseToken, now: new Date('2026-06-01T10:00:01.000Z') });

  await writeCurrentOutput({ runId, workflowPath, leaseToken: claim.leaseToken, summary: 'accepted output renews lease', now: new Date('2026-06-01T10:10:00.000Z') });

  const lease = snapshotRunState(paths).indexEntry.workerLease;
  assert.equal(lease.tokenHash, hashLeaseToken(claim.leaseToken));
  assert.equal(lease.leaseExpiresAt, '2026-06-01T11:10:00.000Z');
});

test('runner fairness: old holder continue after stale takeover rejects without mutating baton', async () => {
  const workflowPath = path.join(tempDir, 'old-holder-continue-after-takeover.json');
  writeJson(workflowPath, workflowDoc);
  const { runId } = runCase('old-holder-continue-after-takeover', workflowPath);
  const paths = resolveRunPaths({ runId, workflowPath });
  const oldClaim = await registerWorkflowRunAtRoot({ runId, workflowPath, claim: true, owner: 'alice', harness: 'portable', sessionId: 'session-a', leaseMs: 1_000, now: new Date('2026-06-01T10:00:00.000Z') });
  await runnerNext({ runId, workflowPath, leaseToken: oldClaim.leaseToken, now: new Date('2026-06-01T10:00:00.500Z') });
  const takeover = await claimWorkflowRunAtRoot({ runId, workflowPath, owner: 'bob', harness: 'portable', sessionId: 'session-b', leaseMs: 60_000, takeover: true, now: new Date('2026-06-01T11:00:02.000Z') });
  assert.equal(takeover.ok, true);
  const before = snapshotRunState(paths);

  await assert.rejects(
    () => runnerContinue({ runId, workflowPath, leaseToken: oldClaim.leaseToken, now: new Date('2026-06-01T11:00:03.000Z') }),
    /workflow run is occupied/,
  );

  assert.deepEqual(snapshotRunState(paths), before);
});

test('runner fairness: loadInstructions rejects unauthorized lease identity', async () => {
  const workflowPath = path.join(tempDir, 'load-instructions-lease-authority.json');
  writeJson(workflowPath, workflowDoc);
  const { runId } = runCase('load-instructions-lease-authority', workflowPath);
  const claim = await registerWorkflowRunAtRoot({ runId, workflowPath, claim: true, owner: 'alice', harness: 'portable', sessionId: 'session-a', leaseMs: 60_000, now: new Date('2026-06-01T10:00:00.000Z') });
  await runnerNext({ runId, workflowPath, leaseToken: claim.leaseToken, now: new Date('2026-06-01T10:00:01.000Z') });

  await assert.rejects(
    () => runnerLoadInstructions({ runId, workflowPath, stepId: 'prepare', leaseToken: 'wrong-token', now: new Date('2026-06-01T10:00:02.000Z') }),
    /workflow run is occupied/,
  );
});

test('runner fairness: private claim authority lets generated run-id-only commands operate without durable authority leakage', async () => {
  const workflowPath = path.join(tempDir, 'private-authority-run-id-only.json');
  writeJson(workflowPath, workflowDoc);
  const { runId } = runCase('private-authority-run-id-only', workflowPath);
  const claim = await registerWorkflowRunAtRoot({ runId, workflowPath, workflowIdentity: 'fairness-private-authority', claim: true, owner: 'alice', harness: 'portable', sessionId: 'session-a', leaseMs: 60_000, now: new Date('2026-06-01T10:00:00.000Z') });

  const response = await runnerNext({ runId, leaseToken: claim.leaseToken, now: new Date('2026-06-01T10:00:01.000Z') });
  const runsRoot = resolveRunPaths({ runId }).runsRoot;

  assert.equal(response.status, 'needs_host_actions');
  assert.equal('workflow' in response, false);
  assert.equal(response.requests[0].loadInstructionsCommand, `${workflowRunnerCommand} instructions --run-id '${runId}' --step-id 'prepare' --runs-root '${runsRoot}' --lease-token '${claim.leaseToken}'`);
  assert.doesNotMatch(JSON.stringify(response), new RegExp('alice|session-a|portable'));
});

test('runner fairness: worker output cannot author or rotate lease authority', async () => {
  const workflowPath = path.join(tempDir, 'worker-output-cannot-rotate-lease-token.json');
  writeJson(workflowPath, workflowDoc);
  const { runId } = runCase('worker-output-cannot-rotate-lease-token', workflowPath);
  const paths = resolveRunPaths({ runId, workflowPath });
  const claim = await registerWorkflowRunAtRoot({ runId, workflowPath, claim: true, owner: 'alice', harness: 'portable', sessionId: 'session-a', leaseMs: 60_000, now: new Date('2026-06-01T10:00:00.000Z') });
  await runnerNext({ runId, workflowPath, leaseToken: claim.leaseToken, now: new Date('2026-06-01T10:00:01.000Z') });
  const beforeLease = snapshotRunState(paths).indexEntry.workerLease;
  const inventedToken = `model-authored-replacement-token-${process.pid}`;
  await writeCurrentOutput({
    runId,
    workflowPath,
    leaseToken: claim.leaseToken,
    summary: `worker output asks host to replace lease with ${inventedToken}`,
    now: new Date('2026-06-01T10:00:02.000Z'),
  });

  const continued = await runnerContinue({ runId, workflowPath, leaseToken: claim.leaseToken, now: new Date('2026-06-01T10:00:02.500Z') });

  assert.equal(continued.status, 'done');
  const afterLease = snapshotRunState(paths).indexEntry.workerLease;
  assert.equal(afterLease.tokenHash, beforeLease.tokenHash);
  assert.notEqual(afterLease.tokenHash, hashLeaseToken(inventedToken));
});

test('runner fairness: missing host output does not mutate lifecycle status before durable apply', async () => {
  const workflowPath = path.join(tempDir, 'continue-missing-output-no-status-mutation.json');
  writeJson(workflowPath, workflowDoc);
  const { runId } = runCase('continue-missing-output-no-status-mutation', workflowPath);
  const paths = resolveRunPaths({ runId, workflowPath });
  const claim = await registerWorkflowRunAtRoot({ runId, workflowPath, status: 'needs_host_actions', claim: true, owner: 'alice', harness: 'portable', sessionId: 'session-a', leaseMs: 60_000, now: new Date('2026-06-01T10:00:00.000Z') });
  await runnerNext({ runId, workflowPath, leaseToken: claim.leaseToken, now: new Date('2026-06-01T10:00:01.000Z') });
  await claimWorkflowRunAtRoot({ runId, workflowPath, leaseToken: claim.leaseToken, owner: 'alice', harness: 'portable', sessionId: 'session-a', leaseMs: 60_000, now: new Date('2026-06-01T10:00:02.000Z') });
  const before = snapshotRunState(paths);

  await assert.rejects(
    () => runnerContinue({ runId, leaseToken: claim.leaseToken, now: new Date('2026-06-01T10:00:03.000Z') }),
    /missing accepted host output/,
  );

  const after = snapshotRunState(paths);
  assert.equal(after.baton, before.baton);
  assert.equal(after.runDirExists, before.runDirExists);
  assert.equal(after.runnerDirExists, before.runnerDirExists);
  assert.equal(after.continueLockExists, before.continueLockExists);
  assert.equal(after.instructionsDirExists, before.instructionsDirExists);
  assert.deepEqual(after.indexEntry, before.indexEntry);
  const failureEntry = after.history.slice(before.history.length);
  assert.match(failureEntry, /source: workflow-runner-failure/);
  assert.match(failureEntry, /public failure: command=continue/);
  assert.match(failureEntry, /missing accepted host output for workflow step prepare/);
});
