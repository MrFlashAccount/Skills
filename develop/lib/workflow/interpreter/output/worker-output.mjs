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

function assertGenericApprovalOutput(hostOutput) {
  if (!hostOutput || typeof hostOutput !== 'object' || Array.isArray(hostOutput)) {
    throw new WorkflowInterpreterError('approval output failed schema validation: / must be object');
  }
  if ('approval' in hostOutput && typeof hostOutput.approval !== 'string') {
    throw new WorkflowInterpreterError('approval output failed schema validation: /approval must be string');
  }
  if ('artifacts' in hostOutput) {
    if (!Array.isArray(hostOutput.artifacts)) throw new WorkflowInterpreterError('approval output failed schema validation: /artifacts must be array');
    for (const [index, artifact] of hostOutput.artifacts.entries()) {
      if (!artifact || typeof artifact !== 'object' || Array.isArray(artifact)) {
        throw new WorkflowInterpreterError(`approval output failed schema validation: /artifacts/${index} must be object`);
      }
      if (typeof artifact.type !== 'string') {
        throw new WorkflowInterpreterError(`approval output failed schema validation: /artifacts/${index}/type must be string`);
      }
    }
  }
  if ('results' in hostOutput) {
    if (!Array.isArray(hostOutput.results)) throw new WorkflowInterpreterError('approval output failed schema validation: /results must be array');
    for (const [index, result] of hostOutput.results.entries()) {
      if (!result || typeof result !== 'object' || Array.isArray(result)) {
        throw new WorkflowInterpreterError(`approval output failed schema validation: /results/${index} must be object`);
      }
    }
  }
  if ('blocker' in hostOutput && (!hostOutput.blocker || typeof hostOutput.blocker !== 'object' || Array.isArray(hostOutput.blocker))) {
    throw new WorkflowInterpreterError('approval output failed schema validation: /blocker must be object');
  }
}

export function assertOutputSchemaIfDeclared({ workflowPath, workflow, baton, stepId, step, workerOutput }) {
  const schemaRef = step.output?.schema;
  if (!schemaRef) {
    if (step.kind === 'approval') assertGenericApprovalOutput(workerOutput);
    else assertWorkerOutputSchema(workerOutput);
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
