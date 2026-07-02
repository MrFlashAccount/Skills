import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';
import { bindAgent, continueRun, loadInstructions, next, writeOutput } from '../entrypoints/workflow-runner-command.mjs';
import { WORKFLOW_RUNNER_COMMAND as workflowRunnerCommand } from '../entrypoints/internal/runner/runner-command-builder.mjs';
import { resolveRunPaths } from '../persistence/run-state/paths.mjs';
import { readRunsIndex } from '../persistence/run-state/run-index.mjs';
import { registerWorkflowRunAtRoot } from '../persistence/run-state/workflow-runs.mjs';

const tempDir = mkdtempSync(path.join(tmpdir(), 'workflow-runner-reuse-hints-'));
const testNow = new Date('2026-06-01T10:00:01.000Z');
writeFileSync(path.join(tempDir, 'output.md'), '## Output contract\nReturn markdown.\n');

const workflowDoc = {
  name: 'runner-reuse-hints-check',
  version: 1,
  start: 'prepare',
  done: 'done',
  steps: {
    prepare: {
      name: 'Prepare',
      kind: 'worker',
      input: { prompt: 'Prepare branch.' },
      output: { template: 'output.md' },
      next: ['branch_a', 'branch_b'],
    },
    branch_a: {
      name: 'Branch A',
      kind: 'worker',
      input: { prompt: 'Run branch A.' },
      output: { template: 'output.md' },
      next: 'join',
    },
    branch_b: {
      name: 'Branch B',
      kind: 'worker',
      input: { prompt: 'Run branch B.' },
      output: { template: 'output.md' },
      next: 'join',
    },
    join: {
      name: 'Join',
      kind: 'worker',
      input: { prompt: 'Join branch output.' },
      output: { template: 'output.md' },
      next: 'done',
    },
    done: { name: 'Done', kind: 'done', input: { prompt: 'Finished.' } },
  },
};

function writeJson(filePath, value) {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function readBaton(runDir) {
  return JSON.parse(readFileSync(path.join(runDir, 'baton.json'), 'utf8'));
}

function workerOutput(summary) {
  return { outcome: 'ready', results: [{ type: 'check', summary }] };
}

function debugSummaryFileFor(runDir, stepId, text = `debug summary for ${stepId}\n`) {
  const filePath = path.join(runDir, stepId, 'debug-summary.md');
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, text, { flag: 'w' });
  return filePath;
}

function schemaCoveredWorkflow(overrides = {}) {
  const schemaPath = path.join(tempDir, `worker-output-${process.pid}-${Math.random().toString(16).slice(2)}.schema.json`);
  writeJson(schemaPath, {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    required: ['outcome'],
    properties: {
      outcome: { type: 'string' },
      results: { type: 'array' },
      artifacts: { type: 'array' },
    },
    additionalProperties: true,
  });
  const workflow = structuredClone(workflowDoc);
  for (const step of Object.values(workflow.steps)) {
    if (step.kind === 'worker') step.output = { template: 'output.md', schema: path.basename(schemaPath) };
  }
  Object.assign(workflow.steps.prepare, overrides.prepare ?? {});
  Object.assign(workflow.steps.branch_a, overrides.branchA ?? {});
  Object.assign(workflow.steps.branch_b, overrides.branchB ?? {});
  Object.assign(workflow.steps.join, overrides.join ?? {});
  return workflow;
}

function devHarnessImplementationSchema() {
  const schemaDir = path.join(tempDir, 'schemas');
  mkdirSync(schemaDir, { recursive: true });
  const schemaPath = path.join(schemaDir, 'implementation-output.json');
  writeJson(schemaPath, {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    required: ['outcome'],
    properties: {
      outcome: { enum: ['implemented', 'blocked', 'ready'] },
      implementation_handoff: { type: 'object' },
      changed_files: { type: 'array' },
      verification: { type: 'array' },
      blocker: { type: 'object', additionalProperties: true },
      results: { type: 'array' },
      artifacts: { type: 'array' },
    },
    additionalProperties: true,
  });
  return path.basename(schemaPath);
}

