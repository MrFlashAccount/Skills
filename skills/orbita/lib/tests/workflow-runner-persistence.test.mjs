import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';
import { fileURLToPath } from 'node:url';
import { next as runnerNext } from '../entrypoints/api/workflowRunner.mjs';
import { resolveRunPaths } from '../persistence/run-state/paths.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const tempDir = mkdtempSync(path.join(tmpdir(), 'workflow-runner-check-'));
writeFileSync(path.join(tempDir, 'output.md'), '## Output contract\nReturn markdown.\n');
writeFileSync(path.join(tempDir, 'output.schema.json'), `${JSON.stringify({
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  required: ['outcome'],
  properties: {
    outcome: { type: 'string' },
  },
  additionalProperties: true,
}, null, 2)}\n`);
writeFileSync(path.join(tempDir, 'approval-freeform.schema.json'), `${JSON.stringify({
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  additionalProperties: true,
}, null, 2)}\n`);
const testLeaseToken = `workflow-runner-test-token-${process.pid}`;
const leaseTokensByRunId = new Map();
process.env.WORKFLOW_RUN_TOKEN = testLeaseToken;

const workflowDoc = {
    name: 'runner-check',
    version: 1,
    start: 'prepare',
    done: 'done',
    blocked: 'blocked',
    steps: {
      prepare: {
        name: 'Prepare',
        kind: 'worker',
        input: { prompt: 'Prepare branch.' },
        output: { template: 'output.md', schema: 'output.schema.json' },
        next: ['branch_a', 'branch_b'],
      },
      branch_a: {
        name: 'Branch A',
        kind: 'worker',
        input: { prompt: 'Run branch A.\nPrepare output:\n${{ input.prepare }}' },
        output: { template: 'output.md', schema: 'output.schema.json' },
        next: 'join',
      },
      branch_b: {
        name: 'Branch B',
        kind: 'worker',
        input: { prompt: 'Run branch B.\nPrepare output:\n${{ input.prepare }}' },
        output: { template: 'output.md', schema: 'output.schema.json' },
        next: 'join',
      },
      join: {
        name: 'Join',
        kind: 'worker',
        input: { prompt: 'Join branch output.\nBranch A:\n${{ input.branch_a }}\nBranch B:\n${{ input.branch_b }}' },
        output: { template: 'output.md', schema: 'output.schema.json' },
        next: 'done',
      },
      done: { name: 'Done', kind: 'done', input: { prompt: 'Finished.' } },
      blocked: { name: 'Blocked', kind: 'blocked', input: { prompt: 'Blocked.' } },
    },

};

function writeJson(filePath, value) {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function claimRunForTest(paths) {
  const knownToken = leaseTokensByRunId.get(paths.runId);
  if (knownToken) {
    process.env.WORKFLOW_RUN_TOKEN = knownToken;
    return knownToken;
  }
  const createArgs = ['skills/orbita/lib/entrypoints/cli/workflow-runs.mjs', 'create', '--claim', '--run-id', paths.runId, '--workflow', paths.workflowPath];
  const created = spawnSync(process.execPath, createArgs, { cwd: root, encoding: 'utf8', env: process.env });
  if (created.status === 0) {
    const token = JSON.parse(created.stdout).leaseToken;
    leaseTokensByRunId.set(paths.runId, token);
    process.env.WORKFLOW_RUN_TOKEN = token;
    return token;
  }
  const token = knownToken ?? testLeaseToken;
  const claimed = spawnSync(process.execPath, ['skills/orbita/lib/entrypoints/cli/workflow-runs.mjs', 'claim', '--run-id', paths.runId, '--lease-token', token], { cwd: root, encoding: 'utf8', env: { ...process.env, WORKFLOW_RUN_TOKEN: token } });
  assert.equal(claimed.status, 0, `claim ${paths.runId} failed\ncreate stderr:\n${created.stderr}\nclaim stderr:\n${claimed.stderr}`);
  leaseTokensByRunId.set(paths.runId, token);
  process.env.WORKFLOW_RUN_TOKEN = token;
  return token;
}

function runCase(label, workflowPath) {
  const runId = `workflow-runner-test-${process.pid}-${label}`;
  const paths = resolveRunPaths({ runId, workflowPath });
  rmSync(paths.runDir, { recursive: true, force: true });
  if (workflowPath !== undefined) claimRunForTest(paths);
  return { runId, runDir: paths.runDir };
}

function runCaseNamed(name, label, workflowPath) {
  const runId = `workflow-runner-test-${process.pid}-${label}`;
  const paths = resolveRunPaths({ runId, workflowPath });
  rmSync(paths.runDir, { recursive: true, force: true });
  if (workflowPath !== undefined) claimRunForTest(paths);
  return { [`${name}RunId`]: runId, [`${name}RunDir`]: paths.runDir };
}


function valueAfter(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function claimRunForRunnerArgs(args) {
  const runId = valueAfter(args, '--run-id');
  if (!runId) return undefined;
  const workflowPath = valueAfter(args, '--workflow');
  const knownToken = leaseTokensByRunId.get(runId);
  if (knownToken) return knownToken;
  const createArgs = ['skills/orbita/lib/entrypoints/cli/workflow-runs.mjs', 'create', '--claim', '--run-id', runId];
  if (workflowPath !== undefined) createArgs.push('--workflow', workflowPath);
  const created = spawnSync(process.execPath, createArgs, { cwd: root, encoding: 'utf8', env: process.env });
  if (created.status === 0) {
    const token = JSON.parse(created.stdout).leaseToken;
    leaseTokensByRunId.set(runId, token);
    return token;
  }
  const token = knownToken ?? testLeaseToken;
  const claimArgs = ['skills/orbita/lib/entrypoints/cli/workflow-runs.mjs', 'claim', '--run-id', runId, '--lease-token', token];
  if (workflowPath !== undefined) claimArgs.push('--workflow', workflowPath);
  const claimed = spawnSync(process.execPath, claimArgs, { cwd: root, encoding: 'utf8', env: { ...process.env, WORKFLOW_RUN_TOKEN: token } });
  assert.equal(claimed.status, 0, `claim ${runId} failed\ncreate stderr:\n${created.stderr}\nclaim stderr:\n${claimed.stderr}`);
  return token;
}

function withLeaseTokenArg(args, token) {
  if (args.includes('--lease-token') || !token) return args;
  const [mode, ...rest] = args;
  return [mode, `--lease-token=${token}`, ...rest];
}

function runRunner(args, options = {}) {
  const token = claimRunForRunnerArgs(args);
  return spawnSync(process.execPath, ['skills/orbita/lib/entrypoints/cli/workflow-runner.mjs', ...withLeaseTokenArg(args, token)], { cwd: root, encoding: 'utf8', input: options.input, env: { ...process.env, WORKFLOW_RUN_TOKEN: token ?? testLeaseToken, ...(options.env ?? {}) } });
}

async function runRunnerAsync(args) {
  const token = claimRunForRunnerArgs(args);
  const child = spawn(process.execPath, ['skills/orbita/lib/entrypoints/cli/workflow-runner.mjs', ...withLeaseTokenArg(args, token)], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, WORKFLOW_RUN_TOKEN: token ?? testLeaseToken },
  });
  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    stdout += chunk;
  });
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });
  const [status] = await once(child, 'exit');
  return { status, stdout, stderr };
}

