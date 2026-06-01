import {
  claimWorkflowRunAtRoot,
  heartbeatWorkflowRunAtRoot,
  listWorkflowRunsAtRoot,
  registerWorkflowRunAtRoot,
  summarizeWorkflowRuns,
} from '../../persistence/run-state/workflow-runs.mjs';

export { summarizeWorkflowRuns };

export async function listWorkflowRuns({ now = new Date() } = {}) {
  return listWorkflowRunsAtRoot({ now });
}

export async function registerWorkflowRun({ runId, title, summary, workflowPath, workflowIdentity, status = 'running', taskKey, taskFingerprint, claim = false, owner, harness, sessionId, workerId, leaseMs, now = new Date() } = {}) {
  return registerWorkflowRunAtRoot({
    runId,
    title,
    summary,
    workflowPath,
    workflowIdentity,
    status,
    taskKey,
    taskFingerprint,
    claim,
    owner,
    harness,
    sessionId,
    workerId,
    leaseMs,
    now,
  });
}

export async function claimWorkflowRun({ runId, workflowPath, owner, harness, sessionId, workerId, leaseMs, leaseToken, now = new Date() } = {}) {
  return claimWorkflowRunAtRoot({ runId, workflowPath, owner, harness, sessionId, workerId, leaseMs, leaseToken, now });
}

export async function heartbeatWorkflowRun(options = {}) {
  return heartbeatWorkflowRunAtRoot(options);
}
