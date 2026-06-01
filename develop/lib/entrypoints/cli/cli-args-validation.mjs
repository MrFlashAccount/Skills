import { validateJsonSchema } from 'schema-validation';
import { workflowInterpreterCliArgsSchema } from './schema/workflow-interpreter-args-schema.mjs';

export function validateWorkflowRuntimeCliArgs(args) {
  return validateJsonSchema(workflowInterpreterCliArgsSchema, args, { schemas: [workflowInterpreterCliArgsSchema] }).ok;
}
