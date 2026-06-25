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

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const tempDir = mkdtempSync(path.join(tmpdir(), 'workflow-runner-check-'));
writeFileSync(path.join(tempDir, 'output.md'), '## Output contract\nReturn markdown.\n');
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

function claimRunForTest(paths) {
  const knownToken = leaseTokensByRunId.get(paths.runId);
  if (knownToken) {
    process.env.WORKFLOW_RUN_TOKEN = knownToken;
    return knownToken;
  }
  const createArgs = ['develop/lib/entrypoints/cli/workflow-runs.mjs', 'create', '--claim', '--run-id', paths.runId, '--workflow', paths.workflowPath];
  const created = spawnSync(process.execPath, createArgs, { cwd: root, encoding: 'utf8', env: process.env });
  if (created.status === 0) {
    const token = JSON.parse(created.stdout).leaseToken;
    leaseTokensByRunId.set(paths.runId, token);
    process.env.WORKFLOW_RUN_TOKEN = token;
    return token;
  }
  const token = knownToken ?? testLeaseToken;
  const claimed = spawnSync(process.execPath, ['develop/lib/entrypoints/cli/workflow-runs.mjs', 'claim', '--run-id', paths.runId, '--lease-token', token], { cwd: root, encoding: 'utf8', env: { ...process.env, WORKFLOW_RUN_TOKEN: token } });
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
  const createArgs = ['develop/lib/entrypoints/cli/workflow-runs.mjs', 'create', '--claim', '--run-id', runId];
  if (workflowPath !== undefined) createArgs.push('--workflow', workflowPath);
  const created = spawnSync(process.execPath, createArgs, { cwd: root, encoding: 'utf8', env: process.env });
  if (created.status === 0) {
    const token = JSON.parse(created.stdout).leaseToken;
    leaseTokensByRunId.set(runId, token);
    return token;
  }
  const token = knownToken ?? testLeaseToken;
  const claimArgs = ['develop/lib/entrypoints/cli/workflow-runs.mjs', 'claim', '--run-id', runId, '--lease-token', token];
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
  return spawnSync(process.execPath, ['develop/lib/entrypoints/cli/workflow-runner.mjs', ...withLeaseTokenArg(args, token)], { cwd: root, encoding: 'utf8', input: options.input, env: { ...process.env, WORKFLOW_RUN_TOKEN: token ?? testLeaseToken, ...(options.env ?? {}) } });
}

