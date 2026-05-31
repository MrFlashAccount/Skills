const SAFE_STEP_ID = /^[A-Za-z0-9_.-]+$/;

function assertSafeStepId(stepId) {
  if (typeof stepId !== 'string' || !SAFE_STEP_ID.test(stepId) || stepId === '.' || stepId === '..') {
    throw new Error(`invalid workflow step id for runner storage: ${stepId}`);
  }
}

/** Selects the current instruction text from DTO inputs supplied by persistence. */
export function loadInstructions({ lastResponse, stepId, instructionText }) {
  assertSafeStepId(stepId);
  const request = (lastResponse.requests ?? []).find((candidate) => candidate.stepId === stepId || candidate.id === stepId);
  if (lastResponse.status !== 'needs_host_actions' || !request) throw new Error(`unknown current workflow step id: ${stepId}`);
  return instructionText;
}
