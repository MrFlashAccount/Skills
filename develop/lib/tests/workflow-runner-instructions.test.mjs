import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';
import { fileURLToPath } from 'node:url';
import { continueRun as runnerContinueRun, loadInstructions as runnerLoadInstructions, next as runnerNext } from '../entrypoints/api/workflowRunner.mjs';
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
  return spawnSync(process.execPath, ['develop/lib/entrypoints/cli/workflow-runner.mjs', ...withLeaseTokenArg(args, token)], { cwd: root, encoding: 'utf8', env: { ...process.env, WORKFLOW_RUN_TOKEN: token ?? testLeaseToken, ...(options.env ?? {}) } });
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

after(() => rmSync(tempDir, { recursive: true, force: true }));

test('runner: durable commit recovery uses derived run dir', () => {
  const { runId, runDir } = runCase('durable-commit-derived-run-dir');
  const workflowPath = path.join(tempDir, 'durable-commit-derived-run-dir-workflow.json');
  const singleWorkflow = structuredClone(workflowDoc);
  singleWorkflow.steps.prepare.next = 'done';
  writeJson(workflowPath, singleWorkflow);

  expectRunner(['next', '--run-id', runId, '--workflow', workflowPath], 'next durable symlinked parent setup');
  const instructionPath = path.join(runDir, '.workflow-runner', 'instructions', 'prepare.md');
  const durableCommitPath = path.join(runDir, '.workflow-runner', 'durable-commit.json');
  writeJson(durableCommitPath, {
    version: 1,
    response: JSON.parse(readFileSync(path.join(runDir, '.workflow-runner', 'last-response.json'), 'utf8')),
    instructions: [{ path: instructionPath, content: 'instructions via symlinked parent\n' }],
    historyText: '',
  });

  const result = runRunner(['instructions', '--run-id', runId, '--step-id', 'prepare']);

  assert.equal(result.status, 0, `instructions failed
stdout:
${result.stdout}
stderr:
${result.stderr}`);
  assert.equal(readFileSync(path.join(runDir, '.workflow-runner', 'instructions', 'prepare.md'), 'utf8'), 'instructions via symlinked parent\n');
});


test('runner: durable commit recovery rejects symlinked instructions dir', () => {
  const { runId, runDir } = runCase('durable-commit-instructions-dir-symlink-escape');
  const workflowPath = path.join(tempDir, 'durable-commit-instructions-dir-symlink-escape-workflow.json');
  const singleWorkflow = structuredClone(workflowDoc);
  singleWorkflow.steps.prepare.next = 'done';
  writeJson(workflowPath, singleWorkflow);

  expectRunner(['next', '--run-id', runId, '--workflow', workflowPath], 'next durable instructions dir symlink escape setup');
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

  const result = runRunner(['instructions', '--run-id', runId, '--step-id', 'prepare']);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /durable workflow commit instructions dir is unsafe/);
  assert.equal(existsSync(path.join(outsideDir, 'prepare.md')), false);
});

