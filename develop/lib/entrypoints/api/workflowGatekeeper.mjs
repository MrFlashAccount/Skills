import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { access, mkdir, open, readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { assertSafeRunId, resolveRunPaths, workflowRunsRoot } from '../../persistence/run-state/paths.mjs';
import { createManagedDirectory, writeJsonAtomic, writeTextAtomic } from '../../persistence/run-state/atomic-file.mjs';
import { withRunStateLock } from '../../persistence/run-state/lock.mjs';
import { publicErrorMessage } from '../cli/public-error.mjs';

const SCHEMA_VERSION = 1;
const TERMINAL_STATES = new Set(['completed', 'failed', 'cancelled']);
const SAFE_GATE_ID = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/;
const DELIVERY_GAP = {
  status: 'runtime_gap',
  delivered: false,
  requires_parent_delivery: true,
  reason: 'same-session OpenClaw delivery/injection is unavailable from Skills entrypoint',
};

function generatedId(prefix) {
  return assertSafeRunId(`${prefix}-${randomUUID()}`);
}

function assertSafeGateId(gateId) {
  if (typeof gateId !== 'string' || gateId.length === 0) throw new Error('gate_id is required');
  if (!SAFE_GATE_ID.test(gateId) || gateId === '.' || gateId === '..' || gateId.includes('/') || gateId.includes('\\')) {
    throw new Error(`invalid gate_id: ${gateId}`);
  }
  return gateId;
}

function iso(now) {
  return (now instanceof Date ? now : new Date(now)).toISOString();
}

async function exists(pathname) {
  try { await access(pathname, constants.F_OK); return true; } catch { return false; }
}

function pathsFor({ workflowId, runsRoot = workflowRunsRoot }) {
  const runPaths = resolveRunPaths({ runId: workflowId, runsRoot });
  const gatekeeperDir = join(runPaths.runDir, '.workflow-gatekeeper');
  return {
    ...runPaths,
    gatekeeperDir,
    workflowStatePath: join(gatekeeperDir, 'workflow.json'),
    eventsPath: join(gatekeeperDir, 'events.jsonl'),
    gatesDir: join(gatekeeperDir, 'gates'),
    artifactsDir: join(gatekeeperDir, 'artifacts'),
  };
}

function gatePath(paths, gateId) {
  return join(paths.gatesDir, `${assertSafeGateId(gateId)}.json`);
}

function gateArtifactPath(paths, gateId) {
  return join(paths.artifactsDir, `gate-${assertSafeGateId(gateId)}.md`);
}

function resumeArtifactPath(paths, gateId) {
  return join(paths.artifactsDir, `resume-${assertSafeGateId(gateId)}.json`);
}

async function readJson(pathname, name) {
  let content;
  try { content = await readFile(pathname, 'utf8'); }
  catch (error) {
    const code = typeof error?.code === 'string' ? `: ${error.code}` : '';
    throw new Error(`cannot read ${name}${code}`);
  }
  try { return JSON.parse(content); }
  catch (error) { throw new Error(`cannot parse ${name}: ${error.message}`); }
}

async function readWorkflow(paths) {
  return readJson(paths.workflowStatePath, 'workflow gatekeeper state');
}

async function readGate(paths, gateId) {
  return readJson(gatePath(paths, gateId), 'workflow gate');
}

async function appendEvent(paths, event) {
  await createManagedDirectory(paths.gatekeeperDir, 'workflow gatekeeper directory');
  const handle = await open(paths.eventsPath, 'a', 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(event)}\n`, 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function ensureGatekeeperDirs(paths) {
  await createManagedDirectory(paths.gatekeeperDir, 'workflow gatekeeper directory');
  await createManagedDirectory(paths.gatesDir, 'workflow gatekeeper gates directory');
  await createManagedDirectory(paths.artifactsDir, 'workflow gatekeeper artifacts directory');
}

function publicWorkflow(workflow) {
  return structuredClone(workflow);
}

function compactWorkflow(workflow) {
  return {
    workflow_id: workflow.workflow_id,
    kind: workflow.kind,
    state: workflow.state,
    session_key: workflow.session_key,
    current_gate_id: workflow.current_gate_id,
    delivery: workflow.delivery,
    created_at: workflow.created_at,
    updated_at: workflow.updated_at,
    revision: workflow.revision,
  };
}

function canonicalAnswer(answer) {
  if (answer === undefined || answer === null) throw new Error('answer is required');
  return typeof answer === 'string' ? answer : JSON.stringify(answer);
}

function isExpired(expiresAt, now) {
  if (!expiresAt) return false;
  const deadline = new Date(expiresAt);
  if (Number.isNaN(deadline.getTime())) throw new Error(`invalid expires_at: ${expiresAt}`);
  return deadline.getTime() <= now.getTime();
}

function gateMarkdown(gate) {
  const lines = [`# Workflow gate ${gate.gate_id}`, '', gate.human_text, ''];
  if (gate.choices?.length) lines.push('## Choices', ...gate.choices.map((choice) => `- ${choice}`), '');
  if (gate.approval_tokens?.length) lines.push('## Approval tokens', ...gate.approval_tokens.map((token) => `- ${token}`), '');
  if (gate.expires_at) lines.push(`Expires at: ${gate.expires_at}`, '');
  lines.push('## Resume instruction', gate.resume_instruction, '');
  return lines.join('\n');
}

function publicApiError(error, options = {}) {
  const redacted = new Error(publicErrorMessage(error?.message ?? error, options));
  if (error?.code) redacted.code = error.code;
  return redacted;
}

async function publicApiCall(callback, options = {}) {
  try { return await callback(); }
  catch (error) { throw publicApiError(error, options); }
}

async function createFileExclusive(pathname, content) {
  const handle = await open(pathname, 'wx', 0o600);
  try {
    await handle.writeFile(content, 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function writeJsonExclusive(pathname, value) {
  await mkdir(dirname(pathname), { recursive: true });
  await createFileExclusive(pathname, `${JSON.stringify(value, null, 2)}\n`);
}

async function startInternal({ workflowId, kind = 'generic', sessionKey, goal, runsRoot, now = new Date() } = {}) {
  const safeWorkflowId = workflowId === undefined ? generatedId('workflow') : assertSafeRunId(workflowId);
  const paths = pathsFor({ workflowId: safeWorkflowId, runsRoot });
  return withRunStateLock(paths, async () => {
    await ensureGatekeeperDirs(paths);
    if (await exists(paths.workflowStatePath)) throw new Error(`workflow already exists: ${safeWorkflowId}`);
    const timestamp = iso(now);
    const workflow = {
      schema_version: SCHEMA_VERSION,
      workflow_id: safeWorkflowId,
      kind,
      state: 'running',
      session_key: sessionKey,
      goal,
      current_gate_id: null,
      delivery: null,
      created_at: timestamp,
      updated_at: timestamp,
      revision: 1,
      events: [{ type: 'started', at: timestamp }],
    };
    for (const key of Object.keys(workflow)) if (workflow[key] === undefined) delete workflow[key];
    await writeJsonExclusive(paths.workflowStatePath, workflow);
    await appendEvent(paths, { type: 'started', at: timestamp, workflow_id: safeWorkflowId, kind, session_key: sessionKey });
    return { ok: true, workflow: publicWorkflow(workflow), state_path: paths.workflowStatePath };
  });
}

async function loadExistingWorkflow(workflowId, runsRoot) {
  const safeWorkflowId = assertSafeRunId(workflowId);
  const paths = pathsFor({ workflowId: safeWorkflowId, runsRoot });
  if (!await exists(paths.workflowStatePath)) throw new Error(`unknown workflow: ${safeWorkflowId}`);
  return { paths, workflow: await readWorkflow(paths) };
}

async function updateWorkflow(paths, workflow, patch, event, now) {
  const timestamp = iso(now);
  const next = {
    ...workflow,
    ...patch,
    updated_at: timestamp,
    revision: (workflow.revision ?? 0) + 1,
    events: [...(workflow.events ?? []), event ? { ...event, at: timestamp } : { type: 'updated', at: timestamp }],
  };
  await writeJsonAtomic(paths.workflowStatePath, next);
  await appendEvent(paths, { ...(event ?? { type: 'updated' }), at: timestamp, workflow_id: workflow.workflow_id, revision: next.revision });
  return next;
}

async function gateInternal({ workflowId, gateId, gateKind = 'approval', humanText, resumeInstruction, choices, approvalTokens, expiresAt, runsRoot, now = new Date() } = {}) {
  if (typeof humanText !== 'string' || humanText.trim().length === 0) throw new Error('human_text is required');
  if (typeof resumeInstruction !== 'string' || resumeInstruction.trim().length === 0) throw new Error('resume_instruction is required');
  const safeGateId = gateId === undefined ? assertSafeGateId(`gate-${randomUUID()}`) : assertSafeGateId(gateId);
  const { paths } = await loadExistingWorkflow(workflowId, runsRoot);
  return withRunStateLock(paths, async () => {
    const workflow = await readWorkflow(paths);
    if (TERMINAL_STATES.has(workflow.state)) throw new Error(`workflow is terminal: ${workflow.workflow_id}`);
    if (await exists(gatePath(paths, safeGateId))) throw new Error(`workflow gate already exists: ${safeGateId}`);
    const timestamp = iso(now);
    const gate = {
      schema_version: SCHEMA_VERSION,
      workflow_id: workflow.workflow_id,
      gate_id: safeGateId,
      gate_kind: gateKind,
      state: 'waiting_human',
      human_text: humanText,
      resume_instruction: resumeInstruction,
      choices: choices ?? [],
      approval_tokens: approvalTokens ?? [],
      expires_at: expiresAt,
      delivery: { ...DELIVERY_GAP, updated_at: timestamp },
      created_at: timestamp,
      updated_at: timestamp,
      revision: 1,
    };
    if (expiresAt !== undefined && Number.isNaN(new Date(expiresAt).getTime())) throw new Error(`invalid expires_at: ${expiresAt}`);
    await writeJsonExclusive(gatePath(paths, safeGateId), gate);
    await writeTextAtomic(gateArtifactPath(paths, safeGateId), gateMarkdown(gate));
    const next = await updateWorkflow(paths, workflow, {
      state: 'waiting_human',
      current_gate_id: safeGateId,
      delivery: gate.delivery,
    }, { type: 'gate_created', gate_id: safeGateId, delivery: gate.delivery }, now);
    return { ok: true, workflow: compactWorkflow(next), gate, delivery: gate.delivery, gate_artifact_path: gateArtifactPath(paths, safeGateId) };
  });
}

async function statusInternal({ workflowId, runsRoot } = {}) {
  const { paths, workflow } = await loadExistingWorkflow(workflowId, runsRoot);
  const current_gate = workflow.current_gate_id ? await readGate(paths, workflow.current_gate_id) : null;
  return { ok: true, workflow: publicWorkflow(workflow), current_gate };
}

async function listInternal({ state, kind, sessionKey, limit = 50, runsRoot = workflowRunsRoot } = {}) {
  const root = runsRoot;
  await createManagedDirectory(root, 'workflow runs root');
  const entries = await readdir(root, { withFileTypes: true }).catch((error) => {
    if (error?.code === 'ENOENT') return [];
    throw error;
  });
  const workflows = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    try {
      const safeWorkflowId = assertSafeRunId(entry.name);
      const paths = pathsFor({ workflowId: safeWorkflowId, runsRoot: root });
      if (!await exists(paths.workflowStatePath)) continue;
      const workflow = await readWorkflow(paths);
      if (state && workflow.state !== state) continue;
      if (kind && workflow.kind !== kind) continue;
      if (sessionKey && workflow.session_key !== sessionKey) continue;
      workflows.push(compactWorkflow(workflow));
    } catch {}
  }
  workflows.sort((left, right) => String(right.updated_at ?? '').localeCompare(String(left.updated_at ?? '')) || left.workflow_id.localeCompare(right.workflow_id));
  return { ok: true, workflows: workflows.slice(0, Number(limit) || 50) };
}

async function resumeInternal({ workflowId, gateId, answer, runsRoot, now = new Date() } = {}) {
  const canonical = canonicalAnswer(answer);
  const { paths } = await loadExistingWorkflow(workflowId, runsRoot);
  return withRunStateLock(paths, async () => {
    const workflow = await readWorkflow(paths);
    const safeGateId = gateId === undefined ? workflow.current_gate_id : assertSafeGateId(gateId);
    if (!safeGateId) throw new Error('gate_id is required');
    const resumePath = resumeArtifactPath(paths, safeGateId);
    if (await exists(resumePath)) {
      const gate = await readGate(paths, safeGateId);
      const existing = await readJson(resumePath, 'workflow gate resume');
      if (existing.answer_canonical === canonical) {
        return { ok: true, idempotent: true, workflow: compactWorkflow(workflow), gate, resume: existing, delivery: { ...DELIVERY_GAP, updated_at: existing.created_at } };
      }
      throw new Error(`workflow gate already resumed with a different answer: ${safeGateId}`);
    }
    if (workflow.current_gate_id !== safeGateId || workflow.state !== 'waiting_human') throw new Error(`stale workflow gate resume: ${safeGateId}`);
    const gate = await readGate(paths, safeGateId);
    if (gate.state !== 'waiting_human') throw new Error(`stale workflow gate resume: ${safeGateId}`);
    if (isExpired(gate.expires_at, now)) throw new Error(`workflow gate expired: ${safeGateId}`);
    const timestamp = iso(now);
    const resume = {
      schema_version: SCHEMA_VERSION,
      workflow_id: workflow.workflow_id,
      gate_id: safeGateId,
      answer,
      answer_canonical: canonical,
      resume_instruction: gate.resume_instruction,
      staged_reply: `${gate.resume_instruction}\n\nHuman answer:\n${canonical}`,
      continuation: { ...DELIVERY_GAP, updated_at: timestamp },
      created_at: timestamp,
    };
    await writeJsonExclusive(resumePath, resume);
    const nextGate = { ...gate, state: 'resumed', resumed_at: timestamp, updated_at: timestamp, revision: (gate.revision ?? 0) + 1 };
    await writeJsonAtomic(gatePath(paths, safeGateId), nextGate);
    const next = await updateWorkflow(paths, workflow, {
      state: 'resuming',
      current_gate_id: safeGateId,
      delivery: resume.continuation,
    }, { type: 'gate_resumed', gate_id: safeGateId, delivery: resume.continuation }, now);
    return { ok: true, idempotent: false, workflow: compactWorkflow(next), gate: nextGate, resume, delivery: resume.continuation, resume_artifact_path: resumePath };
  });
}

async function cancelInternal({ workflowId, reason, runsRoot, now = new Date() } = {}) {
  const { paths } = await loadExistingWorkflow(workflowId, runsRoot);
  return withRunStateLock(paths, async () => {
    const workflow = await readWorkflow(paths);
    if (TERMINAL_STATES.has(workflow.state)) return { ok: true, idempotent: true, workflow: compactWorkflow(workflow) };
    const next = await updateWorkflow(paths, workflow, { state: 'cancelled', cancel_reason: reason }, { type: 'cancelled', reason }, now);
    return { ok: true, idempotent: false, workflow: compactWorkflow(next) };
  });
}

export async function startWorkflowGatekeeper(options = {}) {
  return publicApiCall(() => startInternal(options), { runsRoot: options.runsRoot });
}

export async function gateWorkflow(options = {}) {
  return publicApiCall(() => gateInternal(options), { runsRoot: options.runsRoot });
}

export async function statusWorkflowGatekeeper(options = {}) {
  return publicApiCall(() => statusInternal(options), { runsRoot: options.runsRoot });
}

export async function listWorkflowGatekeepers(options = {}) {
  return publicApiCall(() => listInternal(options), { runsRoot: options.runsRoot });
}

export async function resumeWorkflowGatekeeper(options = {}) {
  return publicApiCall(() => resumeInternal(options), { runsRoot: options.runsRoot });
}

export async function cancelWorkflowGatekeeper(options = {}) {
  return publicApiCall(() => cancelInternal(options), { runsRoot: options.runsRoot });
}
