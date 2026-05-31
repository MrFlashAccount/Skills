import { validateJsonSchema } from 'schema-validation';
import { workflowInterpreterCliArgsSchema, workflowSchemas } from './schema-validation.mjs';

export function validateWorkflowInterpreterCliArgs(args) {
  return validateJsonSchema(workflowInterpreterCliArgsSchema, args, { schemas: workflowSchemas }).ok;
}
