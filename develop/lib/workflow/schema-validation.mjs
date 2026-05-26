import validateBatonSchema from '../../dist/validators/baton.mjs';
import validateWorkflowSchema from '../../dist/validators/workflow.mjs';
import validateWorkerOutputSchema from '../../dist/validators/worker-output.mjs';
import validateWorkflowInterpreterResponseSchema from '../../dist/validators/workflow-interpreter-response.mjs';
import { WorkflowInterpreterError } from './errors.mjs';

function formatSchemaErrors(errors = []) {
  return errors
    .map((error) => `${error.instancePath || '/'} ${error.message}`.trim())
    .join('; ');
}

export function assertSchema(validate, value, name) {
  if (!validate(value)) throw new WorkflowInterpreterError(`${name} failed schema validation: ${formatSchemaErrors(validate.errors)}`);
}

export function assertWorkflowSchema(workflowDoc) {
  assertSchema(validateWorkflowSchema, workflowDoc, 'workflow');
}

export function assertBatonSchema(baton) {
  assertSchema(validateBatonSchema, baton, 'baton');
}

export function assertWorkerOutputSchema(workerOutput) {
  assertSchema(validateWorkerOutputSchema, workerOutput, 'worker output');
}

export function assertResponseSchema(response) {
  assertSchema(validateWorkflowInterpreterResponseSchema, response, 'workflow interpreter response');
}
