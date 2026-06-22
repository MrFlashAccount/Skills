import { mkdir, readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { isAbsolute, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { next, writeOutput, continueRun, loadInstructions } from '../api/workflowRunner.mjs';
import { listWorkflowRuns, registerWorkflowRun, heartbeatWorkflowRun, claimWorkflowRun } from '../api/workflowRuns.mjs';
import { formatWorkflowRunBlock, safePublicRequestId as safeNativePublicRequestId, safeWorkflowRunTitle } from './nativePresentation.mjs';
import { buildOrbitaRelayMessage, sendGatewayRequesterSessionMessage } from './gatewaySessionRelay.mjs';
import { pendingUserActionText, safeArtifactAttachments } from './pendingActionCard.mjs';
import { Baton } from '../../entities/Baton/index.mjs';
import { assertBatonSchema } from '../../entities/Baton/schema/baton-schema.mjs';
import { resolveRunPaths, workflowRunsRoot as defaultWorkflowRunsRoot } from '../../persistence/run-state/paths.mjs';
import { readRunsIndex, runsIndexPathsForRoot, updateRunIndexEntry } from '../../persistence/run-state/run-index.mjs';
import { safeTokenHashMatches } from '../../persistence/run-state/lease-authority.mjs';

const PLUGIN_ID = 'orbita';
const SESSION_LEASE_NAMESPACE = 'workflowLeases';
const REPO_ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const MAX_SUBAGENT_RESPONSE_CHARS = 200_000;
const MAX_PUBLIC_SUMMARY_CHARS = 160;
const MAX_RUN_TITLE_TASK_CHARS = 80;
const DEFAULT_LEASE_MS = 30 * 60 * 1000;
const WORKFLOW_SUBAGENT_WAIT_TIMEOUT_MS = 20 * 60 * 1000;
const deliveredWorkflowNotifications = new Set();
const activeWorkflowNotifications = new Set();

const PUBLIC_ERROR_MESSAGES = new Map([
  ['workflow_failed', 'Workflow failed before a safe result was available.'],
  ['workflow_lease_persistence_failed', 'Workflow lease could not be persisted to the current session.'],
  ['runtime_subagent_unavailable', 'Workflow runtime subagent API is unavailable.'],
  ['runtime_subagent_run_failed', 'Workflow worker run did not complete successfully.'],
  ['runtime_subagent_run_error', 'Workflow worker run failed.'],
  ['runtime_subagent_run_timeout', 'Workflow worker run timed out.'],
  ['runtime_subagent_run_cancelled', 'Workflow worker run was cancelled.'],
  ['unsupported_workflow_path', 'Unsupported workflow path. Use a relative workflow JSON path without parent traversal.'],
  ['unsupported_workflow_host_action', 'Workflow requested an unsupported host action.'],
  ['runtime_subagent_output_unavailable', 'Workflow worker finished without a readable JSON output.'],
  ['runtime_subagent_output_invalid', 'Workflow worker returned invalid JSON output.'],
]);

const SAFE_REQUEST_ID_PATTERN = /^orbita-[a-z0-9][a-z0-9-]{0,95}$/;
const SAFE_FAILURE_IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:@-]{0,255}$/;
const PROMPT_TRANSCRIPT_MARKER_PATTERN = /<{2,}\s*(?:begin|end)?[-_\s]*(?:prompt|transcript)[^>]*>{2,}|(?:prompt|transcript)/iu;
const TOKEN_LABEL_PATTERN = /\b(?:lease[-_\s]?token|token|access[-_\s]?token|refresh[-_\s]?token|api[-_\s]?key|secret)\b/iu;
const PREFIXED_TOKEN_PATTERN = /\b(?:sk|ghp|github_pat|xox[baprs]|ya29|glpat|oc_[A-Za-z0-9]*)[_-][A-Za-z0-9_=-]{12,}\b/iu;
const JWT_PATTERN = /^[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}$/u;
const OPAQUE_TOKEN_PATTERN = /^[A-Za-z0-9_=]{40,}$/u;

function generatedRequestId() {
  return `orbita-${randomUUID()}`;
}

function compactRequestId(requestId) {
  if (typeof requestId !== 'string') return generatedRequestId();
  const normalized = requestId.trim().toLowerCase();
  return SAFE_REQUEST_ID_PATTERN.test(normalized) ? normalized : generatedRequestId();
}

function safePublicRequestId(requestId) {
  if (typeof requestId !== 'string') return undefined;
  const normalized = requestId.trim().toLowerCase();
  return SAFE_REQUEST_ID_PATTERN.test(normalized) ? normalized : undefined;
}

function safeWorkflowIdentity(value) {
  return safeFailureIdentifier(value) || 'workflow';
}

function safeFailureIdentifier(value) {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (trimmed.includes('/') || trimmed.includes('\\')) return '[redacted]';
  if (PROMPT_TRANSCRIPT_MARKER_PATTERN.test(trimmed)) return '[redacted]';
  if (TOKEN_LABEL_PATTERN.test(trimmed) || PREFIXED_TOKEN_PATTERN.test(trimmed) || JWT_PATTERN.test(trimmed) || OPAQUE_TOKEN_PATTERN.test(trimmed)) return '[redacted]';
  return SAFE_FAILURE_IDENTIFIER_PATTERN.test(trimmed) ? trimmed : '[redacted]';
}

function workflowErrorCode(error) {
  const code = String(error?.message ?? '').trim();
  return PUBLIC_ERROR_MESSAGES.has(code) ? code : 'workflow_failed';
}

function failureMetadata(error, { requestId, workflowRunId, stepId, sessionKey, runtimeRunId } = {}) {
  const errorCode = workflowErrorCode(error);
  return {
    request_id: compactRequestId(requestId),
    error_code: errorCode,
    failure_code: errorCode,
    workflow_run_id: safeFailureIdentifier(workflowRunId),
    failed_step_id: safeFailureIdentifier(stepId),
    failed_session_key: safeFailureIdentifier(sessionKey),
    runtime_run_id: safeFailureIdentifier(runtimeRunId ?? error?.runtimeRunId),
  };
}

function waitForRunErrorCode(result) {
  if (result === undefined || result === null) return undefined;
  if (result === true) return undefined;
  const status = typeof result === 'string' ? result : result?.status;
  if (status === undefined || status === null) return undefined;
  const normalized = String(status).trim().toLowerCase();
  if (!normalized || ['ok', 'done', 'completed', 'complete', 'success', 'succeeded'].includes(normalized)) return undefined;
  if (normalized === 'timeout' || normalized === 'timed_out') return 'runtime_subagent_run_timeout';
  if (normalized === 'error') return 'runtime_subagent_run_error';
  if (normalized === 'cancelled' || normalized === 'canceled') return 'runtime_subagent_run_cancelled';
  return 'runtime_subagent_run_failed';
}

function publicWorkflowError(code, { requestId } = {}) {
  const safeRequestId = compactRequestId(requestId);
  const message = PUBLIC_ERROR_MESSAGES.get(code) || PUBLIC_ERROR_MESSAGES.get('workflow_failed');
  return {
    ok: false,
    mode: 'run',
    openclaw_surface: PLUGIN_ID,
    workflow: 'workflow',
    error_code: code,
    message: code,
    request_id: safeRequestId,
    text: `🪐 Workflow error: ${code}\n${message}\nRequest ID: ${safeRequestId}`,
  };
}

export function isWorkflowRunControlRequested(values = {}) {
  return ['approve', 'reject', 'reply'].includes(values?.controlAction);
}

export function isWorkflowRunRequested(values = {}) {
  return typeof values.workflow === 'string' && values.workflow.length > 0;
}

export function validateWorkflowPath(value) {
  if (typeof value !== 'string' || value.length === 0) throw new Error('unsupported_workflow_path');
  const normalized = normalize(value).replaceAll('\\', '/');
  const withoutDot = value.replace(/^\.\//, '');
  if (isAbsolute(value) || value.startsWith('~') || value.includes('..') || normalized !== withoutDot) {
    throw new Error('unsupported_workflow_path');
  }
  return withoutDot;
}

function extractText(value) {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return undefined;
  if (typeof value.text === 'string') return value.text;
  if (typeof value.output === 'string') return value.output;
  if (typeof value.result === 'string') return value.result;
  if (typeof value.content === 'string') return value.content;
  if (Array.isArray(value.content)) {
    return value.content.map((part) => typeof part === 'string' ? part : part?.text).filter(Boolean).join('\n');
  }
  return undefined;
}

function stripJsonFence(text) {
  return text.trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
}

function parseWorkerOutput(value) {
  if (value && typeof value === 'object' && !Array.isArray(value) && !('role' in value) && !('content' in value)) return value;
  const text = extractText(value);
  if (!text) throw new Error('runtime_subagent_output_unavailable');
  if (text.length > MAX_SUBAGENT_RESPONSE_CHARS) throw new Error('runtime_subagent_output_too_large');
  try {
    return JSON.parse(stripJsonFence(text));
  } catch {
    throw new Error('runtime_subagent_output_invalid');
  }
}

function runtimeSubagent(api) {
  const subagent = api?.runtime?.subagent;
  if (!subagent || typeof subagent.run !== 'function' || typeof subagent.waitForRun !== 'function' || typeof subagent.getSessionMessages !== 'function') {
    return undefined;
  }
  return subagent;
}

function messagesFromResult(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.messages)) return value.messages;
  if (Array.isArray(value?.session?.messages)) return value.session.messages;
  return [];
}

