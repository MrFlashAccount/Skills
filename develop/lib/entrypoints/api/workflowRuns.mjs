import {
  claimWorkflowRunAtRoot,
  heartbeatWorkflowRunAtRoot,
  listWorkflowRunsAtRoot,
  registerWorkflowRunAtRoot,
  summarizeWorkflowRuns,
} from '../../persistence/run-state/workflow-runs.mjs';
import { publicErrorMessage } from '../cli/public-error.mjs';

export { summarizeWorkflowRuns };

function publicApiError(error, options = {}) {
  const rawMessage = String(error?.message ?? error);
  const message = /workflow runs index/.test(rawMessage)
    ? publicErrorMessage(rawMessage, options).replace(/\s+from\s+.*$/, '')
    : publicErrorMessage(rawMessage, options);
  const redacted = new Error(message);
  if (error?.code) redacted.code = error.code;
  return redacted;
}

async function publicApiCall(callback, options = {}) {
  try { return await callback(); }
  catch (error) { throw publicApiError(error, options); }
}

export async function listWorkflowRuns({ runsRoot, now = new Date(), workflowIdentity, workflowPath, limit, maxLimit } = {}) {
  return publicApiCall(() => listWorkflowRunsAtRoot({ runsRoot, now, workflowIdentity, workflowPath, limit, maxLimit }), { runsRoot });
}

export async function registerWorkflowRun({ runId, title, summary, workflowPath, workflowIdentity, status = 'running', taskKey, taskFingerprint, requestId, currentStep, currentGate, taskFlowId, requesterBinding, runsRoot, claim = false, owner, harness, sessionId, workerId, leaseMs, now = new Date() } = {}) {
  return publicApiCall(() => registerWorkflowRunAtRoot({
    runId,
    title,
    summary,
    workflowPath,
    workflowIdentity,
    status,
    taskKey,
    taskFingerprint,
    requestId,
    currentStep,
    currentGate,
    taskFlowId,
    requesterBinding,
    runsRoot,
    claim,
    owner,
    harness,
    sessionId,
    workerId,
    leaseMs,
    now,
  }), { runsRoot });
}

export async function claimWorkflowRun({ runId, workflowPath, runsRoot, owner, harness, sessionId, workerId, leaseMs, leaseToken, takeover = false, now = new Date() } = {}) {
  return publicApiCall(() => claimWorkflowRunAtRoot({ runId, workflowPath, runsRoot, owner, harness, sessionId, workerId, leaseMs, leaseToken, takeover, now }), { runsRoot });
}

export async function heartbeatWorkflowRun(options = {}) {
  return publicApiCall(() => heartbeatWorkflowRunAtRoot(options), { runsRoot: options.runsRoot });
}