test('runner: durable commit recovery rejects existing symlink instruction file rollback', () => {
  const { runId, runDir } = runCase('durable-commit-instruction-file-symlink-escape');
  const workflowPath = path.join(tempDir, 'durable-commit-instruction-file-symlink-escape-workflow.json');
  const singleWorkflow = structuredClone(workflowDoc);
  singleWorkflow.steps.prepare.next = 'done';
  writeJson(workflowPath, singleWorkflow);

  expectRunner(['next', '--run-id', runId, '--workflow', workflowPath], 'next durable instruction file symlink escape setup');
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

  const result = runRunner(['instructions', '--run-id', runId, '--step-id', 'prepare'], {
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

  const result = runRunner(['next', '--run-id', runCase('external-runner-shared-run').runId, '--workflow', path.join(workflowDir, 'workflow.json')]);

  assert.equal(result.status, 0, result.stderr);
  const response = JSON.parse(result.stdout);
  assert.equal(response.requests[0].stepId, 'prepare');
});

test('runner: next uses semantic workflow validation and rejects schema-declared dynamic targets that are not workflow steps', () => {
  const { runId, runDir } = runCase('runtime-semantic-dynamic-target');
  const workflowPath = path.join(tempDir, 'runtime-semantic-dynamic-target-workflow.json');
  const schemaPath = path.join(tempDir, 'runtime-semantic-dynamic-target.schema.json');
  writeJson(schemaPath, {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    required: ['outcome', 'route'],
    properties: {
      outcome: { enum: ['ready', 'blocked'] },
      route: { enum: ['done', 'missing_step'] },
    },
    additionalProperties: false,
  });
  const dynamicWorkflow = structuredClone(workflowDoc);
  dynamicWorkflow.steps.prepare.output = { template: 'output.md', schema: path.basename(schemaPath) };
  dynamicWorkflow.steps.prepare.next = '${{ output.route }}';
  writeJson(workflowPath, dynamicWorkflow);

  const result = runRunner(['next', '--run-id', runId, '--workflow', workflowPath]);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /prepare.*next expression.*missing_step/);
});

test('runner: continue rejects explicit workflow mismatch with last-response context', () => {
  const { runId, runDir } = runCase('continue-workflow-mismatch');
  const workflowPath = path.join(tempDir, 'continue-workflow-mismatch-a.json');
  const otherWorkflowPath = path.join(tempDir, 'continue-workflow-mismatch-b.json');
  const singleWorkflow = structuredClone(workflowDoc);
  singleWorkflow.steps.prepare.next = 'done';
  writeJson(workflowPath, singleWorkflow);
  writeJson(otherWorkflowPath, singleWorkflow);

  expectRunner(['next', '--run-id', runId, '--workflow', workflowPath], 'next workflow mismatch setup');
  const outputPath = path.join(runDir, 'prepared.json');
  writeJson(outputPath, workerOutput('prepared'));

  const mismatched = runRunner(['continue', '--run-id', runId, '--workflow', otherWorkflowPath, '--output', outputPath]);

  assert.notEqual(mismatched.status, 0);
  assert.match(mismatched.stderr, /already bound to a different workflow/);
  assert.equal(JSON.parse(readFileSync(path.join(runDir, 'baton.json'), 'utf8')).cursor, 'prepare');
});

test('runner: instructions rejects explicit workflow mismatch with last-response context', () => {
  const { runId, runDir } = runCase('instructions-workflow-mismatch');
  const workflowPath = path.join(tempDir, 'instructions-workflow-mismatch-a.json');
  const otherWorkflowPath = path.join(tempDir, 'instructions-workflow-mismatch-b.json');
  const singleWorkflow = structuredClone(workflowDoc);
  singleWorkflow.steps.prepare.next = 'done';
  writeJson(workflowPath, singleWorkflow);
  writeJson(otherWorkflowPath, singleWorkflow);

  expectRunner(['next', '--run-id', runId, '--workflow', workflowPath], 'next instructions workflow mismatch setup');

  const mismatched = runRunner(['instructions', '--run-id', runId, '--workflow', otherWorkflowPath, '--step-id', 'prepare']);

  assert.notEqual(mismatched.status, 0);
  assert.match(mismatched.stderr, /already bound to a different workflow/);
});

test('runner: continue rejects stale last-response after baton advances', () => {
  const { runId, runDir } = runCase('continue-stale-last-response');
  const workflowPath = path.join(tempDir, 'continue-stale-last-response-workflow.json');
  const singleWorkflow = structuredClone(workflowDoc);
  singleWorkflow.steps.prepare.next = 'done';
  writeJson(workflowPath, singleWorkflow);

  expectRunner(['next', '--run-id', runId, '--workflow', workflowPath], 'next stale continue setup');
  const lastResponseBefore = readFileSync(path.join(runDir, '.workflow-runner', 'last-response.json'), 'utf8');
  writeJson(path.join(runDir, 'baton.json'), { cursor: 'done', status: 'done', state: { artifacts: [], results: [], prepare: workerOutput('prepared elsewhere') } });
  const outputPath = path.join(runDir, 'prepared.json');
  writeJson(outputPath, workerOutput('old prepared output'));

  const stale = runRunner(['continue', '--run-id', runId, '--workflow', workflowPath, '--output', outputPath]);

  assert.notEqual(stale.status, 0);
  assert.match(stale.stderr, /stale last runner response/);
  assert.equal(JSON.parse(readFileSync(path.join(runDir, 'baton.json'), 'utf8')).cursor, 'done');
  assert.equal(readFileSync(path.join(runDir, '.workflow-runner', 'last-response.json'), 'utf8'), lastResponseBefore);
});

test('runner: instructions rejects stale last-response requests after baton advances', () => {
  const { runId, runDir } = runCase('instructions-stale-request');
  const workflowPath = path.join(tempDir, 'instructions-stale-request-workflow.json');
  const singleWorkflow = structuredClone(workflowDoc);
  singleWorkflow.steps.prepare.next = 'done';
  writeJson(workflowPath, singleWorkflow);

  expectRunner(['next', '--run-id', runId, '--workflow', workflowPath], 'next stale instructions setup');
  writeJson(path.join(runDir, 'baton.json'), { cursor: 'done', status: 'done', state: { artifacts: [], results: [], prepare: workerOutput('prepared') } });

  const stale = runRunner(['instructions', '--run-id', runId, '--step-id', 'prepare']);

  assert.notEqual(stale.status, 0);
  assert.match(stale.stderr, /stale last runner response/);
});

test('runner: instructions rejects unknown, unsafe, and missing instructions', () => {
  const { runId, runDir } = runCase('instructions-errors');
  const workflowPath = path.join(tempDir, 'instructions-errors-workflow.json');
  const singleWorkflow = structuredClone(workflowDoc);
  singleWorkflow.steps.prepare.next = 'done';
  writeJson(workflowPath, singleWorkflow);

  expectRunner(['next', '--run-id', runId, '--workflow', workflowPath], 'next instructions errors');

  const unknown = runRunner(['instructions', '--run-id', runId, '--step-id', 'nope']);
  assert.notEqual(unknown.status, 0);
  assert.match(unknown.stderr, /unknown current workflow step id: nope/);

  const unsafe = runRunner(['instructions', '--run-id', runId, '--step-id', '../prepare']);
  assert.notEqual(unsafe.status, 0);
  assert.match(unsafe.stderr, /invalid workflow step id/);

  rmSync(path.join(runDir, '.workflow-runner', 'instructions', 'prepare.md'), { force: true });
  const missing = runRunner(['instructions', '--run-id', runId, '--step-id', 'prepare']);
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /cannot read instructions for workflow step prepare/);
});

