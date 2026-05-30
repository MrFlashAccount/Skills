import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';
import { fileURLToPath } from 'node:url';
import { next as runnerNext } from '../workflow/runner/index.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const tempDir = mkdtempSync(path.join(tmpdir(), 'workflow-runner-check-'));
writeFileSync(path.join(tempDir, 'output.md'), '## Output contract\nReturn markdown.\n');

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
        output: { template: 'output.md' },
        next: ['branch_a', 'branch_b'],
      },
      branch_a: {
        name: 'Branch A',
        kind: 'worker',
        input: { state: ['prepare'], prompt: 'Run branch A.' },
        output: { template: 'output.md' },
        next: 'join',
      },
      branch_b: {
        name: 'Branch B',
        kind: 'worker',
        input: { state: ['prepare'], prompt: 'Run branch B.' },
        output: { template: 'output.md' },
        next: 'join',
      },
      join: {
        name: 'Join',
        kind: 'worker',
        input: { state: ['branch_a', 'branch_b'], prompt: 'Join branch output.' },
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

function runRunner(args, options = {}) {
  return spawnSync(process.execPath, ['develop/lib/bin/workflow-runner.mjs', ...args], { cwd: root, encoding: 'utf8', env: { ...process.env, ...(options.env ?? {}) } });
}

async function runRunnerAsync(args) {
  const child = spawn(process.execPath, ['develop/lib/bin/workflow-runner.mjs', ...args], {
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
  singleWorkflow.steps.prepare.next = 'done';
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
  reservedWorkflow.start = 'artifacts';
  reservedWorkflow.steps.artifacts = {
    ...reservedWorkflow.steps.prepare,
    name: 'Reserved first worker',
  };
  delete reservedWorkflow.steps.prepare;
  writeJson(workflowPath, reservedWorkflow);

  const result = runRunner(['next', '--run-dir', runDir, '--workflow', workflowPath, '--user-prompt', 'must not be skipped']);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /workflow step id 'artifacts' is reserved for runtime aggregate state/);
});

test('runner: user prompt is stored, included only in initial worker instructions, and preserved on continue', () => {
  const runDir = path.join(tempDir, 'user-prompt-runtime');
  const workflowPath = path.join(tempDir, 'user-prompt-runtime-workflow.json');
  writeJson(workflowPath, workflowDoc);
  const rawPrompt = 'Raw startup task text.\nPreserve me exactly.';

  const first = expectRunner(['next', '--run-dir', runDir, '--workflow', workflowPath, '--user-prompt', rawPrompt], 'next with user prompt');
  assert.equal(first.baton.user_prompt, rawPrompt);
  assert.equal(first.baton.user_prompt_injected, undefined);
  assert.equal(JSON.parse(readFileSync(path.join(runDir, 'baton.json'), 'utf8')).user_prompt, rawPrompt);
  assert.equal(JSON.parse(readFileSync(path.join(runDir, 'baton.json'), 'utf8')).user_prompt_injected, undefined);

  const initialInstructions = runRunner(['instructions', '--run-dir', runDir, '--step-id', 'prepare']);
  assert.equal(initialInstructions.status, 0, initialInstructions.stderr);
  assert.match(initialInstructions.stdout, /## User prompt/);
  assert.equal(initialInstructions.stdout.includes(rawPrompt), true);

  const resumedBeforeOutput = expectRunner(['next', '--run-dir', runDir, '--workflow', workflowPath], 'resume before first output');
  assert.equal(resumedBeforeOutput.baton.user_prompt_injected, undefined);
  const resumedInstructions = runRunner(['instructions', '--run-dir', runDir, '--step-id', 'prepare']);
  assert.equal(resumedInstructions.status, 0, resumedInstructions.stderr);
  assert.match(resumedInstructions.stdout, /## User prompt/);
  assert.equal(resumedInstructions.stdout.includes(rawPrompt), true);

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

test('runner: resumed next is read-only for baton after user prompt marker is persisted', () => {
  const runDir = path.join(tempDir, 'user-prompt-next-read-only-after-marker');
  const workflowPath = path.join(tempDir, 'user-prompt-next-read-only-after-marker.json');
  const singleWorkflow = structuredClone(workflowDoc);
  singleWorkflow.steps.prepare.next = 'branch_a';
  singleWorkflow.steps.branch_a.next = 'done';
  writeJson(workflowPath, singleWorkflow);

  expectRunner(['next', '--run-dir', runDir, '--workflow', workflowPath, '--user-prompt', 'marker must not be rolled back'], 'next before marker');
  const prepareOutput = path.join(runDir, 'prepare-output.json');
  writeJson(prepareOutput, workerOutput('prepared'));
  expectRunner(['continue', '--run-dir', runDir, '--workflow', workflowPath, '--output', prepareOutput], 'continue marker');

  const batonPath = path.join(runDir, 'baton.json');
  const before = statSync(batonPath, { bigint: true }).mtimeNs;
  const resumed = expectRunner(['next', '--run-dir', runDir, '--workflow', workflowPath], 'resumed next after marker');
  const after = statSync(batonPath, { bigint: true }).mtimeNs;

  assert.equal(resumed.baton.user_prompt_injected, true);
  assert.equal(after, before);
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

test('runner: API next rejects empty user prompt before persisting baton', async () => {
  const workflowPath = path.join(tempDir, 'api-empty-user-prompt-workflow.json');
  writeJson(workflowPath, workflowDoc);

  const emptyRunDir = path.join(tempDir, 'api-empty-user-prompt-next');
  await assert.rejects(
    runnerNext({ runDir: emptyRunDir, workflowPath, userPrompt: '' }),
    /--user-prompt must not be empty or whitespace-only/,
  );
  assert.equal(existsSync(path.join(emptyRunDir, 'baton.json')), false);

  const whitespaceRunDir = path.join(tempDir, 'api-whitespace-user-prompt-next');
  await assert.rejects(
    runnerNext({ runDir: whitespaceRunDir, workflowPath, userPrompt: '  \n\t' }),
    /--user-prompt must not be empty or whitespace-only/,
  );
  assert.equal(existsSync(path.join(whitespaceRunDir, 'baton.json')), false);
});

test('runner: CLI resume ignores deleted startup user prompt file and preserves persisted prompt', () => {
  const runDir = path.join(tempDir, 'user-prompt-resume-deleted-file');
  const workflowPath = path.join(tempDir, 'user-prompt-resume-deleted-file-workflow.json');
  const promptPath = path.join(tempDir, 'user-prompt-resume-deleted-file.txt');
  writeJson(workflowPath, workflowDoc);
  writeFileSync(promptPath, 'original file prompt');

  expectRunner(['next', '--run-dir', runDir, '--workflow', workflowPath, '--user-prompt-file', promptPath], 'next with prompt file');
  rmSync(promptPath, { force: true });
  const response = expectRunner(['next', '--run-dir', runDir, '--workflow', workflowPath, '--user-prompt-file', promptPath], 'resume with deleted prompt file');

  assert.equal(response.resumed, true);
  assert.equal(response.baton.user_prompt, 'original file prompt');
  assert.equal(JSON.parse(readFileSync(path.join(runDir, 'baton.json'), 'utf8')).user_prompt, 'original file prompt');
});

test('runner: non-next modes reject empty user prompt file option', () => {
  const result = runRunner(['instructions', '--run-dir', path.join(tempDir, 'unsupported-user-prompt-file'), '--step-id', 'prepare', '--user-prompt-file', '']);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /usage: node develop\/lib\/bin\/workflow-runner\.mjs/);
});

test('runner: user prompt is included in first worker when workflow starts with approval step', () => {
  const runDir = path.join(tempDir, 'user-prompt-control-start');
  const workflowPath = path.join(tempDir, 'user-prompt-control-start-workflow.json');
  const approvalFirstWorkflow = structuredClone(workflowDoc);
  approvalFirstWorkflow.start = 'gate';
  approvalFirstWorkflow.steps = {
    gate: {
      name: 'Gate',
      kind: 'approval',
      input: { prompt: 'Approve startup task.' },
      next: { match: '${{ output.approval }}', cases: { approved: 'prepare', retry: 'prepare' } },
    },
    ...approvalFirstWorkflow.steps,
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

test('runner: startup prompt target rejects match-cases with worker and terminal branches', () => {
  const runDir = path.join(tempDir, 'user-prompt-match-terminal-rejected');
  const workflowPath = path.join(tempDir, 'user-prompt-match-terminal-rejected.json');
  const approvalFirstWorkflow = structuredClone(workflowDoc);
  approvalFirstWorkflow.start = 'gate';
  approvalFirstWorkflow.steps = {
    gate: {
      name: 'Gate',
      kind: 'approval',
      input: { prompt: 'Approve startup task.' },
      next: { match: '${{ output.approval }}', cases: { approved: 'prepare', blocked: 'blocked' } },
    },
    ...approvalFirstWorkflow.steps,
  };
  writeJson(workflowPath, approvalFirstWorkflow);

  const result = runRunner(['next', '--run-dir', runDir, '--workflow', workflowPath, '--user-prompt', 'Prompt must not be dropped.']);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /cannot determine stable startup user prompt target: workflow step 'gate' has a match\/cases branch with no worker target/);
});

test('runner: startup prompt target rejects a selected match-cases branch that no longer renders the target', () => {
  const runDir = path.join(tempDir, 'user-prompt-match-selected-target-missing');
  const workflowPath = path.join(tempDir, 'user-prompt-match-selected-target-missing.json');
  const approvalFirstWorkflow = structuredClone(workflowDoc);
  approvalFirstWorkflow.start = 'gate';
  approvalFirstWorkflow.steps = {
    gate: {
      name: 'Gate',
      kind: 'approval',
      input: { prompt: 'Choose startup route.' },
      next: { match: '${{ output.choice }}', cases: { approved: 'prepare', retry: 'prepare' } },
    },
    ...approvalFirstWorkflow.steps,
  };
  writeJson(workflowPath, approvalFirstWorkflow);

  const initial = expectRunner(['next', '--run-dir', runDir, '--workflow', workflowPath, '--user-prompt', 'Prompt must reach prepare.'], 'next stable match-cases');
  assert.equal(initial.baton.user_prompt_target, 'prepare');

  approvalFirstWorkflow.steps.gate.next = { match: '${{ output.choice }}', cases: { approved: 'done', retry: 'prepare' } };
  writeJson(workflowPath, approvalFirstWorkflow);
  const approvalOutput = path.join(runDir, 'gate-output.json');
  writeJson(approvalOutput, { choice: 'approved' });
  const result = runRunner(['continue', '--run-dir', runDir, '--workflow', workflowPath, '--output', `gate=${approvalOutput}`]);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /startup user prompt target 'prepare' is not renderable in the current workflow response/);
});

test('runner: startup prompt target rejects dynamic fanout before prompt selection can drift', () => {
  const runDir = path.join(tempDir, 'user-prompt-dynamic-fanout-rejected');
  const workflowPath = path.join(tempDir, 'user-prompt-dynamic-fanout-rejected.json');
  const approvalWorkflow = structuredClone(workflowDoc);
  approvalWorkflow.start = 'choose_path';
  approvalWorkflow.steps = {
    choose_path: {
      name: 'Choose path',
      kind: 'approval',
      input: { prompt: 'Ask whether to fan out.' },
      next: ['branch_a', '${{ output.extra_branch }}'],
    },
    branch_a: approvalWorkflow.steps.branch_a,
    branch_b: approvalWorkflow.steps.branch_b,
    join: approvalWorkflow.steps.join,
    done: approvalWorkflow.steps.done,
    blocked: approvalWorkflow.steps.blocked,
  };
  approvalWorkflow.steps.branch_a.input.state = ['choose_path'];
  approvalWorkflow.steps.branch_b.input.state = ['choose_path'];
  approvalWorkflow.steps.join.next = 'done';
  writeJson(workflowPath, approvalWorkflow);

  const result = runRunner(['next', '--run-dir', runDir, '--workflow', workflowPath, '--user-prompt', 'Prompt must not pick a drift-prone fanout target.']);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /cannot determine stable startup user prompt target: workflow step 'choose_path' uses dynamic or ambiguous next/);
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
  driftWorkflow.steps.prepare.next = 'branch_a';
  driftWorkflow.steps.branch_a.next = 'done';
  writeJson(workflowPath, driftWorkflow);
  const rawPrompt = 'Do not inject twice after workflow drift.';

  expectRunner(['next', '--run-dir', runDir, '--workflow', workflowPath, '--user-prompt', rawPrompt], 'next before workflow drift');
  const prepareOutput = path.join(runDir, 'prepare-drift-output.json');
  writeJson(prepareOutput, workerOutput('prepared before drift'));
  expectRunner(['continue', '--run-dir', runDir, '--workflow', workflowPath, '--output', prepareOutput], 'continue before workflow drift');

  delete driftWorkflow.steps.prepare;
  driftWorkflow.start = 'branch_a';
  driftWorkflow.steps.branch_a.input.state = [];
  driftWorkflow.steps.branch_b.input.state = [];
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
  singleWorkflow.steps.prepare.next = 'done';
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
  singleWorkflow.name = 'custom-workflow-continue';
  singleWorkflow.steps.prepare.next = 'done';
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
  approvalWorkflow.steps.join.input.state = [];
  approvalWorkflow.steps.join.next = 'done';
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

test('runner: single approval request with opaque id still applies output by stepId', () => {
  const runDir = path.join(tempDir, 'approval-opaque-request-id');
  const workflowPath = path.join(tempDir, 'approval-opaque-request-id-workflow.json');
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
  approvalWorkflow.steps.join.input.state = [];
  approvalWorkflow.steps.join.next = 'done';
  writeJson(workflowPath, approvalWorkflow);

  const next = expectRunner(['next', '--run-dir', runDir, '--workflow', workflowPath], 'next opaque approval');
  assert.equal(next.status, 'needs_host_actions');
  assert.equal(next.requests[0].stepId, 'choose_path');
  const lastResponsePath = path.join(runDir, '.workflow-runner', 'last-response.json');
  const lastResponse = JSON.parse(readFileSync(lastResponsePath, 'utf8'));
  lastResponse.requests[0].id = 'user-input-1';
  writeJson(lastResponsePath, lastResponse);

  const outputPath = path.join(runDir, 'choose-path-answer.json');
  writeJson(outputPath, { choice: 'option_a', answer: 'Opaque id should not imply parallel.' });
  const response = expectRunner(['continue', '--run-dir', runDir, '--workflow', workflowPath, '--output', `user-input-1=${outputPath}`], 'continue opaque approval');

  assert.equal(response.status, 'done');
  assert.equal(response.baton.cursor, 'done');
  assert.deepEqual(response.baton.state.choose_path, { choice: 'option_a', answer: 'Opaque id should not imply parallel.' });
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
  approvalWorkflow.steps.branch_a.input.state = ['choose_path'];
  approvalWorkflow.steps.branch_b.input.state = ['choose_path'];
  approvalWorkflow.steps.join.next = 'done';
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
  approvalWorkflow.start = 'choose_path';
  approvalWorkflow.steps = {
    choose_path: {
      name: 'Choose path',
      kind: 'approval',
      input: { prompt: 'Ask the user whether to fan out.' },
      next: ['branch_a', 'branch_b'],
    },
    branch_a: approvalWorkflow.steps.branch_a,
    branch_b: approvalWorkflow.steps.branch_b,
    join: approvalWorkflow.steps.join,
    done: approvalWorkflow.steps.done,
    blocked: approvalWorkflow.steps.blocked,
  };
  approvalWorkflow.steps.branch_a.input.state = ['choose_path'];
  approvalWorkflow.steps.branch_b.input.state = ['choose_path'];
  approvalWorkflow.steps.join.next = 'done';
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

test('runner: selected startup prompt target survives static parallel workflow order drift before output', () => {
  const runDir = path.join(tempDir, 'user-prompt-static-parallel-target-drift');
  const workflowPath = path.join(tempDir, 'user-prompt-static-parallel-target-drift.json');
  const approvalWorkflow = structuredClone(workflowDoc);
  approvalWorkflow.start = 'choose_path';
  approvalWorkflow.steps = {
    choose_path: {
      name: 'Choose path',
      kind: 'approval',
      input: { prompt: 'Ask whether to fan out.' },
      next: ['branch_a', 'branch_b'],
    },
    branch_a: approvalWorkflow.steps.branch_a,
    branch_b: approvalWorkflow.steps.branch_b,
    join: approvalWorkflow.steps.join,
    done: approvalWorkflow.steps.done,
    blocked: approvalWorkflow.steps.blocked,
  };
  approvalWorkflow.steps.branch_a.input.state = ['choose_path'];
  approvalWorkflow.steps.branch_b.input.state = ['choose_path'];
  approvalWorkflow.steps.join.next = 'done';
  writeJson(workflowPath, approvalWorkflow);
  const rawPrompt = 'Prompt must stay with originally selected branch.';

  const initial = expectRunner(['next', '--run-dir', runDir, '--workflow', workflowPath, '--user-prompt', rawPrompt], 'next approval before static fanout');
  assert.equal(initial.baton.user_prompt_target, 'branch_a');

  approvalWorkflow.steps.choose_path.next = ['branch_b', 'branch_a'];
  writeJson(workflowPath, approvalWorkflow);
  const approvalOutput = path.join(runDir, 'choose-path-output.json');
  writeJson(approvalOutput, { approval: 'approved' });
  const fanout = expectRunner(['continue', '--run-dir', runDir, '--workflow', workflowPath, '--output', `choose_path=${approvalOutput}`], 'continue approval static fanout after drift');
  assert.equal(fanout.baton.user_prompt_target, 'branch_a');

  const rerendered = expectRunner(['next', '--run-dir', runDir, '--workflow', workflowPath], 'next after static fanout drift');
  assert.deepEqual(rerendered.requests.map((request) => request.id), ['branch_b', 'branch_a']);

  const branchAInstructions = runRunner(['instructions', '--run-dir', runDir, '--step-id', 'branch_a']);
  assert.equal(branchAInstructions.status, 0, branchAInstructions.stderr);
  assert.match(branchAInstructions.stdout, /## User prompt/);
  assert.equal(branchAInstructions.stdout.includes(rawPrompt), true);

  const branchBInstructions = runRunner(['instructions', '--run-dir', runDir, '--step-id', 'branch_b']);
  assert.equal(branchBInstructions.status, 0, branchBInstructions.stderr);
  assert.doesNotMatch(branchBInstructions.stdout, /## User prompt/);
  assert.equal(branchBInstructions.stdout.includes(rawPrompt), false);
});

test('runner: startup prompt static fanout selects renderable worker instead of downstream control-branch worker', () => {
  const runDir = path.join(tempDir, 'user-prompt-static-fanout-control-branch');
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
  fanoutWorkflow.steps.work_b.input.state = ['choose_path'];
  fanoutWorkflow.steps.join.input.state = ['approval_before_worker', 'work_b'];
  fanoutWorkflow.steps.join.next = 'done';
  writeJson(workflowPath, fanoutWorkflow);
  const rawPrompt = 'Prompt belongs to the worker visible in the first fanout response.';

  const initial = expectRunner(['next', '--run-dir', runDir, '--workflow', workflowPath, '--user-prompt', rawPrompt], 'next control branch fanout');
  assert.equal(initial.baton.user_prompt_target, 'work_b');

  const chooseOutput = path.join(runDir, 'choose-path-output.json');
  writeJson(chooseOutput, { approval: 'approved' });
  const fanout = expectRunner(['continue', '--run-dir', runDir, '--workflow', workflowPath, '--output', `choose_path=${chooseOutput}`], 'continue control branch fanout');
  assert.deepEqual(fanout.requests.map((request) => [request.id, request.action]), [
    ['approval_before_worker', 'wait_for_approval'],
    ['work_b', 'run_worker'],
  ]);
  assert.equal(fanout.baton.user_prompt_target, 'work_b');

  const workBInstructions = runRunner(['instructions', '--run-dir', runDir, '--step-id', 'work_b']);
  assert.equal(workBInstructions.status, 0, workBInstructions.stderr);
  assert.match(workBInstructions.stdout, /## User prompt/);
  assert.equal(workBInstructions.stdout.includes(rawPrompt), true);
});

test('runner: startup prompt target removal before first output fails loudly instead of dropping prompt', () => {
  const runDir = path.join(tempDir, 'user-prompt-static-parallel-target-removed');
  const workflowPath = path.join(tempDir, 'user-prompt-static-parallel-target-removed.json');
  const approvalWorkflow = structuredClone(workflowDoc);
  approvalWorkflow.start = 'choose_path';
  approvalWorkflow.steps = {
    choose_path: {
      name: 'Choose path',
      kind: 'approval',
      input: { prompt: 'Ask whether to fan out.' },
      next: ['branch_a', 'branch_b'],
    },
    branch_a: approvalWorkflow.steps.branch_a,
    branch_b: approvalWorkflow.steps.branch_b,
    join: approvalWorkflow.steps.join,
    done: approvalWorkflow.steps.done,
    blocked: approvalWorkflow.steps.blocked,
  };
  approvalWorkflow.steps.branch_a.input.state = ['choose_path'];
  approvalWorkflow.steps.branch_b.input.state = ['choose_path'];
  writeJson(workflowPath, approvalWorkflow);

  const initial = expectRunner(['next', '--run-dir', runDir, '--workflow', workflowPath, '--user-prompt', 'Prompt must not disappear.'], 'next approval before target removal');
  assert.equal(initial.baton.user_prompt_target, 'branch_a');

  delete approvalWorkflow.steps.branch_a;
  approvalWorkflow.steps.choose_path.next = ['branch_b'];
  approvalWorkflow.steps.branch_b.next = 'done';
  approvalWorkflow.steps.join.input.state = ['branch_b'];
  writeJson(workflowPath, approvalWorkflow);
  const approvalOutput = path.join(runDir, 'choose-path-output-removed.json');
  writeJson(approvalOutput, { approval: 'approved' });
  const result = runRunner(['continue', '--run-dir', runDir, '--workflow', workflowPath, '--output', `choose_path=${approvalOutput}`]);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /startup user prompt target 'branch_a' is no longer defined|startup user prompt target 'branch_a' is not renderable/);
});

test('runner: untyped approval static parallel applies branch outputs and persists prompt marker once', () => {
  const runDir = path.join(tempDir, 'approval-untyped-static-parallel-branch-output');
  const workflowPath = path.join(tempDir, 'approval-untyped-static-parallel-branch-output.json');
  const approvalWorkflow = structuredClone(workflowDoc);
  approvalWorkflow.start = 'choose_path';
  approvalWorkflow.steps = {
    choose_path: {
      name: 'Choose path',
      kind: 'approval',
      input: { prompt: 'Ask whether to fan out.' },
      next: ['branch_a', 'branch_b'],
    },
    branch_a: approvalWorkflow.steps.branch_a,
    branch_b: approvalWorkflow.steps.branch_b,
    join: approvalWorkflow.steps.join,
    done: approvalWorkflow.steps.done,
    blocked: approvalWorkflow.steps.blocked,
  };
  approvalWorkflow.steps.branch_a.input.state = ['choose_path'];
  approvalWorkflow.steps.branch_b.input.state = ['choose_path'];
  approvalWorkflow.steps.join.next = 'done';
  writeJson(workflowPath, approvalWorkflow);
  const rawPrompt = 'Prompt marker should persist exactly once.';

  expectRunner(['next', '--run-dir', runDir, '--workflow', workflowPath, '--user-prompt', rawPrompt], 'next approval untyped static parallel');
  const approvalOutput = path.join(runDir, 'choose-path-output.json');
  writeJson(approvalOutput, { approval: 'approved', note: 'Fan out.' });
  const fanout = expectRunner(['continue', '--run-dir', runDir, '--workflow', workflowPath, '--output', `choose_path=${approvalOutput}`], 'continue approval untyped static parallel');
  assert.deepEqual(fanout.requests.map((request) => request.id), ['branch_a', 'branch_b']);
  assert.deepEqual(fanout.baton.state.choose_path, { approval: 'approved', note: 'Fan out.' });
  assert.equal(fanout.baton.user_prompt_injected, undefined);

  const branchAOutput = path.join(runDir, 'branch-a-output.json');
  const branchBOutput = path.join(runDir, 'branch-b-output.json');
  writeJson(branchAOutput, workerOutput('branch a complete'));
  writeJson(branchBOutput, workerOutput('branch b complete'));
  const joined = expectRunner([
    'continue',
    '--run-dir',
    runDir,
    '--workflow',
    workflowPath,
    '--output',
    `branch_a=${branchAOutput}`,
    '--output',
    `branch_b=${branchBOutput}`,
  ], 'continue untyped approval branch outputs');

  assert.equal(joined.status, 'needs_host_actions');
  assert.deepEqual(joined.requests.map((request) => request.id), ['join']);
  assert.equal(joined.baton.cursor, 'join');
  assert.equal(joined.baton.user_prompt_injected, true);
  assert.equal(JSON.parse(readFileSync(path.join(runDir, 'baton.json'), 'utf8')).user_prompt_injected, true);
  assert.equal(JSON.stringify(joined.baton).match(/user_prompt_injected/g).length, 1);
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
  mixedWorkflow.steps.prepare.next = ['branch_a', 'choose_path'];
  mixedWorkflow.steps.branch_a.next = 'join';
  mixedWorkflow.steps.choose_path = {
    name: 'Choose path',
    kind: 'approval',
    input: { prompt: 'Ask for the user choice before joining.' },
    next: 'join',
  };
  mixedWorkflow.steps.join.input.state = ['branch_a', 'choose_path'];
  mixedWorkflow.steps.join.next = 'done';
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

test('runner: continue rejects one unnamed output for multiple parallel branches', () => {
  const runDir = path.join(tempDir, 'parallel-unnamed-output-rejected');
  const workflowPath = path.join(tempDir, 'parallel-unnamed-output-rejected-workflow.json');
  writeJson(workflowPath, workflowDoc);

  expectRunner(['next', '--run-dir', runDir, '--workflow', workflowPath], 'next parallel unnamed setup');
  const prepareOutput = path.join(runDir, 'prepare-output.json');
  writeJson(prepareOutput, workerOutput('prepared'));
  const branches = expectRunner(['continue', '--run-dir', runDir, '--workflow', workflowPath, '--output', prepareOutput], 'continue prepare unnamed setup');
  assert.deepEqual(branches.requests.map((request) => request.id), ['branch_a', 'branch_b']);

  const sharedOutput = path.join(runDir, 'shared-output.json');
  writeJson(sharedOutput, workerOutput('same output must not fan out'));
  const result = runRunner(['continue', '--run-dir', runDir, '--workflow', workflowPath, '--output', sharedOutput]);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /parallel host outputs must use --output <step-id>=<path> for each requested step/);
  const baton = JSON.parse(readFileSync(path.join(runDir, 'baton.json'), 'utf8'));
  assert.equal(baton.cursor, 'prepare');
  assert.equal(Object.hasOwn(baton.state, 'branch_a'), false);
  assert.equal(Object.hasOwn(baton.state, 'branch_b'), false);
});

test('runner: dynamic parallel with one branch still applies branch output as parallel envelope', () => {
  const runDir = path.join(tempDir, 'dynamic-single-branch-parallel');
  const workflowPath = path.join(tempDir, 'dynamic-single-branch-parallel-workflow.json');
  const schemaPath = path.join(tempDir, 'dynamic-single-branch-output.schema.json');
  writeJson(schemaPath, {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    required: ['outcome', 'selected_steps'],
    properties: {
      outcome: { enum: ['ready'] },
      selected_steps: { type: 'array', minItems: 1, uniqueItems: true, items: { enum: ['branch_a'] } },
      results: { type: 'array' },
      artifacts: { type: 'array' },
    },
    additionalProperties: false,
  });
  const dynamicWorkflow = structuredClone(workflowDoc);
  dynamicWorkflow.steps.prepare.output.schema = path.basename(schemaPath);
  dynamicWorkflow.steps.prepare.next = '${{ output.selected_steps }}';
  delete dynamicWorkflow.steps.branch_b;
  dynamicWorkflow.steps.join.input.state = ['branch_a'];
  writeJson(workflowPath, dynamicWorkflow);

  expectRunner(['next', '--run-dir', runDir, '--workflow', workflowPath], 'next dynamic single branch setup');
  const prepareOutput = path.join(runDir, 'prepare-output.json');
  writeJson(prepareOutput, { outcome: 'ready', selected_steps: ['branch_a'] });
  const branch = expectRunner(['continue', '--run-dir', runDir, '--workflow', workflowPath, '--output', prepareOutput], 'continue dynamic prepare to one branch');
  assert.deepEqual(branch.requests.map((request) => request.id), ['branch_a']);
  assert.equal(branch.baton.cursor, 'prepare');

  const branchOutput = path.join(runDir, 'branch-a-output.json');
  writeJson(branchOutput, workerOutput('single branch complete'));
  const response = expectRunner(['continue', '--run-dir', runDir, '--workflow', workflowPath, '--output', `branch_a=${branchOutput}`], 'continue dynamic single branch to join');

  assert.equal(response.status, 'needs_host_actions');
  assert.deepEqual(response.requests.map((request) => request.id), ['join']);
  assert.equal(response.baton.cursor, 'join');
  assert.equal(response.baton.state.branch_a.results[0].summary, 'single branch complete');
  assert.equal(Object.hasOwn(response.baton.state, 'attempts'), false);
});

test('runner: static parallel with one branch still applies branch output as parallel envelope', () => {
  const runDir = path.join(tempDir, 'static-single-branch-parallel');
  const workflowPath = path.join(tempDir, 'static-single-branch-parallel-workflow.json');
  const staticWorkflow = structuredClone(workflowDoc);
  staticWorkflow.steps.prepare.next = ['branch_a'];
  delete staticWorkflow.steps.branch_b;
  staticWorkflow.steps.join.input.state = ['branch_a'];
  writeJson(workflowPath, staticWorkflow);

  expectRunner(['next', '--run-dir', runDir, '--workflow', workflowPath], 'next static single branch setup');
  const prepareOutput = path.join(runDir, 'prepare-output.json');
  writeJson(prepareOutput, workerOutput('prepared'));
  const branch = expectRunner(['continue', '--run-dir', runDir, '--workflow', workflowPath, '--output', prepareOutput], 'continue static prepare to one branch');
  assert.deepEqual(branch.requests.map((request) => request.id), ['branch_a']);
  assert.equal(branch.baton.cursor, 'prepare');

  const branchOutput = path.join(runDir, 'branch-a-output.json');
  writeJson(branchOutput, workerOutput('static single branch complete'));
  const response = expectRunner(['continue', '--run-dir', runDir, '--workflow', workflowPath, '--output', `branch_a=${branchOutput}`], 'continue static single branch to join');

  assert.equal(response.status, 'needs_host_actions');
  assert.deepEqual(response.requests.map((request) => request.id), ['join']);
  assert.equal(response.baton.cursor, 'join');
  assert.equal(response.baton.state.branch_a.results[0].summary, 'static single branch complete');
  assert.equal(Object.hasOwn(response.baton.state, 'attempts'), false);
});

test('runner: continue rejects concurrent attempts for the same run dir', async () => {
  const runDir = path.join(tempDir, 'concurrent-continue-same-run-dir');
  const workflowPath = path.join(tempDir, 'concurrent-continue-same-run-dir.json');
  const singleWorkflow = structuredClone(workflowDoc);
  singleWorkflow.steps.prepare.next = 'done';
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
  singleWorkflow.steps.prepare.next = 'done';
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
  singleWorkflow.steps.prepare.next = 'done';
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
  renderFailureWorkflow.steps.prepare.next = 'bad_render';
  renderFailureWorkflow.steps.bad_render = {
    name: 'Bad Render',
    kind: 'worker',
    input: {
      state: ['prepare'],
      template: 'missing-input-template.md',
      prompt: 'This step should fail prompt rendering.',
    },
    output: { template: 'output.md' },
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

test('runner: parallel continue does not create durable envelope when next render fails', () => {
  const runDir = path.join(tempDir, 'parallel-render-failure-no-envelope');
  const workflowPath = path.join(tempDir, 'parallel-render-failure-no-envelope-workflow.json');
  const renderFailureWorkflow = structuredClone(workflowDoc);
  renderFailureWorkflow.steps.join.input.template = 'missing-join-template.md';
  writeJson(workflowPath, renderFailureWorkflow);

  expectRunner(['next', '--run-dir', runDir, '--workflow', workflowPath], 'next parallel render failure setup');
  const prepareOutput = path.join(runDir, 'prepare-output.json');
  writeJson(prepareOutput, workerOutput('prepared'));
  expectRunner(['continue', '--run-dir', runDir, '--workflow', workflowPath, '--output', prepareOutput], 'continue prepare to branches');
  const batonBefore = readFileSync(path.join(runDir, 'baton.json'), 'utf8');
  const historyBefore = readFileSync(path.join(runDir, 'history.md'), 'utf8');
  const lastResponseBefore = readFileSync(path.join(runDir, '.workflow-runner', 'last-response.json'), 'utf8');

  const branchA = path.join(runDir, 'branch-a-output.json');
  const branchB = path.join(runDir, 'branch-b-output.json');
  writeJson(branchA, workerOutput('branch a complete'));
  writeJson(branchB, workerOutput('branch b complete'));
  const result = runRunner([
    'continue',
    '--run-dir',
    runDir,
    '--workflow',
    workflowPath,
    '--output',
    `branch_a=${branchA}`,
    '--output',
    `branch_b=${branchB}`,
  ]);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /workflow prompt render failed/);
  assert.equal(readFileSync(path.join(runDir, 'baton.json'), 'utf8'), batonBefore);
  assert.equal(readFileSync(path.join(runDir, 'history.md'), 'utf8'), historyBefore);
  assert.equal(readFileSync(path.join(runDir, '.workflow-runner', 'last-response.json'), 'utf8'), lastResponseBefore);
  assert.equal(existsSync(path.join(runDir, '.workflow-runner', 'parallel-output.json')), false);
});

test('runner: continue recovers from post-render durable commit failure without mismatched next state', () => {
  for (const failurePoint of ['pending', 'instructions', 'history', 'baton', 'last-response']) {
    const runDir = path.join(tempDir, `durable-commit-${failurePoint}-failure`);
    const workflowPath = path.join(tempDir, `durable-commit-${failurePoint}-failure-workflow.json`);
    const singleWorkflow = structuredClone(workflowDoc);
    singleWorkflow.steps.prepare.next = 'join';
    singleWorkflow.steps.join.input.state = ['prepare'];
    writeJson(workflowPath, singleWorkflow);

    expectRunner(['next', '--run-dir', runDir, '--workflow', workflowPath], `next durable commit ${failurePoint} failure setup`);
    const batonBefore = readFileSync(path.join(runDir, 'baton.json'), 'utf8');
    const historyBefore = readFileSync(path.join(runDir, 'history.md'), 'utf8');
    const lastResponseBefore = readFileSync(path.join(runDir, '.workflow-runner', 'last-response.json'), 'utf8');
    const joinInstructionPath = path.join(runDir, '.workflow-runner', 'instructions', 'join.md');
    const staleJoinInstructions = 'stale join instructions must survive failed commit\n';
    assert.equal(existsSync(joinInstructionPath), false);
    writeFileSync(joinInstructionPath, staleJoinInstructions);

    const outputPath = path.join(runDir, 'prepare-result.json');
    writeJson(outputPath, workerOutput(`prepared after durable ${failurePoint} retry`));
    const failed = runRunner(['continue', '--run-dir', runDir, '--workflow', workflowPath, '--output', outputPath], {
      env: { WORKFLOW_RUNNER_FAIL_DURABLE_COMMIT_AFTER: failurePoint },
    });

    assert.notEqual(failed.status, 0);
    assert.match(failed.stderr, new RegExp(`injected durable commit failure after ${failurePoint}`));
    assert.equal(readFileSync(path.join(runDir, 'baton.json'), 'utf8'), batonBefore);
    assert.equal(readFileSync(path.join(runDir, 'history.md'), 'utf8'), historyBefore);
    assert.equal(readFileSync(path.join(runDir, '.workflow-runner', 'last-response.json'), 'utf8'), lastResponseBefore);
    assert.equal(readFileSync(joinInstructionPath, 'utf8'), staleJoinInstructions);
    assert.equal(existsSync(path.join(runDir, '.workflow-runner', 'durable-commit.json')), true);

    const recovered = runRunner(['instructions', '--run-dir', runDir, '--step-id', 'join']);
    assert.equal(recovered.status, 0, recovered.stderr);
    assert.match(recovered.stdout, new RegExp(`prepared after durable ${failurePoint} retry`));
    assert.equal(existsSync(path.join(runDir, '.workflow-runner', 'durable-commit.json')), false);

    const baton = JSON.parse(readFileSync(path.join(runDir, 'baton.json'), 'utf8'));
    const lastResponse = JSON.parse(readFileSync(path.join(runDir, '.workflow-runner', 'last-response.json'), 'utf8'));
    assert.equal(baton.cursor, 'join');
    assert.equal(lastResponse.status, 'needs_host_actions');
    assert.deepEqual(lastResponse.requests.map((request) => request.id), ['join']);
    assert.equal(baton.state.prepare.results[0].summary, `prepared after durable ${failurePoint} retry`);
    assert.match(readFileSync(path.join(runDir, 'history.md'), 'utf8'), /prepare-result\.json/);
  }
});

test('runner: durable commit recovery rejects instruction paths outside instructions dir', () => {
  const runDir = path.join(tempDir, 'durable-commit-instruction-escape');
  const workflowPath = path.join(tempDir, 'durable-commit-instruction-escape-workflow.json');
  const singleWorkflow = structuredClone(workflowDoc);
  singleWorkflow.steps.prepare.next = 'done';
  writeJson(workflowPath, singleWorkflow);

  expectRunner(['next', '--run-dir', runDir, '--workflow', workflowPath], 'next durable instruction escape setup');
  const victimPath = path.join(tempDir, 'durable-commit-victim.txt');
  rmSync(victimPath, { force: true });
  const durableCommitPath = path.join(runDir, '.workflow-runner', 'durable-commit.json');
  writeJson(durableCommitPath, {
    version: 1,
    response: JSON.parse(readFileSync(path.join(runDir, '.workflow-runner', 'last-response.json'), 'utf8')),
    instructions: [{ path: victimPath, content: 'pwned\n' }],
    historyText: '',
  });

  const result = runRunner(['instructions', '--run-dir', runDir, '--step-id', 'prepare']);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /durable workflow commit instruction path escapes instructions dir/);
  assert.equal(existsSync(victimPath), false);
});

test('runner: durable commit recovery rejects symlinked instruction paths outside instructions dir', () => {
  const runDir = path.join(tempDir, 'durable-commit-instruction-symlink-escape');
  const workflowPath = path.join(tempDir, 'durable-commit-instruction-symlink-escape-workflow.json');
  const singleWorkflow = structuredClone(workflowDoc);
  singleWorkflow.steps.prepare.next = 'done';
  writeJson(workflowPath, singleWorkflow);

  expectRunner(['next', '--run-dir', runDir, '--workflow', workflowPath], 'next durable instruction symlink escape setup');
  const outsideDir = path.join(tempDir, 'durable-commit-symlink-outside');
  mkdirSync(outsideDir, { recursive: true });
  const linkPath = path.join(runDir, '.workflow-runner', 'instructions', 'link');
  rmSync(linkPath, { recursive: true, force: true });
  symlinkSync(outsideDir, linkPath, 'dir');
  const victimPath = path.join(outsideDir, 'pwned.md');
  rmSync(victimPath, { force: true });
  const durableCommitPath = path.join(runDir, '.workflow-runner', 'durable-commit.json');
  writeJson(durableCommitPath, {
    version: 1,
    response: JSON.parse(readFileSync(path.join(runDir, '.workflow-runner', 'last-response.json'), 'utf8')),
    instructions: [{ path: path.join(linkPath, 'pwned.md'), content: 'pwned\n' }],
    historyText: '',
  });

  const result = runRunner(['instructions', '--run-dir', runDir, '--step-id', 'prepare']);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /durable workflow commit instruction path escapes instructions dir/);
  assert.equal(existsSync(victimPath), false);
});


test('runner: durable commit recovery rejects symlinked instructions dir', () => {
  const runDir = path.join(tempDir, 'durable-commit-instructions-dir-symlink-escape');
  const workflowPath = path.join(tempDir, 'durable-commit-instructions-dir-symlink-escape-workflow.json');
  const singleWorkflow = structuredClone(workflowDoc);
  singleWorkflow.steps.prepare.next = 'done';
  writeJson(workflowPath, singleWorkflow);

  expectRunner(['next', '--run-dir', runDir, '--workflow', workflowPath], 'next durable instructions dir symlink escape setup');
  const outsideDir = path.join(tempDir, 'durable-commit-instructions-dir-outside');
  mkdirSync(outsideDir, { recursive: true });
  const instructionsDir = path.join(runDir, '.workflow-runner', 'instructions');
  rmSync(instructionsDir, { recursive: true, force: true });
  symlinkSync(outsideDir, instructionsDir, 'dir');
  const durableCommitPath = path.join(runDir, '.workflow-runner', 'durable-commit.json');
  writeJson(durableCommitPath, {
    version: 1,
    response: JSON.parse(readFileSync(path.join(runDir, '.workflow-runner', 'last-response.json'), 'utf8')),
    instructions: [{ path: path.join(instructionsDir, 'prepare.md'), content: 'pwned\n' }],
    historyText: '',
  });

  const result = runRunner(['instructions', '--run-dir', runDir, '--step-id', 'prepare']);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /durable workflow commit instructions dir is unsafe/);
  assert.equal(existsSync(path.join(outsideDir, 'prepare.md')), false);
});

test('runner: durable commit recovery rejects existing symlink instruction file rollback', () => {
  const runDir = path.join(tempDir, 'durable-commit-instruction-file-symlink-escape');
  const workflowPath = path.join(tempDir, 'durable-commit-instruction-file-symlink-escape-workflow.json');
  const singleWorkflow = structuredClone(workflowDoc);
  singleWorkflow.steps.prepare.next = 'done';
  writeJson(workflowPath, singleWorkflow);

  expectRunner(['next', '--run-dir', runDir, '--workflow', workflowPath], 'next durable instruction file symlink escape setup');
  const outsideSecret = path.join(tempDir, 'durable-commit-outside-secret.txt');
  writeFileSync(outsideSecret, 'outside secret must not be copied\n');
  const instructionPath = path.join(runDir, '.workflow-runner', 'instructions', 'prepare.md');
  rmSync(instructionPath, { force: true });
  symlinkSync(outsideSecret, instructionPath, 'file');
  const durableCommitPath = path.join(runDir, '.workflow-runner', 'durable-commit.json');
  writeJson(durableCommitPath, {
    version: 1,
    response: JSON.parse(readFileSync(path.join(runDir, '.workflow-runner', 'last-response.json'), 'utf8')),
    instructions: [{ path: instructionPath, content: 'new instructions\n' }],
    historyText: '',
  });

  const result = runRunner(['instructions', '--run-dir', runDir, '--step-id', 'prepare'], {
    env: { WORKFLOW_RUNNER_FAIL_DURABLE_COMMIT_AFTER: 'instructions' },
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /durable workflow commit instruction path escapes instructions dir/);
  assert.equal(readFileSync(outsideSecret, 'utf8'), 'outside secret must not be copied\n');
});


test('runner: next resolves external workflow package shared resources from repo boundary', () => {
  const repoDir = path.join(tempDir, 'external-runner-shared-repo');
  const workflowDir = path.join(repoDir, 'workflows', 'demo');
  const sharedDir = path.join(repoDir, 'shared');
  mkdirSync(workflowDir, { recursive: true });
  mkdirSync(sharedDir, { recursive: true });
  writeFileSync(path.join(workflowDir, 'output.md'), '## Output contract\nReturn markdown.\n');
  writeFileSync(path.join(sharedDir, 'shared.schema.json'), JSON.stringify({
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    required: ['outcome'],
    properties: { outcome: { const: 'ready' } },
    additionalProperties: false,
  }));
  const doc = structuredClone(workflowDoc);
  doc.steps.prepare.next = 'done';
  doc.steps.prepare.output = { template: 'output.md', schema: '../../shared/shared.schema.json' };
  writeJson(path.join(workflowDir, 'workflow.json'), doc);

  const result = runRunner(['next', '--run-dir', path.join(tempDir, 'external-runner-shared-run'), '--workflow', path.join(workflowDir, 'workflow.json')]);

  assert.equal(result.status, 0, result.stderr);
  const response = JSON.parse(result.stdout);
  assert.equal(response.requests[0].stepId, 'prepare');
});

test('runner: instructions rejects unknown, unsafe, and missing instructions', () => {
  const runDir = path.join(tempDir, 'instructions-errors');
  const workflowPath = path.join(tempDir, 'instructions-errors-workflow.json');
  const singleWorkflow = structuredClone(workflowDoc);
  singleWorkflow.steps.prepare.next = 'done';
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
