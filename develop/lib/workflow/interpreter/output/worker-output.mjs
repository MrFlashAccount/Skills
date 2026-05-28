import { readFileSync } from 'node:fs';
import { readJson } from '../../json-io.mjs';
import { WorkflowInterpreterError } from '../../errors.mjs';
import { assertWorkerOutputSchema } from '../../schema-validation.mjs';
import { validateAgainstOutputSchema, OUTPUT_SCHEMA_MAX_ATTEMPTS } from '../../output-schema-validation.mjs';
import { invalidJsonOutputRetry, outputSchemaAttempt, responseForOutputSchemaRetry } from '../loop/guard.mjs';

export function readWorkerOutputForStep({ outputPath, baton, stepId, step, allOutput }) {
  if (!step.output?.schema) return { workerOutput: allOutput ?? readJson(outputPath, 'worker output'), retryResponse: undefined };
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

export function isParallelOutputEnvelope(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value) && value.steps && typeof value.steps === 'object' && !Array.isArray(value.steps));
}
