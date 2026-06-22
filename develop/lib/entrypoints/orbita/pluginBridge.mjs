import { lstat } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { projectOrbitaResult } from '../../dtos/orbita-lifecycle/projections.mjs';
import { createFileOrbitaRunStore } from '../../persistence/orbita-lifecycle/fileRunStore.mjs';
import { createOrbitaLifecycleController } from '../../use-cases/orbita-lifecycle/controller.mjs';
import { createOrbitaIntakeAgent } from './intakeAgent.mjs';
import {
  DEFAULT_WORKFLOW_RUN_LIST_LIMIT,
  MAX_WORKFLOW_RUN_LIST_LIMIT,
  buildNativeInboxPresentation,
  formatNativeInboxReply,
  formatNativeListText,
  formatNativeRunText,
  formatNativeStatusText,
  formatWorkflowRunBlock,
  inboxWorkflowRuns,
  safePublicRequestId,
  safeWorkflowRunTitle,
  summarizeStatusItems,
  userFacingWorkflowState,
  workflowRunCurrentGate,
  workflowRunHasApprovalAction,
  workflowRunNeedsHumanAction,
} from './nativePresentation.mjs';
import { localArtifactPath, pendingUserActionText, safeArtifactAttachments } from './pendingActionCard.mjs';
import { continueWorkflowRunFromOrbita, isWorkflowRunRequested, listWorkflowRunsForOrbita, readWorkflowRunCanonicalState, runWorkflow, workflowLeaseContextFromCurrentSession } from './workflowAdapter.mjs';

const PLUGIN_ID = 'orbita';
const COMMAND_NAME = 'orbita';
const TOOL_NAME = 'orbita';
const WORKSPACE_DIR = resolve(process.env.OPENCLAW_WORKSPACE_DIR || join(process.env.HOME || process.cwd(), '.openclaw', 'workspace'));
const DEFAULT_RUNS_ROOT = join(WORKSPACE_DIR, '.openclaw-runtime', 'plugins', 'orbita', 'runs');
const PUBLIC_MODES = new Set(['run', 'inbox', 'status', 'list', 'cancel', 'approve', 'reject', 'reply', 'help']);
const PERSISTENT_MODES = new Set(['run', 'inbox', 'status', 'list', 'cancel', 'approve', 'reject', 'reply']);
const LOCAL_MEDIA_URLS = Symbol.for('openclaw.orbita.localMediaUrls');

function withLocalMediaUrls(result, mediaUrls = []) {
  if (mediaUrls.length > 0) Object.defineProperty(result, LOCAL_MEDIA_URLS, { value: mediaUrls });
  return result;
}

function localMediaUrls(result) {
  const urls = result?.[LOCAL_MEDIA_URLS];
  return Array.isArray(urls) ? urls : [];
}

function defineLocalPluginEntry(entry) {
  return entry;
}

function usageText() {
  return `Orbita lifecycle bridge

Usage:
  orbita run [--dry-run] [--kind <kind>] [messy raw request]
  orbita run --workflow <workflow.json> -- <task>
  orbita inbox [--limit <n>] [--page <n>]
  orbita status [--run <id>]
  orbita list [--state <state>] [--limit <n>]
  orbita cancel <run> [--reason <text>]
  orbita approve <run>
  orbita reject <run> [reason]
  orbita reply <run> <text>
  orbita help

Diagnostic: use orbita run --dry-run.
Default runs root: workspace-managed Orbita runtime storage`;
}

function formatNativeHelpText() {
  return `🪐 Orbita
State-aware lifecycle bridge.

Команды
/orbita run <запрос> — разобрать запрос и создать/продолжить активный run
/orbita run --dry-run <запрос> — semantic intake без записи
/orbita run --workflow <workflow.json> -- <task> — запустить workflow до approval prompt
/orbita inbox — runs, требующие доставки/внимания
/orbita status [--run <id>] — состояние
/orbita list — список runs
/orbita cancel <run> — отменить run
/orbita approve <run> — approve текущий pending workflow approval
/orbita reject <run> [reason] — reject текущий pending workflow approval
/orbita reply <run> <text> — ответить на ожидающий вопрос
/orbita help — помощь`;
}

