import { WorkflowRuntimeError } from '../../../errors.mjs';
import { assertWorkerOutputSchema } from './worker-output-schema.mjs';
import { validateAgainstOutputSchema, OUTPUT_SCHEMA_MAX_ATTEMPTS } from '../../../use-cases/runtime/output/output-schema-validation.mjs';
import { invalidJsonOutputRetry, outputSchemaAttempt, responseForOutputSchemaRetry } from '../loop/guard.mjs';

export function readWorkerOutputForStep({ baton, stepId, step, allOutput, outputParseError }) {
  if (!step.output?.schema) return { workerOutput: allOutput, retryResponse: undefined };
  if (outputParseError) return { workerOutput: undefined, retryResponse: invalidJsonOutputRetry({ baton, stepId, step, error: outputParseError }) };
  return { workerOutput: allOutput, retryResponse: undefined };
}

function assertGenericApprovalOutput(hostOutput) {
  if (!hostOutput || typeof hostOutput !== 'object' || Array.isArray(hostOutput)) {
    throw new WorkflowRuntimeError('approval output failed schema validation: / must be object');
  }
  if ('approval' in hostOutput && typeof hostOutput.approval !== 'string') {
    throw new WorkflowRuntimeError('approval output failed schema validation: /approval must be string');
  }
  if ('artifacts' in hostOutput) {
    if (!Array.isArray(hostOutput.artifacts)) throw new WorkflowRuntimeError('approval output failed schema validation: /artifacts must be array');
    for (const [index, artifact] of hostOutput.artifacts.entries()) {
      if (!artifact || typeof artifact !== 'object' || Array.isArray(artifact)) {
        throw new WorkflowRuntimeError(`approval output failed schema validation: /artifacts/${index} must be object`);
      }
      if (typeof artifact.id !== 'string' || artifact.id.length === 0) {
        throw new WorkflowRuntimeError(`approval output failed schema validation: /artifacts/${index}/id must be non-empty string`);
      }
      if (typeof artifact.content_type !== 'string' || artifact.content_type.length === 0) {
        throw new WorkflowRuntimeError(`approval output failed schema validation: /artifacts/${index}/content_type must be non-empty string`);
      }
      for (const field of ['type', 'kind', 'ref', 'producer_step_id', 'version', 'replaces', 'aliases']) {
        if (Object.hasOwn(artifact, field)) throw new WorkflowRuntimeError(`approval output failed schema validation: /artifacts/${index}/${field} is not allowed`);
      }
    }
  }
  if ('results' in hostOutput) {
    if (!Array.isArray(hostOutput.results)) throw new WorkflowRuntimeError('approval output failed schema validation: /results must be array');
    for (const [index, result] of hostOutput.results.entries()) {
      if (!result || typeof result !== 'object' || Array.isArray(result)) {
        throw new WorkflowRuntimeError(`approval output failed schema validation: /results/${index} must be object`);
      }
    }
  }
  if ('blocker' in hostOutput && (!hostOutput.blocker || typeof hostOutput.blocker !== 'object' || Array.isArray(hostOutput.blocker))) {
    throw new WorkflowRuntimeError('approval output failed schema validation: /blocker must be object');
  }
}

export function assertOutputSchemaIfDeclared({ baton, stepId, step, workerOutput, resources }) {
  const schemaRef = step.output?.schema;
  if (!schemaRef) {
    if (step.kind === 'approval') assertGenericApprovalOutput(workerOutput);
    else assertWorkerOutputSchema(workerOutput);
    return { workerOutput, retryResponse: undefined };
  }

  const loaded = resources?.outputSchemas instanceof Map ? resources.outputSchemas.get(schemaRef) : resources?.outputSchemas?.[schemaRef];
  const schema = loaded?.schema ?? loaded;
  if (!schema) throw new WorkflowRuntimeError(`output schema validation failed: missing output.schema '${schemaRef}'`);
  const validation = validateAgainstOutputSchema({ schemaRef, schema, output: workerOutput });
  if (validation.ok) return { workerOutput: validation.output, retryResponse: undefined };

  const attempt = outputSchemaAttempt(baton, stepId);
  if (attempt >= OUTPUT_SCHEMA_MAX_ATTEMPTS) {
    throw new WorkflowRuntimeError(
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