async function runRunnerAsync(args) {
  const token = claimRunForRunnerArgs(args);
  const child = spawn(process.execPath, ['develop/lib/entrypoints/cli/workflow-runner.mjs', ...withLeaseTokenArg(args, token)], {
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

function workerOutput(summary) {
  return { outcome: 'ready', results: [{ type: 'check', summary }] };
}

function currentRequestIds(runDir) {
  const lastResponse = JSON.parse(readFileSync(path.join(runDir, '.workflow-runner', 'last-response.json'), 'utf8'));
  return (lastResponse.requests ?? []).map((request) => request.stepId ?? request.id);
}

function parseOutputRef(ref) {
  const separator = ref.indexOf('=');
  if (separator < 0) return { stepId: undefined, filePath: ref };
  return { stepId: ref.slice(0, separator), filePath: ref.slice(separator + 1) };
}

function writeOutputFile({ runId, runDir, workflowPath, stepId, filePath, label = 'write output' }) {
  const targetStepId = stepId ?? currentRequestIds(runDir)[0];
  const result = runRunner(['write-output', '--run-id', runId, '--workflow', workflowPath, '--step-id', targetStepId], { input: readFileSync(filePath, 'utf8') });
  assert.equal(result.status, 0, `${label} failed
stdout:
${result.stdout}
stderr:
${result.stderr}`);
  return JSON.parse(result.stdout);
}

function continueWithOutputs({ runId, runDir, workflowPath, refs, label = 'continue' }) {
  const normalized = Array.isArray(refs) ? refs : [refs];
  const pendingIds = currentRequestIds(runDir);
  for (const ref of normalized) {
    const { stepId, filePath } = parseOutputRef(ref);
    const targetStepId = stepId ?? (pendingIds.length === 1 ? pendingIds[0] : undefined);
    assert.ok(targetStepId, `output for ${label} must name a step when multiple requests are pending`);
    writeOutputFile({ runId, runDir, workflowPath, stepId: targetStepId, filePath, label: `${label} write ${targetStepId}` });
  }
  return expectRunner(['continue', '--run-id', runId, '--workflow', workflowPath], label);
}

after(() => rmSync(tempDir, { recursive: true, force: true }));

test('runner: next returns a single host action request with load command only', () => {
  const { runId, runDir } = runCase('single');
  const workflowPath = path.join(tempDir, 'single-workflow.json');
  const singleWorkflow = structuredClone(workflowDoc);
  singleWorkflow.steps.prepare.next = 'done';
  writeJson(workflowPath, singleWorkflow);

  const response = expectRunner(['next', '--run-id', runId, '--workflow', workflowPath], 'next single');

  assert.equal(response.status, 'needs_host_actions');
  assert.match(response.orchestratorInstruction, /Execute every current request in stdout\.requests\[\]/);
  assert.match(response.orchestratorInstruction, /submit the accepted JSON through workflow-runner write-output/);
  assert.match(response.orchestratorInstruction, /the continue stdout\.orchestratorInstruction controls the next step/);
  assert.match(response.orchestratorInstruction, /Do not stop or report completion while status is needs_host_actions/);
  assert.equal(response.baton.cursor, 'prepare');
  assert.deepEqual(response.requests.map((request) => request.id), ['prepare']);
  assert.equal(response.requests[0].action, 'run_worker');
  assert.equal(Object.hasOwn(response.requests[0], 'compiledPrompt'), false);
  assert.equal(response.requests[0].stepId, 'prepare');
  assert.equal(Object.hasOwn(response.requests[0], 'instructionRef'), false);
  assert.match(response.requests[0].loadInstructionsCommand, /workflow-runner\.mjs instructions --run-id .* --step-id 'prepare' --lease-token <lease-token>/);
  assert.equal(Object.hasOwn(response.requests[0], 'outputPath'), false);

  const lastResponse = JSON.parse(readFileSync(path.join(runDir, '.workflow-runner', 'last-response.json'), 'utf8'));
  assert.equal(lastResponse.orchestratorInstruction, response.orchestratorInstruction);
  assert.equal(Object.hasOwn(lastResponse.requests[0], 'instructionRef'), false);
  assert.equal(Object.hasOwn(lastResponse.requests[0], 'outputPath'), false);

  const loaded = runRunner(['instructions', '--run-id', runId, '--step-id', 'prepare']);
  assert.equal(loaded.status, 0, loaded.stderr);
  assert.match(loaded.stdout, /# Prepare/);

  assert.equal(existsSync(path.join(runDir, 'baton.json')), true);
});

test('runner: continue rejects legacy --output path handoff', () => {
  const result = runRunner(['continue', '--run-id', `workflow-runner-test-${process.pid}-legacy-output`, '--output', 'worker-output.json']);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Unknown option '--output'|continue no longer accepts --output/);
});

test('runner: next rejects existing unindexed legacy run state instead of minting authority', () => {
  const runId = `workflow-runner-test-${process.pid}-legacy-unindexed`;
  const workflowPath = path.join(tempDir, 'legacy-unindexed-workflow.json');
  const singleWorkflow = structuredClone(workflowDoc);
  singleWorkflow.steps.prepare.next = 'done';
  writeJson(workflowPath, singleWorkflow);
  const paths = resolveRunPaths({ runId, workflowPath });
  rmSync(paths.runDir, { recursive: true, force: true });
  mkdirSync(paths.runDir, { recursive: true });
  writeJson(paths.batonPath, { cursor: 'prepare', status: 'running', state: { artifacts: [], results: [] } });

  const result = spawnSync(process.execPath, [
    'develop/lib/entrypoints/cli/workflow-runner.mjs',
    'next',
    '--run-id', runId,
    '--workflow', workflowPath,
    '--lease-token', 'legacy-token-must-not-create-authority',
  ], { cwd: root, encoding: 'utf8' });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /requires indexed lease authority/);
  assert.doesNotMatch(result.stderr, /\.workflow-runs\/runs\.json/);
});

test('runner: resumed next validates persisted aggregate instruction refs before rendering', async () => {
  const { runId, runDir } = runCase('next-validates-persisted-state');
  const workflowPath = path.join(tempDir, 'next-validates-persisted-state-workflow.json');
  const singleWorkflow = structuredClone(workflowDoc);
  singleWorkflow.steps.prepare.next = 'done';
  writeJson(workflowPath, singleWorkflow);
  claimRunForTest(resolveRunPaths({ runId, workflowPath }));

  const leaseToken = leaseTokensByRunId.get(runId);
  const first = await runnerNext({ runId, workflowPath, leaseToken });
  assert.equal(first.status, 'needs_host_actions');

  const instructionPath = path.join(runDir, '.workflow-runner', 'instructions', 'prepare.md');
  assert.equal(existsSync(instructionPath), true);
  rmSync(instructionPath);

  await assert.rejects(
    () => runnerNext({ runId, workflowPath, leaseToken }),
    /missing committed instruction file/,
  );
  assert.equal(existsSync(instructionPath), false);
});

test('runner: next rejects workflow whose first worker id is reserved baton state bookkeeping', () => {
  const { runId, runDir } = runCase('reserved-first-worker');
  const workflowPath = path.join(tempDir, 'reserved-first-worker-workflow.json');
  const reservedWorkflow = structuredClone(workflowDoc);
  reservedWorkflow.start = 'artifacts';
  reservedWorkflow.steps.artifacts = {
    ...reservedWorkflow.steps.prepare,
    name: 'Reserved first worker',
  };
  delete reservedWorkflow.steps.prepare;
  writeJson(workflowPath, reservedWorkflow);

  const result = runRunner(['next', '--run-id', runId, '--workflow', workflowPath, '--user-prompt', 'must not be skipped']);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /workflow step id 'artifacts' is reserved for runtime aggregate state/);
});

test('runner: next rejects dynamic transition without output schema coverage before rendering', () => {
  const { runId, runDir } = runCase('dynamic-next-missing-schema');
  const workflowPath = path.join(tempDir, 'dynamic-next-missing-schema-workflow.json');
  const dynamicWorkflow = structuredClone(workflowDoc);
  dynamicWorkflow.steps.prepare.next = '${{ output.outcome }}';
  writeJson(workflowPath, dynamicWorkflow);

  const result = runRunner(['next', '--run-id', runId, '--workflow', workflowPath]);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /step 'prepare' next expression \$\{\{ output\.outcome \}\} has no schema-covered path/);
  assert.equal(existsSync(path.join(runDir, '.workflow-runner', 'instructions', 'prepare.md')), false);
  assert.equal(existsSync(path.join(runDir, '.workflow-runner', 'last-response.json')), false);
});

