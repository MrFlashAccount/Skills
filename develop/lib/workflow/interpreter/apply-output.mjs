import { readFileSync } from 'node:fs';
import { readJson } from '../json-io.mjs';
import { WorkflowInterpreterError } from '../errors.mjs';
import { assertWorkerOutputSchema } from '../schema-validation.mjs';
import { validateAgainstOutputSchema, OUTPUT_SCHEMA_MAX_ATTEMPTS } from '../output-schema-validation.mjs';
import { loadWorkflowAndBaton } from './validation.mjs';
import { invalidJsonOutputRetry, outputSchemaAttempt, responseForOutputSchemaRetry } from './loop-guard.mjs';
import { applyNextTransition } from './next-transition.mjs';
import { prepareParallelBranch } from './parallel-steps.mjs';
import { applyParallelOutputs } from './join-step.mjs';

function readWorkerOutputForStep({ outputPath, baton, stepId, step }) {
  if (!step.output?.schema) return { workerOutput: readJson(outputPath, 'worker output'), retryResponse: undefined };
  try {
    return { workerOutput: JSON.parse(readFileSync(outputPath, 'utf8')), retryResponse: undefined };
  } catch (error) {
    return { workerOutput: undefined, retryResponse: invalidJsonOutputRetry({ baton, stepId, step, error }) };
  }
}

export function assertOutputSchemaIfDeclared({ workflowPath, workflow, baton, stepId, step, workerOutput }) {
  const schemaRef = step.output?.schema;
  if (!schemaRef) {
    assertWorkerOutputSchema(workerOutput);
    return { workerOutput, retryResponse: undefined };
  }

  const validation = validateAgainstOutputSchema({ workflow, workflowPath, schemaRef, output: workerOutput });
  if (validation.ok) return { workerOutput: validation.output, retryResponse: undefined };

  const attempt = outputSchemaAttempt(baton, stepId);
  if (attempt >= OUTPUT_SCHEMA_MAX_ATTEMPTS) {
    throw new WorkflowInterpreterError(
      `output schema validation failed for step '${stepId}' after ${OUTPUT_SCHEMA_MAX_ATTEMPTS} attempts: ${validation.errors}`,
    );
  }

  return {
    workerOutput,
    retryResponse: responseForOutputSchemaRetry({ baton, stepId, step, errors: validation.errors, attempt }),
  };
}

export function applyWorkflowOutput(workflowPath, batonPath, outputPath) {
  const { workflow, baton, cursorStep } = loadWorkflowAndBaton(workflowPath, batonPath);
  if (baton.parallel) return applyParallelOutputs({ workflowPath, workflow, baton, outputPath });

  const readResult = readWorkerOutputForStep({ outputPath, baton, stepId: baton.cursor, step: cursorStep });
  if (readResult.retryResponse) return readResult.retryResponse;
  const { workerOutput, retryResponse } = assertOutputSchemaIfDeclared({
    workflowPath,
    workflow,
    baton,
    stepId: baton.cursor,
    step: cursorStep,
    workerOutput: readResult.workerOutput,
  });
  if (retryResponse) return retryResponse;

  if (Array.isArray(cursorStep.next)) {
    return prepareParallelBranch({ workflow, baton, stepId: baton.cursor, step: cursorStep, output: workerOutput, attempts: undefined });
  }

  return applyNextTransition({ workflow, baton, cursorStep, workerOutput });
}
