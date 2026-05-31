import { join } from 'node:path';
import { loadOutputSchema } from '../../persistence/output-schema.mjs';

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
  return `node develop/lib/bin/workflow-runner.mjs instructions --run-dir ${shellQuote(runDir)} --step-id ${shellQuote(stepId)}`;
}

export function responseStatusForInterpreterResponse(interpreterResponse) {
  const steps = interpreterResponse.steps ?? [];
  if (steps.length === 1 && steps[0].action === 'stop_done') return 'done';
  if (steps.length === 1 && steps[0].action === 'stop_blocked') return 'blocked';
  return 'needs_host_actions';
}

function resolvedOutputSchemaForStep(step, { workflow, workflowPath, repositoryRoot = process.cwd() }) {
  const schemaRef = step.step?.output?.schema;
  if (step.action !== 'wait_for_approval' || !schemaRef) return undefined;
  const resolved = loadOutputSchema({ workflow, workflowPath, schemaRef, repositoryRoot });
  return {
    ref: schemaRef,
    schema: resolved.schema,
  };
}

export function buildHostRequests(interpreterResponse, { runDir, workflow, workflowPath, repositoryRoot }) {
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
      const resolvedOutputSchema = resolvedOutputSchemaForStep(step, { workflow, workflowPath, repositoryRoot });
      if (resolvedOutputSchema) {
        request.outputSchema = resolvedOutputSchema.ref;
        request.resolvedOutputSchema = resolvedOutputSchema;
      }
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