function latestAssistantMessage(messages = []) {
  const reversed = [...messages].reverse();
  return reversed.find((message) => message?.role === 'assistant' && extractText(message))
    || reversed.find((message) => extractText(message));
}

async function callRuntimeSubagent(api, request) {
  const subagent = runtimeSubagent(api);
  if (!subagent) throw new Error('runtime_subagent_unavailable');
  let runId;
  try {
    const started = await subagent.run(request);
    runId = started?.runId || started?.id;
    if (!runId) throw new Error('runtime_subagent_unavailable');
    const waitResult = await subagent.waitForRun({ runId, timeoutMs: WORKFLOW_SUBAGENT_WAIT_TIMEOUT_MS });
    const waitErrorCode = waitForRunErrorCode(waitResult);
    if (waitErrorCode) throw new Error(waitErrorCode);
    const messagesResult = await subagent.getSessionMessages({ sessionKey: request.sessionKey, requestId: request.requestId });
    const latest = latestAssistantMessage(messagesFromResult(messagesResult));
    return parseWorkerOutput(latest);
  } catch (error) {
    if (runId) error.runtimeRunId = runId;
    throw error;
  }
}

function safeTaskText(values = {}) {
  const request = typeof values.request === 'string' ? values.request.trim() : '';
  const positional = Array.isArray(values._positionals) ? values._positionals.join(' ').trim() : '';
  return request || positional || '';
}

function workflowRunsRoot(pluginConfig = {}) {
  return pluginConfig.workflowRunsRoot || pluginConfig.runsRootWorkflow || pluginConfig.workflow_runs_root;
}

function effectiveWorkflowRunsRoot(pluginConfig = {}) {
  return workflowRunsRoot(pluginConfig) || defaultWorkflowRunsRoot;
}

function hostActionsFromCanonicalBaton({ baton, workflow } = {}) {
  const stepId = typeof baton?.cursor === 'string' && baton.cursor ? baton.cursor : undefined;
  if (!stepId) return [];
  const step = workflow?.steps?.[stepId];
  if (!step || typeof step !== 'object') return [];
  if (step.kind === 'approval') return [{ id: stepId, stepId, action: 'wait_for_approval' }];
  if (step.kind === 'worker') return [{ id: stepId, stepId, action: 'run_worker' }];
  return [];
}

function safeRunRelativeArtifactPath(value) {
  if (typeof value !== 'string' || !value || isAbsolute(value)) return undefined;
  const segments = value.split(/[\\/]+/).filter(Boolean);
  if (segments.length < 3 || segments[1] !== 'artifacts') return undefined;
  if (!segments.every((segment, index) => {
    if (segment === '.' || segment === '..' || segment.startsWith('.')) return false;
    if (index === 1 && segment !== 'artifacts') return false;
    return true;
  })) return undefined;
  return segments.join('/');
}

function absolutizeArtifactForValidation(artifact, runDir) {
  if (!artifact || typeof artifact !== 'object' || Array.isArray(artifact)) return artifact;
  const artifactPath = artifact.path;
  const safeRelative = safeRunRelativeArtifactPath(artifactPath);
  if (!safeRelative || !runDir) return artifact;
  return { ...artifact, path: resolve(runDir, safeRelative) };
}

function absolutizeOutputArtifactsForValidation(value, runDir) {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((entry) => absolutizeOutputArtifactsForValidation(entry, runDir));
  const projected = { ...value };
  if (Array.isArray(projected.artifacts)) projected.artifacts = projected.artifacts.map((artifact) => absolutizeArtifactForValidation(artifact, runDir));
  for (const [key, nested] of Object.entries(projected)) {
    if (key !== 'artifacts' && nested && typeof nested === 'object') projected[key] = absolutizeOutputArtifactsForValidation(nested, runDir);
  }
  return projected;
}

function batonForHostProjectionValidation(baton, runDir) {
  if (!baton || typeof baton !== 'object' || !runDir) return baton;
  const projected = structuredClone(baton);
  const outputs = projected?.state?.outputs;
  if (outputs && typeof outputs === 'object' && !Array.isArray(outputs)) {
    projected.state.outputs = Object.fromEntries(Object.entries(outputs).map(([stepId, output]) => [stepId, absolutizeOutputArtifactsForValidation(output, runDir)]));
  }
  if (Array.isArray(projected?.state?.artifacts)) {
    projected.state.artifacts = projected.state.artifacts.map((entry) => entry && typeof entry === 'object'
      ? { ...entry, artifact: absolutizeArtifactForValidation(entry.artifact, runDir) }
      : entry);
  }
  return projected;
}

function assertCanonicalBatonForHostProjection({ baton, workflow, runDir } = {}) {
  const validationBaton = batonForHostProjectionValidation(baton, runDir);
  assertBatonSchema(validationBaton);
  new Baton(validationBaton).validateAgainst(workflow);
}

function statusFromCanonicalBaton({ baton, workflow, indexedStatus } = {}) {
  if (['failed', 'stopped', 'cancelled', 'canceled'].includes(indexedStatus)) return indexedStatus;
  const stepId = typeof baton?.cursor === 'string' && baton.cursor ? baton.cursor : undefined;
  const step = stepId ? workflow?.steps?.[stepId] : undefined;
  if (step?.kind === 'done') return 'done';
  if (step?.kind === 'blocked') return 'blocked';
  const hostActions = hostActionsFromCanonicalBaton({ baton, workflow });
  if (hostActions.length > 0) return 'needs_host_actions';
  return indexedStatus;
}

export async function readWorkflowRunCanonicalState(pluginConfig = {}, runId) {
  if (typeof runId !== 'string' || !runId) return { degradedReason: 'missing_run_id' };
  const runsRoot = effectiveWorkflowRunsRoot(pluginConfig);
  try {
    const index = await readRunsIndex(runsIndexPathsForRoot(runsRoot));
    const indexed = index.runs?.[runId];
    if (!indexed?.workflow?.path) return { degradedReason: 'workflow_run_unavailable' };
    const paths = resolveRunPaths({ runId, workflowPath: indexed.workflow.path, runsRoot });
    const [baton, workflow] = await Promise.all([
      readFile(paths.batonPath, 'utf8').then(JSON.parse),
      readFile(paths.workflowPath, 'utf8').then(JSON.parse),
    ]);
    assertCanonicalBatonForHostProjection({ baton, workflow, runDir: paths.runDir });
    const hostActions = hostActionsFromCanonicalBaton({ baton, workflow });
    const currentStep = typeof baton?.cursor === 'string' && baton.cursor ? baton.cursor : undefined;
    const currentGate = hostActions.find((action) => action.action === 'wait_for_approval')?.stepId;
    return {
      baton,
      workflow,
      response: {
        runId,
        status: statusFromCanonicalBaton({ baton, workflow, indexedStatus: indexed.status }),
        requestId: indexed.requestId,
        baton,
        workflow,
        requests: hostActions,
      },
      hostActions,
      currentStep,
      currentGate,
      degradedReason: undefined,
    };
  } catch (error) {
    const validationFailure = error instanceof SyntaxError
      || /(?:schema|semantic validation|baton cursor not found|inconsistent with cursor|validation failed)/i.test(String(error?.message ?? ''));
    return { degradedReason: validationFailure ? 'canonical_state_invalid' : 'canonical_state_unavailable', hostActions: [] };
  }
}

function configuredWorkflowPath(pluginConfig = {}, workflowPath) {
  if (pluginConfig.workflowPath) return pluginConfig.workflowPath;
  return join(REPO_ROOT, workflowPath);
}

async function workflowIdentityForPath(workflowPath) {
  try {
    const workflow = JSON.parse(await readFile(workflowPath, 'utf8'));
    return typeof workflow.name === 'string' && workflow.name.trim() ? workflow.name.trim() : 'workflow';
  } catch {
    return 'workflow';
  }
}

export async function listWorkflowRunsForOrbita({ pluginConfig = {}, runsRoot, limit, maxLimit } = {}) {
  if (!runsRoot && !pluginConfig.workflowRunsRoot && !pluginConfig.runsRootWorkflow && !pluginConfig.workflow_runs_root && pluginConfig.runsRoot) return [];
  return listWorkflowRuns({
    runsRoot: runsRoot ?? workflowRunsRoot(pluginConfig),
    limit,
    maxLimit,
  });
}

function artifactOutputDirFor({ runId, stepId, workflowPath, runsRoot }) {
  const paths = resolveRunPaths({ runId, workflowPath, runsRoot });
  return join(paths.runDir, stepId, 'artifacts');
}

async function prepareArtifactDirectory(options) {
  const artifactDir = artifactOutputDirFor(options);
  await mkdir(artifactDir, { recursive: true, mode: 0o700 });
  return artifactDir;
}

