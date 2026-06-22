// Native Orbita presentation helpers for public, command-oriented run lists and status cards.
// This module owns redaction and human-facing formatting so the plugin bridge stays thin.

const MAX_WORKFLOW_RUN_TITLE_CHARS = 96;
const DEFAULT_WORKFLOW_RUN_LIST_LIMIT = 10;
const MAX_WORKFLOW_RUN_LIST_LIMIT = 50;
const SAFE_PUBLIC_REQUEST_ID_PATTERN = /^orbita-[a-z0-9][a-z0-9-]{0,95}$/u;

function redactSensitivePublicText(value) {
  return String(value)
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

function safeWorkflowRunTitle(value) {
  if (typeof value !== 'string') return undefined;
  const redacted = redactSensitivePublicText(value);
  if (!redacted) return undefined;
  const bounded = redacted.length > MAX_WORKFLOW_RUN_TITLE_CHARS ? redacted.slice(0, MAX_WORKFLOW_RUN_TITLE_CHARS) : redacted;
  return bounded.trim() || undefined;
}

function safePublicRequestId(value) {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase();
  return SAFE_PUBLIC_REQUEST_ID_PATTERN.test(normalized) ? normalized : undefined;
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

function compactAgeSince(value, { now = Date.now() } = {}) {
  if (typeof value !== 'string' || !value) return undefined;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return undefined;
  return compactDuration(now - timestamp);
}

function compactRunAgeLine(run = {}) {
  const age = run.age ?? run.elapsed ?? compactAgeSince(run.created_at ?? run.createdAt);
  const updatedAge = run.updated_age ?? run.last_update_age ?? compactAgeSince(run.updated_at ?? run.updatedAt);
  if (age && updatedAge) return `age: ${age} · updated: ${updatedAge} ago`;
  if (age) return `age: ${age}`;
  if (updatedAge) return `updated: ${updatedAge} ago`;
  return undefined;
}

function compactLineValue(value) {
  if (value === undefined || value === null || value === '') return '—';
  return String(value);
}

function jsonText(value) {
  return JSON.stringify(value, (_key, val) => {
    if (val === undefined) return undefined;
    if (typeof val === 'string') return redactSensitivePublicText(val);
    return val;
  }, 2);
}

const MAX_NATIVE_TITLE_CHARS = 180;

function boundedNativeTitle(value) {
  const title = safeWorkflowRunTitle(value) ?? 'Untitled workflow run';
  if (title.length <= MAX_NATIVE_TITLE_CHARS) return title;
  return `${title.slice(0, MAX_NATIVE_TITLE_CHARS - 1).trim()}…`;
}

function workflowRunHostActions(run = {}) {
  if (Array.isArray(run.hostActions)) return run.hostActions;
  if (Array.isArray(run.host_actions)) return run.host_actions.map((action) => ({ action: action?.action, stepId: action?.stepId ?? action?.step_id ?? action?.id }));
  return [];
}

function workflowRunCurrentStep(run = {}) {
  return run.currentStep ?? run.current_step;
}

function workflowRunCurrentGate(run = {}) {
  return run.currentGate ?? run.current_gate;
}

function workflowRunWaitingReason(run = {}) {
  if (run.waiting_reason) return run.waiting_reason;
  if (workflowRunHostActions(run).some((action) => action?.action === 'wait_for_approval')) return 'approval needed';
  if (workflowRunHostActions(run).some((action) => action?.action === 'run_worker')) return 'worker action pending';
  if (workflowRunCurrentGate(run)) return 'approval needed';
  if (run.user_action_label) return run.user_action_label;
  return undefined;
}

function workflowRunHasApprovalAction(run = {}) {
  return workflowRunHostActions(run).some((action) => action?.action === 'wait_for_approval');
}

function workflowRunNeedsHumanAction(run = {}) {
  if (run?.status !== 'needs_host_actions') return false;
  const actions = workflowRunHostActions(run);
  if (actions.length > 0) return workflowRunHasApprovalAction(run);
  if (run.user_action_required === true) return true;
  if (run.user_action_required === false) return false;
  return Boolean(workflowRunCurrentGate(run));
}

function userFacingWorkflowState(run = {}) {
  if (run.status === 'done' || run.status === 'completed') return { icon: '✅', label: 'done' };
  if (run.status === 'failed') return { icon: '🔴', label: 'failed' };
  if (run.status === 'blocked') return { icon: '⛔', label: 'blocked' };
  if (run.status === 'stopped' || run.status === 'cancelled' || run.status === 'canceled') return { icon: '🛑', label: 'stopped' };
  if (run.user_action_label) return { icon: workflowRunNeedsHumanAction(run) ? '🟡' : '🔧', label: run.user_action_label };
  if (workflowRunNeedsHumanAction(run)) return { icon: '🟡', label: 'waiting for you' };
  if (run.status === 'needs_host_actions' && workflowRunHostActions(run).some((action) => action?.action === 'run_worker')) return { icon: '🔧', label: 'worker action pending' };
  if (run.status === 'running') return { icon: '🔵', label: 'running' };
  return { icon: '⚪', label: compactLineValue(run.status) };
}

function userFacingHostAction(action) {
  if (action?.action === 'wait_for_approval') return `Waiting for you${action.step_id ? ` · ${action.step_id}` : ''}`;
  if (action?.action === 'run_worker') return `Worker action pending${action.step_id ? ` · ${action.step_id}` : ''}`;
  return `Pending user action${action?.step_id ? ` · ${action.step_id}` : ''}`;
}

function workflowRunNeedsUserResponse(run = {}) {
  return workflowRunNeedsHumanAction(run);
}

function inboxWorkflowRuns(runs = []) {
  return runs.filter((run) => run && workflowRunNeedsHumanAction(run));
}


function sortWorkflowRunsForNativeDisplay(runs = []) {
  return runs
    .map((run, index) => ({ run, index }))
    .sort((left, right) => Number(workflowRunNeedsUserResponse(right.run)) - Number(workflowRunNeedsUserResponse(left.run)) || left.index - right.index)
    .map(({ run }) => run);
}

function compactRunLine(run) {
  const icon = run.state === 'completed' || run.state === 'done' ? '✅' : run.state === 'failed' ? '🔴' : run.state === 'blocked' ? '⛔' : '🪐';
  const lines = [
    `${icon} ${compactLineValue(run.kind)}`,
    `run id: \`${compactLineValue(run.run_id)}\``,
    `state: ${compactLineValue(run.state)}`,
  ];
  if (run.runtime_gap) lines.push(`runtime gap: ${run.runtime_gap}`);
  return lines.join('\n');
}

function workflowRunSummaryLines(run) {
  const state = userFacingWorkflowState(run);
  const runId = compactLineValue(run.workflow_run_id);
  const lines = [
    `${state.icon} ${boundedNativeTitle(run.title ?? run.workflow_identity)}`,
    `run id: \`${runId}\``,
  ];
  if (run.workflow_identity) lines.push(`workflow id: \`${run.workflow_identity}\``);
  const currentStep = workflowRunCurrentStep(run);
  if (currentStep) lines.push(`step: ${currentStep}`);
  const currentGate = workflowRunCurrentGate(run);
  if (currentGate) lines.push(`gate: ${currentGate}`);
  const waitingReason = workflowRunWaitingReason(run);
  if (waitingReason) lines.push(`waiting: ${waitingReason}`);
  else lines.push(state.label);
  const ageLine = compactRunAgeLine(run);
  if (ageLine) lines.push(ageLine);
  if (run.lease_state) lines.push(`lease: ${run.lease_state}`);
  if (run.failure_code || run.error_code) lines.push(`Error: ${compactLineValue(run.failure_code ?? run.error_code)}`);
  return lines;
}

function formatWorkflowRunBlock(run) {
  const runId = compactLineValue(run.workflow_run_id);
  const lines = workflowRunSummaryLines(run);
  if (workflowRunNeedsHumanAction(run)) lines.push(naturalPendingUserActionOptionsText(runId));
  return lines.join('\n');
}

function compactWorkflowRunLine(run) {
  return workflowRunSummaryLines(run).join('\n');
}

function formatConfidencePercent(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '—';
  return `${Math.round(Math.max(0, Math.min(1, numeric)) * 100)}%`;
}

function formatNativeRunText(result) {
  if (result?.user_action_text) return result.user_action_text;
  const intake = result?.run?.intake;
  if (intake?.match_status === 'multiple_matches') {
    const matches = Array.isArray(intake.matched_refs) ? intake.matched_refs : [];
    const lines = matches.map((match, index) => `${index + 1}. ${compactLineValue(match?.ref)} — ${formatConfidencePercent(match?.confidence)}`);
    return `🪐 Orbita
Нашла несколько похожих runs:
${lines.join('\n')}

Выбери run id или скажи: создать новый.`;
  }
  return result?.text ?? jsonText(result);
}

function formatNativeListText(result) {
  const runs = Array.isArray(result?.runs) ? result.runs.filter(Boolean) : [];
  const workflowRuns = Array.isArray(result?.workflow_runs) ? result.workflow_runs.filter(Boolean) : [];
  if (runs.length === 0 && workflowRuns.length === 0) {
    return `🪐 Orbita
Активных runs нет.

Проверка: /orbita run --dry-run`;
  }

  const sections = [];
  if (runs.length > 0) sections.push(`Runs: ${runs.length}\n\n${runs.map(compactRunLine).join('\n')}`);
  if (workflowRuns.length > 0) {
    const meta = result?.workflow_runs_meta;
    const shown = meta?.shown ?? workflowRuns.length;
    const total = meta?.total;
    const page = meta?.page ?? 1;
    const totalPages = meta?.total_pages ?? 1;
    const limited = meta?.limited === true;
    const capped = meta?.requested_limit && meta?.requested_limit > meta?.limit;
    const note = limited
      ? ` (showing ${shown} of ${total ?? shown}; page ${page}/${totalPages}; use --limit up to ${meta?.max_limit ?? MAX_WORKFLOW_RUN_LIST_LIMIT})`
      : (capped ? ` (limit capped at ${meta?.limit})` : '');
    const fallbackCommands = [];
    const paginationCommand = meta?.mode === 'inbox' ? 'inbox' : 'list';
    if (meta?.has_previous_page) fallbackCommands.push(`Prev: /orbita ${paginationCommand} --limit ${meta?.requested_limit ?? meta?.limit} --page ${page - 1}`);
    if (meta?.has_next_page) fallbackCommands.push(`Next: /orbita ${paginationCommand} --limit ${meta?.requested_limit ?? meta?.limit} --page ${page + 1}`);
    sections.push(`Workflow runs: ${workflowRuns.length}${note}\n\n${workflowRuns.map(compactWorkflowRunLine).join('\n')}${fallbackCommands.length ? `\n\n${fallbackCommands.join('\n')}` : ''}`);
  }
  return `🪐 Orbita\n${sections.join('\n\n')}`;
}


function nativeInboxRunButton(run) {
  const runId = compactLineValue(run?.workflow_run_id);
  if (!runId || runId === '—') return undefined;
  return {
    label: `Open ${runId}`,
    value: `/orbita run ${runId}`,
    style: 'primary',
  };
}

function nativeInboxPaginationButtons(meta = {}) {
  const buttons = [];
  const limit = meta.requested_limit ?? meta.limit ?? DEFAULT_WORKFLOW_RUN_LIST_LIMIT;
  const page = meta.page ?? 1;
  if (meta.has_previous_page) buttons.push({ label: 'Prev', value: `/orbita inbox --limit ${limit} --page ${page - 1}`, style: 'secondary' });
  if (meta.has_next_page) buttons.push({ label: 'Next', value: `/orbita inbox --limit ${limit} --page ${page + 1}`, style: 'secondary' });
  return buttons;
}

function buildNativeInboxPresentation(result) {
  const workflowRuns = Array.isArray(result?.workflow_runs) ? result.workflow_runs.filter(Boolean) : [];
  const runButtons = workflowRuns.map(nativeInboxRunButton).filter(Boolean);
  const paginationButtons = nativeInboxPaginationButtons(result?.workflow_runs_meta);
  const buttonBlocks = [];
  for (const button of runButtons) buttonBlocks.push({ type: 'buttons', buttons: [button] });
  if (paginationButtons.length > 0) buttonBlocks.push({ type: 'buttons', buttons: paginationButtons });
  if (buttonBlocks.length === 0) return undefined;
  return {
    title: '🪐 Orbita inbox',
    tone: 'info',
    blocks: [
      { type: 'context', text: 'Open a pending item to resurface its command-only action card.' },
      ...buttonBlocks,
    ],
  };
}

function buildNativeInboxInteractive(result) {
  const presentation = buildNativeInboxPresentation(result);
  if (!presentation) return undefined;
  const blocks = [];
  if (presentation.title) blocks.push({ type: 'text', text: presentation.title });
  for (const block of presentation.blocks) {
    if (block.type === 'text' || block.type === 'context') blocks.push({ type: 'text', text: block.text });
    else if (block.type === 'buttons') blocks.push({ type: 'buttons', buttons: block.buttons });
  }
  return blocks.length > 0 ? { blocks } : undefined;
}

function formatNativeInboxReply(result) {
  const presentation = buildNativeInboxPresentation(result);
  const interactive = buildNativeInboxInteractive(result);
  return {
    text: formatNativeListText(result),
    ...(presentation ? { presentation } : {}),
    ...(interactive ? { interactive } : {}),
  };
}


function lifecycleRunStatusBucket(run = {}) {
  const state = run.state;
  if (state === 'completed' || state === 'done') return 'done';
  if (state === 'failed') return 'failed';
  if (state === 'waiting_human') return 'pending';
  if (state === 'created' || state === 'running') return 'active';
  return 'other';
}

function nonInboxWorkflowRunStatusBucket(run = {}) {
  const status = run.status;
  if (status === 'done' || status === 'completed') return 'done';
  if (status === 'failed') return 'failed';
  if (status === 'blocked') return 'failed';
  if (status === 'running' || status === 'needs_host_actions') return 'active';
  return 'other';
}

function countWorkflowPendingApprovals(runs = []) {
  return runs.filter((run) => workflowRunCurrentGate(run) || workflowRunHasApprovalAction(run)).length;
}

function summarizeStatusItems({ runs = [], workflowRuns = [], inboxWorkflowRunItems } = {}) {
  const summary = { total: 0, active: 0, pending: 0, failed: 0, done: 0, approvals: 0 };
  for (const run of runs.filter(Boolean)) {
    summary.total += 1;
    const bucket = lifecycleRunStatusBucket(run);
    if (bucket in summary) summary[bucket] += 1;
  }
  const workflowRunItems = workflowRuns.filter(Boolean);
  const inboxItems = inboxWorkflowRunItems ?? inboxWorkflowRuns(workflowRunItems);
  const inboxSet = new Set(inboxItems);
  for (const run of workflowRunItems) {
    summary.total += 1;
    if (inboxSet.has(run)) {
      summary.pending += 1;
      continue;
    }
    const bucket = nonInboxWorkflowRunStatusBucket(run);
    if (bucket in summary) summary[bucket] += 1;
  }
  summary.approvals = countWorkflowPendingApprovals(inboxItems);
  return summary;
}

function formatNativeStatusText(result) {
  if (result?.status_scope === 'run') {
    if (result.workflow_run) return `🪐 Orbita status\n${formatWorkflowRunBlock(result.workflow_run)}`;
    if (result.run) return `🪐 Orbita status\n${compactRunLine(result.run)}`;
    return '🪐 Orbita status\nRun не найден.';
  }

  const workflowRuns = Array.isArray(result?.workflow_runs) ? result.workflow_runs.filter(Boolean) : [];
  const runs = Array.isArray(result?.runs) ? result.runs.filter(Boolean) : (result?.run ? [result.run] : []);
  const summary = result?.status_summary ?? summarizeStatusItems({ runs, workflowRuns });
  const lines = [
    '🪐 Orbita status',
    `Всего: ${summary.total ?? 0}`,
    `🔵 Активные/running: ${summary.active ?? 0}`,
    `🟡 Inbox / ждут тебя: ${summary.pending ?? 0}`,
    `🔴 Failed: ${summary.failed ?? 0}`,
    `✅ Done: ${summary.done ?? 0}`,
  ];
  if ((summary.total ?? 0) === 0) lines.push('Пусто: активных runs и workflow items нет.');
  return lines.join('\n');
}



function naturalPendingUserActionOptionsText(runId = '<runId>') {
  return [
    'Команды:',
    `• /orbita approve ${runId} — approve текущий pending approval`,
    `• /orbita reject ${runId} reason — reject и вернуть на доработку/по workflow route`,
    `• /orbita reply ${runId} text — ответить на ожидающий вопрос`,
  ].join('\n');
}


export {
  DEFAULT_WORKFLOW_RUN_LIST_LIMIT,
  MAX_WORKFLOW_RUN_LIST_LIMIT,
  boundedNativeTitle,
  buildNativeInboxPresentation,
  compactLineValue,
  formatNativeInboxReply,
  formatNativeListText,
  formatNativeRunText,
  formatNativeStatusText,
  formatWorkflowRunBlock,
  inboxWorkflowRuns,
  naturalPendingUserActionOptionsText,
  redactSensitivePublicText,
  safePublicRequestId,
  safeWorkflowRunTitle,
  summarizeStatusItems,
  userFacingWorkflowState,
  workflowRunCurrentGate,
  workflowRunHasApprovalAction,
  workflowRunNeedsHumanAction,
};