function jsonText(value) {
  return JSON.stringify(value, (_key, val) => val === undefined ? undefined : val, 2);
}

function ensureUnderWorkspace(path) {
  const workspace = `${WORKSPACE_DIR}/`;
  if (path !== WORKSPACE_DIR && !path.startsWith(workspace)) {
    throw new Error('runs_root must stay under the OpenClaw workspace');
  }
  return path;
}

function resolveRunsRoot(value, pluginConfig = {}) {
  if (value) {
    if (isAbsolute(value) || value.split(/[\\/]+/).includes('..')) {
      throw new Error('runs_root must be a relative path without parent traversal');
    }
    return ensureUnderWorkspace(resolve(DEFAULT_RUNS_ROOT, value));
  }
  if (pluginConfig.runsRoot) {
    const configured = pluginConfig.runsRoot;
    const resolved = isAbsolute(configured) ? resolve(configured) : resolve(WORKSPACE_DIR, configured);
    return ensureUnderWorkspace(resolved);
  }
  return DEFAULT_RUNS_ROOT;
}

async function assertRunsRootHasNoSymlinkedExistingSegments(runsRoot) {
  const pathFromWorkspace = relative(WORKSPACE_DIR, runsRoot);
  if (!pathFromWorkspace) return;
  let cursor = WORKSPACE_DIR;
  for (const segment of pathFromWorkspace.split(/[\\/]+/).filter(Boolean)) {
    cursor = join(cursor, segment);
    try {
      if ((await lstat(cursor)).isSymbolicLink()) {
        throw new Error('runs_root must stay under the OpenClaw workspace without symlink escapes');
      }
    } catch (error) {
      if (error?.code === 'ENOENT') return;
      throw error;
    }
  }
}

const cliOptions = {
  run: { type: 'string' },
  kind: { type: 'string' },
  state: { type: 'string' },
  limit: { type: 'string' },
  page: { type: 'string' },
  reason: { type: 'string' },
  request: { type: 'string' },
  text: { type: 'string' },
  workflow: { type: 'string' },
  'runs-root': { type: 'string' },
  'dry-run': { type: 'boolean' },
  keep: { type: 'boolean' },
  help: { type: 'boolean' },
};

function controllerFor(runsRoot) {
  return createOrbitaLifecycleController({ store: createFileOrbitaRunStore({ runsRoot }) });
}

