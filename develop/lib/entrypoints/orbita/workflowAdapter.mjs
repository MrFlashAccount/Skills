import { mkdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { isAbsolute, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

import { next, writeOutput, continueRun, loadInstructions } from '../api/workflowRunner.mjs';
import { registerWorkflowRun, heartbeatWorkflowRun } from '../api/workflowRuns.mjs';
import { resolveRunPaths } from '../../persistence/run-state/paths.mjs';

const PLUGIN_ID = 'orbita';
const DEV_HARNESS_WORKFLOW = 'workflows/dev-harness/workflow.json';
const REPO_ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const ALLOWED_WORKFLOW_PATHS = new Set([DEV_HARNESS_WORKFLOW, `./${DEV_HARNESS_WORKFLOW}`]);
const MAX_WORKFLOW_STEPS = 8;
const MAX_SUBAGENT_RESPONSE_CHARS = 200_000;
const MAX_PUBLIC_SUMMARY_CHARS = 160;
const DEFAULT_LEASE_MS = 30 * 60 * 1000;

const PUBLIC_ERROR_MESSAGES = new Map([
  ['dev_harness_workflow_failed', 'DevHarness workflow failed before a safe result was available.'],
  ['runtime_subagent_unavailable', 'DevHarness runtime subagent API is unavailable.'],
  ['runtime_subagent_run_failed', 'DevHarness worker run did not complete successfully.'],
  ['runtime_subagent_run_error', 'DevHarness worker run failed.'],
  ['runtime_subagent_run_timeout', 'DevHarness worker run timed out.'],
  ['runtime_subagent_run_cancelled', 'DevHarness worker run was cancelled.'],
  ['unsupported_workflow_path', 'Unsupported workflow path. Use workflows/dev-harness/workflow.json.'],
  ['unsupported_workflow_host_action', 'DevHarness workflow requested an unsupported host action.'],
  ['workflow_step_limit_exceeded', 'DevHarness workflow stopped after reaching the step limit.'],
  ['runtime_subagent_output_unavailable', 'DevHarness worker finished without a readable JSON output.'],
  ['runtime_subagent_output_invalid', 'DevHarness worker returned invalid JSON output.'],
]);

const SAFE_REQUEST_ID_PATTERN = /^orbita-[a-z0-9][a-z0-9-]{0,95}$/;

function generatedRequestId() {
  return `orbita-${randomUUID()}`;
}

function compactRequestId(requestId) {
  if (typeof requestId !== 'string') return generatedRequestId();
  const normalized = requestId.trim().toLowerCase();
  return SAFE_REQUEST_ID_PATTERN.test(normalized) ? normalized : generatedRequestId();
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
  const message = PUBLIC_ERROR_MESSAGES.get(code) || PUBLIC_ERROR_MESSAGES.get('dev_harness_workflow_failed');
  return {
    ok: false,
    mode: 'run',
    openclaw_surface: PLUGIN_ID,
    workflow: 'dev-harness',
    error_code: code,
    message: code,
    request_id: safeRequestId,
    text: `🪐 DevHarness error: ${code}\n${message}\nRequest ID: ${safeRequestId}`,
  };
}

export function isWorkflowRunRequested(values = {}) {
  return typeof values.workflow === 'string' && values.workflow.length > 0;
}

export function validateDevHarnessWorkflowPath(value) {
  if (!ALLOWED_WORKFLOW_PATHS.has(value)) {
    throw new Error('unsupported_workflow_path');
  }
  if (isAbsolute(value) || value.startsWith('~') || value.includes('..') || normalize(value).replaceAll('\\', '/') !== value.replace(/^\.\//, '')) {
    throw new Error('unsupported_workflow_path');
  }
  return DEV_HARNESS_WORKFLOW;
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
  const started = await subagent.run(request);
  const runId = started?.runId || started?.id;
  if (!runId) throw new Error('runtime_subagent_unavailable');
  const waitResult = await subagent.waitForRun({ runId, requestId: request.requestId, idempotencyKey: request.idempotencyKey });
  const waitErrorCode = waitForRunErrorCode(waitResult);
  if (waitErrorCode) throw new Error(waitErrorCode);
  const messagesResult = await subagent.getSessionMessages({ sessionKey: request.sessionKey, requestId: request.requestId });
  const latest = latestAssistantMessage(messagesFromResult(messagesResult));
  return parseWorkerOutput(latest);
}

function safeTaskText(values = {}) {
  const request = typeof values.request === 'string' ? values.request.trim() : '';
  const positional = Array.isArray(values._positionals) ? values._positionals.join(' ').trim() : '';
  return request || positional || '';
}

function workflowRunsRoot(pluginConfig = {}) {
  return pluginConfig.workflowRunsRoot || pluginConfig.runsRootWorkflow || pluginConfig.workflow_runs_root;
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
  return `You are executing one DevHarness workflow worker step through Orbita.

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
  text = text
    .replace(/(?:[A-Za-z]:)?[\\/](?:[^\s:;|,<>"'`{}()[\]]+[\\/]){1,}[^\s:;|,<>"'`{}()[\]]*/g, '[redacted-path]')
    .replace(/~[\\/][^\s:;|,<>"'`{}()[\]]*/g, '[redacted-path]')
    .replace(/\b(lease[-_ ]?token|prompt|transcript)\b\s*[:=]\s*\S+/gi, '$1=[redacted]')
    .replace(/\b[A-Za-z0-9_-]{24,}\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\b/g, '[redacted-token]')
    .replace(/\b(?:sk|ghp|github_pat|xox[baprs]|ya29|glpat|oc_[A-Za-z0-9]*)[_-][A-Za-z0-9_=-]{12,}\b/gi, '[redacted-token]')
    .replace(/\b[A-Za-z0-9_=-]{40,}\b/g, '[redacted-token]')
    .replace(/\s+/g, ' ')
    .trim();
  if (/\b(prompt|transcript)\b/i.test(text)) text = text.replace(/\b(prompt|transcript)\b/gi, '[redacted-runtime]');
  return text.length > MAX_PUBLIC_SUMMARY_CHARS ? `${text.slice(0, MAX_PUBLIC_SUMMARY_CHARS - 1)}…` : text;
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
  return `🪐 DevHarness approval required\n\nStep: ${stepId}\nRequest ID: ${requestId}\nWorkflow paused for human approval.${body}\n\nApprove/reject/block this gate to continue.`;
}

function terminalText(response, { requestId } = {}) {
  const suffix = `\nRequest ID: ${requestId}`;
  if (response.status === 'done') return `🪐 DevHarness workflow completed.${suffix}`;
  if (response.status === 'blocked') return `🪐 DevHarness workflow blocked.${suffix}`;
  return `🪐 DevHarness workflow stopped.${suffix}`;
}

function safeRunProjection(response, extra = {}) {
  return {
    ok: true,
    mode: 'run',
    openclaw_surface: PLUGIN_ID,
    workflow: 'dev-harness',
    workflow_run_id: response.runId,
    status: response.status,
    approval_step: response.requests?.find((request) => request.action === 'wait_for_approval')?.stepId,
    ...extra,
  };
}

async function executeWorkerRequest({ api, response, request, workflowPath, runsRoot, leaseToken, requestId }) {
  const stepId = request.stepId || request.id;
  const instructions = await loadInstructions({ runId: response.runId, workflowPath, stepId, leaseToken, runsRoot });
  const artifactDir = await prepareArtifactDirectory({ runId: response.runId, stepId, workflowPath, runsRoot });
  const message = workerPrompt({ instructions, runId: response.runId, stepId, artifactDir, requestId });
  const sessionKey = `orbita:dev-harness:${requestId}:${response.runId}:${stepId}`;
  const output = await callRuntimeSubagent(api, {
    sessionKey,
    message,
    label: `orbita-dev-harness-${requestId}-${stepId}`,
    task: message,
    prompt: message,
    cwd: REPO_ROOT,
    cleanup: 'delete',
    requestId,
    idempotencyKey: `orbita-dev-harness:${requestId}:${response.runId}:${stepId}`,
    metadata: { openclaw_surface: PLUGIN_ID, workflow: 'dev-harness', workflowRunId: response.runId, stepId, requestId },
  });
  await writeOutput({ runId: response.runId, workflowPath, stepId, json: JSON.stringify(output), leaseToken, runsRoot });
}

export async function runDevHarnessWorkflow(values = {}, { pluginConfig = {}, ctx = {}, api } = {}) {
  let allowedWorkflow;
  try {
    allowedWorkflow = validateDevHarnessWorkflowPath(values.workflow);
  } catch {
    return publicWorkflowError('unsupported_workflow_path');
  }

  const workflowPath = join(REPO_ROOT, allowedWorkflow);
  const runsRoot = workflowRunsRoot(pluginConfig);
  const task = safeTaskText(values);
  const title = task ? `DevHarness: ${task.slice(0, 80)}` : 'DevHarness workflow';
  const requester = ctx.sessionKey || ctx.session?.key || ctx.sessionId || ctx.sender?.id || ctx.senderId || ctx.requesterRef;

  const requestId = compactRequestId(values.requestId || values.request_id);

  if (!runtimeSubagent(api)) return publicWorkflowError('runtime_subagent_unavailable', { requestId });

  try {
    const registered = await registerWorkflowRun({
      title,
      summary: task ? 'Orbita DevHarness workflow run' : 'Orbita DevHarness workflow run without task text',
      workflowPath,
      workflowIdentity: 'dev-harness',
      status: 'running',
      runsRoot,
      claim: true,
      owner: requester ? String(requester) : 'orbita',
      harness: 'orbita-dev-harness',
      sessionId: requester ? String(requester) : undefined,
      workerId: `orbita-${requestId}`,
      requestId,
      leaseMs: DEFAULT_LEASE_MS,
    });
    const leaseToken = registered.leaseToken;
    let response = await next({ runId: registered.runId, workflowPath, userPrompt: task, leaseToken, runsRoot });

    for (let index = 0; index < MAX_WORKFLOW_STEPS; index += 1) {
      await heartbeatWorkflowRun({ runId: response.runId, workflowPath, runsRoot, leaseToken, leaseMs: DEFAULT_LEASE_MS });
      const requests = response.requests ?? [];
      const approval = requests.find((request) => request.action === 'wait_for_approval');
      if (approval) {
        const text = approvalText(response, { requestId });
        return { ...safeRunProjection(response, { request_id: requestId, text }), text };
      }
      if (response.status === 'done' || response.status === 'blocked') {
        const text = terminalText(response, { requestId });
        return { ...safeRunProjection(response, { request_id: requestId, text }), text };
      }
      if (requests.length !== 1 || requests[0]?.action !== 'run_worker') return publicWorkflowError('unsupported_workflow_host_action', { requestId });
      await executeWorkerRequest({ api, response, request: requests[0], workflowPath, runsRoot, leaseToken, requestId });
      response = await continueRun({ runId: response.runId, workflowPath, leaseToken, runsRoot });
    }
    return publicWorkflowError('workflow_step_limit_exceeded', { requestId });
  } catch (error) {
    const code = PUBLIC_ERROR_MESSAGES.has(error?.message) ? error.message : 'dev_harness_workflow_failed';
    return publicWorkflowError(code, { requestId });
  }
}
