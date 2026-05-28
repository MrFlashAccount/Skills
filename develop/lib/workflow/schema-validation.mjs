import batonSchema from '../../schemas/baton.json' with { type: 'json' };
import reviewerSelectionOutputSchema from '../../schemas/dev-harness/reviewer-selection-output.json' with { type: 'json' };
import workflowInterpreterCliArgsSchema from '../../schemas/internal/cli-args/workflow-interpreter.json' with { type: 'json' };
import workerOutputSchema from '../../schemas/worker-output.json' with { type: 'json' };
import workflowInterpreterResponseSchema from '../../schemas/workflow-interpreter-response.json' with { type: 'json' };
import workflowSchema from '../../schemas/workflow.json' with { type: 'json' };
import { validateJsonSchema } from 'schema-validation';
import { WorkflowInterpreterError } from './errors.mjs';

export const workflowSchemas = [
  batonSchema,
  reviewerSelectionOutputSchema,
  workflowInterpreterCliArgsSchema,
  workerOutputSchema,
  workflowInterpreterResponseSchema,
  workflowSchema,
];

export {
  batonSchema,
  reviewerSelectionOutputSchema,
  workflowInterpreterCliArgsSchema,
  workerOutputSchema,
  workflowInterpreterResponseSchema,
  workflowSchema,
};

export function formatSchemaErrors(errors = []) {
  return errors
    .map((error) => `${error.instancePath || '/'} ${error.message}`.trim())
    .join('; ');
}

export function assertSchema(schema, value, name) {
  const validation = validateJsonSchema(schema, value, { schemas: workflowSchemas });
  if (!validation.ok) throw new WorkflowInterpreterError(`${name} failed schema validation: ${formatSchemaErrors(validation.errors)}`);
}

export function assertWorkflowSchema(workflowDoc) {
  assertSchema(workflowSchema, workflowDoc, 'workflow');
}

export function assertBatonSchema(baton) {
  assertSchema(batonSchema, baton, 'baton');
}

export function assertWorkerOutputSchema(workerOutput) {
  assertSchema(workerOutputSchema, workerOutput, 'worker output');
}

export function assertResponseSchema(response) {
  assertSchema(workflowInterpreterResponseSchema, response, 'workflow interpreter response');
}
