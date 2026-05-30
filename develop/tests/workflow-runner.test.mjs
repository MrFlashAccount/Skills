import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const tempDir = mkdtempSync(path.join(tmpdir(), 'workflow-runner-check-'));

const workflowDoc = {
  workflow: {
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
        output: { template: 'shared/templates/implementation-plan-template.md' },
        next: ['branch_a', 'branch_b'],
      },
      branch_a: {
        name: 'Branch A',
        kind: 'worker',
        input: { state: ['prepare'], prompt: 'Run branch A.' },
        output: { template: 'shared/templates/implementation-plan-template.md' },
        next: 'join',
      },
      branch_b: {
        name: 'Branch B',
        kind: 'worker',
        input: { state: ['prepare'], prompt: 'Run branch B.' },
        output: { template: 'shared/templates/implementation-plan-template.md' },
        next: 'join',
      },
      join: {
        name: 'Join',
        kind: 'worker',
        input: { state: ['branch_a', 'branch_b'], prompt: 'Join branch output.' },
        output: { template: 'shared/templates/implementation-plan-template.md' },
        next: 'done',
      },
      done: { name: 'Done', kind: 'done', input: { prompt: 'Finished.' } },
      blocked: { name: 'Blocked', kind: 'blocked', input: { prompt: 'Blocked.' } },
    },
  },
};