async function waitForPath(filePath) {
  const startedAt = Date.now();
  while (!existsSync(filePath)) {
    if (Date.now() - startedAt > 2000) throw new Error(`timed out waiting for ${filePath}`);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

function makeFifo(filePath) {
  const result = spawnSync('mkfifo', [filePath], { encoding: 'utf8' });
  assert.equal(result.status, 0, `mkfifo ${filePath} failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
}

function expectRunner(args, label) {
  const result = runRunner(args);
  assert.equal(result.status, 0, `${label} failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  return JSON.parse(result.stdout);
}

function currentRequestIds(runId, workflowPath) {
  const response = expectRunner(['next', '--run-id', runId, '--workflow', workflowPath], 'derive current requests');
  return (response.requests ?? []).map((request) => request.stepId ?? request.id);
}

function parseOutputRef(ref) {
  const separator = ref.indexOf('=');
  return separator < 0 ? { stepId: undefined, filePath: ref } : { stepId: ref.slice(0, separator), filePath: ref.slice(separator + 1) };
}

function writeOutputFile({ runId, runDir, workflowPath, stepId, filePath, label = 'write output' }) {
  const targetStepId = stepId ?? currentRequestIds(runId, workflowPath)[0];
  const result = runRunner(['write-output', '--run-id', runId, '--workflow', workflowPath, '--step-id', targetStepId], { input: readFileSync(filePath, 'utf8') });
  assert.equal(result.status, 0, `${label} failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  return JSON.parse(result.stdout);
}

function continueWithOutputs({ runId, runDir, workflowPath, refs, label = 'continue' }) {
  const pendingIds = currentRequestIds(runId, workflowPath);
  for (const ref of Array.isArray(refs) ? refs : [refs]) {
    const { stepId, filePath } = parseOutputRef(ref);
    const targetStepId = stepId ?? (pendingIds.length === 1 ? pendingIds[0] : undefined);
    assert.ok(targetStepId, `output for ${label} must name a step when multiple requests are pending`);
    writeOutputFile({ runId, runDir, workflowPath, stepId: targetStepId, filePath, label: `${label} write ${targetStepId}` });
  }
  return expectRunner(['continue', '--run-id', runId, '--workflow', workflowPath], label);
}

function workerOutput(summary) {
  return { outcome: 'ready', results: [{ type: 'check', summary }] };
}

after(() => rmSync(tempDir, { recursive: true, force: true }));

test('runner: persisted user prompt injection marker survives workflow drift on resume', () => {
  const { runId, runDir } = runCase('user-prompt-workflow-drift');
  const workflowPath = path.join(tempDir, 'user-prompt-workflow-drift.json');
  const driftWorkflow = structuredClone(workflowDoc);
  driftWorkflow.steps.prepare.next = 'branch_a';
  driftWorkflow.steps.branch_a.next = 'done';
  writeJson(workflowPath, driftWorkflow);
  const rawPrompt = 'Do not inject twice after workflow drift.';

  expectRunner(['next', '--run-id', runId, '--workflow', workflowPath, '--user-prompt', rawPrompt], 'next before workflow drift');
  const prepareOutput = path.join(runDir, 'prepare-drift-output.json');
  writeJson(prepareOutput, workerOutput('prepared before drift'));
  continueWithOutputs({ runId, runDir, workflowPath, refs: prepareOutput, label: 'continue before workflow drift' });

  delete driftWorkflow.steps.prepare;
  driftWorkflow.start = 'branch_a';
  driftWorkflow.steps.branch_a.input.prompt = 'Run branch A.';
  driftWorkflow.steps.branch_b.input.prompt = 'Run branch B.';
  writeJson(workflowPath, driftWorkflow);
  const resumed = expectRunner(['next', '--run-id', runId, '--workflow', workflowPath], 'rerender after workflow drift');
  assert.equal(resumed.baton.user_prompt_injected, true);

  const laterInstructions = runRunner(['instructions', '--run-id', runId, '--step-id', 'branch_a']);
  assert.equal(laterInstructions.status, 0, laterInstructions.stderr);
  assert.doesNotMatch(laterInstructions.stdout, /## User prompt/);
  assert.equal(laterInstructions.stdout.includes(rawPrompt), false);
});

test('runner: continue applies single output and returns terminal done', () => {
  const { runId, runDir } = runCase('single-continue');
  const workflowPath = path.join(tempDir, 'single-continue-workflow.json');
  const singleWorkflow = structuredClone(workflowDoc);
  singleWorkflow.steps.prepare.next = 'done';
  writeJson(workflowPath, singleWorkflow);

  expectRunner(['next', '--run-id', runId, '--workflow', workflowPath], 'next single continue');
  const outputPath = path.join(runDir, 'prepare-result.json');
  writeJson(outputPath, workerOutput('prepared'));
  const response = continueWithOutputs({ runId, runDir, workflowPath, refs: outputPath, label: 'continue single' });

  assert.equal(response.status, 'done');
  assert.equal(response.baton.cursor, 'done');
  assert.equal(response.baton.status, 'done');
  assert.equal(response.baton.state.prepare.results[0].summary, 'prepared');
});

test('runner: continue reuses saved custom workflow when --workflow is omitted', () => {
  const { runId, runDir } = runCase('custom-workflow-continue');
  const workflowPath = path.join(tempDir, 'custom-workflow-continue.json');
  const singleWorkflow = structuredClone(workflowDoc);
  singleWorkflow.name = 'custom-workflow-continue';
  singleWorkflow.steps.prepare.next = 'done';
  writeJson(workflowPath, singleWorkflow);

  expectRunner(['next', '--run-id', runId, '--workflow', workflowPath], 'next custom workflow continue');
  const outputPath = path.join(runDir, 'prepare-result.json');
  writeJson(outputPath, workerOutput('prepared with saved workflow'));
  const response = continueWithOutputs({ runId, runDir, workflowPath, refs: outputPath, label: 'continue custom workflow without workflow arg' });

  assert.equal(response.status, 'done');
  assert.equal('workflow' in response, false);
  assert.equal(response.baton.cursor, 'done');
  assert.equal(response.baton.state.prepare.results[0].summary, 'prepared with saved workflow');
});

test('runner: wait_for_approval request accepts request-specific host output JSON', () => {
  const { runId, runDir } = runCase('approval-generic-output');
  const workflowPath = path.join(tempDir, 'approval-generic-output-workflow.json');
  const approvalWorkflow = structuredClone(workflowDoc);
  approvalWorkflow.start = 'choose_path';
  approvalWorkflow.steps = {
    choose_path: {
      name: 'Choose path',
      kind: 'approval',
      input: { prompt: 'Ask the user to choose option_a, option_b, or free-form blocked reason.' },
      next: { match: '${{ output.choice }}', cases: { option_a: 'done', option_b: 'join', blocked: 'blocked' } },
    },
    join: approvalWorkflow.steps.join,
    done: approvalWorkflow.steps.done,
    blocked: approvalWorkflow.steps.blocked,
  };
  approvalWorkflow.steps.join.input.prompt = 'Join without branch prompt input.';
  approvalWorkflow.steps.join.next = 'done';
  writeJson(workflowPath, approvalWorkflow);

  const next = expectRunner(['next', '--run-id', runId, '--workflow', workflowPath], 'next approval generic');
  assert.equal(next.status, 'needs_host_actions');
  assert.equal(next.requests[0].action, 'wait_for_approval');

  const outputPath = path.join(runDir, 'choose-path-answer.json');
  writeJson(outputPath, { choice: 'option_a', answer: 'Ship the smaller fix first.' });
  const response = continueWithOutputs({ runId, runDir, workflowPath, refs: `choose_path=${outputPath}`, label: 'continue approval generic' });

  assert.equal(response.status, 'done');
  assert.equal(response.baton.cursor, 'done');
  assert.deepEqual(response.baton.state.choose_path, { choice: 'option_a', answer: 'Ship the smaller fix first.' });
});

test('runner: single approval request applies output by current stepId', () => {
  const { runId, runDir } = runCase('approval-step-id-output');
  const workflowPath = path.join(tempDir, 'approval-step-id-output-workflow.json');
  const approvalWorkflow = structuredClone(workflowDoc);
  approvalWorkflow.start = 'choose_path';
  approvalWorkflow.steps = {
    choose_path: {
      name: 'Choose path',
      kind: 'approval',
      input: { prompt: 'Ask the user to choose option_a or option_b.' },
      next: { match: '${{ output.choice }}', cases: { option_a: 'done', option_b: 'join' } },
    },
    join: approvalWorkflow.steps.join,
    done: approvalWorkflow.steps.done,
    blocked: approvalWorkflow.steps.blocked,
  };
  approvalWorkflow.steps.join.input.prompt = 'Join without branch prompt input.';
  approvalWorkflow.steps.join.next = 'done';
  writeJson(workflowPath, approvalWorkflow);

  const next = expectRunner(['next', '--run-id', runId, '--workflow', workflowPath], 'next opaque approval');
  assert.equal(next.status, 'needs_host_actions');
  assert.equal(next.requests[0].stepId, 'choose_path');

  const outputPath = path.join(runDir, 'choose-path-answer.json');
  writeJson(outputPath, { choice: 'option_a', answer: 'Step id should not imply parallel.' });
  const response = continueWithOutputs({ runId, runDir, workflowPath, refs: `choose_path=${outputPath}`, label: 'continue approval step id' });

  assert.equal(response.status, 'done');
  assert.equal(response.baton.cursor, 'done');
  assert.deepEqual(response.baton.state.choose_path, { choice: 'option_a', answer: 'Step id should not imply parallel.' });
});

test('runner: approval request exposes optional output schema reference', () => {
  const { runId, runDir } = runCase('approval-output-schema-request');
  const workflowPath = path.join(tempDir, 'approval-output-schema-request-workflow.json');
  const schemaPath = path.join(tempDir, 'approval-output-schema-request.schema.json');
  writeJson(schemaPath, {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    required: ['choice'],
    properties: { choice: { enum: ['approved', 'blocked'] } },
    additionalProperties: false,
  });
  const approvalWorkflow = structuredClone(workflowDoc);
  approvalWorkflow.start = 'choose_path';
  approvalWorkflow.steps = {
    choose_path: {
      name: 'Choose path',
      kind: 'approval',
      input: { prompt: 'Ask the user whether to approve or block.' },
      output: { schema: path.basename(schemaPath) },
      next: { match: '${{ output.choice }}', cases: { approved: 'done', blocked: 'blocked' } },
    },
    done: approvalWorkflow.steps.done,
    blocked: approvalWorkflow.steps.blocked,
  };
  writeJson(workflowPath, approvalWorkflow);

  const response = expectRunner(['next', '--run-id', runId, '--workflow', workflowPath], 'next approval output schema request');

  assert.equal(response.status, 'needs_host_actions');
  assert.equal(response.requests[0].action, 'wait_for_approval');
  assert.equal(response.requests[0].outputSchema, path.basename(schemaPath));
  assert.equal(response.requests[0].resolvedOutputSchema.ref, path.basename(schemaPath));
  assert.equal(Object.hasOwn(response.requests[0].resolvedOutputSchema, 'path'), false);
  assert.deepEqual(response.requests[0].resolvedOutputSchema.schema.required, ['choice']);
});

test('runner: typed approval retry preserves validation feedback in instructions', () => {
  const { runId, runDir } = runCase('approval-output-schema-retry');
  const workflowPath = path.join(tempDir, 'approval-output-schema-retry-workflow.json');
  const schemaPath = path.join(tempDir, 'approval-output-schema-retry.schema.json');
  writeJson(schemaPath, {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    required: ['choice'],
    properties: { choice: { enum: ['approved', 'blocked'] } },
    additionalProperties: false,
  });
  const approvalWorkflow = structuredClone(workflowDoc);
  approvalWorkflow.start = 'choose_path';
  approvalWorkflow.steps = {
    choose_path: {
      name: 'Choose path',
      kind: 'approval',
      input: { prompt: 'Ask the user whether to approve or block.' },
      output: { schema: path.basename(schemaPath) },
      next: { match: '${{ output.choice }}', cases: { approved: 'done', blocked: 'blocked' } },
    },
    done: approvalWorkflow.steps.done,
    blocked: approvalWorkflow.steps.blocked,
  };
  writeJson(workflowPath, approvalWorkflow);

  expectRunner(['next', '--run-id', runId, '--workflow', workflowPath], 'next approval output schema retry');
  const outputPath = path.join(runDir, 'invalid-approval.json');
  writeJson(outputPath, { choice: 'maybe' });

  const rejected = runRunner(['write-output', '--run-id', runId, '--workflow', workflowPath, '--step-id', 'choose_path'], { input: readFileSync(outputPath, 'utf8') });

  assert.notEqual(rejected.status, 0);
  assert.match(rejected.stderr, /output schema validation failed for step 'choose_path'/);
  const response = expectRunner(['next', '--run-id', runId, '--workflow', workflowPath], 'derive approval output schema retry request');
  assert.equal(response.status, 'needs_host_actions');
  assert.equal(response.requests[0].action, 'wait_for_approval');
  assert.equal(response.requests[0].outputSchema, path.basename(schemaPath));
  assert.equal(response.requests[0].resolvedOutputSchema.ref, path.basename(schemaPath));
  assert.equal(Object.hasOwn(response.requests[0].resolvedOutputSchema, 'path'), false);
  assert.deepEqual(response.requests[0].resolvedOutputSchema.schema.required, ['choice']);
  assert.equal(Object.hasOwn(JSON.parse(readFileSync(path.join(runDir, 'baton.json'), 'utf8')).state, 'outputs'), false);

  const loaded = runRunner(['instructions', '--run-id', runId, '--step-id', 'choose_path']);
  assert.equal(loaded.status, 0, loaded.stderr);
  assert.doesNotMatch(loaded.stdout, /Previous output failed output\.schema validation/);
});

test('runner: typed approval static parallel next preserves approval output in state', () => {
  const { runId, runDir } = runCase('approval-output-schema-static-parallel');
  const workflowPath = path.join(tempDir, 'approval-output-schema-static-parallel-workflow.json');
  const schemaPath = path.join(tempDir, 'approval-output-schema-static-parallel.schema.json');
  writeJson(schemaPath, {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    required: ['choice', 'notes'],
    properties: {
      choice: { enum: ['approved'] },
      notes: { type: 'string' },
    },
    additionalProperties: false,
  });
  const approvalWorkflow = structuredClone(workflowDoc);
  approvalWorkflow.start = 'choose_path';
  approvalWorkflow.steps = {
    choose_path: {
      name: 'Choose path',
      kind: 'approval',
      input: { prompt: 'Ask the user whether to fan out.' },
      output: { schema: path.basename(schemaPath) },
      next: ['branch_a', 'branch_b'],
    },
    branch_a: approvalWorkflow.steps.branch_a,
    branch_b: approvalWorkflow.steps.branch_b,
    join: approvalWorkflow.steps.join,
    done: approvalWorkflow.steps.done,
    blocked: approvalWorkflow.steps.blocked,
  };
  approvalWorkflow.steps.branch_a.input.prompt = 'Run branch A from approval output:\n${{ input.choose_path }}';
  approvalWorkflow.steps.branch_b.input.prompt = 'Run branch B from approval output:\n${{ input.choose_path }}';
  approvalWorkflow.steps.join.next = 'done';
  writeJson(workflowPath, approvalWorkflow);

  expectRunner(['next', '--run-id', runId, '--workflow', workflowPath], 'next approval static parallel');
  const outputPath = path.join(runDir, 'choose-path-output.json');
  const approvalOutput = { choice: 'approved', notes: 'Fan out now.' };
  writeJson(outputPath, approvalOutput);
  const response = continueWithOutputs({ runId, runDir, workflowPath, refs: `choose_path=${outputPath}`, label: 'continue approval static parallel' });

  assert.equal(response.status, 'needs_host_actions');
  assert.deepEqual(response.requests.map((request) => request.id), ['branch_a', 'branch_b']);
  assert.deepEqual(response.baton.state.choose_path, approvalOutput);
  assert.deepEqual(response.baton.state.outputs.choose_path, approvalOutput);

  const branchAInstructions = runRunner(['instructions', '--run-id', runId, '--step-id', 'branch_a']);
  assert.equal(branchAInstructions.status, 0, branchAInstructions.stderr);
  assert.match(branchAInstructions.stdout, /Fan out now\./);
});

test('runner: generic approval static parallel next preserves approval output in state', () => {
  const { runId, runDir } = runCase('approval-generic-static-parallel');
  const workflowPath = path.join(tempDir, 'approval-generic-static-parallel-workflow.json');
  const approvalWorkflow = structuredClone(workflowDoc);
  approvalWorkflow.start = 'choose_path';
  approvalWorkflow.steps = {
    choose_path: {
      name: 'Choose path',
      kind: 'approval',
      input: { prompt: 'Ask the user whether to fan out.' },
      output: { schema: 'approval-freeform.schema.json' },
      next: ['branch_a', 'branch_b'],
    },
    branch_a: approvalWorkflow.steps.branch_a,
    branch_b: approvalWorkflow.steps.branch_b,
    join: approvalWorkflow.steps.join,
    done: approvalWorkflow.steps.done,
    blocked: approvalWorkflow.steps.blocked,
  };
  approvalWorkflow.steps.branch_a.input.prompt = 'Run branch A from approval output:\n${{ input.choose_path }}';
  approvalWorkflow.steps.branch_b.input.prompt = 'Run branch B from approval output:\n${{ input.choose_path }}';
  approvalWorkflow.steps.join.next = 'done';
  writeJson(workflowPath, approvalWorkflow);

  expectRunner(['next', '--run-id', runId, '--workflow', workflowPath], 'next generic approval static parallel');
  const outputPath = path.join(runDir, 'choose-path-output.json');
  const approvalOutput = { approval: 'approved', answer: 'Use both branches.' };
  writeJson(outputPath, approvalOutput);
  const response = continueWithOutputs({ runId, runDir, workflowPath, refs: `choose_path=${outputPath}`, label: 'continue generic approval static parallel' });

  assert.equal(response.status, 'needs_host_actions');
  assert.deepEqual(response.requests.map((request) => request.id), ['branch_a', 'branch_b']);
  assert.deepEqual(response.baton.state.choose_path, approvalOutput);

  const branchAInstructions = runRunner(['instructions', '--run-id', runId, '--step-id', 'branch_a']);
  assert.equal(branchAInstructions.status, 0, branchAInstructions.stderr);
  assert.match(branchAInstructions.stdout, /Use both branches\./);
});

test('runner: selected startup prompt target survives static parallel workflow order drift before output', () => {
  const { runId, runDir } = runCase('user-prompt-static-parallel-target-drift');
  const workflowPath = path.join(tempDir, 'user-prompt-static-parallel-target-drift.json');
  const approvalWorkflow = structuredClone(workflowDoc);
  approvalWorkflow.start = 'choose_path';
  approvalWorkflow.steps = {
    choose_path: {
      name: 'Choose path',
      kind: 'approval',
      input: { prompt: 'Ask whether to fan out.' },
      output: { schema: 'approval-freeform.schema.json' },
      next: ['branch_a', 'branch_b'],
    },
    branch_a: approvalWorkflow.steps.branch_a,
    branch_b: approvalWorkflow.steps.branch_b,
    join: approvalWorkflow.steps.join,
    done: approvalWorkflow.steps.done,
    blocked: approvalWorkflow.steps.blocked,
  };
  approvalWorkflow.steps.branch_a.input.prompt = 'Run branch A.';
  approvalWorkflow.steps.branch_b.input.prompt = 'Run branch B.';
  approvalWorkflow.steps.join.next = 'done';
  writeJson(workflowPath, approvalWorkflow);
  const rawPrompt = 'Prompt must stay with originally selected branch.';

  const initial = expectRunner(['next', '--run-id', runId, '--workflow', workflowPath, '--user-prompt', rawPrompt], 'next approval before static fanout');
  assert.equal(initial.baton.user_prompt_target, 'branch_a');

  approvalWorkflow.steps.choose_path.next = ['branch_b', 'branch_a'];
  writeJson(workflowPath, approvalWorkflow);
  const approvalOutput = path.join(runDir, 'choose-path-output.json');
  writeJson(approvalOutput, { approval: 'approved' });
  const fanout = continueWithOutputs({ runId, runDir, workflowPath, refs: `choose_path=${approvalOutput}`, label: 'continue approval static fanout after drift' });
  assert.equal(fanout.baton.user_prompt_target, 'branch_a');

  const rerendered = expectRunner(['next', '--run-id', runId, '--workflow', workflowPath], 'next after static fanout drift');
  assert.deepEqual(rerendered.requests.map((request) => request.id), ['branch_b', 'branch_a']);

  const branchAInstructions = runRunner(['instructions', '--run-id', runId, '--step-id', 'branch_a']);
  assert.equal(branchAInstructions.status, 0, branchAInstructions.stderr);
  assert.match(branchAInstructions.stdout, /## User prompt/);
  assert.equal(branchAInstructions.stdout.includes(rawPrompt), true);

  const branchBInstructions = runRunner(['instructions', '--run-id', runId, '--step-id', 'branch_b']);
  assert.equal(branchBInstructions.status, 0, branchBInstructions.stderr);
  assert.doesNotMatch(branchBInstructions.stdout, /## User prompt/);
  assert.equal(branchBInstructions.stdout.includes(rawPrompt), false);
});

test('runner: startup prompt static fanout selects renderable worker instead of downstream control-branch worker', () => {
  const { runId, runDir } = runCase('user-prompt-static-fanout-control-branch');
  const workflowPath = path.join(tempDir, 'user-prompt-static-fanout-control-branch.json');
  const fanoutWorkflow = structuredClone(workflowDoc);
  fanoutWorkflow.start = 'choose_path';
  fanoutWorkflow.steps = {
    choose_path: {
      name: 'Choose path',
      kind: 'approval',
      input: { prompt: 'Choose whether to ask before the join.' },
      next: ['approval_before_worker', 'work_b'],
    },
    approval_before_worker: {
      name: 'Approval before worker',
      kind: 'approval',
      input: { prompt: 'Approve delayed worker.' },
      next: 'join',
    },
    work_b: {
      ...fanoutWorkflow.steps.branch_b,
      next: 'join',
    },
    join: fanoutWorkflow.steps.join,
    done: fanoutWorkflow.steps.done,
    blocked: fanoutWorkflow.steps.blocked,
  };
  fanoutWorkflow.steps.work_b.input.prompt = 'Run worker B.';
  fanoutWorkflow.steps.join.input.prompt = 'Join approval and worker B.';
  fanoutWorkflow.steps.join.next = 'done';
  writeJson(workflowPath, fanoutWorkflow);
  const rawPrompt = 'Prompt belongs to the worker visible in the first fanout response.';

  const initial = expectRunner(['next', '--run-id', runId, '--workflow', workflowPath, '--user-prompt', rawPrompt], 'next control branch fanout');
  assert.equal(initial.baton.user_prompt_target, 'work_b');

  const chooseOutput = path.join(runDir, 'choose-path-output.json');
  writeJson(chooseOutput, { approval: 'approved' });
  const fanout = continueWithOutputs({ runId, runDir, workflowPath, refs: `choose_path=${chooseOutput}`, label: 'continue control branch fanout' });
  assert.deepEqual(fanout.requests.map((request) => [request.id, request.action]), [
    ['approval_before_worker', 'wait_for_approval'],
    ['work_b', 'run_worker'],
  ]);
  assert.equal(fanout.baton.user_prompt_target, 'work_b');

  const workBInstructions = runRunner(['instructions', '--run-id', runId, '--step-id', 'work_b']);
  assert.equal(workBInstructions.status, 0, workBInstructions.stderr);
  assert.match(workBInstructions.stdout, /## User prompt/);
  assert.equal(workBInstructions.stdout.includes(rawPrompt), true);
});

test('runner: startup prompt target removal before first output fails loudly instead of dropping prompt', () => {
  const { runId, runDir } = runCase('user-prompt-static-parallel-target-removed');
  const workflowPath = path.join(tempDir, 'user-prompt-static-parallel-target-removed.json');
  const approvalWorkflow = structuredClone(workflowDoc);
  approvalWorkflow.start = 'choose_path';
  approvalWorkflow.steps = {
    choose_path: {
      name: 'Choose path',
      kind: 'approval',
      input: { prompt: 'Ask whether to fan out.' },
      output: { schema: 'approval-freeform.schema.json' },
      next: ['branch_a', 'branch_b'],
    },
    branch_a: approvalWorkflow.steps.branch_a,
    branch_b: approvalWorkflow.steps.branch_b,
    join: approvalWorkflow.steps.join,
    done: approvalWorkflow.steps.done,
    blocked: approvalWorkflow.steps.blocked,
  };
  approvalWorkflow.steps.branch_a.input.prompt = 'Run branch A.';
  approvalWorkflow.steps.branch_b.input.prompt = 'Run branch B.';
  writeJson(workflowPath, approvalWorkflow);

  const initial = expectRunner(['next', '--run-id', runId, '--workflow', workflowPath, '--user-prompt', 'Prompt must not disappear.'], 'next approval before target removal');
  assert.equal(initial.baton.user_prompt_target, 'branch_a');

  delete approvalWorkflow.steps.branch_a;
  approvalWorkflow.steps.choose_path.next = ['branch_b'];
  approvalWorkflow.steps.join.input.prompt = 'Join branch B:\n${{ input.branch_b }}';
  writeJson(workflowPath, approvalWorkflow);
  const approvalOutput = path.join(runDir, 'choose-path-output-removed.json');
  writeJson(approvalOutput, { approval: 'approved' });
  const result = runRunner(['write-output', '--run-id', runId, '--workflow', workflowPath, '--step-id', 'choose_path'], { input: readFileSync(approvalOutput, 'utf8') });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /startup user prompt target 'branch_a' is no longer defined|startup user prompt target 'branch_a' is not renderable/);
});

test('runner: untyped approval static parallel applies branch outputs and persists prompt marker once', () => {
  const { runId, runDir } = runCase('approval-untyped-static-parallel-branch-output');
  const workflowPath = path.join(tempDir, 'approval-untyped-static-parallel-branch-output.json');
  const approvalWorkflow = structuredClone(workflowDoc);
  approvalWorkflow.start = 'choose_path';
  approvalWorkflow.steps = {
    choose_path: {
      name: 'Choose path',
      kind: 'approval',
      input: { prompt: 'Ask whether to fan out.' },
      output: { schema: 'approval-freeform.schema.json' },
      next: ['branch_a', 'branch_b'],
    },
    branch_a: approvalWorkflow.steps.branch_a,
    branch_b: approvalWorkflow.steps.branch_b,
    join: approvalWorkflow.steps.join,
    done: approvalWorkflow.steps.done,
    blocked: approvalWorkflow.steps.blocked,
  };
  approvalWorkflow.steps.branch_a.input.prompt = 'Run branch A from approval output:\n${{ input.choose_path }}';
  approvalWorkflow.steps.branch_b.input.prompt = 'Run branch B from approval output:\n${{ input.choose_path }}';
  approvalWorkflow.steps.join.next = 'done';
  writeJson(workflowPath, approvalWorkflow);
  const rawPrompt = 'Prompt marker should persist exactly once.';

  expectRunner(['next', '--run-id', runId, '--workflow', workflowPath, '--user-prompt', rawPrompt], 'next approval untyped static parallel');
  const approvalOutput = path.join(runDir, 'choose-path-output.json');
  writeJson(approvalOutput, { approval: 'approved', note: 'Fan out.' });
  const fanout = continueWithOutputs({ runId, runDir, workflowPath, refs: `choose_path=${approvalOutput}`, label: 'continue approval untyped static parallel' });
  assert.deepEqual(fanout.requests.map((request) => request.id), ['branch_a', 'branch_b']);
  assert.deepEqual(fanout.baton.state.choose_path, { approval: 'approved', note: 'Fan out.' });
  assert.equal(fanout.baton.user_prompt_injected, undefined);

  const branchAOutput = path.join(runDir, 'branch-a-output.json');
  const branchBOutput = path.join(runDir, 'branch-b-output.json');
  writeJson(branchAOutput, workerOutput('branch a complete'));
  writeJson(branchBOutput, workerOutput('branch b complete'));
  const joined = continueWithOutputs({ runId, runDir, workflowPath, refs: [`branch_a=${branchAOutput}`, `branch_b=${branchBOutput}`], label: 'continue untyped approval branch outputs' });

  assert.equal(joined.status, 'needs_host_actions');
  assert.deepEqual(joined.requests.map((request) => request.id), ['join']);
  assert.equal(joined.baton.cursor, 'join');
  assert.equal(joined.baton.user_prompt_injected, true);
  assert.equal(JSON.parse(readFileSync(path.join(runDir, 'baton.json'), 'utf8')).user_prompt_injected, true);
  assert.equal(JSON.stringify(joined.baton).match(/user_prompt_injected/g).length, 1);
});

test('runner: continue fans out parallel branch requests with separate step ids and load commands', () => {
  const { runId, runDir } = runCase('parallel');
  const workflowPath = path.join(tempDir, 'parallel-workflow.json');
  writeJson(workflowPath, workflowDoc);

  expectRunner(['next', '--run-id', runId, '--workflow', workflowPath], 'next prepare');
  const prepareOutput = path.join(runDir, 'prepare-output.json');
  writeJson(prepareOutput, workerOutput('prepared'));
  const response = continueWithOutputs({ runId, runDir, workflowPath, refs: prepareOutput, label: 'continue prepare' });

  assert.equal(response.status, 'needs_host_actions');
  assert.deepEqual(response.requests.map((request) => request.id), ['branch_a', 'branch_b']);
  assert.deepEqual(response.requests.map((request) => request.stepId), ['branch_a', 'branch_b']);
  assert.equal(Object.hasOwn(response.requests[0], 'compiledPrompt'), false);
  assert.equal(Object.hasOwn(response.requests[0], 'outputPath'), false);
  assert.equal(Object.hasOwn(response.requests[0], 'instructionRef'), false);
  assert.notEqual(response.requests[0].loadInstructionsCommand, response.requests[1].loadInstructionsCommand);
  const loaded = runRunner(['instructions', '--run-id', runId, '--step-id', 'branch_a']);
  assert.equal(loaded.status, 0, loaded.stderr);
  assert.match(loaded.stdout, /prepared/);
});

test('runner: continue accepts mixed run_worker and user-input outputs in one batch', () => {
  const { runId, runDir } = runCase('parallel-mixed-host-actions');
  const workflowPath = path.join(tempDir, 'parallel-mixed-host-actions.json');
  const mixedWorkflow = structuredClone(workflowDoc);
  mixedWorkflow.steps.prepare.next = ['branch_a', 'choose_path'];
  mixedWorkflow.steps.branch_a.next = 'join';
  mixedWorkflow.steps.choose_path = {
    name: 'Choose path',
    kind: 'approval',
    input: { prompt: 'Ask for the user choice before joining.' },
    output: { schema: 'approval-freeform.schema.json' },
    next: 'join',
  };
  mixedWorkflow.steps.join.input.prompt = 'Join branch A and approval:\n${{ input.branch_a }}\n${{ input.choose_path }}';
  mixedWorkflow.steps.join.next = 'done';
  writeJson(workflowPath, mixedWorkflow);

  expectRunner(['next', '--run-id', runId, '--workflow', workflowPath], 'next mixed prepare');
  const prepareOutput = path.join(runDir, 'prepare-output.json');
  writeJson(prepareOutput, workerOutput('prepared'));
  const requests = continueWithOutputs({ runId, runDir, workflowPath, refs: prepareOutput, label: 'continue mixed prepare' });

  assert.deepEqual(requests.requests.map((request) => [request.id, request.action]), [
    ['branch_a', 'run_worker'],
    ['choose_path', 'wait_for_approval'],
  ]);

  const branchOutput = path.join(runDir, 'branch-a-output.json');
  const userInputOutput = path.join(runDir, 'choose-path-output.json');
  writeJson(branchOutput, workerOutput('branch complete'));
  writeJson(userInputOutput, { choice: 'continue', answer: 'Looks good.' });

  const response = continueWithOutputs({ runId, runDir, workflowPath, refs: [`branch_a=${branchOutput}`, `choose_path=${userInputOutput}`], label: 'continue mixed batch' });

  assert.equal(response.status, 'needs_host_actions');
  assert.deepEqual(response.requests.map((request) => request.id), ['join']);
  assert.equal(response.baton.state.branch_a.results[0].summary, 'branch complete');
  assert.deepEqual(response.baton.state.choose_path, { choice: 'continue', answer: 'Looks good.' });
});

test('runner: continue collects parallel outputs and advances to join request', () => {
  const { runId, runDir } = runCase('parallel-join');
  const workflowPath = path.join(tempDir, 'parallel-join-workflow.json');
  writeJson(workflowPath, workflowDoc);

  expectRunner(['next', '--run-id', runId, '--workflow', workflowPath], 'next prepare join');
  const prepareOutput = path.join(runDir, 'prepare-output.json');
  writeJson(prepareOutput, workerOutput('prepared'));
  const branches = continueWithOutputs({ runId, runDir, workflowPath, refs: prepareOutput, label: 'continue prepare join' });
  const branchOutputs = branches.requests.map((request) => {
    const outputPath = path.join(runDir, `${request.id}-artifact.json`);
    writeJson(outputPath, workerOutput(`${request.id} complete`));
    return `${request.id}=${outputPath}`;
  });
  const response = continueWithOutputs({ runId, runDir, workflowPath, refs: branchOutputs, label: 'continue branches' });

  assert.equal(response.status, 'needs_host_actions');
  assert.deepEqual(response.requests.map((request) => request.id), ['join']);
  assert.equal(Object.hasOwn(response.requests[0], 'compiledPrompt'), false);
  const loaded = runRunner(['instructions', '--run-id', runId, '--step-id', 'join']);
  assert.equal(loaded.status, 0, loaded.stderr);
  assert.match(loaded.stdout, /branch_a complete/);
  assert.match(loaded.stdout, /branch_b complete/);
  const baton = JSON.parse(readFileSync(path.join(runDir, 'baton.json'), 'utf8'));
  assert.equal(baton.cursor, 'join');
});
