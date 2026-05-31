import { WorkflowRuntimeError } from '../../../entities/errors.mjs';
import { outputSchemaRetryKey, validationRetryPrompt, OUTPUT_SCHEMA_MAX_ATTEMPTS } from '../../../schemas/output-schema-validation.mjs';
import { responseFor, stepWithValidationFeedback } from '../output/response.mjs';

export function responseForOutputSchemaRetry({ baton, stepId, step, errors, attempt }) {
  const updatedBaton = structuredClone(baton);
  updatedBaton.state = {
    ...updatedBaton.state,
    attempts: {
      ...(updatedBaton.state?.attempts ?? {}),
      [outputSchemaRetryKey(stepId)]: attempt,
    },
  };
  delete updatedBaton.blocker;
  const feedbackPrompt = validationRetryPrompt({ errors, attempt });
  return responseFor(updatedBaton, stepId, stepWithValidationFeedback(step, feedbackPrompt));
}

export function invalidJsonOutputRetry({ baton, stepId, step, error }) {
  const attempt = (baton.state?.attempts?.[outputSchemaRetryKey(stepId)] ?? 0) + 1;
  const errors = `step output is not valid JSON: ${error.message}`;
  if (attempt >= OUTPUT_SCHEMA_MAX_ATTEMPTS) {
    throw new WorkflowRuntimeError(
      `output schema validation failed for step '${stepId}' after ${OUTPUT_SCHEMA_MAX_ATTEMPTS} attempts: ${errors}`,
    );
  }
  return responseForOutputSchemaRetry({ baton, stepId, step, errors, attempt });
}

export function outputSchemaAttempt(baton, stepId) {
  return (baton.state?.attempts?.[outputSchemaRetryKey(stepId)] ?? 0) + 1;
}
