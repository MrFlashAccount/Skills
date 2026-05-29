import { join } from 'node:path';

const TERMINAL_ACTIONS = new Set(['stop_done', 'stop_blocked']);
const SAFE_STEP_ID = /^[A-Za-z0-9_.-]+$/;

export function assertSafeStepId(stepId) {
  if (typeof stepId !== 'string' || !SAFE_STEP_ID.test(stepId) || stepId === '.' || stepId === '..') {
    throw new Error(`invalid workflow step id for runner storage: ${stepId}`);
  }
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

export function instructionPathForStep(instructionsDir, stepId) {
  assertSafeStepId(stepId);
  return join(instructionsDir, `${stepId}.md`);
}

export function loadInstructionsCommandForStep(runDir, stepId) {
  assertSafeStepId(stepId);
  return `node develop/scripts/workflow-runner.mjs instructions --run-dir ${shellQuote(runDir)} --step-id ${shellQuote(stepId)}`;
}

export function responseStatusForInterpreterResponse(interpreterResponse) {
  const steps = interpreterResponse.steps ?? [];
  if (steps.length === 1 && steps[0].action === 'stop_done') return 'done';
  if (steps.length === 1 && steps[0].action === 'stop_blocked') return 'blocked';
  return 'needs_host_actions';
}

export function buildHostRequests(interpreterResponse, { runDir }) {
  const status = responseStatusForInterpreterResponse(interpreterResponse);
  if (status !== 'needs_host_actions') return [];

  return interpreterResponse.steps
    .filter((step) => !TERMINAL_ACTIONS.has(step.action))
    .map((step) => {
      const request = {
        id: step.id,
        stepId: step.id,
        action: step.action,
        loadInstructionsCommand: loadInstructionsCommandForStep(runDir, step.id),
      };
      if (step.action === 'wait_for_approval' && step.step?.output?.schema) request.outputSchema = step.step.output.schema;
      return request;
    });
}

export function toRunnerResponse(interpreterResponse, options) {
  const status = responseStatusForInterpreterResponse(interpreterResponse);
  const response = {
    status,
    baton: interpreterResponse.baton,
  };
  if (status === 'needs_host_actions') response.requests = buildHostRequests(interpreterResponse, options);
  return response;
}