function compactDuration(ms) {
  if (!Number.isFinite(ms) || ms < 0) return undefined;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d`;
  const months = Math.floor(days / 30);
  if (months < 24) return `${months}mo`;
  return `${Math.floor(days / 365)}y`;
}

function compactAgeSince(value, { now = new Date() } = {}) {
  if (typeof value !== 'string' || !value) return undefined;
  const timestamp = Date.parse(value);
  const current = now instanceof Date ? now.getTime() : Date.parse(now);
  if (!Number.isFinite(timestamp) || !Number.isFinite(current)) return undefined;
  return compactDuration(current - timestamp);
}

function waitingReasonForWorkflowRun(run = {}) {
  const actions = Array.isArray(run.hostActions) ? run.hostActions : [];
  if (actions.some((action) => action?.action === 'wait_for_approval')) return 'approval needed';
  if (actions.some((action) => action?.action === 'run_worker')) return 'worker action pending';
  if (run.currentGate) return 'approval needed';
  return undefined;
}

function safeLeaseState(run = {}, { workflowLeaseContext } = {}) {
  const occupancyState = run.occupancy?.state;
  if (occupancyState === 'occupied' && workflowLeaseContext?.tokenForRun?.(run.runId)) return 'owned';
  if (occupancyState === 'occupied') return 'busy';
  if (occupancyState === 'stale') return 'reclaimable';
  if (occupancyState === 'unclaimed') return 'unclaimed';
  return occupancyState ? 'unknown' : undefined;
}

function projectWorkflowRun(run, options = {}) {
  if (!run) return null;
  const state = userFacingWorkflowState(run);
  const userActionRequired = workflowRunNeedsHumanAction(run);
  const waitingReason = options.exposeHostActionDetails ? waitingReasonForWorkflowRun(run) : undefined;
  const projected = {
    workflow_run_id: run.runId,
    workflow_identity: safeWorkflowRunTitle(run.workflow?.identity),
    request_id: safePublicRequestId(run.requestId) ?? safePublicRequestId(run.failure?.request_id),
    title: safeWorkflowRunTitle(run.title),
    status: run.status,
    state_label: state.label,
    current_step: options.exposeHostActionDetails ? safeHostActionValue(run.currentStep) : undefined,
    current_gate: options.exposeHostActionDetails ? safeHostActionValue(run.currentGate) : undefined,
    host_actions: options.exposeHostActionDetails ? safeHostActions(run.hostActions) : undefined,
    waiting_reason: waitingReason,
    user_action_required: userActionRequired,
    user_action_label: userActionRequired ? (waitingReason ?? 'waiting for you') : (state.label === 'worker action pending' ? state.label : undefined),
    failure_code: run.failure?.failure_code,
    error_code: run.failure?.error_code,
    created_at: run.createdAt,
    updated_at: run.updatedAt,
    elapsed: compactAgeSince(run.createdAt, options),
    updated_age: compactAgeSince(run.updatedAt, options),
    lease_state: safeLeaseState(run, options),
    task_flow_id: run.taskFlowId ?? null,
  };
  for (const key of Object.keys(projected)) if (projected[key] === undefined) delete projected[key];
  return projected;
}

function projectWorkflowRuns(runs = [], options = {}) {
  return runs.map((run) => projectWorkflowRun(run, options)).filter(Boolean);
}

function normalizePositiveInteger(value, defaultValue) {
  const requested = value === undefined || value === null || value === '' ? defaultValue : Number(value);
  return Number.isInteger(requested) && requested >= 1 ? requested : defaultValue;
}

function normalizeWorkflowRunLimit(value) {
  const effectiveRequested = normalizePositiveInteger(value, DEFAULT_WORKFLOW_RUN_LIST_LIMIT);
  return {
    requested: effectiveRequested,
    limit: Math.min(effectiveRequested, MAX_WORKFLOW_RUN_LIST_LIMIT),
  };
}

function normalizeWorkflowRunPage(value) {
  return normalizePositiveInteger(value, 1);
}

function workflowRunStateFilter(values = {}) {
  const stateFilter = values.workflow_states ?? values.workflowStates ?? values.state;
  if (Array.isArray(stateFilter)) return new Set(stateFilter.filter((state) => typeof state === 'string' && state.length > 0));
  return typeof stateFilter === 'string' && stateFilter.length > 0 ? new Set([stateFilter]) : undefined;
}

function safeHostActionValue(value) {
  return safeWorkflowRunTitle(typeof value === 'string' ? value : undefined);
}

function safeHostActions(actions) {
  if (!Array.isArray(actions)) return undefined;
  const projected = actions
    .map((action) => ({ action: safeHostActionValue(action?.action), step_id: safeHostActionValue(action?.stepId ?? action?.id) }))
    .filter((action) => action.action || action.step_id)
    .slice(0, 8);
  return projected.length > 0 ? projected : undefined;
}

const WORKFLOW_RUN_OPEN_CARD_PATTERN = /^(?:run-|wf-|workflow-|[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$)/iu;

function workflowRunOpenCardNotFound(runId) {
  return {
    ok: false,
    mode: 'run',
    openclaw_surface: PLUGIN_ID,
    workflow_run_id: safeWorkflowRunTitle(runId),
    status: 'unavailable',
    message: 'workflow_run_not_found',
    text: `🪐 Orbita run\nRun not found or unavailable: ${safeWorkflowRunTitle(runId) ?? 'requested run'}\nНовый run не создан.`,
  };
}

function workflowRunIdInvocation(values = {}) {
  if (values.workflow || values['dry-run'] === true || values.kind || values.request) return undefined;
  const positionals = Array.isArray(values._positionals) ? values._positionals : [];
  if (positionals.length !== 1) return undefined;
  const candidate = String(positionals[0] ?? '').trim();
  if (!candidate || /\s/.test(candidate)) return undefined;
  return candidate;
}

function requestStepId(request) {
  return request?.stepId ?? request?.id;
}

function isHumanHostActionRequest(request = {}) {
  return request?.action === 'wait_for_approval';
}

function pendingUserActionRequestFromResponse(response) {
  const requests = Array.isArray(response?.requests) ? response.requests : [];
  return requests.find(isHumanHostActionRequest);
}

async function enrichWorkflowRunForOrbita(pluginConfig, run) {
  const canonical = await readWorkflowRunCanonicalState(pluginConfig, run?.runId);
  if (canonical.degradedReason) {
    const { currentStep, currentGate, hostActions, ...withoutCachedPendingState } = run ?? {};
    return { ...withoutCachedPendingState, canonicalStateUnavailable: true, hostActions: [] };
  }
  return {
    ...run,
    status: canonical.response?.status ?? run.status,
    currentStep: canonical.currentStep,
    currentGate: canonical.currentGate,
    hostActions: canonical.hostActions,
  };
}

async function pendingWorkflowRunInvocation(pluginConfig = {}, values = {}, { requesterRef, workflowLeaseContext } = {}) {
  const requestedRunId = workflowRunIdInvocation(values);
  if (!requestedRunId) return undefined;
  const runs = await listWorkflowRunsForOrbita({ pluginConfig });
  const rawRun = runs.find((run) => run?.runId === requestedRunId);
  if (!rawRun) return workflowRunOpenCardNotFound(requestedRunId);
  const canonical = await readWorkflowRunCanonicalState(pluginConfig, requestedRunId);
  const run = await enrichWorkflowRunForOrbita(pluginConfig, rawRun);
  const response = canonical.response;
  const degradedReason = canonical.degradedReason;
  const pendingUserActionRequest = degradedReason ? undefined : pendingUserActionRequestFromResponse(response);
  const attachments = pendingUserActionRequest ? await safeArtifactAttachments(pluginConfig, requestedRunId, response) : [];
  const privateMediaUrls = attachments.map(localArtifactPath).filter((value) => typeof value === 'string' && value);
  const projectedRun = projectWorkflowRun(run, { workflowLeaseContext });

  if (!workflowRunNeedsHumanAction(run) || !pendingUserActionRequest) {
    return {
      ok: true,
      mode: 'run',
      openclaw_surface: PLUGIN_ID,
      workflow: safeWorkflowRunTitle(run.workflow?.identity) ?? 'workflow',
      workflow_run_id: run.runId,
      status: run.status,
      ...(safePublicRequestId(run.requestId) ? { request_id: safePublicRequestId(run.requestId) } : {}),
      workflow_run: projectedRun,
      workflow_runs: [projectedRun],
      user_action_text: `🪐 Orbita run\n${formatWorkflowRunBlock(projectedRun)}\n\nЭтот run сейчас не ждёт ответа или approval. Новый run не создан.`,
      message: 'workflow_run_invoked_not_waiting',
    };
  }

  const pendingText = pendingUserActionText({ run, response, stepId: requestStepId(pendingUserActionRequest), request: pendingUserActionRequest, degradedReason, attachments });
  return withLocalMediaUrls({
    ok: true,
    mode: 'run',
    openclaw_surface: PLUGIN_ID,
    workflow: safeWorkflowRunTitle(run.workflow?.identity) ?? 'workflow',
    workflow_run_id: run.runId,
    status: run.status,
    ...(safePublicRequestId(run.requestId) ? { request_id: safePublicRequestId(run.requestId) } : {}),
    workflow_run: projectedRun,
    workflow_runs: [projectedRun],
    user_action: {
      type: pendingUserActionRequest.action === 'wait_for_approval' ? 'approval' : 'question',
      label: pendingUserActionRequest.action === 'wait_for_approval' ? 'Approval needed' : 'Answer needed',
      artifact_attachments: attachments,
      degraded: Boolean(degradedReason),
      ...(degradedReason ? { degraded_reason: degradedReason } : {}),
    },
    user_action_text: pendingText,
    message: 'workflow_run_waiting_for_user',
  }, privateMediaUrls);
}

async function listWorkflowRunsForBridge(pluginConfig = {}, values = {}, options = {}) {
  const { requested, limit } = normalizeWorkflowRunLimit(values.limit);
  const page = normalizeWorkflowRunPage(values.page);
  const offset = (page - 1) * limit;
  const allRuns = await Promise.all((await listWorkflowRunsForOrbita({ pluginConfig })).map((run) => enrichWorkflowRunForOrbita(pluginConfig, run)));
  const states = workflowRunStateFilter(values);
  const scopedByState = states ? allRuns.filter((run) => states.has(run.status)) : allRuns;
  const scoped = values.inbox_only ? inboxWorkflowRuns(scopedByState) : scopedByState;
  const shown = scoped.slice(offset, offset + limit);
  const totalPages = Math.max(1, Math.ceil(scoped.length / limit));
  return {
    workflow_runs: projectWorkflowRuns(shown, { ...options, exposeHostActionDetails: Boolean(values.inbox_only) }),
    workflow_runs_meta: {
      total: scoped.length,
      shown: shown.length,
      limit,
      requested_limit: requested,
      default_limit: DEFAULT_WORKFLOW_RUN_LIST_LIMIT,
      max_limit: MAX_WORKFLOW_RUN_LIST_LIMIT,
      page,
      total_pages: totalPages,
      mode: values.inbox_only ? 'inbox' : 'list',
      offset,
      has_previous_page: page > 1,
      has_next_page: page < totalPages,
      limited: scoped.length > offset + shown.length || page > 1,
    },
  };
}

async function statusForOrbita({ controller, values, requesterRef, projectionOptions, pluginConfig, workflowLeaseContext }) {
  const selectedRun = Boolean(values.run);
  const lifecycle = selectedRun
    ? projectBridgeResult(await controller.status({ runId: values.run, requesterRef }), projectionOptions)
    : { ok: true, mode: 'status', openclaw_surface: PLUGIN_ID };
  if (selectedRun && (lifecycle.ok !== false || lifecycle.message !== 'run_not_found')) return { ...lifecycle, status_scope: 'run' };

  const workflowRuns = await Promise.all((await listWorkflowRunsForOrbita({ pluginConfig })).map((run) => enrichWorkflowRunForOrbita(pluginConfig, run)));
  if (selectedRun) {
    const run = workflowRuns.find((candidate) => candidate.runId === values.run);
    if (!run) return { ...lifecycle, status_scope: 'run' };
    return {
      ok: true,
      mode: 'status',
      openclaw_surface: PLUGIN_ID,
      run: null,
      workflow_run: projectWorkflowRun(run, { workflowLeaseContext, exposeHostActionDetails: true }),
      workflow_runs: projectWorkflowRuns([run], { workflowLeaseContext, exposeHostActionDetails: true }),
      workflow_runs_meta: { total: 1, shown: 1, limit: 1, requested_limit: 1, default_limit: DEFAULT_WORKFLOW_RUN_LIST_LIMIT, max_limit: MAX_WORKFLOW_RUN_LIST_LIMIT, limited: false },
      status_scope: 'run',
      message: 'workflow_run_status',
      status_scope: 'run',
    };
  }

  const shouldIncludeLifecycleRuns = Boolean(pluginConfig.runsRoot || !pluginConfig.workflowRunsRoot);
  const lifecycleList = shouldIncludeLifecycleRuns ? projectBridgeResult(await controller.list({ requesterRef }), projectionOptions) : { runs: [] };
  const lifecycleRuns = Array.isArray(lifecycleList.runs) ? lifecycleList.runs : [];
  const workflowInboxRuns = inboxWorkflowRuns(workflowRuns);
  const projectedWorkflowRuns = projectWorkflowRuns(workflowRuns, { workflowLeaseContext });
  return {
    ...lifecycle,
    run: undefined,
    runs: lifecycleRuns,
    workflow_runs: projectedWorkflowRuns,
    workflow_runs_meta: {
      total: projectedWorkflowRuns.length,
      shown: projectedWorkflowRuns.length,
      limit: projectedWorkflowRuns.length,
      requested_limit: projectedWorkflowRuns.length,
      default_limit: DEFAULT_WORKFLOW_RUN_LIST_LIMIT,
      max_limit: MAX_WORKFLOW_RUN_LIST_LIMIT,
      limited: false,
    },
    status_summary: summarizeStatusItems({ runs: lifecycleRuns, workflowRuns, inboxWorkflowRunItems: workflowInboxRuns }),
    status_scope: 'global',
  };
}

function projectBridgeResult(result, options = {}) {
  return { ...projectOrbitaResult(result, options), openclaw_surface: PLUGIN_ID };
}

function actorRef(actor) {
  if (actor === undefined || actor === null) return undefined;
  if (typeof actor === 'string' || typeof actor === 'number' || typeof actor === 'bigint') return String(actor);
  if (typeof actor !== 'object') return undefined;
  return actor.id ?? actor.userId ?? actor.username ?? actor.handle ?? actor.ref;
}

function requesterRefFrom(ctx = {}) {
  const delivery = ctx.deliveryContext && typeof ctx.deliveryContext === 'object' && !Array.isArray(ctx.deliveryContext) ? ctx.deliveryContext : {};
  return ctx.sessionKey || ctx.session?.key || ctx.sessionId || delivery.sessionKey || delivery.sessionId || ctx.sender?.id || actorRef(ctx.from) || ctx.senderId || ctx.requesterRef;
}

function isDryRun(values = {}) {
  return values['dry-run'] === true;
}

function trustedRequesterRequired(mode, values = {}, ctx = {}) {
  if (!PERSISTENT_MODES.has(mode)) return false;
  if (mode === 'run' && isDryRun(values)) return false;
  return !requesterRefFrom(ctx);
}

function trustedRequesterError(mode) {
  return { ok: false, mode, openclaw_surface: PLUGIN_ID, message: 'trusted_requester_required' };
}

function rawRequestFromValues(values = {}) {
  if (typeof values.request === 'string' && values.request.trim()) return values.request.trim();
  if (Array.isArray(values._positionals) && values._positionals.length > 0) return values._positionals.join(' ').trim();
  return undefined;
}

async function runOrbita(mode, values = {}, { pluginConfig = {}, ctx = {}, api } = {}) {
  if (mode === 'help') return { ok: true, text: usageText() };
  if (!PUBLIC_MODES.has(mode)) return { ok: false, mode, openclaw_surface: PLUGIN_ID, message: 'unsupported_orbita_command', text: usageText() };
  if (trustedRequesterRequired(mode, values, ctx)) return trustedRequesterError(mode);
  const runsRoot = resolveRunsRoot(values['runs-root'], pluginConfig);
  await assertRunsRootHasNoSymlinkedExistingSegments(runsRoot);
  const controller = controllerFor(runsRoot);
  const requesterRef = requesterRefFrom(ctx);
  const workflowLeaseContext = await workflowLeaseContextFromCurrentSession({ api, ctx });

  if (mode === 'approve' || mode === 'reject' || mode === 'reply') {
    return continueWorkflowRunFromOrbita({ ...values, controlAction: mode, workflowLeaseContext }, { pluginConfig, ctx, api });
  }

  if (mode === 'run') {
    const pendingWorkflowRun = await pendingWorkflowRunInvocation(pluginConfig, values, { requesterRef, workflowLeaseContext });
    if (pendingWorkflowRun) return pendingWorkflowRun;
    if (isWorkflowRunRequested(values)) return runWorkflow({ ...values, workflowLeaseContext }, { pluginConfig, ctx, api });
    const rawRequest = rawRequestFromValues(values);
    const candidateRefs = pluginConfig.candidateRefs ?? pluginConfig.matchCandidates;
    const intakeAgent = createOrbitaIntakeAgent({ api });
    return projectBridgeResult(await controller.run({
      dryRun: values['dry-run'] === true,
      requesterRef,
      kind: values.kind,
      candidateRefs,
      prepareIntake: () => intakeAgent.intake({ rawRequest, kind: values.kind, candidateRefs }),
      opaqueRefs: { surface: PLUGIN_ID },
    }), { candidateRefs });
  }

  const projectionOptions = { candidateRefs: pluginConfig.candidateRefs ?? pluginConfig.matchCandidates };
  if (mode === 'inbox') {
    const lifecycle = projectBridgeResult(await controller.inbox({ limit: values.limit, requesterRef }), projectionOptions);
    return { ...lifecycle, ...(await listWorkflowRunsForBridge(pluginConfig, { ...values, inbox_only: true }, { workflowLeaseContext })) };
  }
  if (mode === 'status') return statusForOrbita({ controller, values, requesterRef, projectionOptions, pluginConfig, workflowLeaseContext });
  if (mode === 'list') {
    const lifecycle = projectBridgeResult(await controller.list({ state: values.state, limit: values.limit, requesterRef }), projectionOptions);
    return { ...lifecycle, ...(await listWorkflowRunsForBridge(pluginConfig, values, { workflowLeaseContext })) };
  }
  if (mode === 'cancel') return projectBridgeResult(await controller.cancel({ runId: values.run || values._positionals?.[0], reason: values.reason, requesterRef }), projectionOptions);

  return { ok: true, text: usageText() };
}

function parseModeValues(mode, args = []) {
  if (mode === 'help') return { values: {}, positionals: [] };

  const separatorIndex = args.indexOf('--');
  const optionTokens = separatorIndex >= 0 ? args.slice(0, separatorIndex) : args;
  const requestTokens = separatorIndex >= 0 ? args.slice(separatorIndex + 1) : [];

  if (optionTokens.includes('--help')) return { help: true, values: {}, positionals: [] };

  if (mode !== 'run') {
    const { values, positionals } = parseArgs({ args, options: cliOptions, strict: true, allowPositionals: true });
    values._positionals = positionals;
    if ((mode === 'cancel' || mode === 'approve' || mode === 'reject' || mode === 'reply') && !values.run && positionals[0]) values.run = positionals[0];
    if ((mode === 'reject' || mode === 'reply') && !values.text && positionals.length > 1) values.text = positionals.slice(1).join(' ');
    return { values, positionals };
  }

  const scanTokens = separatorIndex >= 0 ? optionTokens : args;
  let firstRequestIndex = scanTokens.length;
  for (let index = 0; index < scanTokens.length; index += 1) {
    const token = scanTokens[index];
    if (!token.startsWith('-')) {
      firstRequestIndex = index;
      break;
    }
    if (['--kind', '--run', '--state', '--limit', '--reason', '--request', '--workflow', '--runs-root'].includes(token)) index += 1;
  }

  const parsedOptionTokens = scanTokens.slice(0, firstRequestIndex);
  const trailingRequestTokens = separatorIndex >= 0 ? requestTokens : scanTokens.slice(firstRequestIndex);
  const { values } = parseArgs({ args: parsedOptionTokens, options: cliOptions, strict: true, allowPositionals: true });
  values._positionals = trailingRequestTokens;
  return { values, positionals: trailingRequestTokens };
}

function parseCommandArgs(args = '') {
  const tokens = typeof args === 'string' ? args.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g)?.map((token) => token.replace(/^(["'])(.*)\1$/, '$2')) ?? [] : [];
  const [mode = 'help', ...rest] = tokens;
  if (!PUBLIC_MODES.has(mode)) return { mode: 'help', values: {} };
  const parsed = parseModeValues(mode, rest);
  if (parsed.help) return { mode: 'help', values: {} };
  return { mode, values: parsed.values };
}

function toolParametersSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['mode'],
    properties: {
      mode: { type: 'string', enum: ['run', 'inbox', 'status', 'list', 'cancel', 'approve', 'reject', 'reply', 'help'] },
      run: { type: 'string' },
      kind: { type: 'string' },
      state: { type: 'string' },
      limit: { type: 'number' },
      page: { type: 'number' },
      reason: { type: 'string' },
      request: { type: 'string' },
      text: { type: 'string' },
      workflow: { type: 'string' },
      runs_root: { type: 'string' },
      dry_run: { type: 'boolean' },
    },
  };
}

function toolValues(params = {}) {
  const values = {
    run: params.run,
    kind: params.kind,
    state: params.state,
    limit: params.limit,
    page: params.page,
    reason: params.reason,
    request: params.request,
    workflow: params.workflow,
    text: params.text,
    'runs-root': params.runs_root,
    'dry-run': params.dry_run,
  };
  if (params.mode === 'run' && typeof params.run === 'string' && params.run.trim()) values._positionals = [params.run.trim()];
  return values;
}

export default defineLocalPluginEntry({
  id: PLUGIN_ID,
  name: 'Orbita',
  description: 'State-aware OpenClaw adapter for the Skills-owned Orbita lifecycle controller.',
  register(api) {
    api.registerSessionExtension?.({
      namespace: 'workflowLeases',
      description: 'Orbita workflow lease tokens bound to the current OpenClaw session.',
      project: ({ state }) => {
        const runs = state?.runs && typeof state.runs === 'object' && !Array.isArray(state.runs) ? state.runs : {};
        return { runCount: Object.keys(runs).length };
      },
    });

    api.registerCommand?.({
      name: COMMAND_NAME,
      nativeNames: { default: COMMAND_NAME, telegram: COMMAND_NAME },
      description: 'Run Orbita lifecycle commands: run/inbox/status/list/cancel/approve/reject/reply/help.',
      acceptsArgs: true,
      handler: async (ctx = {}) => {
        const { mode, values } = parseCommandArgs(ctx.args || 'help');
        const result = await runOrbita(mode, values, { pluginConfig: api.pluginConfig || {}, ctx, api });
        if (mode === 'help') return { text: formatNativeHelpText() };
        if (mode === 'inbox') return formatNativeInboxReply(result);
        if (mode === 'list') return { text: formatNativeListText(result) };
        if (mode === 'status') return { text: formatNativeStatusText(result) };
        if (mode === 'run') return {
          text: formatNativeRunText(result),
          ...(localMediaUrls(result).length > 0 ? { mediaUrls: localMediaUrls(result), trustedLocalMedia: true } : {}),
        };
        if (mode === 'approve' || mode === 'reject' || mode === 'reply') return { text: result.text ?? jsonText(result) };
        return { text: result.text ?? jsonText(result) };
      },
    });

    api.registerTool?.({
      name: TOOL_NAME,
      description: 'Orbita lifecycle bridge. Returns compact state; does not echo prompts, transcripts, approval tokens, or worker answers.',
      parameters: toolParametersSchema(),
      async execute(_id, params = {}, ctx = {}) {
        const result = await runOrbita(params.mode, toolValues(params), { pluginConfig: api.pluginConfig || {}, ctx, api });
        return { content: [{ type: 'text', text: result.text ?? jsonText(result) }] };
      },
    });

    api.registerCli?.(({ program }) => {
      const root = program
        .command(COMMAND_NAME)
        .description('Orbita lifecycle bridge')
        .allowUnknownOption(true)
        .allowExcessArguments(true);

      for (const mode of ['run', 'inbox', 'status', 'list', 'cancel', 'approve', 'reject', 'reply', 'help']) {
        root
          .command(`${mode} [args...]`)
          .description(mode === 'help' ? 'Show Orbita help' : `Run ${mode}`)
          .allowUnknownOption(true)
          .action(async (args = []) => {
            try {
              const parsedMode = mode === 'help' ? 'help' : mode;
              const parsed = parseModeValues(parsedMode, args);
              if (parsed.help) {
                console.log(formatNativeHelpText());
                return;
              }
              const { values } = parsed;
              const result = await runOrbita(parsedMode, values, { pluginConfig: api.pluginConfig || {}, api });
              console.log(result.text ?? jsonText(result));
            } catch (error) {
              console.error(`orbita: ${error?.message ?? String(error)}`);
              process.exitCode = 1;
            }
          });
      }
    }, {
      descriptors: [{ name: COMMAND_NAME, description: 'Orbita lifecycle bridge', hasSubcommands: true }],
    });
  },
});

export { buildNativeInboxPresentation, formatNativeHelpText, formatNativeInboxReply, formatNativeListText, formatNativeRunText, formatNativeStatusText, parseCommandArgs, runOrbita, usageText };