function devHarnessImplementationWorkflow({ parallel = false } = {}) {
  devHarnessImplementationSchema();
  const implementationOutput = { template: 'output.md', schema: 'schemas/implementation-output.json' };
  const steps = {
    backend_implementation: {
      name: 'Backend implementation',
      kind: 'worker',
      input: { prompt: 'Implement backend.' },
      output: implementationOutput,
      next: 'implementation_join',
    },
    frontend_implementation: {
      name: 'Frontend implementation',
      kind: 'worker',
      input: { prompt: 'Implement frontend.' },
      output: implementationOutput,
      next: 'implementation_join',
    },
    implementation_join: {
      name: 'Implementation join',
      kind: 'worker',
      input: { prompt: 'Join implementation outputs.' },
      output: { template: 'output.md' },
      next: 'done',
    },
    done: { name: 'Done', kind: 'done', input: { prompt: 'Finished.' } },
  };
  if (parallel) {
    steps.implementation_dispatch = {
      name: 'Implementation dispatch',
      kind: 'worker',
      input: { prompt: 'Dispatch implementation.' },
      output: { template: 'output.md' },
      next: ['backend_implementation', 'frontend_implementation'],
    };
  }
  return {
    name: 'dev-harness',
    version: 1,
    start: parallel ? 'implementation_dispatch' : 'backend_implementation',
    done: 'done',
    steps,
  };
}

function implementedOutput(summary, extra = {}) {
  return {
    outcome: 'implemented',
    implementation_handoff: {
      summary,
      covered_contract_rows: [{ id: summary, status: 'covered' }],
      review_notes: ['ready for review'],
    },
    changed_files: ['skills/orbita/lib/example.mjs'],
    verification: [{ command: 'node:test', result: 'passed' }],
    ...extra,
  };
}

function blockedOutput(overrides = {}) {
  return {
    outcome: 'blocked',
    blocker: {
      summary: 'Need approval before continuing.',
      source_step_id: 'backend_implementation',
      needed: 'Approve the smallest recovery question.',
      evidence: ['bounded public evidence'],
      risk: 'Continuing without approval would violate the plan.',
      ...overrides,
    },
  };
}

async function runCase(label, workflow = workflowDoc, options = {}) {
  const workflowPath = path.join(tempDir, `${label}-workflow.json`);
  writeJson(workflowPath, workflow);
  const runId = `workflow-runner-reuse-hints-${process.pid}-${label}`;
  const paths = resolveRunPaths({ runId, workflowPath, runsRoot: options.runsRoot });
  rmSync(paths.runDir, { recursive: true, force: true });
  const claim = await registerWorkflowRunAtRoot({
    runId,
    workflowPath,
    runsRoot: options.runsRoot,
    claim: true,
    owner: 'test',
    harness: 'node-test',
    sessionId: label,
    now: new Date('2026-06-01T10:00:00.000Z'),
  });
  return { runId, runDir: paths.runDir, workflowPath, runsRoot: options.runsRoot, leaseToken: claim.leaseToken, now: testNow };
}

function requestsFromOrchestratorInstruction(instruction) {
  const match = instruction.match(/^Execute every host request in this JSON and wait until all requested actions finish: (.+)$/m);
  assert.ok(match, instruction);
  return JSON.parse(match[1]);
}

after(() => rmSync(tempDir, { recursive: true, force: true }));

