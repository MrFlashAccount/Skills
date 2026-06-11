import assert from 'node:assert/strict';
import { symlinkSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile, stat, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { ORBITA_RUN_STATES } from '../entities/orbita-lifecycle/run.mjs';
import { createOrbitaLifecycleController } from '../use-cases/orbita-lifecycle/controller.mjs';
import { createFileOrbitaRunStore } from '../persistence/orbita-lifecycle/fileRunStore.mjs';
import { projectOrbitaResult } from '../dtos/orbita-lifecycle/projections.mjs';
import { parseCommandArgs, runOrbita } from '../entrypoints/orbita/pluginBridge.mjs';

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

async function withRoot(fn) {
  const root = await mkdtemp(join(tmpdir(), 'orbita-lifecycle-'));
  try {
    await fn(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function withController(fn) {
  await withRoot(async (root) => {
    const controller = createOrbitaLifecycleController({
      store: createFileOrbitaRunStore({ runsRoot: root }),
      now: () => new Date('2026-06-10T19:00:00.000Z'),
      idFactory: () => 'fixed-id',
    });
    await fn(controller, root);
  });
}

test('run creates a compact runtime-gap lifecycle record and reuses the active run', async () => {
  await withController(async (controller) => {
    const created = projectOrbitaResult(await controller.run({ requesterRef: 'requester-a', kind: 'backend' }));
    assert.equal(created.ok, true);
    assert.equal(created.run.run_id, 'orbita-fixed-id');
    assert.equal(created.run.state, 'waiting_human');
    assert.equal(created.run.runtime_gap, 'requires_parent_delivery');
    assert.equal(Object.hasOwn(created.run, 'requester_ref'), false);
    assert.equal(Object.hasOwn(created.run, 'session_key'), false);
    assert.equal(created.delivery.requires_parent_delivery, true);
    assert.equal(created.run.opaque_refs, undefined);

    const reused = projectOrbitaResult(await controller.run({ requesterRef: 'requester-a', kind: 'backend' }));
    assert.equal(reused.message, 'existing_active_run');
    assert.equal(reused.run.run_id, created.run.run_id);
  });
});

test('runtime gap is delivery metadata, not a lifecycle state', async () => {
  assert.equal(Object.values(ORBITA_RUN_STATES).includes('blocked_runtime_gap'), false);

  await withController(async (controller) => {
    const created = projectOrbitaResult(await controller.run({ requesterRef: 'requester-a' }));
    assert.notEqual(created.run.state, 'blocked_runtime_gap');
    assert.equal(created.run.runtime_gap, 'requires_parent_delivery');
  });
});

test('dry-run reports runtime honesty and intake without persisting a run', async () => {
  await withRoot(async (root) => {
    const runsRoot = join(root, 'missing-runs-root');
    const controller = createOrbitaLifecycleController({
      store: createFileOrbitaRunStore({ runsRoot }),
      now: () => new Date('2026-06-10T19:00:00.000Z'),
      idFactory: () => 'fixed-id',
    });
    const dry = projectOrbitaResult(await controller.run({ dryRun: true }));
    assert.equal(dry.ok, true);
    assert.equal(dry.dry_run, true);
    assert.equal(dry.run.state, 'completed');
    assert.equal(dry.runtime_gap, 'requires_parent_delivery');
    assert.equal(dry.run.intake.intake_status, 'needs_intake_agent');
    assert.equal(dry.run.intake.task_kind, 'unknown');
    assert.equal(dry.run.intake.brief_available, false);
    assert.equal(Object.hasOwn(dry.run.intake, 'clean_subagent_brief'), false);
    assert.equal(await exists(runsRoot), false);

    const listed = projectOrbitaResult(await controller.list());
    assert.deepEqual(listed.runs, []);
    assert.equal(await exists(runsRoot), false);
  });
});

test('semantic intake agent packet is persisted with the lifecycle run and raw request is not projected', async () => {
  await withRoot(async (root) => {
    const controller = createOrbitaLifecycleController({
      store: createFileOrbitaRunStore({ runsRoot: root }),
      now: () => new Date('2026-06-10T19:00:00.000Z'),
      idFactory: () => 'fixed-id',
    });

    const created = projectOrbitaResult(await controller.run({
      requesterRef: 'requester-a',
      intake: {
        intake_status: 'ambiguous',
        task_kind: 'backend',
        candidate_options: [{ id: 'dev-harness', label: 'Dev Harness workflow' }],
        clean_subagent_brief: 'Implement backend lifecycle support.',
        clean_subagent_brief_safe: true,
        confidence: 0.42,
      },
    }));
    assert.equal(created.ok, true);
    assert.equal(created.run.state, 'waiting_human');
    assert.equal(created.run.intake.intake_status, 'ambiguous');
    assert.deepEqual(created.run.intake.candidate_options, [{ id: 'dev-harness', label: 'Dev Harness' }]);
    assert.equal(created.run.intake.clean_subagent_brief, 'Implement backend lifecycle support.');
    assert.doesNotMatch(JSON.stringify(created), /raw secret-ish messy prompt/);

    const listed = projectOrbitaResult(await controller.list({ requesterRef: 'requester-a' }));
    assert.equal(listed.runs[0].intake.intake_status, 'ambiguous');
  });
});

test('requester scoping hides runs from other requesters by default', async () => {
  await withRoot(async (root) => {
    let nextId = 0;
    const controller = createOrbitaLifecycleController({
      store: createFileOrbitaRunStore({ runsRoot: root }),
      now: () => new Date('2026-06-10T19:00:00.000Z'),
      idFactory: () => `fixed-id-${++nextId}`,
    });
    const a = await controller.run({ requesterRef: 'requester-a', kind: 'backend' });
    await controller.run({ requesterRef: 'requester-b', kind: 'backend' });

    const listA = projectOrbitaResult(await controller.list({ requesterRef: 'requester-a' }));
    assert.deepEqual(listA.runs.map((run) => run.run_id), [a.run.run_id]);

    const statusB = projectOrbitaResult(await controller.status({ requesterRef: 'requester-b', runId: a.run.run_id }));
    assert.equal(statusB.ok, false);
    assert.equal(statusB.message, 'run_not_found');
  });
});

test('cancel is requester-scoped and terminal cancel is a no-op', async () => {
  await withController(async (controller) => {
    const created = await controller.run({ requesterRef: 'requester-a', kind: 'backend' });
    const denied = projectOrbitaResult(await controller.cancel({ requesterRef: 'requester-b', runId: created.run.run_id, reason: 'stop' }));
    assert.equal(denied.ok, false);
    assert.equal(denied.message, 'run_not_found');

    const cancelled = projectOrbitaResult(await controller.cancel({ requesterRef: 'requester-a', runId: created.run.run_id, reason: 'stop' }));
    assert.equal(cancelled.ok, true);
    assert.equal(cancelled.run.state, 'cancelled');
    assert.equal(cancelled.run.cancel_reason, undefined);

    const second = projectOrbitaResult(await controller.cancel({ requesterRef: 'requester-a', runId: created.run.run_id, reason: 'stop again' }));
    assert.equal(second.ok, true);
    assert.equal(second.message, 'already_terminal');
    assert.equal(second.run.state, 'cancelled');
  });
});

test('invalid list and inbox limits are rejected explicitly', async () => {
  await withController(async (controller) => {
    await assert.rejects(() => controller.list({ limit: 0 }), /limit must be a positive integer/);
    await assert.rejects(() => controller.inbox({ limit: 'not-a-number' }), /limit must be a positive integer/);
  });
});

test('corrupt run JSON is skipped with diagnostics instead of bricking list and run', async () => {
  await withRoot(async (root) => {
    const store = createFileOrbitaRunStore({ runsRoot: root });
    const controller = createOrbitaLifecycleController({ store, idFactory: () => 'fresh-id' });
    await mkdir(store.root, { recursive: true });
    await writeFile(join(store.root, 'corrupt.json'), '{not-json');

    const listed = projectOrbitaResult(await controller.list());
    assert.equal(listed.ok, true);
    assert.deepEqual(listed.runs, []);
    assert.equal(listed.diagnostics?.[0]?.code, 'corrupt_run_record_skipped');

    const status = projectOrbitaResult(await controller.status({ runId: 'corrupt' }));
    assert.equal(status.ok, true);
    assert.equal(status.run, null);
    assert.equal(status.diagnostics?.[0]?.code, 'corrupt_run_record_skipped');

    const inbox = projectOrbitaResult(await controller.inbox());
    assert.equal(inbox.ok, true);
    assert.deepEqual(inbox.runs, []);
    assert.equal(inbox.diagnostics?.[0]?.code, 'corrupt_run_record_skipped');

    const created = projectOrbitaResult(await controller.run({ requesterRef: 'requester-a' }));
    assert.equal(created.ok, true);
    assert.equal(created.run.run_id, 'orbita-fresh-id');
    assert.equal(created.diagnostics?.[0]?.code, 'corrupt_run_record_skipped');
  });
});

test('public bridge modes exclude legacy and smoke commands', async () => {
  const unsupported = await runOrbita('smoke');
  assert.equal(unsupported.ok, false);
  assert.equal(unsupported.message, 'unsupported_orbita_command');
  assert.doesNotMatch(unsupported.text, /smoke|start|resume|gate|e2e/);
});

test('workspace plugin metadata has no legacy smoke surface or stale gate wording', async () => {
  const pluginRoot = join(process.env.HOME, '.openclaw', 'workspace', 'plugins', 'orbita');
  const packageText = await readFile(join(pluginRoot, 'package.json'), 'utf8');
  const manifestText = await readFile(join(pluginRoot, 'openclaw.plugin.json'), 'utf8');
  const packageJson = JSON.parse(packageText);

  assert.equal(await exists(join(pluginRoot, 'scripts', 'smoke.js')), false);
  assert.equal(Object.hasOwn(packageJson.scripts ?? {}, 'smoke'), false);
  assert.doesNotMatch(`${packageText}\n${manifestText}`, /Skills workflow gate API|smoke\.js|legacy smoke/i);
});

test('bridge rejects user-controlled absolute and traversal runs roots', async () => {
  await assert.rejects(() => runOrbita('list', { 'runs-root': '/tmp/orbita-escape' }, { ctx: { sessionKey: 'requester-a' } }), /relative path/);
  await assert.rejects(() => runOrbita('list', { 'runs-root': '../escape' }, { ctx: { sessionKey: 'requester-a' } }), /parent traversal/);
});

test('bridge rejects plugin-configured absolute runs roots outside the workspace', async () => {
  await assert.rejects(
    () => runOrbita('run', { 'dry-run': true }, { pluginConfig: { runsRoot: '/tmp/orbita-escape' } }),
    /OpenClaw workspace/,
  );
});

test('bridge rejects workspace-relative runs roots that traverse through symlinks', async () => {
  const workspaceDir = process.env.OPENCLAW_WORKSPACE_DIR || join(process.env.HOME, '.openclaw', 'workspace');
  const outside = await mkdtemp(join(tmpdir(), 'orbita-runs-root-outside-'));
  const linkName = `.test-orbita-symlink-${process.pid}-${Date.now()}`;
  const linkPath = join(workspaceDir, linkName);
  try {
    symlinkSync(outside, linkPath, 'dir');
    await assert.rejects(
      () => runOrbita('run', { 'dry-run': true }, { pluginConfig: { runsRoot: linkName } }),
      /symlink escapes/,
    );
  } finally {
    await rm(linkPath, { force: true });
    await rm(outside, { recursive: true, force: true });
  }
});

test('direct bridge dry-run parses raw messy request into intake packet without persisting', async () => {
  const workspaceDir = process.env.OPENCLAW_WORKSPACE_DIR || join(process.env.HOME, '.openclaw', 'workspace');
  const relativeRunsRoot = `.test-orbita-intake-dry/${process.pid}-${Date.now()}`;
  const runsRoot = join(workspaceDir, relativeRunsRoot);
  const pluginConfig = { runsRoot: relativeRunsRoot };
  try {
    const dry = await runOrbita('run', { 'dry-run': true, _positionals: ['create', 'new', 'workflow', 'for', 'release triage'] }, { pluginConfig });
    assert.equal(dry.ok, true);
    assert.equal(dry.run.intake.intake_status, 'needs_intake_agent');
    assert.equal(dry.run.intake.task_kind, 'unknown');
    assert.equal(dry.run.intake.brief_available, false);
    assert.doesNotMatch(JSON.stringify(dry), /release triage/);
    assert.equal(await exists(runsRoot), false);
  } finally {
    await rm(runsRoot, { recursive: true, force: true });
  }
});

test('runtime intake sanitizer does not trust safe flags or leak secrets and local paths', async () => {
  const workspaceDir = process.env.OPENCLAW_WORKSPACE_DIR || join(process.env.HOME, '.openclaw', 'workspace');
  const relativeRunsRoot = `.test-orbita-intake-malicious/${process.pid}-${Date.now()}`;
  const runsRoot = join(workspaceDir, relativeRunsRoot);
  const pluginConfig = { runsRoot: relativeRunsRoot };
  const maliciousLocalPath = ['', 'Users', 'sergeygarin', 'private'].join('/');
  const maliciousPacket = {
    intake_status: 'ambiguous',
    task_kind: 'backend',
    candidate_options: [{ id: 'dev-harness', label: `TOKEN=secret ${maliciousLocalPath}/leaky label` }],
    selected_workflow: { id: 'unknown-workflow', label: 'TOKEN=secret selected', path: `${maliciousLocalPath}/SKILL.md` },
    proposed_path: { kind: 'backend', label: 'TOKEN=secret proposed', path: `${maliciousLocalPath}/Projects/skills/private` },
    clean_subagent_brief: `Fix request with TOKEN=secret from ${maliciousLocalPath}/private.txt`,
    clean_subagent_brief_safe: true,
    selected_workflow_safe: true,
    proposed_path_safe: true,
    candidate_options_safe: true,
    confidence: 0.77,
  };

  try {
    const created = await runOrbita('run', { request: 'safe wrapper request' }, {
      pluginConfig,
      ctx: { sessionKey: 'requester-a' },
      api: { runtime: { subagent: () => ({ text: JSON.stringify(maliciousPacket) }) } },
    });
    assert.equal(created.ok, true);
    assert.equal(created.run.intake.intake_status, 'ambiguous');
    assert.deepEqual(created.run.intake.candidate_options, [{ id: 'dev-harness', label: 'Dev Harness' }]);
    assert.equal(created.run.intake.brief_available, false);
    assert.equal(Object.hasOwn(created.run.intake, 'clean_subagent_brief'), false);
    assert.equal(created.run.intake.selected_workflow, undefined);
    assert.equal(created.run.intake.proposed_path, undefined);
    assert.doesNotMatch(JSON.stringify(created), /TOKEN=secret|\/Users\/sergeygarin|leaky label|selected|proposed/);

    const persisted = await readFile(join(runsRoot, 'orbita-lifecycle', `${created.run.run_id}.json`), 'utf8');
    assert.doesNotMatch(persisted, /TOKEN=secret|\/Users\/sergeygarin|leaky label|selected|proposed/);

    const listed = await runOrbita('list', {}, { pluginConfig, ctx: { sessionKey: 'requester-a' } });
    assert.doesNotMatch(JSON.stringify(listed), /TOKEN=secret|\/Users\/sergeygarin|leaky label|selected|proposed/);
  } finally {
    await rm(runsRoot, { recursive: true, force: true });
  }
});

test('direct bridge persistent run stores intake and projects it through list status and inbox', async () => {
  const workspaceDir = process.env.OPENCLAW_WORKSPACE_DIR || join(process.env.HOME, '.openclaw', 'workspace');
  const relativeRunsRoot = `.test-orbita-intake-persist/${process.pid}-${Date.now()}`;
  const runsRoot = join(workspaceDir, relativeRunsRoot);
  const pluginConfig = { runsRoot: relativeRunsRoot };
  try {
    const rawSecret = 'workflow or skill for messy backend request SECRET_TOKEN=abc123';
    const created = await runOrbita('run', { request: rawSecret }, { pluginConfig, ctx: { sessionKey: 'requester-a' } });
    assert.equal(created.ok, true);
    assert.equal(created.run.state, 'waiting_human');
    assert.equal(created.run.intake.intake_status, 'needs_intake_agent');
    assert.equal(created.run.intake.brief_available, false);
    assert.doesNotMatch(JSON.stringify(created), /SECRET_TOKEN|messy backend request/);

    const persisted = await readFile(join(runsRoot, 'orbita-lifecycle', `${created.run.run_id}.json`), 'utf8');
    assert.doesNotMatch(persisted, /SECRET_TOKEN|messy backend request/);

    const status = await runOrbita('status', { run: created.run.run_id }, { pluginConfig, ctx: { sessionKey: 'requester-a' } });
    assert.equal(status.run.intake.intake_status, 'needs_intake_agent');

    const listed = await runOrbita('list', {}, { pluginConfig, ctx: { sessionKey: 'requester-a' } });
    assert.equal(listed.runs[0].intake.intake_status, 'needs_intake_agent');

    const inbox = await runOrbita('inbox', {}, { pluginConfig, ctx: { sessionKey: 'requester-a' } });
    assert.equal(inbox.runs[0].intake.intake_status, 'needs_intake_agent');
    assert.doesNotMatch(JSON.stringify(inbox), /requester-a|SECRET_TOKEN/);
  } finally {
    await rm(runsRoot, { recursive: true, force: true });
  }
});

test('direct bridge dry-run does not create the configured runs root and respects requester scope', async () => {
  const workspaceDir = process.env.OPENCLAW_WORKSPACE_DIR || join(process.env.HOME, '.openclaw', 'workspace');
  const relativeRunsRoot = `.test-orbita-runs/${process.pid}-${Date.now()}`;
  const runsRoot = join(workspaceDir, relativeRunsRoot);
  const pluginConfig = { runsRoot: relativeRunsRoot };
  try {
    const dry = await runOrbita('run', { 'dry-run': true }, { pluginConfig });
    assert.equal(dry.ok, true);
    assert.equal(dry.dry_run, true);
    assert.equal(await exists(runsRoot), false);

    const created = await runOrbita('run', {}, { pluginConfig, ctx: { sessionKey: 'requester-a' } });
    assert.equal(created.ok, true);
    const otherList = await runOrbita('list', {}, { pluginConfig, ctx: { sessionKey: 'requester-b' } });
    assert.deepEqual(otherList.runs, []);
  } finally {
    await rm(runsRoot, { recursive: true, force: true });
  }
});

test('runtime intake response is size-bounded before JSON parsing', async () => {
  const workspaceDir = process.env.OPENCLAW_WORKSPACE_DIR || join(process.env.HOME, '.openclaw', 'workspace');
  const relativeRunsRoot = `.test-orbita-intake-large/${process.pid}-${Date.now()}`;
  const runsRoot = join(workspaceDir, relativeRunsRoot);
  try {
    const result = await runOrbita('run', { 'dry-run': true, request: 'SECRET_TOKEN=oversized-response' }, {
      pluginConfig: { runsRoot: relativeRunsRoot },
      api: { runtime: { subagent: () => ({ text: 'x'.repeat(12_001) }) } },
    });
    assert.equal(result.ok, true);
    assert.equal(result.run.intake.intake_status, 'degraded');
    assert.equal(result.run.intake.degradation_reason, 'runtime_subagent_intake_failed');
    assert.doesNotMatch(JSON.stringify(result), /SECRET_TOKEN/);
  } finally {
    await rm(runsRoot, { recursive: true, force: true });
  }
});

test('native command parser treats tokens after separator as request text, not options', () => {
  const parsed = parseCommandArgs('run --dry-run -- --help not option --kind frontend');
  assert.equal(parsed.mode, 'run');
  assert.equal(parsed.values['dry-run'], true);
  assert.equal(parsed.values.kind, undefined);
  assert.deepEqual(parsed.values._positionals, ['--help', 'not', 'option', '--kind', 'frontend']);
});

test('native run parser stops option parsing at first request token', () => {
  const parsed = parseCommandArgs('run --dry-run create --kind frontend workflow');
  assert.equal(parsed.mode, 'run');
  assert.equal(parsed.values['dry-run'], true);
  assert.equal(parsed.values.kind, undefined);
  assert.deepEqual(parsed.values._positionals, ['create', '--kind', 'frontend', 'workflow']);
});
