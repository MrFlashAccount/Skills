import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { registerWorkflowRun } from '../entrypoints/api/workflowRuns.mjs';
import { continueRun, next, writeOutput } from '../entrypoints/api/workflowRunner.mjs';
import orbitaPlugin, { buildNativeInboxPresentation, formatNativeInboxReply, formatNativeRunText, runOrbita } from '../entrypoints/orbita/pluginBridge.mjs';

const TEST_SAMPLE_WORKFLOW = fileURLToPath(new URL('./fixtures/orbita-sample.workflow.json', import.meta.url));

function orbitaPluginConfig(root, workflowPath = TEST_SAMPLE_WORKFLOW) {
  return { workflowRunsRoot: root, workflowPath };
}

function expectedCommandBlocks(text) {
  return [...text.matchAll(/```text\n([^`]+?)\n```/g)].map((match) => match[1]);
}

async function withRoot(fn) {
  const root = await mkdtemp(join(tmpdir(), 'orbita-inbox-buttons-'));
  try {
    await fn(root);
  } finally {
    await new Promise((resolve) => setTimeout(resolve, 50));
    await rm(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 20 });
  }
}

async function registerApprovalRun(root, suffix) {
  const run = await registerWorkflowRun({
    runsRoot: root,
    runId: `run-${process.pid}-inbox-${suffix}`,
    title: `approval workflow ${suffix}`,
    workflowPath: TEST_SAMPLE_WORKFLOW,
    workflowIdentity: 'sample-workflow',
    status: 'needs_host_actions',
    requestId: `orbita-inbox-${suffix}-request`,
    currentStep: 'approve_research',
    currentGate: 'approve_research',
  });
  const runnerDir = join(root, run.runId, '.workflow-runner');
  await mkdir(join(runnerDir, 'instructions'), { recursive: true, mode: 0o700 });
  await writeFile(join(runnerDir, 'instructions', 'approve_research.md'), `Approve research ${suffix}?`);
  await writeCanonicalBaton(root, run.runId, approvalBaton());
  return run;
}

async function registerIndexGateRun(root, suffix, { writeInstructions = true } = {}) {
  const run = await registerWorkflowRun({
    runsRoot: root,
    runId: `run-${process.pid}-index-gate-${suffix}`,
    title: `degraded approval workflow ${suffix}`,
    workflowPath: TEST_SAMPLE_WORKFLOW,
    workflowIdentity: 'sample-workflow',
    status: 'needs_host_actions',
    requestId: `orbita-index-gate-${suffix}-request`,
    currentStep: 'approve_research',
    currentGate: 'approve_research',
  });
  const runnerDir = join(root, run.runId, '.workflow-runner');
  await mkdir(join(runnerDir, 'instructions'), { recursive: true, mode: 0o700 });
  if (writeInstructions) await writeFile(join(runnerDir, 'instructions', 'approve_research.md'), `Approve degraded research ${suffix}?`);
  await writeCanonicalBaton(root, run.runId, approvalBaton());
  return run;
}

async function readRunsIndex(root) {
  return JSON.parse(await readFile(join(root, 'runs.json'), 'utf8'));
}

async function writeCanonicalBaton(root, runId, baton) {
  await writeFile(join(root, runId, 'baton.json'), `${JSON.stringify(baton, null, 2)}
`);
}

function approvalBaton(outputs = {}) {
  return { cursor: 'approve_research', status: 'running', state: { outputs, artifacts: [], results: [] } };
}

function validResearchAttackVerdict(summary = 'Approved.') {
  return {
    summary: [summary],
    evidence_checked: ['research_draft output'],
    findings: [{
      category: 'can',
      severity: 'can',
      summary: 'Research packet is consistent.',
      description: 'The research draft output was reviewed and no blocking issue was identified.',
      evidence: [{ ref: 'research_draft output', details: 'Research packet was available for critic review.' }],
      recommendation: 'Proceed to approval.',
    }],
  };
}

function assertApprovalGateReached(response) {
  assert.equal(response.status, 'needs_host_actions');
  const approval = response.requests?.find((request) => request.action === 'wait_for_approval');
  assert.ok(approval, 'test fixture must reach a wait_for_approval request');
  assert.equal(approval.stepId ?? approval.id, 'approve_research');
}

async function registerSampleRunAtApprovalGate(root, suffix) {
  const runId = `run-${process.pid}-${suffix}`;
  const registered = await registerWorkflowRun({
    runsRoot: root,
    runId,
    workflowPath: TEST_SAMPLE_WORKFLOW,
    workflowIdentity: 'sample-workflow',
    title: `sample workflow: ${suffix}`,
    status: 'running',
    requestId: `orbita-${suffix}-request`,
    claim: true,
    owner: 'test',
    workerId: `test-${suffix}`,
    leaseMs: 60_000,
  });

  let response = await next({ runId, workflowPath: TEST_SAMPLE_WORKFLOW, runsRoot: root, leaseToken: registered.leaseToken, userPrompt: `approval control ${suffix}` });
  assert.equal(response.requests[0].stepId, 'research_draft');
  const artifactDir = join(root, runId, 'research_draft', 'artifacts');
  await mkdir(artifactDir, { recursive: true });
  const artifactPath = join(artifactDir, 'research.md');
  await writeFile(artifactPath, 'Research packet fixture.');
  await writeOutput({
    runId,
    workflowPath: TEST_SAMPLE_WORKFLOW,
    runsRoot: root,
    leaseToken: registered.leaseToken,
    stepId: 'research_draft',
    json: JSON.stringify({
      outcome: 'ready_for_attack',
      research_packet: {
        summary: ['Research ready.'],
        scope: { in_scope: ['approval control'], out_of_scope: [] },
        constraints: [],
        risks: [],
        open_questions: [],
        recommendation: 'Approve research.',
      },
      artifacts: [{ id: 'research-packet', content_type: 'text/markdown', path: artifactPath, summary: 'Research packet' }],
    }),
  });
  response = await continueRun({ runId, workflowPath: TEST_SAMPLE_WORKFLOW, runsRoot: root, leaseToken: registered.leaseToken });
  assert.equal(response.requests[0].stepId, 'research_attack');
  await writeOutput({
    runId,
    workflowPath: TEST_SAMPLE_WORKFLOW,
    runsRoot: root,
    leaseToken: registered.leaseToken,
    stepId: 'research_attack',
    json: JSON.stringify({ outcome: 'approved', verdict: validResearchAttackVerdict('Research gate approved.') }),
  });
  response = await continueRun({ runId, workflowPath: TEST_SAMPLE_WORKFLOW, runsRoot: root, leaseToken: registered.leaseToken });
  assertApprovalGateReached(response);
  const index = await readRunsIndex(root);
  index.runs[runId].workerLease = null;
  await writeFile(join(root, 'runs.json'), JSON.stringify(index, null, 2));
  return { runId };
}

function workflowDriverLaneStub(starts = []) {
  return { runtime: { workflowDrivers: { async start(params) { starts.push(params); } } } };
}

test('Orbita inbox native reply lists pending runs with open-card buttons only', async () => {
  await withRoot(async (root) => {
    const first = await registerApprovalRun(root, 'first');
    const second = await registerApprovalRun(root, 'second');

    const result = await runOrbita('inbox', { limit: '2' }, { pluginConfig: orbitaPluginConfig(root), ctx: { sessionKey: 'requester-a' } });
    const reply = formatNativeInboxReply(result);

    assert.equal(result.workflow_runs.length, 2);
    assert.ok(buildNativeInboxPresentation(result));
    assert.ok(reply.presentation);
    assert.ok(reply.interactive);
    assert.deepEqual(new Set(reply.presentation.blocks.filter((block) => block.type === 'buttons').flatMap((block) => block.buttons).map((button) => button.value)), new Set([
      `/orbita run ${first.runId}`,
      `/orbita run ${second.runId}`,
    ]));
    assert.ok(reply.text.includes(first.runId));
    assert.ok(reply.text.includes(second.runId));
    assert.doesNotMatch(reply.text, /\/orbita approve /);
    assert.doesNotMatch(reply.text, /\/orbita reject /);
    assert.doesNotMatch(reply.text, /\/orbita reply /);
  });
});

test('Orbita inbox text/buttons paginate with preserved limit and resurfaces selected pending run', async () => {
  await withRoot(async (root) => {
    const first = await registerApprovalRun(root, 'page-first');
    const second = await registerApprovalRun(root, 'page-second');

    const result = await runOrbita('inbox', { limit: '1' }, { pluginConfig: orbitaPluginConfig(root), ctx: { sessionKey: 'requester-a' } });

    assert.equal(result.workflow_runs.length, 1);
    assert.equal(result.workflow_runs_meta.total, 2);
    assert.equal(result.workflow_runs_meta.page, 1);
    assert.equal(result.workflow_runs_meta.has_next_page, true);
    assert.ok(buildNativeInboxPresentation(result));
    const visibleFirstPageRunId = result.workflow_runs[0].workflow_run_id;
    const replyText = formatNativeInboxReply(result).text;
    assert.doesNotMatch(replyText, /\/orbita approve /);
    assert.doesNotMatch(replyText, /\/orbita reject /);
    assert.doesNotMatch(replyText, /\/orbita reply /);
    assert.match(replyText, /Next: \/orbita inbox --limit 1 --page 2/);

    const nextPage = await runOrbita('inbox', { limit: '1', page: '2' }, { pluginConfig: orbitaPluginConfig(root), ctx: { sessionKey: 'requester-a' } });
    assert.ok(buildNativeInboxPresentation(nextPage));
    assert.equal(nextPage.workflow_runs.length, 1);
    const visibleSecondPageRunId = nextPage.workflow_runs[0].workflow_run_id;
    assert.notEqual(visibleSecondPageRunId, visibleFirstPageRunId);
    const nextReplyText = formatNativeInboxReply(nextPage).text;
    assert.doesNotMatch(nextReplyText, /\/orbita approve /);
    assert.doesNotMatch(nextReplyText, /\/orbita reject /);
    assert.doesNotMatch(nextReplyText, /\/orbita reply /);
    assert.match(nextReplyText, /Prev: \/orbita inbox --limit 1 --page 1/);

    const resurfaced = await runOrbita('run', { _positionals: [visibleFirstPageRunId] }, { pluginConfig: orbitaPluginConfig(root), ctx: { sessionKey: 'requester-a' } });
    assert.equal(resurfaced.message, 'workflow_run_waiting_for_user');
    assert.equal(resurfaced.workflow_run_id, visibleFirstPageRunId);
    assert.match(resurfaced.user_action_text, /Orbita ждёт approval/);
    assert.match(resurfaced.user_action_text, /Детали workflow скрыты/);
    assert.doesNotMatch(resurfaced.user_action_text, /Approve research page-(first|second)\?/);
  });
});


test('Orbita run <missingRunId> returns unavailable open-card result without creating lifecycle run', async () => {
  await withRoot(async (root) => {
    const missingRunId = `run-${process.pid}-missing-open-card`;

    const result = await runOrbita('run', { _positionals: [missingRunId] }, { pluginConfig: orbitaPluginConfig(root), ctx: { sessionKey: 'requester-a' } });

    assert.equal(result.ok, false);
    assert.equal(result.message, 'workflow_run_not_found');
    assert.equal(result.workflow_run_id, missingRunId);
    assert.match(result.text, /Run not found or unavailable/);
    assert.match(result.text, /Новый run не создан/);
    await assert.rejects(readFile(join(root, 'runs.json')), /ENOENT/);
  });
});

test('Orbita native run fallback stringifies safely when user_action_text and text are absent', () => {
  const rendered = formatNativeRunText({
    ok: true,
    workflow_run_id: 'run-native-fallback',
    artifact_path: '/Users/sergeygarin/Projects/skills/develop/.workflow-runs/run-native-fallback/research.md',
    omitted: undefined,
  });

  assert.match(rendered, /run-native-fallback/);
  assert.match(rendered, /\[redacted-path\]/);
  assert.doesNotMatch(rendered, /\/Users\/sergeygarin|develop\/.workflow-runs|research\.md/);
  assert.doesNotMatch(rendered, /omitted/);
});

test('Orbita run <runId> returns safe non-waiting card for completed and running workflow runs', async () => {
  await withRoot(async (root) => {
    const completed = await registerWorkflowRun({
      runsRoot: root,
      runId: `run-${process.pid}-completed-open-card`,
      title: 'completed workflow open card',
      workflowPath: TEST_SAMPLE_WORKFLOW,
      workflowIdentity: 'sample-workflow',
      status: 'done',
      requestId: 'orbita-completed-open-card-request',
    });
    const running = await registerWorkflowRun({
      runsRoot: root,
      runId: `run-${process.pid}-running-open-card`,
      title: 'running workflow open card',
      workflowPath: TEST_SAMPLE_WORKFLOW,
      workflowIdentity: 'sample-workflow',
      status: 'running',
      requestId: 'orbita-running-open-card-request',
      currentStep: 'research_draft',
    });

    for (const run of [completed, running]) {
      const result = await runOrbita('run', { _positionals: [run.runId] }, { pluginConfig: orbitaPluginConfig(root), ctx: { sessionKey: 'requester-a' } });

      assert.equal(result.ok, true);
      assert.equal(result.message, 'workflow_run_invoked_not_waiting');
      assert.equal(result.workflow_run_id, run.runId);
      assert.equal(result.workflow_run.status, run.runId === completed.runId ? 'done' : 'running');
      assert.match(result.user_action_text, /не ждёт ответа или approval/);
      assert.doesNotMatch(result.user_action_text, /Pending action:|Gate:|approve_research|research_draft/);
      assert.equal(Object.hasOwn(result.workflow_run, 'current_step'), false);
      assert.equal(Object.hasOwn(result.workflow_run, 'current_gate'), false);
      assert.equal(Object.hasOwn(result.workflow_run, 'host_actions'), false);
    }
  });
});

test('Orbita run <runId> treats terminal stale currentGate as non-waiting', async () => {
  await withRoot(async (root) => {
    for (const status of ['done', 'failed', 'blocked']) {
      const run = await registerWorkflowRun({
        runsRoot: root,
        runId: `run-${process.pid}-terminal-stale-${status}`,
        title: `terminal stale workflow ${status}`,
        workflowPath: TEST_SAMPLE_WORKFLOW,
        workflowIdentity: 'sample-workflow',
        status,
        requestId: `orbita-terminal-stale-${status}-request`,
        currentStep: 'approve_research',
        currentGate: 'approve_research',
      });
      const result = await runOrbita('run', { _positionals: [run.runId] }, { pluginConfig: orbitaPluginConfig(root), ctx: { sessionKey: 'requester-a' } });

      assert.equal(result.ok, true);
      assert.equal(result.message, 'workflow_run_invoked_not_waiting');
      assert.equal(result.workflow_run_id, run.runId);
      assert.equal(Object.hasOwn(result, 'user_action'), false);
      assert.equal(Object.hasOwn(result, 'mediaUrls'), false);
      assert.equal(Object.hasOwn(result, 'media_urls'), false);
      assert.match(result.user_action_text, /не ждёт ответа или approval/);
      assert.doesNotMatch(result.user_action_text, /\/orbita approve |\/orbita reject |\/orbita reply |approve_research/);
    }
  });
});

test('Orbita approve <runId> writes approval output and continues from current gate', async () => {
  await withRoot(async (root) => {
    const { runId } = await registerSampleRunAtApprovalGate(root, 'approve-command');
    const starts = [];

    const result = await runOrbita('approve', { _positionals: [runId] }, {
      pluginConfig: orbitaPluginConfig(root),
      ctx: { sessionKey: 'requester-a' },
      api: workflowDriverLaneStub(starts),
    });

    assert.equal(result.ok, true);
    assert.equal(result.mode, 'approve');
    assert.equal(result.workflow_run_id, runId);
    assert.equal(Object.hasOwn(result, 'pending_user_action_step'), false);
    assert.equal(Object.hasOwn(result, 'approval_step'), false);
    assert.equal(result.accepted, true);
    assert.match(result.text, /Workflow approved/);
    assert.equal(starts.length, 1);
    const indexed = (await readRunsIndex(root)).runs[runId];
    assert.equal(indexed.currentStep, 'architecture_draft');
    assert.equal(Object.hasOwn(indexed, 'currentGate'), false);
  });
});

test('Orbita reject <runId> reason writes rejected approval output and continues from current gate', async () => {
  await withRoot(async (root) => {
    const { runId } = await registerSampleRunAtApprovalGate(root, 'reject-command');
    const starts = [];

    const result = await runOrbita('reject', { _positionals: [runId, 'needs', 'more', 'evidence'] }, {
      pluginConfig: orbitaPluginConfig(root),
      ctx: { sessionKey: 'requester-a' },
      api: workflowDriverLaneStub(starts),
    });

    assert.equal(result.ok, true);
    assert.equal(result.mode, 'reject');
    assert.equal(result.workflow_run_id, runId);
    assert.equal(Object.hasOwn(result, 'pending_user_action_step'), false);
    assert.equal(Object.hasOwn(result, 'approval_step'), false);
    assert.equal(result.accepted, true);
    assert.match(result.text, /Workflow rejected/);
    assert.equal(starts.length, 1);
    const indexed = (await readRunsIndex(root)).runs[runId];
    assert.equal(indexed.currentStep, 'research_draft');
    assert.equal(Object.hasOwn(indexed, 'currentGate'), false);
  });
});

test('Orbita reply <runId> text supports approval-route replies without exposing gate internals', async () => {
  await withRoot(async (root) => {
    const { runId } = await registerSampleRunAtApprovalGate(root, 'reply-command');
    const starts = [];

    const result = await runOrbita('reply', { _positionals: [runId, 'LGTM'] }, {
      pluginConfig: orbitaPluginConfig(root),
      ctx: { sessionKey: 'requester-a' },
      api: workflowDriverLaneStub(starts),
    });

    assert.equal(result.ok, true);
    assert.equal(result.mode, 'reply');
    assert.equal(result.workflow_run_id, runId);
    assert.equal(Object.hasOwn(result, 'pending_user_action_step'), false);
    assert.equal(Object.hasOwn(result, 'approval_step'), false);
    assert.equal(result.accepted, true);
    assert.match(result.text, /Workflow answered/);
    assert.doesNotMatch(result.text, /Test-owned sample workflow approval fixture step|schema|baton|prompt/i);
    assert.equal(starts.length, 1);
    const indexed = (await readRunsIndex(root)).runs[runId];
    assert.equal(indexed.currentStep, 'architecture_draft');
    assert.equal(Object.hasOwn(indexed, 'currentGate'), false);
  });
});


test('Orbita run <runId> returns human-facing approval card with safe artifact attachments', async () => {
  await withRoot(async (root) => {
    const { runId } = await registerSampleRunAtApprovalGate(root, 'approval-card');
    let command;
    orbitaPlugin.register({
      pluginConfig: orbitaPluginConfig(root),
      registerCommand(definition) { command = definition; },
      registerTool() {},
      registerCli() {},
    });

    const result = await runOrbita('run', { _positionals: [runId] }, { pluginConfig: orbitaPluginConfig(root), ctx: { sessionKey: 'requester-a' } });
    const reply = await command.handler({ args: `run ${runId}`, sessionKey: 'requester-a' });

    assert.equal(result.message, 'workflow_run_waiting_for_user');
    assert.equal(Object.hasOwn(result, 'pending_user_action_step'), false);
    assert.equal(Object.hasOwn(result, 'approval_step'), false);
    assert.equal(Object.hasOwn(result, 'pending_gate'), false);
    assert.match(result.user_action_text, /Orbita ждёт approval/);
    assert.match(result.user_action_text, /Summary:/);
    assert.match(result.user_action_text, /Research ready\.|Research gate approved\.|Research packet/);
    assert.match(result.user_action_text, /Artifacts attached:/);
    assert.deepEqual(expectedCommandBlocks(result.user_action_text), [
      `/orbita approve ${runId}`,
      `/orbita reject ${runId} reason`,
      `/orbita reply ${runId} text`,
    ]);
    assert.ok(result.user_action_text.includes([
      'Expected answer:',
      '```text',
      `/orbita approve ${runId}`,
      '```',
      '```text',
      `/orbita reject ${runId} reason`,
      '```',
      '```text',
      `/orbita reply ${runId} text`,
      '```',
    ].join('\n')));
    assert.doesNotMatch(
      result.user_action_text,
      new RegExp(
        "```text\\n/orbita approve "
          + runId
          + "\\n/orbita reject "
          + runId
          + " reason\\n/orbita reply "
          + runId
          + " text\\n```",
      ),
    );
    assert.doesNotMatch(result.user_action_text, /Expected answer:\nКоманды:|• \/orbita approve|• \/orbita reject|• \/orbita reply/);
    assert.doesNotMatch(result.user_action_text, /Pending action:|Gate:|approve_research|Test-owned sample workflow approval fixture step|schema|baton|prompt|question-answer\.schema\.json/i);
    assert.equal(Object.hasOwn(result, 'mediaUrls'), false);
    assert.equal(Object.hasOwn(result, 'media_urls'), false);
    assert.equal(JSON.stringify(result).includes(root), false);
    assert.equal(result.user_action.artifact_attachments.length, 1);
    assert.equal(Object.hasOwn(result.user_action.artifact_attachments[0], 'path'), false);
    assert.ok(Object.keys(reply).includes('mediaUrls'));
    assert.equal(reply.mediaUrls.length, 1);
    assert.match(reply.mediaUrls[0], /research\.md$/);
    assert.equal(reply.trustedLocalMedia, true);
    assert.equal(Object.hasOwn(reply, 'presentation'), false);
    assert.equal(Object.hasOwn(reply, 'interactive'), false);
    assert.doesNotMatch(JSON.stringify(result), /reply_capture_available|natural_reply_supported|requester_ref|OpenClaw plugin API/);
    assert.doesNotMatch(JSON.stringify(reply), /\"buttons\"|reply_capture_available|natural_reply_supported|requester_ref|OpenClaw plugin API/);
  });
});