test('runner reuse hints: run_worker request exposes only approved reuse fields', async () => {
  const workflow = structuredClone(workflowDoc);
  workflow.steps.prepare.next = 'done';
  const { runId, workflowPath, leaseToken, now } = await runCase('single-request', workflow);

  const response = await next({ runId, workflowPath, leaseToken, now });
  const runsRoot = resolveRunPaths({ runId }).runsRoot;

  assert.equal(response.status, 'needs_host_actions');
  assert.deepEqual(requestsFromOrchestratorInstruction(response.orchestratorInstruction), response.requests);
  assert.deepEqual(Object.keys(response.requests[0]).sort(), [
    'action',
    'bindAgentCommand',
    'id',
    'loadFollowupInstructionsCommand',
    'loadInstructionsCommand',
    'preferredAgentId',
    'stepId',
  ].sort());
  assert.equal(response.requests[0].preferredAgentId, null);
  assert.equal(response.requests[0].loadInstructionsCommand, `${workflowRunnerCommand} instructions --run-id '${runId}' --step-id 'prepare' --runs-root '${runsRoot}' --lease-token '${leaseToken}'`);
  assert.equal(response.requests[0].loadFollowupInstructionsCommand, `${workflowRunnerCommand} instructions --follow-up --run-id '${runId}' --step-id 'prepare' --runs-root '${runsRoot}' --lease-token '${leaseToken}'`);
  assert.equal(response.requests[0].bindAgentCommand, `${workflowRunnerCommand} bind-agent --run-id '${runId}' --step-id 'prepare' --runs-root '${runsRoot}' --agent-id <agent-id> --lease-token '${leaseToken}'`);
});

