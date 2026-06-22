import assert from 'node:assert/strict';
import { readFile, readdir, rm, stat } from 'node:fs/promises';
import { dirname, join, sep } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import bridge, { formatNativeHelpText, usageText } from '../entrypoints/orbita/pluginBridge.mjs';
import { validateWorkflowPath } from '../entrypoints/orbita/workflowAdapter.mjs';

const DEVELOP_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const REPO_ROOT = dirname(DEVELOP_ROOT);


async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

function registeredOrbitaTool(pluginConfig = {}) {
  let tool;
  bridge.register({
    pluginConfig,
    registerCommand() {},
    registerTool(definition) { tool = definition; },
    registerCli() {},
  });
  return tool;
}

function parseToolResult(result) {
  return JSON.parse(result.content[0].text);
}

async function filesUnder(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await filesUnder(path));
    else if (entry.isFile() && path.endsWith('.mjs')) files.push(path);
  }
  return files;
}

async function lastResponseSnapshotsUnder(dir) {
  if (!(await exists(dir))) return [];
  const entries = await readdir(dir, { withFileTypes: true });
  const snapshots = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) snapshots.push(...await lastResponseSnapshotsUnder(path));
    else if (entry.isFile() && entry.name === 'last-response.json' && path.includes(`${sep}.workflow-runner${sep}`)) snapshots.push(path);
  }
  return snapshots;
}

async function managedRuntimeRoots() {
  const roots = [join(DEVELOP_ROOT, '.workflow-runs')];
  const worktreesRoot = join(REPO_ROOT, '.worktrees');
  if (await exists(worktreesRoot)) {
    const entries = await readdir(worktreesRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) roots.push(join(worktreesRoot, entry.name, 'develop', '.workflow-runs'));
    }
  }
  return roots;
}

test('managed workflow runtime roots do not retain ignored last-response snapshots', async () => {
  for (const root of await managedRuntimeRoots()) assert.deepEqual(await lastResponseSnapshotsUnder(root), []);
});

test('Orbita lifecycle core zones do not import OpenClaw, plugin, runtime, Telegram, session, task, or runner internals', async () => {
  const roots = ['dtos', 'entities', 'use-cases', 'persistence'].map((zone) => join(DEVELOP_ROOT, 'lib', zone, 'orbita-lifecycle'));
  const forbiddenImport = /import[\s\S]*?(openclaw|plugin-sdk|telegram|subagent|session|taskflow|runtime\/subagent|workflowRunner|workflowRuns|runnerNext|runnerWriteOutput|runnerContinueRun|registerWorkflowRun)/;
  for (const root of roots) {
    for (const file of await filesUnder(root)) {
      const importLines = (await readFile(file, 'utf8')).split('\n').filter((line) => line.trimStart().startsWith('import ')).join('\n');
      assert.equal(forbiddenImport.test(importLines), false, `${file} imports forbidden runtime internals`);
    }
  }
});

test('Orbita lifecycle core zones expose neutral requester fields instead of OpenClaw session fields', async () => {
  const roots = ['dtos', 'entities', 'use-cases', 'persistence'].map((zone) => join(DEVELOP_ROOT, 'lib', zone, 'orbita-lifecycle'));
  for (const root of roots) {
    for (const file of await filesUnder(root)) {
      const source = await readFile(file, 'utf8');
      assert.doesNotMatch(source, /session_key|sessionKey/, `${file} leaks OpenClaw session field names`);
    }
  }
});

