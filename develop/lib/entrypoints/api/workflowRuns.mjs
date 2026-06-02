import {
  claimWorkflowRunAtRoot,
  heartbeatWorkflowRunAtRoot,
  listWorkflowRunsAtRoot,
  registerWorkflowRunAtRoot,
  summarizeWorkflowRuns,
} from '../../persistence/run-state/workflow-runs.mjs';
import { publicErrorMessage } from '../cli/public-error.mjs';

export { summarizeWorkflowRuns };

function publicApiError(error) {
  const rawMessage = String(error?.message ?? error);
  const message = /workflow runs index/.test(rawMessage)
    ? rawMessage.replace(/\s+from\s+.*$/, '')
    : publicErrorMessage(rawMessage);
  const redacted = new Error(message);
  if (error?.code) redacted.code = error.code;
  return redacted;
}

async function publicApiCall(callback) {
  try { return await callback(); }
  catch (error) { throw publicApiError(error); }
}

export async function listWorkflowRuns({ runsRoot, now = new Date() } = {}) {
  return publicApiCall(() => listWorkflowRunsAtRoot({ runsRoot, now }));
}

export async function registerWorkflowRun({ runId, title, summary, workflowPath, workflowIdentity, status = 'running', taskKey, taskFingerprint, runsRoot, claim = false, owner, harness, sessionId, workerId, leaseMs, now = new Date() } = {}) {
  return publicApiCall(() => registerWorkflowRunAtRoot({
    runId,
    title,
    summary,
    workflowPath,
    workflowIdentity,
    status,
    taskKey,
    taskFingerprint,
    runsRoot,
    claim,
    owner,
    harness,
    sessionId,
    workerId,
    leaseMs,
    now,
  }));
}

export async function claimWorkflowRun({ runId, workflowPath, runsRoot, owner, harness, sessionId, workerId, leaseMs, leaseToken, now = new Date() } = {}) {
  return publicApiCall(() => claimWorkflowRunAtRoot({ runId, workflowPath, runsRoot, owner, harness, sessionId, workerId, leaseMs, leaseToken, now }));
}

export async function heartbeatWorkflowRun(options = {}) {
  return publicApiCall(() => heartbeatWorkflowRunAtRoot(options));
}