test('runner: user prompt is stored, included only in initial worker instructions, and preserved on continue', () => {
  const { runId, runDir } = runCase('user-prompt-runtime');
  const workflowPath = path.join(tempDir, 'user-prompt-runtime-workflow.json');
  writeJson(workflowPath, workflowDoc);
  const rawPrompt = 'Raw startup task text.\nPreserve me exactly.';

  const first = expectRunner(['next', '--run-id', runId, '--workflow', workflowPath, '--user-prompt', rawPrompt], 'next with user prompt');
  assert.equal(first.baton.user_prompt, rawPrompt);
  assert.equal(first.baton.user_prompt_injected, undefined);
  assert.equal(JSON.parse(readFileSync(path.join(runDir, 'baton.json'), 'utf8')).user_prompt, rawPrompt);
  assert.equal(JSON.parse(readFileSync(path.join(runDir, 'baton.json'), 'utf8')).user_prompt_injected, undefined);

  const initialInstructions = runRunner(['instructions', '--run-id', runId, '--step-id', 'prepare']);
  assert.equal(initialInstructions.status, 0, initialInstructions.stderr);
  assert.match(initialInstructions.stdout, /## User prompt/);
  assert.equal(initialInstructions.stdout.includes(rawPrompt), true);

  const resumedBeforeOutput = expectRunner(['next', '--run-id', runId, '--workflow', workflowPath], 'resume before first output');
  assert.equal(resumedBeforeOutput.baton.user_prompt_injected, undefined);
  const resumedInstructions = runRunner(['instructions', '--run-id', runId, '--step-id', 'prepare']);
  assert.equal(resumedInstructions.status, 0, resumedInstructions.stderr);
  assert.match(resumedInstructions.stdout, /## User prompt/);
  assert.equal(resumedInstructions.stdout.includes(rawPrompt), true);

  const prepareOutput = path.join(runDir, 'prepare-output.json');
  writeJson(prepareOutput, workerOutput('prepared'));
  const nextResponse = continueWithOutputs({ runId, runDir, workflowPath, refs: prepareOutput, label: 'continue with user prompt' });
  assert.equal(nextResponse.baton.user_prompt, rawPrompt);
  assert.equal(nextResponse.baton.user_prompt_injected, true);
  assert.equal(JSON.parse(readFileSync(path.join(runDir, 'baton.json'), 'utf8')).user_prompt, rawPrompt);
  assert.equal(JSON.parse(readFileSync(path.join(runDir, 'baton.json'), 'utf8')).user_prompt_injected, true);

  const laterInstructions = runRunner(['instructions', '--run-id', runId, '--step-id', 'branch_a']);
  assert.equal(laterInstructions.status, 0, laterInstructions.stderr);
  assert.doesNotMatch(laterInstructions.stdout, /## User prompt/);
  assert.equal(laterInstructions.stdout.includes(rawPrompt), false);
});

test('runner: resumed next is read-only for baton after user prompt marker is persisted', () => {
  const { runId, runDir } = runCase('user-prompt-next-read-only-after-marker');
  const workflowPath = path.join(tempDir, 'user-prompt-next-read-only-after-marker.json');
  const singleWorkflow = structuredClone(workflowDoc);
  singleWorkflow.steps.prepare.next = 'branch_a';
  singleWorkflow.steps.branch_a.next = 'done';
  writeJson(workflowPath, singleWorkflow);

  expectRunner(['next', '--run-id', runId, '--workflow', workflowPath, '--user-prompt', 'marker must not be rolled back'], 'next before marker');
  const prepareOutput = path.join(runDir, 'prepare-output.json');
  writeJson(prepareOutput, workerOutput('prepared'));
  continueWithOutputs({ runId, runDir, workflowPath, refs: prepareOutput, label: 'continue marker' });

  const batonPath = path.join(runDir, 'baton.json');
  const before = statSync(batonPath, { bigint: true }).mtimeNs;
  const resumed = expectRunner(['next', '--run-id', runId, '--workflow', workflowPath], 'resumed next after marker');
  const after = statSync(batonPath, { bigint: true }).mtimeNs;

  assert.equal(resumed.baton.user_prompt_injected, true);
  assert.equal(after, before);
});

test('runner: next rejects empty or conflicting user prompt inputs', () => {
  const workflowPath = path.join(tempDir, 'user-prompt-negative-workflow.json');
  writeJson(workflowPath, workflowDoc);

  const emptyArg = runRunner(['next', '--run-id', runCase('empty-user-prompt-next').runId, '--workflow', workflowPath, '--user-prompt', '']);
  assert.notEqual(emptyArg.status, 0);
  assert.match(emptyArg.stderr, /--user-prompt must not be empty or whitespace-only/);

  const promptPath = path.join(tempDir, 'empty-user-prompt-next-file.txt');
  writeFileSync(promptPath, '  \n');
  const emptyFile = runRunner(['next', '--run-id', runCase('empty-user-prompt-file-next').runId, '--workflow', workflowPath, '--user-prompt-file', promptPath]);
  assert.notEqual(emptyFile.status, 0);
  assert.match(emptyFile.stderr, /--user-prompt-file must not be empty or whitespace-only/);

  const emptyPath = runRunner(['next', '--run-id', runCase('empty-user-prompt-file-path-next').runId, '--workflow', workflowPath, '--user-prompt-file', '']);
  assert.notEqual(emptyPath.status, 0);
  assert.match(emptyPath.stderr, /--user-prompt-file path must not be empty or whitespace-only/);

  writeFileSync(promptPath, 'from file');
  const conflicting = runRunner(['next', '--run-id', runCase('conflicting-user-prompt-next').runId, '--workflow', workflowPath, '--user-prompt', 'from arg', '--user-prompt-file', promptPath]);
  assert.notEqual(conflicting.status, 0);
  assert.match(conflicting.stderr, /provide only one of --user-prompt or --user-prompt-file/);
});

test('runner: API next rejects empty user prompt before persisting baton', async () => {
  const workflowPath = path.join(tempDir, 'api-empty-user-prompt-workflow.json');
  writeJson(workflowPath, workflowDoc);

  const { runId: emptyRunId, runDir: emptyRunDir } = runCase('api-empty-user-prompt-next');
  const emptyLeaseToken = claimRunForTest(resolveRunPaths({ runId: emptyRunId, workflowPath }));
  await assert.rejects(
    runnerNext({ runId: emptyRunId, workflowPath, userPrompt: '', leaseToken: emptyLeaseToken }),
    /--user-prompt must not be empty or whitespace-only/,
  );
  assert.equal(existsSync(path.join(emptyRunDir, 'baton.json')), false);

  const { runId: whitespaceRunId, runDir: whitespaceRunDir } = runCase('api-whitespace-user-prompt-next');
  const whitespaceLeaseToken = claimRunForTest(resolveRunPaths({ runId: whitespaceRunId, workflowPath }));
  await assert.rejects(
    runnerNext({ runId: whitespaceRunId, workflowPath, userPrompt: '  \n\t', leaseToken: whitespaceLeaseToken }),
    /--user-prompt must not be empty or whitespace-only/,
  );
  assert.equal(existsSync(path.join(whitespaceRunDir, 'baton.json')), false);
});

test('runner: CLI resume ignores deleted startup user prompt file and preserves persisted prompt', () => {
  const { runId, runDir } = runCase('user-prompt-resume-deleted-file');
  const workflowPath = path.join(tempDir, 'user-prompt-resume-deleted-file-workflow.json');
  const promptPath = path.join(tempDir, 'user-prompt-resume-deleted-file.txt');
  writeJson(workflowPath, workflowDoc);
  writeFileSync(promptPath, 'original file prompt');

  expectRunner(['next', '--run-id', runId, '--workflow', workflowPath, '--user-prompt-file', promptPath], 'next with prompt file');
  rmSync(promptPath, { force: true });
  const response = expectRunner(['next', '--run-id', runId, '--workflow', workflowPath, '--user-prompt-file', promptPath], 'resume with deleted prompt file');

  assert.equal(response.resumed, true);
  assert.equal(response.baton.user_prompt, 'original file prompt');
  assert.equal(JSON.parse(readFileSync(path.join(runDir, 'baton.json'), 'utf8')).user_prompt, 'original file prompt');
});

test('runner: non-next modes reject empty user prompt file option', () => {
  const result = runRunner(['instructions', '--run-id', runCase('unsupported-user-prompt-file').runId, '--step-id', 'prepare', '--user-prompt-file', '']);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /usage: node develop\/lib\/entrypoints\/cli\/workflow-runner\.mjs/);
});

test('runner: user prompt is included in first worker when workflow starts with approval step', () => {
  const { runId, runDir } = runCase('user-prompt-control-start');
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

  expectRunner(['next', '--run-id', runId, '--workflow', workflowPath, '--user-prompt', rawPrompt], 'next approval-first with user prompt');
  const gateInstructions = runRunner(['instructions', '--run-id', runId, '--step-id', 'gate']);
  assert.equal(gateInstructions.status, 0, gateInstructions.stderr);
  assert.doesNotMatch(gateInstructions.stdout, /## User prompt/);
  assert.equal(gateInstructions.stdout.includes(rawPrompt), false);

  const approvalOutput = path.join(runDir, 'gate-output.json');
  writeJson(approvalOutput, { approval: 'approved' });
  continueWithOutputs({ runId, runDir, workflowPath, refs: approvalOutput, label: 'continue approval-first gate' });
  const firstWorkerInstructions = runRunner(['instructions', '--run-id', runId, '--step-id', 'prepare']);
  assert.equal(firstWorkerInstructions.status, 0, firstWorkerInstructions.stderr);
  assert.match(firstWorkerInstructions.stdout, /## User prompt/);
  assert.equal(firstWorkerInstructions.stdout.includes(rawPrompt), true);

  const prepareOutput = path.join(runDir, 'prepare-output.json');
  writeJson(prepareOutput, workerOutput('prepared'));
  continueWithOutputs({ runId, runDir, workflowPath, refs: prepareOutput, label: 'continue approval-first prepare' });
  const laterInstructions = runRunner(['instructions', '--run-id', runId, '--step-id', 'branch_a']);
  assert.equal(laterInstructions.status, 0, laterInstructions.stderr);
  assert.doesNotMatch(laterInstructions.stdout, /## User prompt/);
  assert.equal(laterInstructions.stdout.includes(rawPrompt), false);
});

test('runner: startup prompt target rejects match-cases with worker and terminal branches', () => {
  const { runId, runDir } = runCase('user-prompt-match-terminal-rejected');
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

  const result = runRunner(['next', '--run-id', runId, '--workflow', workflowPath, '--user-prompt', 'Prompt must not be dropped.']);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /cannot determine stable startup user prompt target: workflow step 'gate' has a match\/cases branch with no worker target/);
});

test('runner: startup prompt target rejects a selected match-cases branch that no longer renders the target', () => {
  const { runId, runDir } = runCase('user-prompt-match-selected-target-missing');
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

  const initial = expectRunner(['next', '--run-id', runId, '--workflow', workflowPath, '--user-prompt', 'Prompt must reach prepare.'], 'next stable match-cases');
  assert.equal(initial.baton.user_prompt_target, 'prepare');

  const approvalOutput = path.join(runDir, 'gate-output.json');
  writeJson(approvalOutput, { choice: 'approved' });
  writeOutputFile({ runId, runDir, workflowPath, stepId: 'gate', filePath: approvalOutput, label: 'write selected target missing output' });
  approvalFirstWorkflow.steps.gate.next = { match: '${{ output.choice }}', cases: { approved: 'done', retry: 'prepare' } };
  writeJson(workflowPath, approvalFirstWorkflow);
  const result = runRunner(['continue', '--run-id', runId, '--workflow', workflowPath]);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /startup user prompt target 'prepare' is not renderable in the current workflow response/);
});

test('runner: startup prompt target rejects dynamic fanout before prompt selection can drift', () => {
  const { runId, runDir } = runCase('user-prompt-dynamic-fanout-rejected');
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

  const result = runRunner(['next', '--run-id', runId, '--workflow', workflowPath, '--user-prompt', 'Prompt must not pick a drift-prone fanout target.']);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /cannot determine stable startup user prompt target: workflow step 'choose_path' uses dynamic or ambiguous next/);
});

test('runner: next resumes existing baton without overwriting user prompt', () => {
  const { runId, runDir } = runCase('user-prompt-resume');
  const workflowPath = path.join(tempDir, 'user-prompt-resume-workflow.json');
  writeJson(workflowPath, workflowDoc);

  expectRunner(['next', '--run-id', runId, '--workflow', workflowPath, '--user-prompt', 'original raw prompt'], 'next original user prompt');
  const response = expectRunner(['next', '--run-id', runId, '--workflow', workflowPath, '--user-prompt', 'replacement raw prompt'], 'resume with replacement user prompt');

  assert.equal(response.resumed, true);
  assert.equal(response.baton.user_prompt, 'original raw prompt');
  assert.equal(JSON.parse(readFileSync(path.join(runDir, 'baton.json'), 'utf8')).user_prompt, 'original raw prompt');

  const instructions = runRunner(['instructions', '--run-id', runId, '--step-id', 'prepare']);
  assert.equal(instructions.status, 0, instructions.stderr);
  assert.match(instructions.stdout, /## User prompt/);
  assert.equal(instructions.stdout.includes('original raw prompt'), true);
  assert.equal(instructions.stdout.includes('replacement raw prompt'), false);
});

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

test('runner: write-output accepts valid stdin JSON into baton state and continue advances without --output', () => {
  const { runId, runDir } = runCase('write-output-stdin-valid');
  const workflowPath = path.join(tempDir, 'write-output-stdin-valid-workflow.json');
  const workflow = schemaCoveredWorkflow({ prepare: { next: 'done' } });
  writeJson(workflowPath, workflow);

  expectRunner(['next', '--run-id', runId, '--workflow', workflowPath], 'next before write-output');
  const written = runRunner(['write-output', '--run-id', runId, '--step-id', 'prepare'], { input: JSON.stringify(workerOutput('prepared')) });
  assert.equal(written.status, 0, written.stderr);
  const writtenResponse = JSON.parse(written.stdout);
  assert.deepEqual(
    writtenResponse,
    {
      ok: true,
      runId,
      stepId: 'prepare',
      accepted: true,
      orchestratorInstruction: 'Output accepted. Parse this write-output stdout and wait until every current request has accepted output. If any current request is still missing accepted output, complete it next. When all current requests are accepted, call workflow-runner continue exactly once; the continue stdout.orchestratorInstruction controls the next step. Do not stop or report completion after write-output stdout.',
    },
  );
  const batonAfterWrite = JSON.parse(readFileSync(path.join(runDir, 'baton.json'), 'utf8'));
  assert.equal(batonAfterWrite.cursor, 'prepare');
  assert.equal(batonAfterWrite.state.outputs.prepare.outcome, 'ready');
  assert.equal(Object.hasOwn(batonAfterWrite.state, 'prepare'), false);

  const continued = expectRunner(['continue', '--run-id', runId, '--workflow', workflowPath], 'continue from accepted output');
  assert.equal(continued.status, 'done');
  assert.equal(continued.baton.state.prepare.outcome, 'ready');
});

test('runner: write-output rejects invalid JSON/schema without accepting output', () => {
  const { runId, runDir } = runCase('write-output-invalid');
  const workflowPath = path.join(tempDir, 'write-output-invalid-workflow.json');
  const workflow = schemaCoveredWorkflow({ prepare: { next: 'done' } });
  writeJson(workflowPath, workflow);

  expectRunner(['next', '--run-id', runId, '--workflow', workflowPath], 'next before invalid write-output');
  const invalid = runRunner(['write-output', '--run-id', runId, '--step-id', 'prepare'], { input: JSON.stringify({ results: [] }) });
  assert.notEqual(invalid.status, 0);
  assert.match(invalid.stderr, /output schema validation failed for step 'prepare'/);
  const batonAfterInvalid = JSON.parse(readFileSync(path.join(runDir, 'baton.json'), 'utf8'));
  assert.equal(batonAfterInvalid.state.outputs, undefined);

  const continued = runRunner(['continue', '--run-id', runId, '--workflow', workflowPath]);
  assert.notEqual(continued.status, 0);
  assert.match(continued.stderr, /missing accepted host output for workflow step prepare/);
});

test('runner: worker instructions include prefilled validating write-output command', () => {
  const { runId } = runCase('write-output-instructions');
  const workflowPath = path.join(tempDir, 'write-output-instructions-workflow.json');
  const workflow = schemaCoveredWorkflow({ prepare: { next: 'done' } });
  writeJson(workflowPath, workflow);

  expectRunner(['next', '--run-id', runId, '--workflow', workflowPath], 'next before loading writer instructions');
  const instructions = runRunner(['instructions', '--run-id', runId, '--step-id', 'prepare']);
  assert.equal(instructions.status, 0, instructions.stderr);
  assert.match(instructions.stdout, /workflow-runner\.mjs write-output --run-id/);
  assert.match(instructions.stdout, /--step-id 'prepare'/);
  assert.match(instructions.stdout, /--lease-token '[^']+'/);
  assert.doesNotMatch(instructions.stdout, /--lease-token <lease-token>/);
  assert.match(instructions.stdout, /Do not create a separate JSON output file and do not pass an output path to the orchestrator/);
});

test('runner: write-output separates parallel request outputs by step id before continue without --output', () => {
  const { runId, runDir } = runCase('write-output-parallel-step-ids');
  const workflowPath = path.join(tempDir, 'write-output-parallel-step-ids-workflow.json');
  const workflow = schemaCoveredWorkflow({ join: { next: 'done' } });
  writeJson(workflowPath, workflow);

  expectRunner(['next', '--run-id', runId, '--workflow', workflowPath], 'next before prepare writer');
  assert.equal(runRunner(['write-output', '--run-id', runId, '--step-id', 'prepare'], { input: JSON.stringify(workerOutput('prepared')) }).status, 0);
  const fanout = expectRunner(['continue', '--run-id', runId, '--workflow', workflowPath], 'continue to parallel branches');
  assert.deepEqual(fanout.requests.map((request) => request.stepId).sort(), ['branch_a', 'branch_b']);

  assert.equal(runRunner(['write-output', '--run-id', runId, '--step-id', 'branch_a'], { input: JSON.stringify(workerOutput('A')) }).status, 0);
  assert.equal(runRunner(['write-output', '--run-id', runId, '--step-id', 'branch_b'], { input: JSON.stringify(workerOutput('B')) }).status, 0);
  const batonAfterWrites = JSON.parse(readFileSync(path.join(runDir, 'baton.json'), 'utf8'));
  assert.equal(batonAfterWrites.state.outputs.branch_a.results[0].summary, 'A');
  assert.equal(batonAfterWrites.state.outputs.branch_b.results[0].summary, 'B');

  const joined = expectRunner(['continue', '--run-id', runId, '--workflow', workflowPath], 'continue from accepted parallel outputs');
  assert.equal(joined.status, 'needs_host_actions');
  assert.equal(joined.baton.cursor, 'join');
  assert.equal(joined.baton.state.branch_a.results[0].summary, 'A');
  assert.equal(joined.baton.state.branch_b.results[0].summary, 'B');
});
