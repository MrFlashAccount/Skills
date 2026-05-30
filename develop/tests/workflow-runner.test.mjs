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

test('runner: next rejects workflow whose first worker id is reserved baton state bookkeeping', () => {
  const runDir = path.join(tempDir, 'reserved-first-worker');
  const workflowPath = path.join(tempDir, 'reserved-first-worker-workflow.json');
  const reservedWorkflow = structuredClone(workflowDoc);
  reservedWorkflow.workflow.start = 'artifacts';
  reservedWorkflow.workflow.steps.artifacts = {
    ...reservedWorkflow.workflow.steps.prepare,
    name: 'Reserved first worker',
  };
  delete reservedWorkflow.workflow.steps.prepare;
  writeJson(workflowPath, reservedWorkflow);

  const result = runRunner(['next', '--run-dir', runDir, '--workflow', workflowPath, '--user-prompt', 'must not be skipped']);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /workflow step id 'artifacts' is reserved for baton state bookkeeping/);
});

test('runner: user prompt is stored, included only in initial worker instructions, and preserved on continue', () => {
  const runDir = path.join(tempDir, 'user-prompt-runtime');
  const workflowPath = path.join(tempDir, 'user-prompt-runtime-workflow.json');
  writeJson(workflowPath, workflowDoc);
  const rawPrompt = 'Raw startup task text.\nPreserve me exactly.';

  const first = expectRunner(['next', '--run-dir', runDir, '--workflow', workflowPath, '--user-prompt', rawPrompt], 'next with user prompt');
  assert.equal(first.baton.user_prompt, rawPrompt);
  assert.equal(first.baton.user_prompt_injected, true);
  assert.equal(JSON.parse(readFileSync(path.join(runDir, 'baton.json'), 'utf8')).user_prompt, rawPrompt);
  assert.equal(JSON.parse(readFileSync(path.join(runDir, 'baton.json'), 'utf8')).user_prompt_injected, true);

  const initialInstructions = runRunner(['instructions', '--run-dir', runDir, '--step-id', 'prepare']);
  assert.equal(initialInstructions.status, 0, initialInstructions.stderr);
  assert.match(initialInstructions.stdout, /## User prompt/);
  assert.equal(initialInstructions.stdout.includes(rawPrompt), true);

  const prepareOutput = path.join(runDir, 'prepare-output.json');
  writeJson(prepareOutput, workerOutput('prepared'));
  const nextResponse = expectRunner(['continue', '--run-dir', runDir, '--workflow', workflowPath, '--output', prepareOutput], 'continue with user prompt');
  assert.equal(nextResponse.baton.user_prompt, rawPrompt);
  assert.equal(nextResponse.baton.user_prompt_injected, true);
  assert.equal(JSON.parse(readFileSync(path.join(runDir, 'baton.json'), 'utf8')).user_prompt, rawPrompt);
  assert.equal(JSON.parse(readFileSync(path.join(runDir, 'baton.json'), 'utf8')).user_prompt_injected, true);

  const laterInstructions = runRunner(['instructions', '--run-dir', runDir, '--step-id', 'branch_a']);
  assert.equal(laterInstructions.status, 0, laterInstructions.stderr);
  assert.doesNotMatch(laterInstructions.stdout, /## User prompt/);
  assert.equal(laterInstructions.stdout.includes(rawPrompt), false);
});

test('runner: next rejects empty or conflicting user prompt inputs', () => {
  const workflowPath = path.join(tempDir, 'user-prompt-negative-workflow.json');
  writeJson(workflowPath, workflowDoc);

  const emptyArg = runRunner(['next', '--run-dir', path.join(tempDir, 'empty-user-prompt-next'), '--workflow', workflowPath, '--user-prompt', '']);
  assert.notEqual(emptyArg.status, 0);
  assert.match(emptyArg.stderr, /--user-prompt must not be empty or whitespace-only/);

  const promptPath = path.join(tempDir, 'empty-user-prompt-next-file.txt');
  writeFileSync(promptPath, '  \n');
  const emptyFile = runRunner(['next', '--run-dir', path.join(tempDir, 'empty-user-prompt-file-next'), '--workflow', workflowPath, '--user-prompt-file', promptPath]);
  assert.notEqual(emptyFile.status, 0);
  assert.match(emptyFile.stderr, /--user-prompt-file must not be empty or whitespace-only/);

  const emptyPath = runRunner(['next', '--run-dir', path.join(tempDir, 'empty-user-prompt-file-path-next'), '--workflow', workflowPath, '--user-prompt-file', '']);
  assert.notEqual(emptyPath.status, 0);
  assert.match(emptyPath.stderr, /--user-prompt-file path must not be empty or whitespace-only/);

  writeFileSync(promptPath, 'from file');
  const conflicting = runRunner(['next', '--run-dir', path.join(tempDir, 'conflicting-user-prompt-next'), '--workflow', workflowPath, '--user-prompt', 'from arg', '--user-prompt-file', promptPath]);
  assert.notEqual(conflicting.status, 0);
  assert.match(conflicting.stderr, /provide only one of --user-prompt or --user-prompt-file/);
});

test('runner: non-next modes reject empty user prompt file option', () => {
  const result = runRunner(['instructions', '--run-dir', path.join(tempDir, 'unsupported-user-prompt-file'), '--step-id', 'prepare', '--user-prompt-file', '']);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /usage: node scripts\/workflow-runner\.mjs/);
});

test('runner: user prompt is included in first worker when workflow starts with approval step', () => {
  const runDir = path.join(tempDir, 'user-prompt-control-start');
  const workflowPath = path.join(tempDir, 'user-prompt-control-start-workflow.json');
  const approvalFirstWorkflow = structuredClone(workflowDoc);
  approvalFirstWorkflow.workflow.start = 'gate';
  approvalFirstWorkflow.workflow.steps = {
    gate: {
      name: 'Gate',
      kind: 'approval',
      input: { prompt: 'Approve startup task.' },
      next: { match: '${{ output.approval }}', cases: { approved: 'prepare', blocked: 'blocked' } },
    },
    ...approvalFirstWorkflow.workflow.steps,
  };
  writeJson(workflowPath, approvalFirstWorkflow);
  const rawPrompt = 'Raw task must reach first worker after approval.';

  expectRunner(['next', '--run-dir', runDir, '--workflow', workflowPath, '--user-prompt', rawPrompt], 'next approval-first with user prompt');
  const gateInstructions = runRunner(['instructions', '--run-dir', runDir, '--step-id', 'gate']);
  assert.equal(gateInstructions.status, 0, gateInstructions.stderr);
  assert.doesNotMatch(gateInstructions.stdout, /## User prompt/);
  assert.equal(gateInstructions.stdout.includes(rawPrompt), false);

  const approvalOutput = path.join(runDir, 'gate-output.json');
  writeJson(approvalOutput, { approval: 'approved' });
  expectRunner(['continue', '--run-dir', runDir, '--workflow', workflowPath, '--output', approvalOutput], 'continue approval-first gate');
  const firstWorkerInstructions = runRunner(['instructions', '--run-dir', runDir, '--step-id', 'prepare']);
  assert.equal(firstWorkerInstructions.status, 0, firstWorkerInstructions.stderr);
  assert.match(firstWorkerInstructions.stdout, /## User prompt/);
  assert.equal(firstWorkerInstructions.stdout.includes(rawPrompt), true);

  const prepareOutput = path.join(runDir, 'prepare-output.json');
  writeJson(prepareOutput, workerOutput('prepared'));
  expectRunner(['continue', '--run-dir', runDir, '--workflow', workflowPath, '--output', prepareOutput], 'continue approval-first prepare');
  const laterInstructions = runRunner(['instructions', '--run-dir', runDir, '--step-id', 'branch_a']);
  assert.equal(laterInstructions.status, 0, laterInstructions.stderr);
  assert.doesNotMatch(laterInstructions.stdout, /## User prompt/);
  assert.equal(laterInstructions.stdout.includes(rawPrompt), false);
});

test('runner: next resumes existing baton without overwriting user prompt', () => {
  const runDir = path.join(tempDir, 'user-prompt-resume');
  const workflowPath = path.join(tempDir, 'user-prompt-resume-workflow.json');
  writeJson(workflowPath, workflowDoc);

  expectRunner(['next', '--run-dir', runDir, '--workflow', workflowPath, '--user-prompt', 'original raw prompt'], 'next original user prompt');
  const response = expectRunner(['next', '--run-dir', runDir, '--workflow', workflowPath, '--user-prompt', 'replacement raw prompt'], 'resume with replacement user prompt');

  assert.equal(response.resumed, true);
  assert.equal(response.baton.user_prompt, 'original raw prompt');
  assert.equal(JSON.parse(readFileSync(path.join(runDir, 'baton.json'), 'utf8')).user_prompt, 'original raw prompt');
});

test('runner: persisted user prompt injection marker survives workflow drift on resume', () => {
  const runDir = path.join(tempDir, 'user-prompt-workflow-drift');
  const workflowPath = path.join(tempDir, 'user-prompt-workflow-drift.json');
  const driftWorkflow = structuredClone(workflowDoc);
  driftWorkflow.workflow.steps.prepare.next = 'branch_a';
  driftWorkflow.workflow.steps.branch_a.next = 'done';
  writeJson(workflowPath, driftWorkflow);
  const rawPrompt = 'Do not inject twice after workflow drift.';

  expectRunner(['next', '--run-dir', runDir, '--workflow', workflowPath, '--user-prompt', rawPrompt], 'next before workflow drift');
  const prepareOutput = path.join(runDir, 'prepare-drift-output.json');
  writeJson(prepareOutput, workerOutput('prepared before drift'));
  expectRunner(['continue', '--run-dir', runDir, '--workflow', workflowPath, '--output', prepareOutput], 'continue before workflow drift');

  delete driftWorkflow.workflow.steps.prepare;
  driftWorkflow.workflow.start = 'branch_a';
  writeJson(workflowPath, driftWorkflow);
  const resumed = expectRunner(['next', '--run-dir', runDir, '--workflow', workflowPath], 'rerender after workflow drift');
  assert.equal(resumed.baton.user_prompt_injected, true);

  const laterInstructions = runRunner(['instructions', '--run-dir', runDir, '--step-id', 'branch_a']);
  assert.equal(laterInstructions.status, 0, laterInstructions.stderr);
  assert.doesNotMatch(laterInstructions.stdout, /## User prompt/);
  assert.equal(laterInstructions.stdout.includes(rawPrompt), false);
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
