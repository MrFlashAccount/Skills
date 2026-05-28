import { join } from 'node:path';

const TERMINAL_ACTIONS = new Set(['stop_done', 'stop_blocked']);

function outputPathForStep(outputsDir, stepId) {
  return join(outputsDir, `${stepId}.json`);
}

export function responseStatusForInterpreterResponse(interpreterResponse) {
  const steps = interpreterResponse.steps ?? [];
  if (steps.length === 1 && steps[0].action === 'stop_done') return 'done';
  if (steps.length === 1 && steps[0].action === 'stop_blocked') return 'blocked';
  return 'needs_host_actions';
}

export function buildHostRequests(interpreterResponse, { outputsDir }) {
  const status = responseStatusForInterpreterResponse(interpreterResponse);
  if (status !== 'needs_host_actions') return [];

  return interpreterResponse.steps
    .filter((step) => !TERMINAL_ACTIONS.has(step.action))
    .map((step) => ({
      id: step.id,
      action: step.action,
      compiledPrompt: step.compiledPrompt,
      outputPath: outputPathForStep(outputsDir, step.id),
    }));
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