test('runner API propagates custom runsRoot through next, instructions, and continue', async () => {
  const runId = `workflow-runner-test-${process.pid}-custom-runs-root`;
  const runsRoot = path.join(tempDir, 'custom-runs-root');
  const workflowPath = path.join(tempDir, 'custom-runs-root-workflow.json');
  const outputPath = path.join(tempDir, 'custom-runs-root-output.json');
  const leaseToken = `custom-runs-root-token-${process.pid}`;
  writeJson(workflowPath, workflowDoc);
  writeJson(outputPath, workerOutput('prepared under custom root'));
  rmSync(runsRoot, { recursive: true, force: true });

  const first = await runnerNext({ runId, workflowPath, runsRoot, leaseToken });

  assert.equal(first.status, 'needs_host_actions');
  assert.equal(first.requests[0].stepId, 'prepare');
  assert.equal(first.requests[0].loadInstructionsCommand.includes(`--runs-root '${runsRoot}'`), true);

  const instructions = await runnerLoadInstructions({ runId, stepId: 'prepare', runsRoot, leaseToken });
  assert.match(instructions, /Prepare branch\./);

  const continued = await runnerContinueRun({ runId, runsRoot, output: outputPath, leaseToken });

  assert.equal(continued.status, 'needs_host_actions');
  assert.deepEqual(continued.requests.map((request) => request.stepId).sort(), ['branch_a', 'branch_b']);
  for (const request of continued.requests) {
    assert.equal(request.loadInstructionsCommand.includes(`--runs-root '${runsRoot}'`), true);
  }
  assert.equal(existsSync(path.join(resolveRunPaths({ runId, runsRoot }).runDir, 'baton.json')), true);
  assert.equal(existsSync(resolveRunPaths({ runId }).runDir), false);
});