function workerPrompt({ instructions, runId, stepId, artifactDir, requestId }) {
  return `You are executing one workflow worker step through Orbita.

Return ONLY strict JSON for the current step output schema. No markdown, no commentary.
If the schema requires artifacts, write artifact files under this exact artifact output directory and reference those absolute paths in artifacts[].path:
${artifactDir}

Do not include prompts, transcripts, lease tokens, or private unrelated content in the JSON.

Workflow run: ${runId}
Request ID: ${requestId}
Step: ${stepId}

Step instructions:
${instructions}`;
}

function firstLine(value) {
  if (typeof value !== 'string') return undefined;
  return value.split(/\r?\n/).map((line) => line.trim()).find(Boolean);
}

function redactPublicSummary(value) {
  if (typeof value !== 'string') return undefined;
  let text = firstLine(value);
  if (!text) return undefined;
  text = redactSensitivePublicText(text);
  return text.length > MAX_PUBLIC_SUMMARY_CHARS ? `${text.slice(0, MAX_PUBLIC_SUMMARY_CHARS - 1)}…` : text;
}

function redactSensitivePublicText(value) {
  return value
    .replace(/<{2,}\s*(?:begin|end)?[-_\s]*(?:prompt|transcript)[^>]*>{2,}/gi, '[redacted-runtime]')
    .replace(/\b(?:begin|end)[-_\s]*(?:prompt|transcript)\b/gi, '[redacted-runtime]')
    .replace(/(?:[A-Za-z]:)?[\\/](?:[^\s:;|,<>'"`{}()[\]]+[\\/]){1,}[^\s:;|,<>'"`{}()[\]]*/g, '[redacted-path]')
    .replace(/~[\\/][^\s:;|,<>'"`{}()[\]]*/g, '[redacted-path]')
    .replace(/\b(lease[-_ ]?token|prompt|transcript)\b\s*[:=]\s*\S+/gi, '$1=[redacted]')
    .replace(/\b[A-Za-z0-9_-]{24,}\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\b/g, '[redacted-token]')
    .replace(/\b(?:sk|ghp|github_pat|xox[baprs]|ya29|glpat|oc_[A-Za-z0-9]*)[_-][A-Za-z0-9_=-]{12,}\b/gi, '[redacted-token]')
    .replace(/\b[A-Za-z0-9_=-]{40,}\b/g, '[redacted-token]')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b(prompt|transcript)\b/gi, '[redacted-runtime]')
    .replace(/\b(?:lease[-_ ]?token|token)\b/gi, '[redacted-token-label]')
    .trim();
}

function safeRunTitle(task) {
  if (typeof task !== 'string') return 'workflow';
  const text = redactSensitivePublicText(task);
  if (!text) return 'workflow';
  const bounded = text.length > MAX_RUN_TITLE_TASK_CHARS ? text.slice(0, MAX_RUN_TITLE_TASK_CHARS) : text;
  return bounded.trim() || 'workflow';
}

function compactContextValue(value) {
  if (value === undefined || value === null) return undefined;
  const text = String(value).trim();
  return text || undefined;
}

function refFromActor(actor) {
  if (actor === undefined || actor === null) return undefined;
  if (typeof actor === 'string' || typeof actor === 'number' || typeof actor === 'bigint') return compactContextValue(actor);
  if (typeof actor !== 'object') return undefined;
  return compactContextValue(actor.id ?? actor.userId ?? actor.username ?? actor.handle ?? actor.ref);
}

function firstCompactContextValue(...values) {
  for (const value of values) {
    const compact = compactContextValue(value);
    if (compact) return compact;
  }
  return undefined;
}

function requesterBindingFromContext(ctx = {}) {
  const delivery = ctx.deliveryContext && typeof ctx.deliveryContext === 'object' && !Array.isArray(ctx.deliveryContext) ? ctx.deliveryContext : {};
  const sessionRef = firstCompactContextValue(
    ctx.sessionKey,
    ctx.session?.key,
    ctx.sessionId,
    delivery.sessionKey,
    delivery.sessionId,
    refFromActor(ctx.sender),
    refFromActor(ctx.from),
    ctx.senderId,
    ctx.requesterRef,
  );
  if (!sessionRef) return undefined;
  const origin = {
    channel: firstCompactContextValue(ctx.channel, delivery.channel),
    account: firstCompactContextValue(ctx.accountId, delivery.accountId, delivery.account),
    sender: firstCompactContextValue(refFromActor(ctx.from), refFromActor(ctx.sender), ctx.senderId, refFromActor(delivery.from), refFromActor(delivery.sender)),
    recipient: firstCompactContextValue(refFromActor(ctx.to), refFromActor(delivery.to), refFromActor(delivery.recipient)),
    thread: firstCompactContextValue(ctx.messageThreadId, delivery.messageThreadId, delivery.threadId, delivery.thread),
    parentThread: firstCompactContextValue(ctx.threadParentId, delivery.threadParentId, delivery.parentThreadId, delivery.parentThread),
  };
  for (const key of Object.keys(origin)) if (origin[key] === undefined) delete origin[key];
  return {
    sessionRef,
    ...(Object.keys(origin).length > 0 ? { origin } : {}),
  };
}

function safePublicSummaryList(value) {
  return Array.isArray(value) ? value.map(redactPublicSummary).filter(Boolean).slice(0, 2) : [];
}

function latestOutputSummary(baton) {
  const outputs = baton?.state?.outputs;
  if (!outputs || typeof outputs !== 'object' || Array.isArray(outputs)) return undefined;
  const summaries = [];
  for (const [stepId, output] of Object.entries(outputs)) {
    const outcome = redactPublicSummary(output?.outcome || output?.approval);
    const packetSummary = safePublicSummaryList(output?.research_packet?.summary);
    const verdictSummary = safePublicSummaryList(output?.verdict?.summary);
    const parts = [outcome, ...packetSummary, ...verdictSummary].filter(Boolean).slice(0, 3);
    if (parts.length > 0) summaries.push(`${stepId}: ${parts.join(' · ')}`);
  }
  return summaries.slice(-4);
}

function approvalText(response, { requestId } = {}) {
  const request = response.requests?.[0];
  const stepId = request?.stepId || request?.id || response.baton?.cursor || 'approval';
  const summaries = latestOutputSummary(response.baton) ?? [];
  const body = summaries.length > 0 ? `\n\nContext:\n${summaries.map((line) => `• ${line}`).join('\n')}` : '';
  return `🪐 Workflow approval required\n\nStep: ${stepId}\nRequest ID: ${requestId}\nWorkflow paused for human approval.${body}\n\nApprove/reject/block this gate to continue.`;
}

function terminalText(response, { requestId } = {}) {
  const suffix = `\nRequest ID: ${requestId}`;
  if (response.status === 'done') return `🪐 workflow completed.${suffix}`;
  if (response.status === 'blocked') return `🪐 workflow blocked.${suffix}`;
  if (response.status === 'failed') return `🪐 workflow failed / could not continue.${suffix}`;
  return `🪐 workflow stopped.${suffix}`;
}

function safePublicFailureCode(failure = {}) {
  const code = safeFailureIdentifier(failure.failure_code ?? failure.error_code);
  return code && code !== '[redacted]' ? code : 'workflow_failed';
}

function failureDeliveryText(projected = {}, { requestId } = {}) {
  const runId = projected.workflow_run_id;
  const lines = [
    '🪐 Orbita workflow failed / could not continue',
    formatWorkflowRunBlock(projected),
    `Request ID: ${requestId || '—'}`,
  ];
  if (runId) lines.push(`Inspect/resurface: /orbita run ${runId}`);
  return lines.filter(Boolean).join('\n');
}


function workflowDeliveryMarker(response = {}) {
  const runId = safeFailureIdentifier(response.runId);
  if (!runId) return undefined;
  if (isTerminalWorkflowState(response)) return `${runId}:terminal:${response.status}`;
  if (response.status === 'failed') return `${runId}:terminal:failed`;
  const request = approvalRequestFor(response);
  const stepId = safeFailureIdentifier(request?.stepId ?? request?.id ?? response.baton?.cursor);
  if (request) return `${runId}:user-gate:${stepId ?? 'gate'}:${safePublicRequestId(response.requestId) ?? ''}`;
  return undefined;
}

function requesterSessionTarget(requesterBinding = {}) {
  const sessionRef = safeFailureIdentifier(requesterBinding?.sessionRef);
  if (!sessionRef || sessionRef === '[redacted]') return undefined;
  return sessionRef;
}

function hostActionsForDelivery(response = {}) {
  return (response.requests ?? [])
    .map((request) => ({ action: safeFailureIdentifier(request?.action), step_id: safeFailureIdentifier(request?.stepId ?? request?.id) }))
    .filter((request) => request.action || request.step_id);
}

function projectedRunForDelivery(indexedRun = {}, response = {}) {
  const request = approvalRequestFor(response);
  const currentStep = safeFailureIdentifier(response.baton?.cursor ?? indexedRun.currentStep);
  const currentGate = request ? safeFailureIdentifier(request.stepId ?? request.id) : safeFailureIdentifier(indexedRun.currentGate);
  const status = response.status ?? indexedRun.status;
  const projected = {
    workflow_run_id: safeFailureIdentifier(response.runId ?? indexedRun.runId),
    workflow_identity: safeWorkflowRunTitle(indexedRun.workflow?.identity),
    request_id: safeNativePublicRequestId(indexedRun.requestId) ?? safeNativePublicRequestId(response.requestId),
    title: safeWorkflowRunTitle(indexedRun.title ?? indexedRun.workflow?.identity),
    status,
    state_label: status,
    current_step: currentStep,
    current_gate: currentGate,
    host_actions: hostActionsForDelivery(response),
    waiting_reason: request ? 'approval needed' : undefined,
    user_action_required: Boolean(request),
    user_action_label: request ? 'approval needed' : undefined,
    failure_code: status === 'failed' ? safePublicFailureCode(response.failure ?? indexedRun.failure) : undefined,
    created_at: indexedRun.createdAt,
    updated_at: indexedRun.updatedAt,
  };
  for (const key of Object.keys(projected)) {
    if (projected[key] === undefined || (Array.isArray(projected[key]) && projected[key].length === 0)) delete projected[key];
  }
  return projected;
}

async function indexedRunForDelivery({ runId, runsRoot } = {}) {
  if (!runId) return undefined;
  try {
    const index = await readRunsIndex(runsIndexPathsForRoot(runsRoot));
    return index.runs?.[runId];
  } catch {
    return undefined;
  }
}

async function workflowDeliveryCard({ pluginConfig = {}, runsRoot, response, requesterBinding }) {
  const indexedRun = await indexedRunForDelivery({ runId: response.runId, runsRoot });
  const effectiveRequesterBinding = indexedRun?.requesterBinding ?? requesterBinding;
  const run = {
    runId: response.runId,
    title: indexedRun?.title,
    requestId: indexedRun?.requestId ?? response.requestId,
    workflow: indexedRun?.workflow,
    status: response.status,
    currentStep: response.baton?.cursor ?? indexedRun?.currentStep,
    currentGate: approvalRequestFor(response)?.stepId ?? approvalRequestFor(response)?.id ?? indexedRun?.currentGate,
  };
  const request = approvalRequestFor(response);
  const attachments = await safeArtifactAttachments({ ...pluginConfig, workflowRunsRoot: runsRoot ?? workflowRunsRoot(pluginConfig) }, response.runId, response).catch(() => []);
  if (response.status === 'failed') {
    const projected = projectedRunForDelivery(indexedRun, response);
    const requestId = safePublicRequestId(indexedRun?.requestId ?? response.requestId ?? response.failure?.request_id) ?? '—';
    return {
      requesterBinding: effectiveRequesterBinding,
      text: failureDeliveryText(projected, { requestId }),
      attachments: [],
    };
  }
  if (request) {
    return {
      requesterBinding: effectiveRequesterBinding,
      text: pendingUserActionText({ run, response, stepId: request.stepId ?? request.id, request, attachments }),
      attachments,
    };
  }

  const projected = projectedRunForDelivery(indexedRun, response);
  const statusText = `🪐 Orbita workflow update\n${formatWorkflowRunBlock(projected)}`;
  return {
    requesterBinding: effectiveRequesterBinding,
    text: statusText || terminalText(response, { requestId: safePublicRequestId(indexedRun?.requestId ?? response.requestId) ?? '—' }),
    attachments,
  };
}

function hasWorkflowDeliveryMarker(indexedRun = {}, marker) {
  if (!marker) return false;
  return (indexedRun.workflowDeliveries ?? []).some((delivery) => delivery?.marker === marker && isSuccessfulWorkflowDelivery(delivery));
}

function workflowDeliveryStatus(delivery = {}) {
  const status = typeof delivery.status === 'string' ? delivery.status : undefined;
  if (['success', 'pending', 'failed', 'skipped'].includes(status)) return status;
  return typeof delivery.deliveredAt === 'string' && delivery.deliveredAt.trim() ? 'success' : undefined;
}

function isSuccessfulWorkflowDelivery(delivery = {}) {
  return workflowDeliveryStatus(delivery) === 'success';
}

function isSuppressingWorkflowDelivery(delivery = {}) {
  return workflowDeliveryStatus(delivery) === 'success';
}

async function durableWorkflowDeliveryStatus({ runId, workflowPath, runsRoot, marker } = {}) {
  if (!runId || !marker) return { delivered: false };
  const resolvedWorkflowPath = workflowPath ?? await indexedWorkflowPathForOrbitaRun({ runId, runsRoot }).catch(() => undefined);
  if (!resolvedWorkflowPath) return { delivered: false, durable: false, reason: 'workflow_run_unavailable' };
  try {
    const index = await readRunsIndex(runsIndexPathsForRoot(runsRoot));
    const delivery = (index.runs?.[runId]?.workflowDeliveries ?? []).find((entry) => entry?.marker === marker);
    const status = workflowDeliveryStatus(delivery);
    return { delivered: status === 'success', pending: status === 'pending', durable: true, delivery, status };
  } catch (error) {
    return { delivered: false, durable: false, reason: 'workflow_delivery_marker_unavailable', error: String(error?.message ?? error) };
  }
}

function workflowDeliveryKey(marker) {
  return marker ? `orbita-workflow-delivery:${marker}` : undefined;
}


function pruneUndefinedDeliveryProperties(value) {
  for (const key of Object.keys(value)) if (value[key] === undefined) delete value[key];
  return value;
}

function safeDeliveryFailureReason(reason) {
  return [
    'missing_target_or_text',
    'gateway_session_relay_unavailable',
    'workflow_delivery_claim_failed',
    'workflow_delivery_finalize_failed',
    'send_failed',
  ].includes(reason) ? reason : 'send_failed';
}

function sanitizedDeliveryOutcome({ marker, status, reason, method, key, claimedAt, completedAt } = {}) {
  const now = new Date().toISOString();
  const safeStatus = ['pending', 'success', 'skipped', 'failed'].includes(status) ? status : undefined;
  const safeCompletedAt = typeof completedAt === 'string' && completedAt.trim() ? completedAt.trim() : undefined;
  let safeReason = safeFailureIdentifier(reason);
  if (safeStatus === 'failed' && safeReason === '[redacted]') safeReason = 'send_failed';
  return pruneUndefinedDeliveryProperties({
    marker,
    deliveredAt: safeStatus === 'success' ? (safeCompletedAt ?? now) : (typeof claimedAt === 'string' && claimedAt.trim() ? claimedAt.trim() : now),
    status: safeStatus,
    reason: safeReason,
    method: safeFailureIdentifier(method),
    key: safeFailureIdentifier(key),
    claimedAt: typeof claimedAt === 'string' && claimedAt.trim() ? claimedAt.trim() : undefined,
    completedAt: safeCompletedAt,
  });
}

function safeCount(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

function sanitizedDeliveryReturn(result = {}, { marker, durable, key, status } = {}) {
  const sent = result.sent === true;
  const safeStatus = ['success', 'failed', 'unconfirmed'].includes(status) ? status : (sent ? 'success' : 'failed');
  const failedAttemptCount = Array.isArray(result.failedAttempts)
    ? result.failedAttempts.length
    : safeCount(result.failedAttemptCount);
  return pruneUndefinedDeliveryProperties({
    sent,
    status: safeStatus,
    reason: sent && safeStatus !== 'unconfirmed' ? undefined : safeDeliveryFailureReason(result.reason),
    method: safeFailureIdentifier(result.method),
    key: safeFailureIdentifier(key),
    attempts: safeCount(result.attempts),
    failedAttemptCount,
    marker,
    durable: durable === true,
  });
}

async function claimWorkflowDeliveryDurable({ runId, workflowPath, runsRoot, marker, key } = {}) {
  if (!runId || !marker) return { claimed: false, reason: 'missing_run_or_marker' };
  const resolvedWorkflowPath = workflowPath ?? await indexedWorkflowPathForOrbitaRun({ runId, runsRoot }).catch(() => undefined);
  if (!resolvedWorkflowPath) return { claimed: false, reason: 'workflow_run_unavailable' };
  const paths = resolveRunPaths({ runId, workflowPath: resolvedWorkflowPath, runsRoot });
  let duplicate = false;
  let delivery;
  const claimedAt = new Date().toISOString();
  await updateRunIndexEntry(paths, (existing) => {
    const deliveries = Array.isArray(existing.workflowDeliveries) ? existing.workflowDeliveries : [];
    delivery = deliveries.find((entry) => entry?.marker === marker);
    const existingStatus = workflowDeliveryStatus(delivery);
    if (isSuppressingWorkflowDelivery(delivery)) {
      duplicate = true;
      delivery = sanitizedDeliveryOutcome({ ...delivery, marker, status: existingStatus });
      return existing;
    }
    delivery = sanitizedDeliveryOutcome({ marker, status: 'pending', key, claimedAt });
    const workflowDeliveries = delivery && existingStatus
      ? deliveries.map((entry) => entry?.marker === marker ? delivery : entry)
      : [...deliveries, delivery];
    return { ...existing, workflowDeliveries };
  });
  return { claimed: !duplicate, duplicate, delivery, durable: true };
}

async function finalizeWorkflowDeliveryDurable({ runId, workflowPath, runsRoot, marker, status, reason, method, key } = {}) {
  if (!runId || !marker) return { marked: false, reason: 'missing_run_or_marker' };
  const resolvedWorkflowPath = workflowPath ?? await indexedWorkflowPathForOrbitaRun({ runId, runsRoot }).catch(() => undefined);
  if (!resolvedWorkflowPath) return { marked: false, reason: 'workflow_run_unavailable' };
  const paths = resolveRunPaths({ runId, workflowPath: resolvedWorkflowPath, runsRoot });
  const completedAt = new Date().toISOString();
  let delivery;
  await updateRunIndexEntry(paths, (existing) => {
    const deliveries = Array.isArray(existing.workflowDeliveries) ? existing.workflowDeliveries : [];
    let found = false;
    const workflowDeliveries = deliveries.map((entry) => {
      if (entry?.marker !== marker) return entry;
      found = true;
      delivery = sanitizedDeliveryOutcome({ ...entry, marker, status, reason, method, key: key ?? entry.key, claimedAt: entry.claimedAt, completedAt });
      return delivery;
    });
    if (!found) {
      delivery = sanitizedDeliveryOutcome({ marker, status, reason, method, key, claimedAt: completedAt, completedAt });
      workflowDeliveries.push(delivery);
    }
    return { ...existing, workflowDeliveries };
  });
  return { marked: true, delivery };
}

async function sendRequesterSessionMessage({ api, sessionKey, text, idempotencyKey } = {}) {
  if (!sessionKey || !text) return { sent: false, reason: 'missing_target_or_text' };
  const relayMessage = buildOrbitaRelayMessage(text);
  try {
    const result = await sendGatewayRequesterSessionMessage({
      sessionKey,
      text: relayMessage,
      idempotencyKey,
      env: api?.orbita?.gatewayEnv,
      gatewayClientClass: api?.orbita?.GatewayClient,
      settings: api?.orbita?.gatewaySettings,
      importRuntime: api?.orbita?.importGatewayRuntime,
    });
    return { ...result, attempts: 1, failedAttempts: [] };
  } catch (error) {
    return {
      sent: false,
      reason: 'gateway_session_relay_unavailable',
      method: 'gateway.sessions.send.adapter',
      error: String(error?.message ?? error),
      failedAttempts: [{ method: 'gateway.sessions.send.adapter', error: String(error?.message ?? error) }],
    };
  }
}

export async function deliverWorkflowResponseToRequester({ api, pluginConfig, runsRoot, response, requesterBinding, workflowPath }) {
  const marker = workflowDeliveryMarker(response);
  if (!marker) return { sent: false, reason: 'not_user_facing_state' };
  const key = workflowDeliveryKey(marker);
  if (deliveredWorkflowNotifications.has(marker)) return { sent: false, reason: 'duplicate', marker };
  if (activeWorkflowNotifications.has(marker)) return { sent: false, reason: 'duplicate', marker, status: 'pending' };
  const durable = await durableWorkflowDeliveryStatus({ runId: response.runId, workflowPath, runsRoot, marker });
  if (durable.delivered) {
    deliveredWorkflowNotifications.add(marker);
    return { sent: false, reason: 'duplicate', marker, status: 'success', durable: true, delivery: sanitizedDeliveryOutcome({ ...durable.delivery, marker, status: 'success' }) };
  }
  if (activeWorkflowNotifications.has(marker)) return { sent: false, reason: 'duplicate', marker, status: 'pending', durable: durable.durable };

  activeWorkflowNotifications.add(marker);

  let claim = { claimed: false, durable: durable.durable };
  try {
    claim = await claimWorkflowDeliveryDurable({ runId: response.runId, workflowPath, runsRoot, marker, key });
  } catch (error) {
    claim = { claimed: false, durable: false, reason: 'workflow_delivery_claim_failed', error: String(error?.message ?? error) };
  }
  if (claim.duplicate) {
    activeWorkflowNotifications.delete(marker);
    const duplicateStatus = workflowDeliveryStatus(claim.delivery);
    return pruneUndefinedDeliveryProperties({ sent: false, reason: 'duplicate', marker, status: duplicateStatus, durable: true, delivery: claim.delivery });
  }
  if (!claim.claimed && deliveredWorkflowNotifications.has(marker)) {
    activeWorkflowNotifications.delete(marker);
    return { sent: false, reason: 'duplicate', marker, durable: claim.durable };
  }
  if (!claim.claimed) {
    activeWorkflowNotifications.delete(marker);
    return pruneUndefinedDeliveryProperties({
      sent: false,
      status: 'failed',
      reason: 'workflow_delivery_claim_failed',
      marker,
      durable: false,
      key,
    });
  }

  let card;
  try {
    card = await workflowDeliveryCard({ pluginConfig, runsRoot, response, requesterBinding });
  } catch (error) {
    const reason = 'workflow_delivery_card_failed';
    await finalizeWorkflowDeliveryDurable({ runId: response.runId, workflowPath, runsRoot, marker, status: 'failed', reason, key }).catch(() => {});
    activeWorkflowNotifications.delete(marker);
    return { sent: false, reason, marker, durable: claim.durable, error: safeFailureIdentifier(String(error?.message ?? error)) };
  }

  const sessionKey = requesterSessionTarget(card.requesterBinding);
  if (!sessionKey) {
    const reason = 'missing_or_unsafe_requester_target';
    await finalizeWorkflowDeliveryDurable({ runId: response.runId, workflowPath, runsRoot, marker, status: 'skipped', reason, key }).catch(() => {});
    activeWorkflowNotifications.delete(marker);
    return { sent: false, reason, marker, durable: claim.durable };
  }

  const result = await sendRequesterSessionMessage({ api, sessionKey, text: card.text, idempotencyKey: key });
  const status = result.sent ? 'success' : 'failed';
  try {
    await finalizeWorkflowDeliveryDurable({
      runId: response.runId,
      workflowPath,
      runsRoot,
      marker,
      status,
      reason: result.sent ? undefined : safeDeliveryFailureReason(result.reason),
      method: result.method,
      key,
    });
  } catch {
    activeWorkflowNotifications.delete(marker);
    return sanitizedDeliveryReturn(
      { ...result, reason: 'workflow_delivery_finalize_failed' },
      { marker, durable: false, key, status: result.sent ? 'unconfirmed' : 'failed' },
    );
  }
  activeWorkflowNotifications.delete(marker);
  if (result.sent) deliveredWorkflowNotifications.add(marker);
  return sanitizedDeliveryReturn(result, { marker, durable: claim.durable, key, status });
}

function ackText({ runId, requestId }) {
  return `🪐 Workflow started in background.\nWorkflow run: ${runId}\nRequest ID: ${requestId}\nThe command path is free; the workflow will continue asynchronously until the next gate or terminal state.`;
}

function safeRunProjection(response, extra = {}) {
  return {
    ok: true,
    mode: 'run',
    openclaw_surface: PLUGIN_ID,
    workflow: 'workflow',
    workflow_run_id: response.runId,
    status: response.status,
    ...extra,
  };
}

export async function markWorkflowRunFailed({ runId, workflowPath, runsRoot, failure }) {
  const paths = resolveRunPaths({ runId, workflowPath, runsRoot });
  return updateRunIndexEntry(paths, (existing) => {
    if (isPersistedTerminalSuccessOrBlock(existing?.status)) return existing;
    return upsertFailedRunIndexEntry(paths, existing, { workflowPath, failure });
  });
}

function isPersistedTerminalSuccessOrBlock(status) {
  return status === 'done' || status === 'blocked';
}

function upsertFailedRunIndexEntry(paths, existing, { workflowPath, failure }) {
  return {
    ...existing,
    workflow: { ...(existing?.workflow ?? {}), path: existing?.workflow?.path ?? workflowPath ?? paths.workflowPath },
    status: 'failed',
    updatedAt: new Date().toISOString(),
    workerLease: null,
    failure,
  };
}

async function markWorkflowRunFailedAndDeliver({ api, pluginConfig, runId, workflowPath, runsRoot, failure, requesterBinding, requestId }) {
  const indexedRun = await markWorkflowRunFailed({ runId, workflowPath, runsRoot, failure });
  if (isPersistedTerminalSuccessOrBlock(indexedRun?.status)) return { sent: false, reason: 'workflow_already_terminal' };
  const response = {
    runId,
    status: 'failed',
    requestId: safePublicRequestId(indexedRun?.requestId ?? requestId ?? failure?.request_id),
    failure: indexedRun?.failure ?? failure,
    baton: { cursor: indexedRun?.currentStep },
    requests: [],
  };
  try {
    return await deliverWorkflowResponseToRequester({
      api,
      pluginConfig: pluginConfig ?? { workflowRunsRoot: runsRoot },
      runsRoot,
      response,
      requesterBinding,
      workflowPath,
    });
  } catch {
    return { sent: false, reason: 'workflow_failure_delivery_failed' };
  }
}

async function indexedWorkflowPathForOrbitaRun({ runId, runsRoot }) {
  const index = await readRunsIndex(runsIndexPathsForRoot(runsRoot));
  return index.runs?.[runId]?.workflow?.path;
}

function runIndexProgressPatch(response = {}) {
  const requests = Array.isArray(response.requests) ? response.requests : [];
  const approval = requests.find((request) => request?.action === 'wait_for_approval');
  return {
    status: response.status,
    currentStep: response.baton?.cursor,
    currentGate: approval ? (approval.stepId ?? approval.id) : undefined,
  };
}

async function releaseWorkflowRunLease({ runId, workflowPath, runsRoot, response, leaseToken }) {
  if (!leaseToken) return { released: false };
  const resolvedWorkflowPath = workflowPath ?? await indexedWorkflowPathForOrbitaRun({ runId, runsRoot });
  const paths = resolveRunPaths({ runId, workflowPath: resolvedWorkflowPath, runsRoot });
  const progress = runIndexProgressPatch(response);
  let released = false;
  await updateRunIndexEntry(paths, (existing) => {
    if (!safeTokenHashMatches(existing?.workerLease?.tokenHash, leaseToken)) return existing;
    released = true;
    return {
      ...existing,
      workflow: { ...(existing.workflow ?? {}), path: existing.workflow?.path ?? resolvedWorkflowPath },
      status: progress.status ?? existing.status,
      currentStep: progress.currentStep,
      currentGate: progress.currentGate,
      updatedAt: new Date().toISOString(),
      workerLease: null,
    };
  });
  return { released };
}

async function prepareWorkerRequest({ response, request, workflowPath, runsRoot, leaseToken, requestId, workflowIdentity }) {
  const stepId = request.stepId || request.id;
  const instructions = await loadInstructions({ runId: response.runId, workflowPath, stepId, leaseToken, runsRoot });
  const artifactDir = await prepareArtifactDirectory({ runId: response.runId, stepId, workflowPath, runsRoot });
  const message = workerPrompt({ instructions, runId: response.runId, stepId, artifactDir, requestId });
  const sessionKey = `orbita:${workflowIdentity ?? 'workflow'}:${requestId}:${response.runId}:${stepId}`;
  return { stepId, message, sessionKey };
}

async function executeWorkerRequest({ api, response, prepared, requestId, workflowIdentity, requesterBinding }) {
  const { stepId, message, sessionKey } = prepared;
  let output;
  try {
    output = await callRuntimeSubagent(api, {
      sessionKey,
      message,
      label: `orbita-workflow-${requestId}-${stepId}`,
      task: message,
      prompt: message,
      cwd: REPO_ROOT,
      cleanup: 'delete',
      requestId,
      idempotencyKey: `orbita-workflow:${requestId}:${response.runId}:${stepId}`,
      metadata: { openclaw_surface: PLUGIN_ID, workflow: workflowIdentity ?? 'workflow', workflowRunId: response.runId, stepId, requestId, requesterDelivery: requesterBinding ? 'bound' : 'unbound' },
    });
  } catch (error) {
    error.workflowRunFailure = failureMetadata(error, { requestId, workflowRunId: response.runId, stepId, sessionKey });
    throw error;
  }
  return { stepId, output };
}

async function writeWorkerRequestOutputs({ response, workflowPath, runsRoot, leaseToken, outputs }) {
  for (const { stepId, output } of outputs) {
    await writeOutput({ runId: response.runId, workflowPath, stepId, json: JSON.stringify(output), leaseToken, runsRoot });
  }
}

function isTerminalWorkflowState(response) {
  return response?.status === 'done' || response?.status === 'blocked';
}

function approvalRequestFor(response) {
  return (response?.requests ?? []).find((request) => request.action === 'wait_for_approval');
}

function isRunnableWorkerState(response) {
  const requests = response?.requests ?? [];
  return response?.status === 'needs_host_actions'
    && requests.length > 0
    && requests.every((request) => request?.action === 'run_worker');
}

async function driveWorkflowFromResponse({ api, initialResponse, workflowPath, runsRoot, leaseToken, requestId, workflowIdentity, requesterBinding }) {
  let response = initialResponse;

  while (isRunnableWorkerState(response)) {
    await heartbeatWorkflowRun({ runId: response.runId, workflowPath, runsRoot, leaseToken, leaseMs: DEFAULT_LEASE_MS });
    const preparedRequests = [];
    for (const request of response.requests ?? []) {
      preparedRequests.push(await prepareWorkerRequest({ response, request, workflowPath, runsRoot, leaseToken, requestId, workflowIdentity }));
    }
    const outputs = await Promise.all(preparedRequests.map((prepared) => executeWorkerRequest({
      api,
      response,
      prepared,
      requestId,
      workflowIdentity,
      requesterBinding,
    })));
    await writeWorkerRequestOutputs({ response, workflowPath, runsRoot, leaseToken, outputs });
    response = await continueRun({ runId: response.runId, workflowPath, leaseToken, runsRoot });
  }

  if (approvalRequestFor(response)) {
    await releaseWorkflowRunLease({ runId: response.runId, workflowPath, runsRoot, response, leaseToken });
    await deliverWorkflowResponseToRequester({ api, pluginConfig: { workflowRunsRoot: runsRoot }, runsRoot, response, requesterBinding, workflowPath });
    return response;
  }
  if (isTerminalWorkflowState(response)) {
    await releaseWorkflowRunLease({ runId: response.runId, workflowPath, runsRoot, response, leaseToken });
    await deliverWorkflowResponseToRequester({ api, pluginConfig: { workflowRunsRoot: runsRoot }, runsRoot, response, requesterBinding, workflowPath });
    return response;
  }
  throw new Error('unsupported_workflow_host_action');
}

async function driveWorkflow({ api, runId, workflowPath, runsRoot, leaseToken, task, requestId, workflowIdentity, requesterBinding }) {
  const response = await next({ runId, workflowPath, userPrompt: task, leaseToken, runsRoot });
  return driveWorkflowFromResponse({ api, initialResponse: response, workflowPath, runsRoot, leaseToken, requestId, workflowIdentity, requesterBinding });
}

async function driveWorkflowAndRecordFailure(options) {
  try {
    return await driveWorkflow(options);
  } catch (error) {
    const failure = error?.workflowRunFailure ?? failureMetadata(error, { requestId: options.requestId, workflowRunId: options.runId });
    await markWorkflowRunFailedAndDeliver({ ...options, failure }).catch(() => {});
    throw error;
  }
}

function runtimeWorkflowDriverLane(api) {
  const lane = api?.runtime?.workflowDrivers || api?.runtime?.workflowDriverLane;
  return lane && typeof lane.start === 'function' ? lane : undefined;
}

async function startBackgroundWorkflowDriveFromResponse(options) {
  const lane = runtimeWorkflowDriverLane(options.api);
  if (lane) {
    await lane.start({
      label: `orbita-${options.workflowIdentity ?? 'workflow'}-driver-${options.requestId}-${options.runId}`,
      idempotencyKey: `orbita-${options.workflowIdentity ?? 'workflow'}-driver:${options.requestId}:${options.runId}`,
      metadata: {
        openclaw_surface: PLUGIN_ID,
        workflow: options.workflowIdentity ?? 'workflow',
        workflowRunId: options.runId,
        requestId: options.requestId,
        requesterDelivery: options.requesterBinding ? 'bound' : 'unbound',
      },
      run: () => driveWorkflowFromResponse({
        api: options.api,
        initialResponse: options.initialResponse,
        workflowPath: options.workflowPath,
        runsRoot: options.runsRoot,
        leaseToken: options.leaseToken,
        requestId: options.requestId,
        workflowIdentity: options.workflowIdentity,
        requesterBinding: options.requesterBinding,
      }).catch(async (error) => {
        await markWorkflowRunFailedAndDeliver({ ...options, failure: error?.workflowRunFailure ?? failureMetadata(error, { requestId: options.requestId, workflowRunId: options.runId }) }).catch(() => {});
        throw error;
      }),
    });
    return { driver: 'runtime_workflow_driver_lane' };
  }

  setImmediate(() => {
    void driveWorkflowFromResponse({
      api: options.api,
      initialResponse: options.initialResponse,
      workflowPath: options.workflowPath,
      runsRoot: options.runsRoot,
      leaseToken: options.leaseToken,
      requestId: options.requestId,
      workflowIdentity: options.workflowIdentity,
      requesterBinding: options.requesterBinding,
    }).catch((error) => {
      void markWorkflowRunFailedAndDeliver({ ...options, failure: error?.workflowRunFailure ?? failureMetadata(error, { requestId: options.requestId, workflowRunId: options.runId }) }).catch(() => {});
    });
  });
  return { driver: 'request_event_loop_fallback' };
}

async function startBackgroundWorkflowDrive(options) {
  const lane = runtimeWorkflowDriverLane(options.api);
  if (lane) {
    await lane.start({
      label: `orbita-${options.workflowIdentity ?? 'workflow'}-driver-${options.requestId}-${options.runId}`,
      idempotencyKey: `orbita-${options.workflowIdentity ?? 'workflow'}-driver:${options.requestId}:${options.runId}`,
      metadata: {
        openclaw_surface: PLUGIN_ID,
        workflow: options.workflowIdentity ?? 'workflow',
        workflowRunId: options.runId,
        requestId: options.requestId,
        requesterDelivery: options.requesterBinding ? 'bound' : 'unbound',
      },
      run: () => driveWorkflowAndRecordFailure(options),
    });
    return { driver: 'runtime_workflow_driver_lane' };
  }

  setImmediate(() => {
    void driveWorkflowAndRecordFailure(options).catch(() => {});
  });
  return { driver: 'request_event_loop_fallback' };
}

function scheduleBackgroundWorkflowDrive(options) {
  void startBackgroundWorkflowDrive(options).catch((error) => {
    void markWorkflowRunFailedAndDeliver({
      ...options,
      failure: error?.workflowRunFailure ?? failureMetadata(error, { requestId: options.requestId, workflowRunId: options.runId }),
    }).catch(() => {});
  });
  return { driver: 'scheduled' };
}
function controlRunId(values = {}) {
  const positional = Array.isArray(values._positionals) ? values._positionals[0] : undefined;
  const value = values.run ?? positional;
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function controlText(values = {}) {
  if (typeof values.text === 'string') return values.text.trim();
  if (typeof values.reason === 'string') return values.reason.trim();
  const rest = Array.isArray(values._positionals) ? values._positionals.slice(1) : [];
  return rest.join(' ').trim();
}

function currentPendingRequest(response = {}) {
  if (response?.status !== 'needs_host_actions') return undefined;
  const requests = Array.isArray(response.requests) ? response.requests : [];
  return requests.find((request) => request?.action === 'wait_for_approval');
}

function hasApprovalRouting(request = {}, response = {}) {
  const stepId = request.stepId ?? request.id ?? response?.baton?.cursor;
  const step = response?.workflow?.steps?.[stepId];
  if (step?.kind === 'approval') return true;
  const match = step?.next?.match;
  if (typeof match === 'string' && match.includes('output.approval')) return true;
  return request?.action === 'wait_for_approval' && typeof stepId === 'string' && /(?:^|[_-])approv(?:e|al)(?:$|[_-])/i.test(stepId);
}

function questionIntentText(request = {}, response = {}, stepId) {
  const step = response?.workflow?.steps?.[stepId];
  return [
    request?.prompt,
    request?.task,
    request?.question,
    step?.name,
    step?.input?.prompt,
    step?.input?.task,
  ].filter((value) => typeof value === 'string' && value.trim()).join(' ');
}

function hasQuestionRouting(request = {}, response = {}) {
  const stepId = String(request.stepId ?? request.id ?? response?.baton?.cursor ?? '');
  if (/(?:^|[_-])(?:ask|question)(?:$|[_-])|question/i.test(stepId)) return true;
  return /(?:^|\s)(?:ask|question|answer)(?:$|\s)|\?/i.test(questionIntentText(request, response, stepId));
}

function controlOutputCandidates(action, text, request, response) {
  const normalizedText = typeof text === 'string' && text.length > 0 ? text : undefined;
  if (action === 'approve') return [{ approval: 'approved' }];
  if (action === 'reject') {
    return normalizedText
      ? [
        { approval: 'rejected', comment: normalizedText },
        { approval: 'rejected', reason: normalizedText },
        { approval: 'rejected', text: normalizedText },
        { approval: 'rejected' },
      ]
      : [{ approval: 'rejected' }];
  }
  if (hasQuestionRouting(request, response)) {
    return [
      { answer: normalizedText ?? '' },
      { text: normalizedText ?? '' },
      { reply: normalizedText ?? '' },
      { comment: normalizedText ?? '' },
    ];
  }
  if (hasApprovalRouting(request, response)) {
    const lower = String(normalizedText ?? '').trim().toLowerCase();
    if (['approve', 'approved', 'lgtm', 'yes', 'y'].includes(lower)) return [{ approval: 'approved' }];
    if (['reject', 'rejected', 'no', 'n'].includes(lower)) return [{ approval: 'rejected', comment: normalizedText }, { approval: 'rejected' }];
    if (['block', 'blocked', 'stop'].includes(lower)) return [{ approval: 'blocked', comment: normalizedText }, { approval: 'blocked' }];
  }
  return [
    { answer: normalizedText ?? '' },
    { text: normalizedText ?? '' },
    { reply: normalizedText ?? '' },
    { comment: normalizedText ?? '' },
  ];
}

async function writeFirstCompatibleControlOutput({ runId, workflowPath, runsRoot, leaseToken, stepId, candidates }) {
  let lastError;
  for (const output of candidates) {
    try {
      await writeOutput({ runId, workflowPath, runsRoot, leaseToken, stepId, json: JSON.stringify(output) });
      return output;
    } catch (error) {
      lastError = error;
      if (!/output schema validation failed|approval output failed schema validation/.test(String(error?.message ?? error))) throw error;
    }
  }
  throw lastError;
}

function controlAckText({ action, runId, requestId, response }) {
  const status = response?.status ?? 'running';
  const actionText = action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'answered';
  return `🪐 Workflow ${actionText}\nWorkflow run: ${runId}\nStatus: ${status}\nRequest ID: ${requestId ?? '—'}`;
}

function controlError({ action, runId, requestId, message, publicDetail }) {
  const safeRunId = safeFailureIdentifier(runId);
  const detail = publicDetail ?? 'The workflow control request could not be applied safely.';
  return {
    ok: false,
    mode: action,
    openclaw_surface: PLUGIN_ID,
    workflow_run_id: safeRunId,
    request_id: requestId,
    message,
    text: `🪐 Orbita ${action}: ${detail}${safeRunId ? `\nWorkflow run: ${safeRunId}` : ''}\nRequest ID: ${requestId ?? '—'}`,
  };
}

function workflowLeasesFromExtensionState(state) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) return {};
  const runs = state.runs && typeof state.runs === 'object' && !Array.isArray(state.runs) ? state.runs : {};
  return runs;
}

function workflowLeaseRunsFromEntry(entry) {
  const pluginState = entry?.pluginExtensions?.[PLUGIN_ID]?.[SESSION_LEASE_NAMESPACE];
  const runs = workflowLeasesFromExtensionState(pluginState);
  return Object.fromEntries(Object.entries(runs).filter(([, lease]) => typeof lease?.leaseToken === 'string' && lease.leaseToken.length > 0));
}

function currentSessionKey(ctx = {}) {
  return requesterBindingFromContext(ctx)?.sessionRef;
}

function sessionStorePathForApi(api, ctx = {}) {
  const session = api?.runtime?.agent?.session;
  if (!session || typeof session.resolveStorePath !== 'function') return undefined;
  const cfg = api.config ?? api.runtime?.config?.current?.() ?? {};
  return session.resolveStorePath(cfg.session?.store, { agentId: ctx.agentId });
}

export async function workflowLeaseContextFromCurrentSession({ api, ctx = {} } = {}) {
  const inlineRuns = workflowLeaseRunsFromEntry(ctx.session);
  const sessionKey = currentSessionKey(ctx);
  const session = api?.runtime?.agent?.session;
  const storePath = sessionKey ? sessionStorePathForApi(api, ctx) : undefined;
  let storedRuns = {};
  if (storePath && typeof session?.loadSessionStore === 'function') {
    const store = session.loadSessionStore(storePath);
    storedRuns = workflowLeaseRunsFromEntry(store?.[sessionKey]);
  }
  const runs = { ...storedRuns, ...inlineRuns };
  return {
    runs,
    canPersist: Boolean(storePath && typeof session?.updateSessionStoreEntry === 'function'),
    tokenForRun(runId) {
      const lease = runs?.[runId];
      return typeof lease?.leaseToken === 'string' && lease.leaseToken.length > 0 ? lease.leaseToken : undefined;
    },
    async storeToken({ runId, leaseToken, requestId } = {}) {
      if (!runId || !leaseToken) return false;
      runs[runId] = { leaseToken, ...(requestId ? { requestId } : {}), updatedAt: new Date().toISOString() };
      return writeWorkflowLeaseTokenToCurrentSession({ api, ctx, runId, leaseToken, requestId });
    },
  };
}

async function writeWorkflowLeaseTokenToCurrentSession({ api, ctx = {}, runId, leaseToken, requestId } = {}) {
  if (!runId || !leaseToken) return false;
  const sessionKey = currentSessionKey(ctx);
  const session = api?.runtime?.agent?.session;
  const storePath = sessionKey ? sessionStorePathForApi(api, ctx) : undefined;
  if (!storePath || typeof session?.updateSessionStoreEntry !== 'function') return false;
  const updated = await session.updateSessionStoreEntry({
    storePath,
    sessionKey,
    update(entry) {
      const pluginExtensions = { ...(entry.pluginExtensions ?? {}) };
      const pluginState = { ...(pluginExtensions[PLUGIN_ID] ?? {}) };
      const leaseState = pluginState[SESSION_LEASE_NAMESPACE] && typeof pluginState[SESSION_LEASE_NAMESPACE] === 'object' && !Array.isArray(pluginState[SESSION_LEASE_NAMESPACE])
        ? { ...pluginState[SESSION_LEASE_NAMESPACE] }
        : {};
      const runs = { ...workflowLeasesFromExtensionState(leaseState) };
      runs[runId] = {
        leaseToken,
        ...(requestId ? { requestId } : {}),
        updatedAt: new Date().toISOString(),
      };
      pluginState[SESSION_LEASE_NAMESPACE] = { ...leaseState, runs };
      pluginExtensions[PLUGIN_ID] = pluginState;
      return { pluginExtensions };
    },
  });
  return Boolean(updated);
}

function hasSessionLeasePersistence(api, ctx = {}) {
  const session = api?.runtime?.agent?.session;
  return Boolean(currentSessionKey(ctx) && sessionStorePathForApi(api, ctx) && typeof session?.updateSessionStoreEntry === 'function');
}

async function storeWorkflowLeaseToken({ workflowLeaseContext, api, ctx, runId, leaseToken, requestId } = {}) {
  if (!leaseToken) return false;
  if (workflowLeaseContext?.canPersist === false && !hasSessionLeasePersistence(api, ctx)) return true;
  try {
    const stored = workflowLeaseContext?.storeToken
      ? await workflowLeaseContext.storeToken({ runId, leaseToken, requestId })
      : await writeWorkflowLeaseTokenToCurrentSession({ api, ctx, runId, leaseToken, requestId });
    return stored !== false;
  } catch {
    return false;
  }
}

export async function continueWorkflowRunFromOrbita(values = {}, { pluginConfig = {}, ctx = {}, api } = {}) {
  const action = values.controlAction;
  const runId = controlRunId(values);
  const text = controlText(values);
  const requestId = compactRequestId(values.requestId || values.request_id);
  if (!runId) return { ok: false, mode: action, openclaw_surface: PLUGIN_ID, message: 'workflow_run_id_required', text: `🪐 Orbita ${action}: run id is required.` };
  if (action === 'reply' && !text) return { ok: false, mode: action, openclaw_surface: PLUGIN_ID, workflow_run_id: safeFailureIdentifier(runId), request_id: requestId, message: 'workflow_reply_text_required', text: `🪐 Orbita reply: text is required for ${safeFailureIdentifier(runId) ?? 'this run'}.` };

  const runsRoot = effectiveWorkflowRunsRoot(pluginConfig);
  const requesterBinding = requesterBindingFromContext(ctx);
  const workflowLeaseContext = values.workflowLeaseContext;
  let claim;
  let leaseToken = workflowLeaseContext?.tokenForRun?.(runId);
  if (!leaseToken) {
    try {
      claim = await claimWorkflowRun({ runId, runsRoot, owner: 'orbita', harness: 'orbita-workflow-control', sessionId: requesterBinding?.sessionRef, workerId: `orbita-control-${requestId}`, leaseMs: DEFAULT_LEASE_MS, takeover: true });
    } catch {
      return controlError({ action, runId, requestId, message: 'workflow_run_control_unavailable', publicDetail: 'workflow run id is invalid or unavailable.' });
    }
    if (!claim.ok) {
      const detail = claim.reason === 'occupied'
        ? 'workflow run is occupied; another session owns the current lease.'
        : `workflow run is ${claim.reason ?? 'not claimable'}; try again after the worker releases or lease expires.`;
      return {
        ok: false,
        mode: action,
        openclaw_surface: PLUGIN_ID,
        workflow_run_id: runId,
        status: claim.run?.status,
        message: `workflow_run_${claim.reason ?? 'not_claimed'}`,
        text: `🪐 Orbita ${action}: ${detail}`,
      };
    }
    leaseToken = claim.leaseToken;
    const stored = await storeWorkflowLeaseToken({ workflowLeaseContext, api, ctx, runId, leaseToken, requestId: safePublicRequestId(claim.run?.requestId) ?? requestId });
    if (!stored) {
      await releaseWorkflowRunLease({ runId, runsRoot, response: { runId, status: claim.run?.status, baton: { cursor: undefined }, requests: [] }, leaseToken }).catch(() => {});
      return controlError({ action, runId, requestId, message: 'workflow_lease_persistence_failed', publicDetail: 'workflow lease could not be persisted to the current session.' });
    }
  }
  const workflowPath = await indexedWorkflowPathForOrbitaRun({ runId, runsRoot });
  const workflowIdentity = claim?.run?.workflow?.identity ?? 'workflow';
  const canonical = await readWorkflowRunCanonicalState(pluginConfig, runId);
  const response = canonical.response;
  const request = canonical.degradedReason ? undefined : currentPendingRequest(response);
  if (!request) {
    await releaseWorkflowRunLease({ runId, workflowPath, runsRoot, response: response ?? { runId, status: claim?.run?.status, baton: { cursor: undefined }, requests: [] }, leaseToken }).catch(() => {});
    return controlError({ action, runId, requestId, message: 'workflow_run_not_waiting', publicDetail: 'not waiting for a pending user action.' });
  }
  const stepId = request.stepId ?? request.id ?? response?.baton?.cursor ?? claim?.run?.currentGate ?? claim?.run?.currentStep ?? 'approval';

  let continued;
  let acceptedOutput;
  try {
    acceptedOutput = await writeFirstCompatibleControlOutput({
      runId,
      workflowPath,
      runsRoot,
      leaseToken,
      stepId,
      candidates: controlOutputCandidates(action, text, request, response),
    });
    continued = await continueRun({ runId, workflowPath, runsRoot, leaseToken });
    await startBackgroundWorkflowDriveFromResponse({ api, runId, workflowPath, runsRoot, leaseToken, initialResponse: continued, requestId, workflowIdentity, requesterBinding: requesterBindingFromContext(ctx) });
  } catch (error) {
    await releaseWorkflowRunLease({ runId, workflowPath, runsRoot, response: response ?? { runId, status: claim?.run?.status, baton: { cursor: stepId }, requests: [request] }, leaseToken }).catch(() => {});
    if (/output schema validation failed|approval output failed schema validation|unknown current workflow step id|current workflow state is .* not needs_host_actions|workflow semantic validation failed|invalid workflow runId/i.test(String(error?.message ?? error))) {
      return controlError({ action, runId, requestId, message: 'workflow_run_control_rejected', publicDetail: 'run is not accepting that response right now.' });
    }
    return controlError({ action, runId, requestId, message: 'workflow_run_control_failed', publicDetail: 'workflow control failed before a safe result was available.' });
  }

  const responseRequestId = safePublicRequestId(claim?.run?.requestId) ?? requestId;
  return {
    ok: true,
    mode: action,
    openclaw_surface: PLUGIN_ID,
    workflow: safeWorkflowIdentity(workflowIdentity),
    workflow_run_id: runId,
    status: continued.status,
    request_id: responseRequestId,
    accepted: true,
    text: controlAckText({ action, runId, requestId: responseRequestId, response: continued }),
  };
}

export async function runWorkflow(values = {}, { pluginConfig = {}, ctx = {}, api } = {}) {
  let allowedWorkflow;
  try {
    allowedWorkflow = validateWorkflowPath(values.workflow);
  } catch {
    return publicWorkflowError('unsupported_workflow_path');
  }

  const workflowPath = configuredWorkflowPath(pluginConfig, allowedWorkflow);
  const workflowIdentity = await workflowIdentityForPath(workflowPath);
  const runsRoot = workflowRunsRoot(pluginConfig);
  const task = safeTaskText(values);
  const safeTaskTitle = safeRunTitle(task);
  const title = task && safeTaskTitle !== 'workflow' ? `${workflowIdentity}: ${safeTaskTitle}` : workflowIdentity;
  const requesterBinding = requesterBindingFromContext(ctx);
  const requester = requesterBinding?.sessionRef || ctx.sessionKey || ctx.session?.key || ctx.sessionId || ctx.sender?.id || ctx.from?.id || ctx.senderId || ctx.requesterRef;

  const requestId = compactRequestId(values.requestId || values.request_id);

  if (!runtimeSubagent(api)) return publicWorkflowError('runtime_subagent_unavailable', { requestId });

  try {
    const registered = await registerWorkflowRun({
      title,
      summary: task ? 'Orbita workflow run' : 'Orbita workflow run without task text',
      workflowPath,
      workflowIdentity,
      status: 'running',
      runsRoot,
      claim: true,
      owner: requester ? String(requester) : 'orbita',
      harness: 'orbita-workflow',
      sessionId: requester ? String(requester) : undefined,
      workerId: `orbita-${requestId}`,
      requestId,
      requesterBinding,
      leaseMs: DEFAULT_LEASE_MS,
    });
    const stored = await storeWorkflowLeaseToken({ workflowLeaseContext: values.workflowLeaseContext, api, ctx, runId: registered.runId, leaseToken: registered.leaseToken, requestId });
    if (!stored) {
      await releaseWorkflowRunLease({ runId: registered.runId, workflowPath, runsRoot, response: { runId: registered.runId, status: registered.status, baton: { cursor: undefined }, requests: [] }, leaseToken: registered.leaseToken }).catch(() => {});
      return publicWorkflowError('workflow_lease_persistence_failed', { requestId });
    }
    scheduleBackgroundWorkflowDrive({ api, runId: registered.runId, workflowPath, runsRoot, leaseToken: registered.leaseToken, task, requestId, workflowIdentity, requesterBinding });
    const text = ackText({ runId: registered.runId, requestId });
    return {
      ok: true,
      mode: 'run',
      openclaw_surface: PLUGIN_ID,
      workflow: safeWorkflowIdentity(workflowIdentity),
      workflow_run_id: registered.runId,
      status: 'running',
      request_id: requestId,
      text,
    };
  } catch {
    return publicWorkflowError('workflow_failed', { requestId });
  }
}