test('Orbita run <runId> attaches canonical baton artifacts with relative paths from aggregate and outputs', async () => {
  await withRoot(async (root) => {
    const { runId } = await registerSampleRunAtApprovalGate(root, 'canonical-baton-artifacts');
    const runDir = join(root, runId);
    const researchDir = join(runDir, 'research_draft', 'artifacts');
    const attackDir = join(runDir, 'research_attack', 'artifacts');
    await mkdir(attackDir, { recursive: true });
    await writeFile(join(researchDir, 'research-packet.md'), 'Research packet fixture.');
    await writeFile(join(attackDir, 'research-attack-verdict.md'), 'Research attack verdict fixture.');
    const baton = JSON.parse(await readFile(join(root, runId, 'baton.json'), 'utf8'));
    const researchArtifact = { id: 'research-packet', content_type: 'text/markdown', path: 'research_draft/artifacts/research-packet.md', summary: 'Research packet' };
    const attackArtifact = { id: 'research-attack-verdict', content_type: 'text/markdown', path: 'research_attack/artifacts/research-attack-verdict.md', summary: 'Research attack verdict' };
    baton.state.outputs.research_draft.artifacts = [researchArtifact];
    baton.state.outputs.research_attack.artifacts = [attackArtifact];
    baton.state.artifacts = [
      { producerStepId: 'research_draft', artifact: researchArtifact },
      { producerStepId: 'research_attack', artifact: attackArtifact },
    ];
    await writeCanonicalBaton(root, runId, baton);
    let command;
    orbitaPlugin.register({
      pluginConfig: orbitaPluginConfig(root),
      registerCommand(definition) { command = definition; },
      registerTool() {},
      registerCli() {},
    });

    const result = await runOrbita('run', { _positionals: [runId] }, { pluginConfig: orbitaPluginConfig(root), ctx: { sessionKey: 'requester-a' } });
    const reply = await command.handler({ args: `run ${runId}`, sessionKey: 'requester-a' });

    assert.equal(result.message, 'workflow_run_waiting_for_user');
    assert.equal(Object.hasOwn(result, 'mediaUrls'), false);
    assert.equal(Object.hasOwn(result, 'media_urls'), false);
    assert.equal(JSON.stringify(result).includes(root), false);
    assert.equal(result.user_action.artifact_attachments.length, 2);
    assert.deepEqual(result.user_action.artifact_attachments.map((artifact) => artifact.summary), ['Research packet', 'Research attack verdict']);
    assert.ok(Object.keys(reply).includes('mediaUrls'));
    assert.equal(reply.mediaUrls.length, 2);
    assert.match(reply.mediaUrls[0], /research-packet\.md$/);
    assert.match(reply.mediaUrls[1], /research-attack-verdict\.md$/);
    assert.equal(reply.trustedLocalMedia, true);
    assert.doesNotMatch(result.user_action_text, new RegExp(root.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.doesNotMatch(result.user_action_text, /research_draft\/artifacts|research_attack\/artifacts/);
  });
});

test('Orbita tool execute content stays path-clean while command delivery carries mediaUrls', async () => {
  await withRoot(async (root) => {
    const { runId } = await registerSampleRunAtApprovalGate(root, 'tool-path-clean');
    let command;
    let tool;
    orbitaPlugin.register({
      pluginConfig: orbitaPluginConfig(root),
      registerCommand(definition) { command = definition; },
      registerTool(definition) { tool = definition; },
      registerCli() {},
    });

    const toolReply = await tool.execute('test-tool-call', { mode: 'run', run: runId }, { sessionKey: 'requester-a' });
    const commandReply = await command.handler({ args: `run ${runId}`, sessionKey: 'requester-a' });
    const toolText = toolReply.content[0].text;

    assert.ok(Object.keys(commandReply).includes('mediaUrls'));
    assert.equal(commandReply.mediaUrls.length, 1);
    assert.match(commandReply.mediaUrls[0], /research\.md$/);
    assert.equal(Object.hasOwn(toolReply, 'mediaUrls'), false);
    assert.equal(Object.hasOwn(toolReply, 'media_urls'), false);
    assert.match(toolText, /workflow_run_waiting_for_user/);
    assert.match(toolText, /Research packet/);
    assert.doesNotMatch(toolText, new RegExp(root.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.doesNotMatch(toolText, /research_draft\/artifacts|research\.md/);
    assert.doesNotMatch(toolText, /mediaUrls|media_urls|"path"/);
  });
});

test('Orbita run card artifact fallback never prints absolute local artifact path', async () => {
  await withRoot(async (root) => {
    const { runId } = await registerSampleRunAtApprovalGate(root, 'artifact-path-fallback');
    const artifactDir = join(root, runId, 'research_draft', 'artifacts');
    const artifactPath = join(artifactDir, 'nameless.md');
    await writeFile(artifactPath, 'Nameless artifact fixture.');
    await writeCanonicalBaton(root, runId, approvalBaton({
      research_draft: {
        outcome: 'ready_for_attack',
        artifacts: [{ content_type: 'text/markdown', path: artifactPath }],
      },
    }));

    const result = await runOrbita('run', { _positionals: [runId] }, { pluginConfig: orbitaPluginConfig(root), ctx: { sessionKey: 'requester-a' } });

    assert.equal(Object.hasOwn(result, 'mediaUrls'), false);
    assert.equal(Object.hasOwn(result, 'media_urls'), false);
    assert.match(result.user_action_text, /Artifacts attached:\n• artifact 1/);
    assert.doesNotMatch(result.user_action_text, new RegExp(root.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.doesNotMatch(result.user_action_text, /nameless\.md/);
  });
});

test('Orbita run media attachments reject unsafe artifact paths', async () => {
  await withRoot(async (root) => {
    const { runId } = await registerSampleRunAtApprovalGate(root, 'artifact-safety');
    const runDir = join(root, runId);
    const safeDir = join(runDir, 'research_draft', 'artifacts');
    const hiddenDir = join(runDir, '.workflow-runner', 'instructions');
    const otherStepDir = join(runDir, 'other_step', 'artifacts');
    const nonArtifactPath = join(runDir, 'research_draft', 'plain.md');
    const outsideDir = await mkdtemp(join(tmpdir(), 'orbita-outside-artifact-'));
    await mkdir(otherStepDir, { recursive: true });
    await writeFile(join(hiddenDir, 'secret.md'), 'secret instructions');
    await writeFile(nonArtifactPath, 'plain file');
    await writeFile(join(otherStepDir, 'wrong-step.md'), 'wrong step');
    await writeFile(join(safeDir, 'safe.md'), 'safe artifact');
    await writeFile(join(outsideDir, 'outside.md'), 'outside file');
    await symlink(join(outsideDir, 'outside.md'), join(safeDir, 'outside-link.md'));
    const missingPath = join(safeDir, 'missing.md');

    try {
      await writeCanonicalBaton(root, runId, approvalBaton({
        research_draft: {
          outcome: 'ready_for_attack',
          artifacts: [
            { id: 'safe', content_type: 'text/markdown', path: join(safeDir, 'safe.md'), summary: 'Safe artifact' },
            { id: 'internal', content_type: 'text/markdown', path: join(hiddenDir, 'secret.md'), summary: 'Internal instructions' },
            { id: 'plain', content_type: 'text/markdown', path: nonArtifactPath, summary: 'Plain file' },
            { id: 'wrong-step', content_type: 'text/markdown', path: join(otherStepDir, 'wrong-step.md'), summary: 'Wrong step' },
            { id: 'symlink', content_type: 'text/markdown', path: join(safeDir, 'outside-link.md'), summary: 'Symlink' },
            { id: 'missing', content_type: 'text/markdown', path: missingPath, summary: 'Missing' },
            { id: 'directory', content_type: 'text/markdown', path: safeDir, summary: 'Directory' },
          ],
        },
      }));

      const result = await runOrbita('run', { _positionals: [runId] }, { pluginConfig: orbitaPluginConfig(root), ctx: { sessionKey: 'requester-a' } });

      assert.equal(Object.hasOwn(result, 'mediaUrls'), false);
      assert.equal(Object.hasOwn(result, 'media_urls'), false);
      assert.equal(JSON.stringify(result).includes(safeDir), false);
      assert.match(result.user_action_text, /Safe artifact/);
      assert.doesNotMatch(result.user_action_text, /Internal instructions|Plain file|Wrong step|Symlink|Missing|Directory/);
    } finally {
      await rm(outsideDir, { recursive: true, force: true });
    }
  });
});

test('Orbita command handler returns native inbox text with open-card button', async () => {
  await withRoot(async (root) => {
    const run = await registerApprovalRun(root, 'handler');
    let command;
    orbitaPlugin.register({
      pluginConfig: orbitaPluginConfig(root),
      registerCommand(definition) { command = definition; },
      registerTool() {},
      registerCli() {},
    });

    const reply = await command.handler({ args: 'inbox --limit 1', sessionKey: 'requester-a' });

    assert.equal(command.name, 'orbita');
    assert.ok(reply.presentation);
    assert.ok(reply.interactive);
    assert.deepEqual(reply.presentation.blocks.filter((block) => block.type === 'buttons').flatMap((block) => block.buttons).map((button) => button.value), [`/orbita run ${run.runId}`]);
    assert.match(reply.text, new RegExp(run.runId));
    assert.doesNotMatch(reply.text, /\/orbita approve /);
    assert.doesNotMatch(reply.text, /\/orbita reject /);
    assert.doesNotMatch(reply.text, /\/orbita reply /);
  });
});

test('Orbita run resurfaces baton pending action from canonical state', async () => {
  await withRoot(async (root) => {
    const run = await registerIndexGateRun(root, 'missing');

    const result = await runOrbita('run', { _positionals: [run.runId] }, { pluginConfig: orbitaPluginConfig(root), ctx: { sessionKey: 'requester-a' } });

    assert.equal(result.message, 'workflow_run_waiting_for_user');
    assert.equal(result.workflow_run_id, run.runId);
    assert.equal(Object.hasOwn(result, 'pending_user_action_step'), false);
    assert.equal(Object.hasOwn(result, 'approval_step'), false);
    assert.equal(Object.hasOwn(result, 'pending_gate'), false);
    assert.equal(result.user_action.degraded, false);
    assert.equal(Object.hasOwn(result.user_action, 'degraded_reason'), false);
    assert.match(result.user_action_text, /Orbita ждёт approval/);
    assert.match(result.user_action_text, /degraded approval workflow missing/);
    assert.doesNotMatch(result.user_action_text, /Pending action:|Gate:|approve_research/);
    assert.match(result.user_action_text, /Детали workflow скрыты/);
    assert.doesNotMatch(result.user_action_text, /Approve degraded research missing\?/);
    assert.notEqual(result.message, 'workflow_run_invoked_not_waiting');
  });
});

test('Orbita command handler resurfaces baton pending action from canonical state', async () => {
  await withRoot(async (root) => {
    const run = await registerIndexGateRun(root, 'handler');
    let command;
    orbitaPlugin.register({
      pluginConfig: orbitaPluginConfig(root),
      registerCommand(definition) { command = definition; },
      registerTool() {},
      registerCli() {},
    });

    const reply = await command.handler({ args: `run ${run.runId}`, sessionKey: 'requester-a' });

    assert.match(reply.text, /Orbita ждёт approval/);
    assert.match(reply.text, new RegExp(run.runId));
    assert.match(reply.text, /degraded approval workflow handler/);
    assert.doesNotMatch(reply.text, /Pending action:|Gate:|approve_research/);
    assert.match(reply.text, /Детали workflow скрыты/);
    assert.doesNotMatch(reply.text, /Approve degraded research handler\?/);
    assert.doesNotMatch(reply.text, /не ждёт ответа или approval/);
  });
});

test('Orbita run media attachments ignore spoofed producer_step_id in step outputs', async () => {
  await withRoot(async (root) => {
    const { runId } = await registerSampleRunAtApprovalGate(root, 'artifact-step-spoof');
    const runDir = join(root, runId);
    const safeDir = join(runDir, 'research_draft', 'artifacts');
    const otherStepDir = join(runDir, 'other_step', 'artifacts');
    await mkdir(otherStepDir, { recursive: true });
    await writeFile(join(safeDir, 'safe.md'), 'safe artifact');
    await writeFile(join(otherStepDir, 'spoofed.md'), 'spoofed artifact');

    await writeCanonicalBaton(root, runId, approvalBaton({
      research_draft: {
        outcome: 'ready_for_attack',
        artifacts: [
          { id: 'safe', content_type: 'text/markdown', path: join(safeDir, 'safe.md'), summary: 'Safe artifact' },
          { id: 'spoofed', producer_step_id: 'other_step', content_type: 'text/markdown', path: join(otherStepDir, 'spoofed.md'), summary: 'Spoofed artifact' },
        ],
      },
    }));

    const result = await runOrbita('run', { _positionals: [runId] }, { pluginConfig: orbitaPluginConfig(root), ctx: { sessionKey: 'requester-a' } });

    assert.equal(Object.hasOwn(result, 'mediaUrls'), false);
    assert.equal(Object.hasOwn(result, 'media_urls'), false);
    assert.equal(JSON.stringify(result).includes(safeDir), false);
    assert.match(result.user_action_text, /Safe artifact/);
    assert.doesNotMatch(result.user_action_text, /Spoofed artifact/);
  });
});

test('Orbita run media attachments reject aggregate artifacts with wrong trusted producer step', async () => {
  await withRoot(async (root) => {
    const { runId } = await registerSampleRunAtApprovalGate(root, 'artifact-aggregate-spoof');
    const runDir = join(root, runId);
    const safeDir = join(runDir, 'research_draft', 'artifacts');
    const otherStepDir = join(runDir, 'other_step', 'artifacts');
    await mkdir(otherStepDir, { recursive: true });
    await writeFile(join(safeDir, 'safe.md'), 'safe aggregate artifact');
    await writeFile(join(otherStepDir, 'spoofed.md'), 'spoofed aggregate artifact');

    await writeCanonicalBaton(root, runId, {
      cursor: 'approve_research',
      status: 'running',
      state: {
        outputs: {},
        artifacts: [
          { producerStepId: 'research_draft', artifact: { id: 'safe', content_type: 'text/markdown', path: join(safeDir, 'safe.md'), summary: 'Safe aggregate artifact' } },
          { producerStepId: 'research_draft', artifact: { id: 'spoofed', content_type: 'text/markdown', path: join(otherStepDir, 'spoofed.md'), summary: 'Spoofed aggregate artifact' } },
        ],
        results: [],
      },
    });

    const result = await runOrbita('run', { _positionals: [runId] }, { pluginConfig: orbitaPluginConfig(root), ctx: { sessionKey: 'requester-a' } });

    assert.equal(Object.hasOwn(result, 'mediaUrls'), false);
    assert.equal(Object.hasOwn(result, 'media_urls'), false);
    assert.equal(JSON.stringify(result).includes(safeDir), false);
    assert.match(result.user_action_text, /Safe aggregate artifact/);
    assert.doesNotMatch(result.user_action_text, /Spoofed aggregate artifact/);
  });
});

test('Orbita run fails closed for malformed aggregate artifacts without trusted producer step', async () => {
  await withRoot(async (root) => {
    const { runId } = await registerSampleRunAtApprovalGate(root, 'artifact-aggregate-missing-producer');
    const runDir = join(root, runId);
    const safeDir = join(runDir, 'research_draft', 'artifacts');
    await writeFile(join(safeDir, 'ambiguous.md'), 'ambiguous aggregate artifact');

    await writeCanonicalBaton(root, runId, {
      cursor: 'approve_research',
      status: 'running',
      state: {
        outputs: {},
        artifacts: [
          { artifact: { id: 'ambiguous', content_type: 'text/markdown', path: join(safeDir, 'ambiguous.md'), summary: 'Ambiguous aggregate artifact' } },
        ],
        results: [],
      },
    });

    const result = await runOrbita('run', { _positionals: [runId] }, { pluginConfig: orbitaPluginConfig(root), ctx: { sessionKey: 'requester-a' } });

    assert.equal(result.message, 'workflow_run_invoked_not_waiting');
    assert.equal(result.mediaUrls, undefined);
    assert.doesNotMatch(String(result.text ?? ''), /Ambiguous aggregate artifact/);
  });
});

test('Orbita degraded worker-only needs_host_actions with currentStep only is not pending user action', async () => {
  await withRoot(async (root) => {
    const run = await registerWorkflowRun({
      runsRoot: root,
      runId: `run-${process.pid}-worker-only-degraded`,
      title: 'worker-only degraded workflow',
      workflowPath: TEST_SAMPLE_WORKFLOW,
      workflowIdentity: 'sample-workflow',
      status: 'needs_host_actions',
      requestId: 'orbita-worker-only-degraded-request',
      currentStep: 'research_draft',
    });

    const inbox = await runOrbita('inbox', { limit: '10' }, { pluginConfig: orbitaPluginConfig(root), ctx: { sessionKey: 'requester-a' } });
    const opened = await runOrbita('run', { _positionals: [run.runId] }, { pluginConfig: orbitaPluginConfig(root), ctx: { sessionKey: 'requester-a' } });

    assert.equal(inbox.workflow_runs.some((item) => item.workflow_run_id === run.runId), false);
    assert.equal(opened.message, 'workflow_run_invoked_not_waiting');
    assert.equal(Object.hasOwn(opened, 'user_action'), false);
    assert.equal(Object.hasOwn(opened, 'mediaUrls'), false);
    assert.match(opened.user_action_text, /не ждёт ответа или approval/);
    assert.doesNotMatch(opened.user_action_text, /\/orbita reply /);
  });
});

test('Orbita worker-only canonical state overrides stale currentGate and does not fabricate reply card', async () => {
  await withRoot(async (root) => {
    const run = await registerWorkflowRun({
      runsRoot: root,
      runId: `run-${process.pid}-worker-only-stale-gate`,
      title: 'worker-only stale gate workflow',
      workflowPath: TEST_SAMPLE_WORKFLOW,
      workflowIdentity: 'sample-workflow',
      status: 'needs_host_actions',
      requestId: 'orbita-worker-only-stale-gate-request',
      currentStep: 'research_draft',
      currentGate: 'approve_research',
    });
    await writeCanonicalBaton(root, run.runId, { cursor: 'research_draft', status: 'running', state: { artifacts: [], results: [] } });

    const inbox = await runOrbita('inbox', { limit: '10' }, { pluginConfig: orbitaPluginConfig(root), ctx: { sessionKey: 'requester-a' } });
    const opened = await runOrbita('run', { _positionals: [run.runId] }, { pluginConfig: orbitaPluginConfig(root), ctx: { sessionKey: 'requester-a' } });

    assert.equal(inbox.workflow_runs.some((item) => item.workflow_run_id === run.runId), false);
    assert.equal(opened.message, 'workflow_run_invoked_not_waiting');
    assert.equal(Object.hasOwn(opened, 'user_action'), false);
    assert.equal(Object.hasOwn(opened, 'mediaUrls'), false);
    assert.match(opened.user_action_text, /не ждёт ответа или approval/);
    assert.doesNotMatch(JSON.stringify(opened), /approve_research|\/orbita reply |workflow_run_waiting_for_user/);
  });
});