test('Orbita plugin bridge is thin and does not call Skills runner APIs directly', async () => {
  const source = await readFile(join(DEVELOP_ROOT, 'lib', 'entrypoints', 'orbita', 'pluginBridge.mjs'), 'utf8');
  const importLines = source.split('\n').filter((line) => line.trimStart().startsWith('import ')).join('\n');

  assert.match(source, /registerCommand/);
  assert.match(source, /registerTool/);
  assert.match(source, /runOrbita/);
  assert.doesNotMatch(importLines, /entrypoints\/api\/workflowRunner|entrypoints\/api\/workflowRuns/);
  assert.doesNotMatch(source, /\bnext\(|\bwriteOutput\(|\bcontinueRun\(|\bregisterWorkflowRun\(/);
});

test('Orbita workflow adapter owns generic workflow runner orchestration outside thin plugin bridge', async () => {
  const source = await readFile(join(DEVELOP_ROOT, 'lib', 'entrypoints', 'orbita', 'workflowAdapter.mjs'), 'utf8');

  assert.match(source, /runWorkflow/);
  assert.match(source, /registerWorkflowRun/);
  assert.match(source, /writeOutput/);
  assert.match(source, /continueRun/);
  assert.doesNotMatch(source, /DevHarness|dev-harness|runDevHarnessWorkflow/);
});

test('Orbita workflow path policy allows generic relative workflow json paths', () => {
  assert.equal(validateWorkflowPath('workflows/sample/workflow.json'), 'workflows/sample/workflow.json');
  assert.equal(validateWorkflowPath('./workflows/sample/workflow.json'), 'workflows/sample/workflow.json');
  assert.equal(validateWorkflowPath('custom/workflow.json'), 'custom/workflow.json');

  for (const value of [
    join('/', 'tmp', 'workflows', 'sample', 'workflow.json'),
    `~${join('/', 'workflows', 'sample', 'workflow.json')}`,
    '../workflows/sample/workflow.json',
    'workflows/../workflows/sample/workflow.json',
  ]) {
    assert.throws(() => validateWorkflowPath(value), /unsupported_workflow_path/, value);
  }
});

test('Orbita public help and tool schema expose only approved lifecycle modes', () => {
  const blocked = /\b(smoke|start|resume|gate|e2e)\b/;
  assert.doesNotMatch(usageText(), blocked);
  assert.doesNotMatch(formatNativeHelpText(), blocked);
  assert.doesNotMatch(usageText(), /\b(?:Privacy|Runtime honesty)\b/);
  assert.doesNotMatch(formatNativeHelpText(), /\b(?:Privacy|Honesty)\b/);
  assert.doesNotMatch(usageText(), new RegExp(`${'/'}Users${'/'}`));

  let tool;
  const cliModes = [];
  bridge.register({
    pluginConfig: {},
    registerCommand() {},
    registerTool(definition) { tool = definition; },
    registerCli(factory) {
      const root = {
        description() { return root; },
        allowUnknownOption() { return root; },
        allowExcessArguments() { return root; },
        command(spec) {
          cliModes.push(spec.split(' ')[0]);
          return { description() { return this; }, allowUnknownOption() { return this; }, action() { return this; } };
        },
      };
      factory({ program: { command() { return root; } } });
    },
  });

  assert.deepEqual(tool.parameters.properties.mode.enum, ['run', 'inbox', 'status', 'list', 'cancel', 'approve', 'reject', 'reply', 'help']);
  assert.equal(Object.hasOwn(tool.parameters.properties, 'session_key'), false);
  assert.doesNotMatch(JSON.stringify(tool.parameters), /session_key/);
  assert.deepEqual(cliModes, ['run', 'inbox', 'status', 'list', 'cancel', 'approve', 'reject', 'reply', 'help']);
});

test('Orbita registered tool blocks persistent modes without trusted requester context', async () => {
  const tool = registeredOrbitaTool();

  for (const mode of ['run', 'inbox', 'status', 'list', 'cancel', 'approve', 'reject', 'reply']) {
    const params = mode === 'cancel' ? { mode, run: 'orbita-missing' } : { mode };
    const result = parseToolResult(await tool.execute('call-id', params));
    assert.equal(result.ok, false, mode);
    assert.equal(result.message, 'trusted_requester_required', mode);
  }
});

test('Orbita registered tool ignores spoofed session_key and scopes by trusted context only', async () => {
  const workspaceDir = process.env.OPENCLAW_WORKSPACE_DIR || join(process.env.HOME, '.openclaw', 'workspace');
  const relativeRunsRoot = `.test-orbita-tool/${process.pid}-${Date.now()}`;
  const runsRoot = join(workspaceDir, relativeRunsRoot);
  const tool = registeredOrbitaTool({ runsRoot: relativeRunsRoot });

  try {
    const created = parseToolResult(await tool.execute('call-id', { mode: 'run' }, { sessionKey: 'requester-a' }));
    assert.equal(created.ok, true);

    const noTrustedCtx = parseToolResult(await tool.execute('call-id', { mode: 'list', session_key: 'requester-a' }));
    assert.equal(noTrustedCtx.ok, false);
    assert.equal(noTrustedCtx.message, 'trusted_requester_required');

    const spoofed = parseToolResult(await tool.execute('call-id', { mode: 'list', session_key: 'requester-a' }, { sessionKey: 'requester-b' }));
    assert.equal(spoofed.ok, true);
    assert.deepEqual(spoofed.runs, []);
  } finally {
    await rm(runsRoot, { recursive: true, force: true });
  }
});

test('Orbita registered tool allows dry-run without trusted requester and does not create runs root', async () => {
  const workspaceDir = process.env.OPENCLAW_WORKSPACE_DIR || join(process.env.HOME, '.openclaw', 'workspace');
  const relativeRunsRoot = `.test-orbita-dry-tool/${process.pid}-${Date.now()}`;
  const runsRoot = join(workspaceDir, relativeRunsRoot);
  const tool = registeredOrbitaTool({ runsRoot: relativeRunsRoot });

  try {
    const dry = parseToolResult(await tool.execute('call-id', { mode: 'run', dry_run: true }));
    assert.equal(dry.ok, true);
    assert.equal(dry.dry_run, true);
    assert.equal(await exists(runsRoot), false);
  } finally {
    await rm(runsRoot, { recursive: true, force: true });
  }
});