function writeJson(filePath, value) {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function runRunner(args) {
  return spawnSync(process.execPath, ['develop/scripts/workflow-runner.mjs', ...args], { cwd: root, encoding: 'utf8' });
}

async function runRunnerAsync(args) {
  const child = spawn(process.execPath, ['develop/scripts/workflow-runner.mjs', ...args], {
    cwd: root,
    encoding: 'utf8',
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

function workerOutput(summary) {
  return { outcome: 'ready', results: [{ type: 'check', summary }] };
}

after(() => rmSync(tempDir, { recursive: true, force: true }));

test('runner: next returns a single host action request with load command only', () => {
  const runDir = path.join(tempDir, 'single');
  const workflowPath = path.join(tempDir, 'single-workflow.json');
  const singleWorkflow = structuredClone(workflowDoc);
  singleWorkflow.workflow.steps.prepare.next = 'done';
  writeJson(workflowPath, singleWorkflow);

  const response = expectRunner(['next', '--run-dir', runDir, '--workflow', workflowPath], 'next single');

  assert.equal(response.status, 'needs_host_actions');
  assert.equal(response.baton.cursor, 'prepare');
  assert.deepEqual(response.requests.map((request) => request.id), ['prepare']);
  assert.equal(response.requests[0].action, 'run_worker');
  assert.equal(Object.hasOwn(response.requests[0], 'compiledPrompt'), false);
  assert.equal(response.requests[0].stepId, 'prepare');
  assert.equal(Object.hasOwn(response.requests[0], 'instructionRef'), false);
  assert.match(response.requests[0].loadInstructionsCommand, /workflow-runner\.mjs instructions --run-dir .* --step-id 'prepare'/);
  assert.equal(Object.hasOwn(response.requests[0], 'outputPath'), false);

  const lastResponse = JSON.parse(readFileSync(path.join(runDir, '.workflow-runner', 'last-response.json'), 'utf8'));
  assert.equal(Object.hasOwn(lastResponse.requests[0], 'instructionRef'), false);
  assert.equal(Object.hasOwn(lastResponse.requests[0], 'outputPath'), false);

  const loaded = runRunner(['instructions', '--run-dir', runDir, '--step-id', 'prepare']);
  assert.equal(loaded.status, 0, loaded.stderr);
  assert.match(loaded.stdout, /# Prepare/);

  assert.equal(existsSync(path.join(runDir, 'baton.json')), true);
});

test('runner: continue applies single output and returns terminal done', () => {
  const runDir = path.join(tempDir, 'single-continue');
  const workflowPath = path.join(tempDir, 'single-continue-workflow.json');
  const singleWorkflow = structuredClone(workflowDoc);
  singleWorkflow.workflow.steps.prepare.next = 'done';
  writeJson(workflowPath, singleWorkflow);

  expectRunner(['next', '--run-dir', runDir, '--workflow', workflowPath], 'next single continue');
  const outputPath = path.join(runDir, 'prepare-result.json');
  writeJson(outputPath, workerOutput('prepared'));
  const response = expectRunner(['continue', '--run-dir', runDir, '--workflow', workflowPath, '--output', outputPath], 'continue single');

  assert.equal(response.status, 'done');
  assert.equal(response.baton.cursor, 'done');
  assert.equal(response.baton.status, 'done');
  assert.equal(response.baton.state.prepare.results[0].summary, 'prepared');
});

test('runner: continue reuses saved custom workflow when --workflow is omitted', () => {
  const runDir = path.join(tempDir, 'custom-workflow-continue');
  const workflowPath = path.join(tempDir, 'custom-workflow-continue.json');
  const singleWorkflow = structuredClone(workflowDoc);
  singleWorkflow.workflow.name = 'custom-workflow-continue';
  singleWorkflow.workflow.steps.prepare.next = 'done';
  writeJson(workflowPath, singleWorkflow);

  expectRunner(['next', '--run-dir', runDir, '--workflow', workflowPath], 'next custom workflow continue');
  const outputPath = path.join(runDir, 'prepare-result.json');
  writeJson(outputPath, workerOutput('prepared with saved workflow'));
  const response = expectRunner(['continue', '--run-dir', runDir, '--output', outputPath], 'continue custom workflow without workflow arg');

  assert.equal(response.status, 'done');
  assert.equal(response.workflow, path.resolve(workflowPath));
  assert.equal(response.baton.cursor, 'done');
  assert.equal(response.baton.state.prepare.results[0].summary, 'prepared with saved workflow');
});

test('runner: wait_for_approval request accepts request-specific host output JSON', () => {
  const runDir = path.join(tempDir, 'approval-generic-output');
  const workflowPath = path.join(tempDir, 'approval-generic-output-workflow.json');
  const approvalWorkflow = structuredClone(workflowDoc);
  approvalWorkflow.workflow.start = 'choose_path';
  approvalWorkflow.workflow.steps = {
    choose_path: {
      name: 'Choose path',
      kind: 'approval',
      input: { prompt: 'Ask the user to choose option_a, option_b, or free-form blocked reason.' },
      next: { match: '${{ output.choice }}', cases: { option_a: 'done', option_b: 'join', blocked: 'blocked' } },
    },
    join: approvalWorkflow.workflow.steps.join,
    done: approvalWorkflow.workflow.steps.done,
    blocked: approvalWorkflow.workflow.steps.blocked,
  };
  approvalWorkflow.workflow.steps.join.input.state = [];
  approvalWorkflow.workflow.steps.join.next = 'done';
  writeJson(workflowPath, approvalWorkflow);

  const next = expectRunner(['next', '--run-dir', runDir, '--workflow', workflowPath], 'next approval generic');
  assert.equal(next.status, 'needs_host_actions');
  assert.equal(next.requests[0].action, 'wait_for_approval');

  const outputPath = path.join(runDir, 'choose-path-answer.json');
  writeJson(outputPath, { choice: 'option_a', answer: 'Ship the smaller fix first.' });
  const response = expectRunner(['continue', '--run-dir', runDir, '--workflow', workflowPath, '--output', `choose_path=${outputPath}`], 'continue approval generic');

  assert.equal(response.status, 'done');
  assert.equal(response.baton.cursor, 'done');
  assert.deepEqual(response.baton.state.choose_path, { choice: 'option_a', answer: 'Ship the smaller fix first.' });
});


test('runner: approval request exposes optional output schema reference', () => {
  const runDir = path.join(tempDir, 'approval-output-schema-request');
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
  approvalWorkflow.workflow.start = 'choose_path';
  approvalWorkflow.workflow.steps = {
    choose_path: {
      name: 'Choose path',
      kind: 'approval',
      input: { prompt: 'Ask the user whether to approve or block.' },
      output: { schema: path.basename(schemaPath) },
      next: { match: '${{ output.choice }}', cases: { approved: 'done', blocked: 'blocked' } },
    },
    done: approvalWorkflow.workflow.steps.done,
    blocked: approvalWorkflow.workflow.steps.blocked,
  };
  writeJson(workflowPath, approvalWorkflow);

  const response = expectRunner(['next', '--run-dir', runDir, '--workflow', workflowPath], 'next approval output schema request');

  assert.equal(response.status, 'needs_host_actions');
  assert.equal(response.requests[0].action, 'wait_for_approval');
  assert.equal(response.requests[0].outputSchema, path.basename(schemaPath));
  assert.equal(response.requests[0].resolvedOutputSchema.ref, path.basename(schemaPath));
  assert.equal(Object.hasOwn(response.requests[0].resolvedOutputSchema, 'path'), false);
  assert.deepEqual(response.requests[0].resolvedOutputSchema.schema.required, ['choice']);
});

test('runner: typed approval retry preserves validation feedback in instructions', () => {
  const runDir = path.join(tempDir, 'approval-output-schema-retry');
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
  approvalWorkflow.workflow.start = 'choose_path';
  approvalWorkflow.workflow.steps = {
    choose_path: {
      name: 'Choose path',
      kind: 'approval',
      input: { prompt: 'Ask the user whether to approve or block.' },
      output: { schema: path.basename(schemaPath) },
      next: { match: '${{ output.choice }}', cases: { approved: 'done', blocked: 'blocked' } },
    },
    done: approvalWorkflow.workflow.steps.done,
    blocked: approvalWorkflow.workflow.steps.blocked,
  };
  writeJson(workflowPath, approvalWorkflow);

  expectRunner(['next', '--run-dir', runDir, '--workflow', workflowPath], 'next approval output schema retry');
  const outputPath = path.join(runDir, 'invalid-approval.json');
  writeJson(outputPath, { choice: 'maybe' });

  const response = expectRunner(['continue', '--run-dir', runDir, '--workflow', workflowPath, '--output', `choose_path=${outputPath}`], 'continue approval output schema retry');

  assert.equal(response.status, 'needs_host_actions');
  assert.equal(response.requests[0].action, 'wait_for_approval');
  assert.equal(response.requests[0].outputSchema, path.basename(schemaPath));
  assert.equal(response.requests[0].resolvedOutputSchema.ref, path.basename(schemaPath));
  assert.equal(Object.hasOwn(response.requests[0].resolvedOutputSchema, 'path'), false);
  assert.deepEqual(response.requests[0].resolvedOutputSchema.schema.required, ['choice']);
  assert.equal(response.baton.state.attempts['choose_path:output.schema'], 1);

  const loaded = runRunner(['instructions', '--run-dir', runDir, '--step-id', 'choose_path']);
  assert.equal(loaded.status, 0, loaded.stderr);
  assert.match(loaded.stdout, /Previous output failed output\.schema validation \(attempt 1\/3\)\./);
  assert.match(loaded.stdout, /Validation errors:/);
  assert.match(loaded.stdout, /approved/);
});


test('runner: typed approval static parallel next preserves approval output in state', () => {
  const runDir = path.join(tempDir, 'approval-output-schema-static-parallel');
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
  approvalWorkflow.workflow.start = 'choose_path';
  approvalWorkflow.workflow.steps = {
    choose_path: {
      name: 'Choose path',
      kind: 'approval',
      input: { prompt: 'Ask the user whether to fan out.' },
      output: { schema: path.basename(schemaPath) },
      next: ['branch_a', 'branch_b'],
    },
    branch_a: approvalWorkflow.workflow.steps.branch_a,
    branch_b: approvalWorkflow.workflow.steps.branch_b,
    join: approvalWorkflow.workflow.steps.join,
    done: approvalWorkflow.workflow.steps.done,
    blocked: approvalWorkflow.workflow.steps.blocked,
  };
  approvalWorkflow.workflow.steps.branch_a.input.state = ['choose_path'];
  approvalWorkflow.workflow.steps.branch_b.input.state = ['choose_path'];
  approvalWorkflow.workflow.steps.join.next = 'done';
  writeJson(workflowPath, approvalWorkflow);

  expectRunner(['next', '--run-dir', runDir, '--workflow', workflowPath], 'next approval static parallel');
  const outputPath = path.join(runDir, 'choose-path-output.json');
  const approvalOutput = { choice: 'approved', notes: 'Fan out now.' };
  writeJson(outputPath, approvalOutput);
  const response = expectRunner(['continue', '--run-dir', runDir, '--workflow', workflowPath, '--output', `choose_path=${outputPath}`], 'continue approval static parallel');

  assert.equal(response.status, 'needs_host_actions');
  assert.deepEqual(response.requests.map((request) => request.id), ['branch_a', 'branch_b']);
  assert.deepEqual(response.baton.state.choose_path, approvalOutput);
  assert.deepEqual(response.baton.state.outputs.choose_path, approvalOutput);

  const branchAInstructions = runRunner(['instructions', '--run-dir', runDir, '--step-id', 'branch_a']);
  assert.equal(branchAInstructions.status, 0, branchAInstructions.stderr);
  assert.match(branchAInstructions.stdout, /Fan out now\./);
});


test('runner: generic approval static parallel next preserves approval output in state', () => {
  const runDir = path.join(tempDir, 'approval-generic-static-parallel');
  const workflowPath = path.join(tempDir, 'approval-generic-static-parallel-workflow.json');
  const approvalWorkflow = structuredClone(workflowDoc);
  approvalWorkflow.workflow.start = 'choose_path';
  approvalWorkflow.workflow.steps = {
    choose_path: {
      name: 'Choose path',
      kind: 'approval',
      input: { prompt: 'Ask the user whether to fan out.' },
      next: ['branch_a', 'branch_b'],
    },
    branch_a: approvalWorkflow.workflow.steps.branch_a,
    branch_b: approvalWorkflow.workflow.steps.branch_b,
    join: approvalWorkflow.workflow.steps.join,
    done: approvalWorkflow.workflow.steps.done,
    blocked: approvalWorkflow.workflow.steps.blocked,
  };
  approvalWorkflow.workflow.steps.branch_a.input.state = ['choose_path'];
  approvalWorkflow.workflow.steps.branch_b.input.state = ['choose_path'];
  approvalWorkflow.workflow.steps.join.next = 'done';
  writeJson(workflowPath, approvalWorkflow);

  expectRunner(['next', '--run-dir', runDir, '--workflow', workflowPath], 'next generic approval static parallel');
  const outputPath = path.join(runDir, 'choose-path-output.json');
  const approvalOutput = { approval: 'approved', answer: 'Use both branches.' };
  writeJson(outputPath, approvalOutput);
  const response = expectRunner(['continue', '--run-dir', runDir, '--workflow', workflowPath, '--output', `choose_path=${outputPath}`], 'continue generic approval static parallel');

  assert.equal(response.status, 'needs_host_actions');
  assert.deepEqual(response.requests.map((request) => request.id), ['branch_a', 'branch_b']);
  assert.deepEqual(response.baton.state.choose_path, approvalOutput);

  const branchAInstructions = runRunner(['instructions', '--run-dir', runDir, '--step-id', 'branch_a']);
  assert.equal(branchAInstructions.status, 0, branchAInstructions.stderr);
  assert.match(branchAInstructions.stdout, /Use both branches\./);
});

test('runner: continue fans out parallel branch requests with separate step ids and load commands', () => {
  const runDir = path.join(tempDir, 'parallel');
  const workflowPath = path.join(tempDir, 'parallel-workflow.json');
  writeJson(workflowPath, workflowDoc);

  expectRunner(['next', '--run-dir', runDir, '--workflow', workflowPath], 'next prepare');
  const prepareOutput = path.join(runDir, 'prepare-output.json');
  writeJson(prepareOutput, workerOutput('prepared'));
  const response = expectRunner(['continue', '--run-dir', runDir, '--workflow', workflowPath, '--output', prepareOutput], 'continue prepare');

  assert.equal(response.status, 'needs_host_actions');
  assert.deepEqual(response.requests.map((request) => request.id), ['branch_a', 'branch_b']);
  assert.deepEqual(response.requests.map((request) => request.stepId), ['branch_a', 'branch_b']);
  assert.equal(Object.hasOwn(response.requests[0], 'compiledPrompt'), false);
  assert.equal(Object.hasOwn(response.requests[0], 'outputPath'), false);
  assert.equal(Object.hasOwn(response.requests[0], 'instructionRef'), false);
  assert.notEqual(response.requests[0].loadInstructionsCommand, response.requests[1].loadInstructionsCommand);
  const loaded = runRunner(['instructions', '--run-dir', runDir, '--step-id', 'branch_a']);
  assert.equal(loaded.status, 0, loaded.stderr);
  assert.match(loaded.stdout, /prepared/);
});

test('runner: continue accepts mixed run_worker and user-input outputs in one batch', () => {
  const runDir = path.join(tempDir, 'parallel-mixed-host-actions');
  const workflowPath = path.join(tempDir, 'parallel-mixed-host-actions.json');
  const mixedWorkflow = structuredClone(workflowDoc);
  mixedWorkflow.workflow.steps.prepare.next = ['branch_a', 'choose_path'];
  mixedWorkflow.workflow.steps.branch_a.next = 'join';
  mixedWorkflow.workflow.steps.choose_path = {
    name: 'Choose path',
    kind: 'approval',
    input: { prompt: 'Ask for the user choice before joining.' },
    next: 'join',
  };
  mixedWorkflow.workflow.steps.join.input.state = ['branch_a', 'choose_path'];
  mixedWorkflow.workflow.steps.join.next = 'done';
  writeJson(workflowPath, mixedWorkflow);

  expectRunner(['next', '--run-dir', runDir, '--workflow', workflowPath], 'next mixed prepare');
  const prepareOutput = path.join(runDir, 'prepare-output.json');
  writeJson(prepareOutput, workerOutput('prepared'));
  const requests = expectRunner(['continue', '--run-dir', runDir, '--workflow', workflowPath, '--output', prepareOutput], 'continue mixed prepare');

  assert.deepEqual(requests.requests.map((request) => [request.id, request.action]), [
    ['branch_a', 'run_worker'],
    ['choose_path', 'wait_for_approval'],
  ]);

  const branchOutput = path.join(runDir, 'branch-a-output.json');
  const userInputOutput = path.join(runDir, 'choose-path-output.json');
  writeJson(branchOutput, workerOutput('branch complete'));
  writeJson(userInputOutput, { choice: 'continue', answer: 'Looks good.' });

  const response = expectRunner([
    'continue',
    '--run-dir',
    runDir,
    '--workflow',
    workflowPath,
    '--output',
    `branch_a=${branchOutput}`,
    '--output',
    `choose_path=${userInputOutput}`,
  ], 'continue mixed batch');

  assert.equal(response.status, 'needs_host_actions');
  assert.deepEqual(response.requests.map((request) => request.id), ['join']);
  assert.equal(response.baton.state.branch_a.results[0].summary, 'branch complete');
  assert.deepEqual(response.baton.state.choose_path, { choice: 'continue', answer: 'Looks good.' });
});

test('runner: continue collects parallel outputs and advances to join request', () => {
  const runDir = path.join(tempDir, 'parallel-join');
  const workflowPath = path.join(tempDir, 'parallel-join-workflow.json');
  writeJson(workflowPath, workflowDoc);

  expectRunner(['next', '--run-dir', runDir, '--workflow', workflowPath], 'next prepare join');
  const prepareOutput = path.join(runDir, 'prepare-output.json');
  writeJson(prepareOutput, workerOutput('prepared'));
  const branches = expectRunner(['continue', '--run-dir', runDir, '--workflow', workflowPath, '--output', prepareOutput], 'continue prepare join');
  const branchOutputs = branches.requests.map((request) => {
    const outputPath = path.join(runDir, `${request.id}-artifact.json`);
    writeJson(outputPath, workerOutput(`${request.id} complete`));
    return `${request.id}=${outputPath}`;
  });
  const response = expectRunner(['continue', '--run-dir', runDir, '--workflow', workflowPath, ...branchOutputs.flatMap((output) => ['--output', output])], 'continue branches');

  assert.equal(response.status, 'needs_host_actions');
  assert.deepEqual(response.requests.map((request) => request.id), ['join']);
  assert.equal(Object.hasOwn(response.requests[0], 'compiledPrompt'), false);
  const loaded = runRunner(['instructions', '--run-dir', runDir, '--step-id', 'join']);
  assert.equal(loaded.status, 0, loaded.stderr);
  assert.match(loaded.stdout, /branch_a complete/);
  assert.match(loaded.stdout, /branch_b complete/);
  const baton = JSON.parse(readFileSync(path.join(runDir, 'baton.json'), 'utf8'));
  assert.equal(baton.cursor, 'join');
});

test('runner: continue rejects concurrent attempts for the same run dir', async () => {
  const runDir = path.join(tempDir, 'concurrent-continue-same-run-dir');
  const workflowPath = path.join(tempDir, 'concurrent-continue-same-run-dir.json');
  const singleWorkflow = structuredClone(workflowDoc);
  singleWorkflow.workflow.steps.prepare.next = 'done';
  writeJson(workflowPath, singleWorkflow);

  expectRunner(['next', '--run-dir', runDir, '--workflow', workflowPath], 'next concurrent continue');
  const outputPath = path.join(runDir, 'prepare-result.json');
  makeFifo(outputPath);

  const first = runRunnerAsync(['continue', '--run-dir', runDir, '--workflow', workflowPath, '--output', outputPath]);
  await waitForPath(path.join(runDir, '.workflow-runner', 'continue.lock'));
  const second = await runRunnerAsync(['continue', '--run-dir', runDir, '--workflow', workflowPath, '--output', outputPath]);
  writeFileSync(outputPath, `${JSON.stringify(workerOutput('prepared once'))}\n`);
  const firstResult = await first;

  assert.equal(firstResult.status, 0, firstResult.stderr);
  assert.notEqual(second.status, 0);
  assert.match(second.stderr, /continue is already in progress/);
  assert.equal(existsSync(path.join(runDir, '.workflow-runner', 'continue.lock')), false);

  const response = JSON.parse(firstResult.stdout);
  assert.equal(response.status, 'done');
  assert.equal(response.baton.state.prepare.results[0].summary, 'prepared once');
});

test('runner: continue locks only one run dir', async () => {
  const slowRunDir = path.join(tempDir, 'concurrent-continue-slow-run-dir');
  const otherRunDir = path.join(tempDir, 'concurrent-continue-other-run-dir');
  const workflowPath = path.join(tempDir, 'concurrent-continue-different-run-dirs.json');
  const singleWorkflow = structuredClone(workflowDoc);
  singleWorkflow.workflow.steps.prepare.next = 'done';
  writeJson(workflowPath, singleWorkflow);

  expectRunner(['next', '--run-dir', slowRunDir, '--workflow', workflowPath], 'next slow run dir');
  expectRunner(['next', '--run-dir', otherRunDir, '--workflow', workflowPath], 'next other run dir');
  const slowOutputPath = path.join(slowRunDir, 'prepare-result.json');
  makeFifo(slowOutputPath);
  writeJson(path.join(otherRunDir, 'prepare-result.json'), workerOutput('other'));

  const first = runRunnerAsync(['continue', '--run-dir', slowRunDir, '--workflow', workflowPath, '--output', slowOutputPath]);
  await waitForPath(path.join(slowRunDir, '.workflow-runner', 'continue.lock'));
  const other = await runRunnerAsync(['continue', '--run-dir', otherRunDir, '--workflow', workflowPath, '--output', path.join(otherRunDir, 'prepare-result.json')]);
  writeFileSync(slowOutputPath, `${JSON.stringify(workerOutput('slow'))}\n`);
  const firstResult = await first;

  assert.equal(firstResult.status, 0, firstResult.stderr);
  assert.equal(other.status, 0, other.stderr);
  assert.equal(JSON.parse(other.stdout).baton.state.prepare.results[0].summary, 'other');
});

test('runner: continue reports missing requested output as an error', () => {
  const runDir = path.join(tempDir, 'missing-output');
  const workflowPath = path.join(tempDir, 'missing-output-workflow.json');
  const singleWorkflow = structuredClone(workflowDoc);
  singleWorkflow.workflow.steps.prepare.next = 'done';
  writeJson(workflowPath, singleWorkflow);

  expectRunner(['next', '--run-dir', runDir, '--workflow', workflowPath], 'next missing');
  const result = runRunner(['continue', '--run-dir', runDir, '--workflow', workflowPath]);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /missing host output/);
});


test('runner: continue does not persist applied output when next render fails', () => {
  const runDir = path.join(tempDir, 'render-failure-no-advance');
  const workflowPath = path.join(tempDir, 'render-failure-no-advance-workflow.json');
  const renderFailureWorkflow = structuredClone(workflowDoc);
  renderFailureWorkflow.workflow.steps.prepare.next = 'bad_render';
  renderFailureWorkflow.workflow.steps.bad_render = {
    name: 'Bad Render',
    kind: 'worker',
    input: {
      state: ['prepare'],
      template: 'missing-input-template.md',
      prompt: 'This step should fail prompt rendering.',
    },
    output: { template: 'shared/templates/implementation-plan-template.md' },
    next: 'done',
  };
  writeJson(workflowPath, renderFailureWorkflow);

  expectRunner(['next', '--run-dir', runDir, '--workflow', workflowPath], 'next render failure setup');
  const batonBefore = readFileSync(path.join(runDir, 'baton.json'), 'utf8');
  const historyBefore = readFileSync(path.join(runDir, 'history.md'), 'utf8');
  const lastResponseBefore = readFileSync(path.join(runDir, '.workflow-runner', 'last-response.json'), 'utf8');

  const outputPath = path.join(runDir, 'prepare-result.json');
  writeJson(outputPath, workerOutput('prepared but should not persist'));
  const result = runRunner(['continue', '--run-dir', runDir, '--workflow', workflowPath, '--output', outputPath]);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /workflow prompt render failed/);
  assert.equal(readFileSync(path.join(runDir, 'baton.json'), 'utf8'), batonBefore);
  assert.equal(readFileSync(path.join(runDir, 'history.md'), 'utf8'), historyBefore);
  assert.equal(readFileSync(path.join(runDir, '.workflow-runner', 'last-response.json'), 'utf8'), lastResponseBefore);

  const baton = JSON.parse(batonBefore);
  assert.equal(baton.cursor, 'prepare');
  assert.equal(Object.hasOwn(baton.state, 'prepare'), false);
});


test('runner: instructions rejects unknown, unsafe, and missing instructions', () => {
  const runDir = path.join(tempDir, 'instructions-errors');
  const workflowPath = path.join(tempDir, 'instructions-errors-workflow.json');
  const singleWorkflow = structuredClone(workflowDoc);
  singleWorkflow.workflow.steps.prepare.next = 'done';
  writeJson(workflowPath, singleWorkflow);

  expectRunner(['next', '--run-dir', runDir, '--workflow', workflowPath], 'next instructions errors');

  const unknown = runRunner(['instructions', '--run-dir', runDir, '--step-id', 'nope']);
  assert.notEqual(unknown.status, 0);
  assert.match(unknown.stderr, /unknown current workflow step id: nope/);

  const unsafe = runRunner(['instructions', '--run-dir', runDir, '--step-id', '../prepare']);
  assert.notEqual(unsafe.status, 0);
  assert.match(unsafe.stderr, /invalid workflow step id/);

  rmSync(path.join(runDir, '.workflow-runner', 'instructions', 'prepare.md'), { force: true });
  const missing = runRunner(['instructions', '--run-dir', runDir, '--step-id', 'prepare']);
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /cannot read instructions for workflow step prepare/);
});