test('runner reuse hints: follow-up instructions preserve validating output contract', async () => {
  const workflow = schemaCoveredWorkflow({ prepare: { next: 'done' } });
  const { runId, workflowPath, leaseToken, now } = await runCase('follow-up-instructions', workflow);
  await next({ runId, workflowPath, leaseToken, now });

  const fresh = await loadInstructions({ runId, workflowPath, stepId: 'prepare', leaseToken, now });
  const followUp = await loadInstructions({ runId, workflowPath, stepId: 'prepare', followUp: true, leaseToken, now });

  assert.equal(followUp, fresh);
  assert.match(followUp, /workflow-runner\.mjs' write-output --run-id/);
  assert.match(followUp, /--step-id 'prepare'/);
  assert.match(followUp, /--lease-token '[^']+'/);
  assert.doesNotMatch(followUp, /write-output[^\n]*--only-instructions/);
});

test('runner reuse hints: bind-agent stores and overwrites top-level worker binding', async () => {
  const workflow = structuredClone(workflowDoc);
  workflow.steps.prepare.next = 'done';
  const { runId, runDir, workflowPath, leaseToken, now } = await runCase('bind-agent-single', workflow);

  const first = await next({ runId, workflowPath, leaseToken, now });
  assert.equal(first.requests[0].preferredAgentId, null);

  assert.deepEqual(await bindAgent({ runId, workflowPath, stepId: 'prepare', agentId: 'worker-1', leaseToken, now }), {
    ok: true,
    runId,
    stepId: 'prepare',
    bound: true,
  });
  assert.deepEqual(readBaton(runDir).workerBindings, { prepare: 'worker-1' });
  assert.equal(readBaton(runDir).state.workerBindings, undefined);

  const response = await next({ runId, workflowPath, leaseToken, now });
  assert.equal(response.requests[0].preferredAgentId, 'worker-1');

  await bindAgent({ runId, workflowPath, stepId: 'prepare', agentId: 'worker-2', leaseToken, now });
  assert.deepEqual(readBaton(runDir).workerBindings, { prepare: 'worker-2' });
  const retried = await next({ runId, workflowPath, leaseToken, now });
  assert.equal(retried.requests[0].preferredAgentId, 'worker-2');
});

test('runner reuse hints: logical agent name reuses one worker across different workflow steps', async () => {
  const workflow = structuredClone(workflowDoc);
  workflow.steps.prepare.agent = 'architect';
  workflow.steps.prepare.next = 'branch_a';
  workflow.steps.branch_a.agent = 'architect';
  workflow.steps.branch_a.next = 'done';
  const { runId, runDir, workflowPath, leaseToken, now } = await runCase('shared-agent-binding', workflow);

  const first = await next({ runId, workflowPath, leaseToken, now });
  assert.equal(first.requests[0].stepId, 'prepare');
  assert.equal(first.requests[0].preferredAgentId, null);

  await bindAgent({ runId, workflowPath, stepId: 'prepare', agentId: 'architect-worker', leaseToken, now });
  assert.deepEqual(readBaton(runDir).workerBindings, { architect: 'architect-worker' });

  await writeOutput({
    runId,
    workflowPath,
    stepId: 'prepare',
    json: JSON.stringify(workerOutput('prepared')),
    debugSummaryFile: debugSummaryFileFor(runDir, 'prepare'),
    leaseToken,
    now,
  });

  const followUp = await continueRun({ runId, workflowPath, leaseToken, now });
  assert.equal(followUp.requests[0].stepId, 'branch_a');
  assert.equal(followUp.requests[0].preferredAgentId, 'architect-worker');
});

test('runner reuse hints: bind-agent renews stale matching worker lease', async () => {
  const workflow = structuredClone(workflowDoc);
  workflow.steps.prepare.next = 'done';
  const { runId, workflowPath, leaseToken, now } = await runCase('bind-agent-renews-lease', workflow);
  const paths = resolveRunPaths({ runId, workflowPath });
  await next({ runId, workflowPath, leaseToken, now });
  const before = (await readRunsIndex(paths)).runs[runId].workerLease;
  assert.equal(before.leaseExpiresAt, '2026-06-01T11:00:01.000Z');

  await bindAgent({
    runId,
    workflowPath,
    stepId: 'prepare',
    agentId: 'worker-after-expiry',
    leaseToken,
    now: new Date('2026-06-01T11:05:00.000Z'),
  });

  const after = (await readRunsIndex(paths)).runs[runId].workerLease;
  assert.equal(after.tokenHash, before.tokenHash);
  assert.equal(after.tokenEpoch, before.tokenEpoch);
  assert.equal(after.leaseExpiresAt, '2026-06-01T12:05:00.000Z');
});

test('runner reuse hints: bind-agent keeps parallel step bindings separated', async () => {
  const { runId, runDir, workflowPath, leaseToken, now } = await runCase('parallel-bindings');
  await next({ runId, workflowPath, leaseToken, now });
  await writeOutput({
    runId,
    workflowPath,
    stepId: 'prepare',
    json: JSON.stringify(workerOutput('prepared')),
    debugSummaryFile: debugSummaryFileFor(runDir, 'prepare'),
    leaseToken,
    now,
  });
  const parallel = await continueRun({ runId, workflowPath, leaseToken, now });
  assert.deepEqual(parallel.requests.map((request) => [request.stepId, request.preferredAgentId]), [
    ['branch_a', null],
    ['branch_b', null],
  ]);

  await bindAgent({ runId, workflowPath, stepId: 'branch_a', agentId: 'worker-a', leaseToken, now });
  await bindAgent({ runId, workflowPath, stepId: 'branch_b', agentId: 'worker-b', leaseToken, now });
  assert.deepEqual(readBaton(runDir).workerBindings, {
    branch_a: 'worker-a',
    branch_b: 'worker-b',
  });

  const response = await next({ runId, workflowPath, leaseToken, now });
  assert.deepEqual(response.requests.map((request) => [request.stepId, request.preferredAgentId]), [
    ['branch_a', 'worker-a'],
    ['branch_b', 'worker-b'],
  ]);
});

test('runner reuse hints: recoverable implementation blocker keeps host work active with same-worker follow-up', async () => {
  const workflow = devHarnessImplementationWorkflow();
  const { runId, runDir, workflowPath, leaseToken, now } = await runCase('recoverable-blocker-same-worker', workflow);

  const first = await next({ runId, workflowPath, leaseToken, now });
  assert.equal(first.requests[0].stepId, 'backend_implementation');
  await bindAgent({ runId, workflowPath, stepId: 'backend_implementation', agentId: 'backend-worker-1', leaseToken, now });
  await writeOutput({
    runId,
    workflowPath,
    stepId: 'backend_implementation',
    json: JSON.stringify(blockedOutput()),
    debugSummaryFile: debugSummaryFileFor(runDir, 'backend_implementation'),
    leaseToken,
    now,
  });

  const recovery = await continueRun({ runId, workflowPath, leaseToken, now });

  assert.equal(recovery.status, 'needs_host_actions');
  assert.equal(recovery.baton.status, 'running');
  assert.equal(recovery.baton.cursor, 'backend_implementation');
  assert.equal(recovery.baton.blocker, undefined);
  assert.equal(recovery.baton.state.backend_implementation, undefined);
  assert.equal(recovery.requests[0].stepId, 'backend_implementation');
  assert.equal(recovery.requests[0].preferredAgentId, 'backend-worker-1');
  assert.match(recovery.requests[0].loadInstructionsCommand, /workflow-runner\.mjs' instructions --run-id/);
  assert.match(recovery.requests[0].loadFollowupInstructionsCommand, /instructions --follow-up --run-id/);
  assert.equal(recovery.requests[0].recoverableBlocker.source_step_id, 'backend_implementation');
  assert.equal(recovery.requests[0].recoverableBlocker.needed, 'Approve the smallest recovery question.');

  const followUpInstructions = await loadInstructions({ runId, workflowPath, stepId: 'backend_implementation', followUp: true, leaseToken, now });
  assert.match(followUpInstructions, /Implement backend\./);

  await writeOutput({
    runId,
    workflowPath,
    stepId: 'backend_implementation',
    json: JSON.stringify(implementedOutput('backend recovered')),
    debugSummaryFile: debugSummaryFileFor(runDir, 'backend_implementation', 'recovered implementation\n'),
    leaseToken,
    now,
  });
  const joined = await continueRun({ runId, workflowPath, leaseToken, now });
  assert.equal(joined.status, 'needs_host_actions');
  assert.equal(joined.requests[0].stepId, 'implementation_join');

  await writeOutput({
    runId,
    workflowPath,
    stepId: 'implementation_join',
    json: JSON.stringify(workerOutput('joined')),
    debugSummaryFile: debugSummaryFileFor(runDir, 'implementation_join'),
    leaseToken,
    now,
  });
  const done = await continueRun({ runId, workflowPath, leaseToken, now });
  assert.equal(done.status, 'done');
});

test('runner reuse hints: any worker blocked output is recoverable at the same step', async () => {
  const workflow = schemaCoveredWorkflow({ prepare: { next: 'done' } });
  const { runId, runDir, workflowPath, leaseToken, now } = await runCase('recoverable-blocker-generic-worker', workflow);

  const first = await next({ runId, workflowPath, leaseToken, now });
  assert.equal(first.requests[0].stepId, 'prepare');
  await writeOutput({
    runId,
    workflowPath,
    stepId: 'prepare',
    json: JSON.stringify({
      outcome: 'blocked',
      blocker: {
        summary: 'Need a decision before continuing.',
        source_step_id: 'prepare',
        needed: 'Provide the missing decision.',
      },
    }),
    debugSummaryFile: debugSummaryFileFor(runDir, 'prepare'),
    leaseToken,
    now,
  });

  const recovery = await continueRun({ runId, workflowPath, leaseToken, now });

  assert.equal(recovery.status, 'needs_host_actions');
  assert.equal(recovery.baton.status, 'running');
  assert.equal(recovery.baton.cursor, 'prepare');
  assert.equal(recovery.baton.state.prepare, undefined);
  assert.equal(recovery.requests[0].stepId, 'prepare');
  assert.equal(recovery.requests[0].recoverableBlocker.source_step_id, 'prepare');
  assert.equal(recovery.requests[0].recoverableBlocker.needed, 'Provide the missing decision.');
});

test('runner reuse hints: recoverable implementation blocker has fresh-worker fallback without preferred worker', async () => {
  const workflow = devHarnessImplementationWorkflow();
  const { runId, runDir, workflowPath, leaseToken, now } = await runCase('recoverable-blocker-fresh-worker', workflow);

  await next({ runId, workflowPath, leaseToken, now });
  await writeOutput({
    runId,
    workflowPath,
    stepId: 'backend_implementation',
    json: JSON.stringify(blockedOutput()),
    debugSummaryFile: debugSummaryFileFor(runDir, 'backend_implementation'),
    leaseToken,
    now,
  });

  const recovery = await continueRun({ runId, workflowPath, leaseToken, now });

  assert.equal(recovery.requests[0].preferredAgentId, null);
  assert.match(recovery.requests[0].loadInstructionsCommand, /instructions --run-id/);
  assert.match(recovery.requests[0].loadFollowupInstructionsCommand, /instructions --follow-up --run-id/);
  assert.equal(recovery.requests[0].recoverableBlocker.summary, 'Need approval before continuing.');

  const freshInstructions = await loadInstructions({ runId, workflowPath, stepId: 'backend_implementation', leaseToken, now });
  assert.match(freshInstructions, /## Recoverable blocker/);
  assert.match(freshInstructions, /Approve the smallest recovery question\./);
  assert.match(freshInstructions, /bounded public evidence/);
});

test('runner reuse hints: recoverable implementation blocker preserves accepted sibling outputs before join', async () => {
  const workflow = devHarnessImplementationWorkflow({ parallel: true });
  const { runId, runDir, workflowPath, leaseToken, now } = await runCase('recoverable-blocker-parallel-preserves-sibling', workflow);

  await next({ runId, workflowPath, leaseToken, now });
  await writeOutput({
    runId,
    workflowPath,
    stepId: 'implementation_dispatch',
    json: JSON.stringify(workerOutput('dispatched')),
    debugSummaryFile: debugSummaryFileFor(runDir, 'implementation_dispatch'),
    leaseToken,
    now,
  });
  const branches = await continueRun({ runId, workflowPath, leaseToken, now });
  assert.deepEqual(branches.requests.map((request) => request.stepId), ['backend_implementation', 'frontend_implementation']);

  const frontendArtifactDir = path.join(runDir, 'frontend_implementation', 'artifacts');
  mkdirSync(frontendArtifactDir, { recursive: true });
  const frontendArtifactPath = path.join(frontendArtifactDir, 'handoff.md');
  writeFileSync(frontendArtifactPath, 'frontend handoff\n');
  await writeOutput({
    runId,
    workflowPath,
    stepId: 'frontend_implementation',
    json: JSON.stringify(implementedOutput('frontend complete', {
      results: [{ type: 'implementation', summary: 'frontend aggregate result' }],
      artifacts: [{ id: 'frontend-handoff', content_type: 'text/markdown', path: frontendArtifactPath, summary: 'frontend handoff artifact' }],
    })),
    debugSummaryFile: debugSummaryFileFor(runDir, 'frontend_implementation'),
    leaseToken,
    now,
  });
  await writeOutput({
    runId,
    workflowPath,
    stepId: 'backend_implementation',
    json: JSON.stringify(blockedOutput()),
    debugSummaryFile: debugSummaryFileFor(runDir, 'backend_implementation'),
    leaseToken,
    now,
  });

  const recovery = await continueRun({ runId, workflowPath, leaseToken, now });

  assert.equal(recovery.status, 'needs_host_actions');
  assert.equal(recovery.baton.cursor, 'backend_implementation');
  assert.equal(recovery.requests.length, 1);
  assert.equal(recovery.requests[0].stepId, 'backend_implementation');
  assert.equal(recovery.baton.state.backend_implementation, undefined);
  assert.equal(recovery.baton.state.frontend_implementation.implementation_handoff.summary, 'frontend complete');
  assert.equal(recovery.baton.state.results.at(-1).summary, 'frontend aggregate result');
  assert.equal(recovery.baton.state.artifacts.at(-1).producerStepId, 'frontend_implementation');
  assert.equal(recovery.baton.state.artifacts.at(-1).artifact.id, 'frontend-handoff');

  await writeOutput({
    runId,
    workflowPath,
    stepId: 'backend_implementation',
    json: JSON.stringify(implementedOutput('backend recovered after sibling')),
    debugSummaryFile: debugSummaryFileFor(runDir, 'backend_implementation', 'backend recovered after sibling\n'),
    leaseToken,
    now,
  });
  const joined = await continueRun({ runId, workflowPath, leaseToken, now });
  assert.equal(joined.requests[0].stepId, 'implementation_join');
  assert.equal(joined.baton.state.frontend_implementation.implementation_handoff.summary, 'frontend complete');
  assert.equal(joined.baton.state.results.at(-1).summary, 'frontend aggregate result');
  assert.equal(joined.baton.state.artifacts.at(-1).producerStepId, 'frontend_implementation');
});

test('runner reuse hints: recoverable blocker request redacts private fields and sensitive text', async () => {
  const workflow = devHarnessImplementationWorkflow();
  const customRunsRoot = path.join(tempDir, 'recoverable-blocker-custom-runs-root');
  const { runId, runDir, workflowPath, runsRoot, leaseToken, now } = await runCase('recoverable-blocker-redaction', workflow, { runsRoot: customRunsRoot });
  const customIndexPath = path.join(customRunsRoot, 'runs.json');
  const customBatonPath = path.join(runDir, 'baton.json');
  const customHistoryPath = path.join(runDir, 'history.md');

  await next({ runId, workflowPath, runsRoot, leaseToken, now });
  await writeOutput({
    runId,
    workflowPath,
    runsRoot,
    stepId: 'backend_implementation',
    json: JSON.stringify(blockedOutput({
      summary: `Need token --lease-token ${leaseToken} before continuing from ${customIndexPath}.`,
      needed: `Inspect ${customBatonPath} before proceeding.`,
      evidence: [
        `${runDir}/.workflow-runner/durable-commit.json`,
        customHistoryPath,
        'safe public evidence',
      ],
      risk: `Leaking ${customRunsRoot} would expose private run state.`,
      transcript: 'private transcript must not be projected',
      hidden_prompt: 'private prompt must not be projected',
      token: leaseToken,
    })),
    debugSummaryFile: debugSummaryFileFor(runDir, 'backend_implementation'),
    leaseToken,
    now,
  });

  const recovery = await continueRun({ runId, workflowPath, runsRoot, leaseToken, now });
  const projected = recovery.requests[0].recoverableBlocker;
  const projectedText = JSON.stringify(projected);

  assert.doesNotMatch(projectedText, new RegExp(leaseToken.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.doesNotMatch(projectedText, /private transcript/);
  assert.doesNotMatch(projectedText, /private prompt/);
  assert.doesNotMatch(projectedText, /\.workflow-runner/);
  assert.doesNotMatch(projectedText, /recoverable-blocker-custom-runs-root/);
  assert.doesNotMatch(projectedText, /runs\.json/);
  assert.doesNotMatch(projectedText, /baton\.json/);
  assert.doesNotMatch(projectedText, /history\.md/);
  assert.match(projected.summary, /\[redacted-lease-token\]/);
  assert.match(projected.summary, /workflow runs index/);
  assert.match(projected.needed, /workflow baton private state/);
  assert.match(projected.evidence.join(' '), /workflow history private state/);
  assert.deepEqual(Object.keys(projected).sort(), ['evidence', 'needed', 'risk', 'source_step_id', 'summary'].sort());
});

test('runner reuse hints: write-output rejects binding metadata and preserves workerBindings', async () => {
  const workflow = structuredClone(workflowDoc);
  workflow.steps.prepare.next = 'done';
  const { runId, runDir, workflowPath, leaseToken, now } = await runCase('write-output-purity', workflow);
  await next({ runId, workflowPath, leaseToken, now });
  await bindAgent({ runId, workflowPath, stepId: 'prepare', agentId: 'worker-before-output', leaseToken, now });

  await assert.rejects(
    () => writeOutput({
      runId,
      workflowPath,
      stepId: 'prepare',
      json: JSON.stringify({ outcome: 'ready', workerBindings: { prepare: 'bad-worker' } }),
      leaseToken,
      now,
    }),
    /output schema validation failed/,
  );
  assert.deepEqual(readBaton(runDir).workerBindings, { prepare: 'worker-before-output' });

  await writeOutput({
    runId,
    workflowPath,
    stepId: 'prepare',
    json: JSON.stringify(workerOutput('accepted without binding mutation')),
    debugSummaryFile: debugSummaryFileFor(runDir, 'prepare'),
    leaseToken,
    now,
  });
  assert.deepEqual(readBaton(runDir).workerBindings, { prepare: 'worker-before-output' });
  assert.equal(readBaton(runDir).state.prepare.results[0].summary, 'accepted without binding mutation');
});
