import { validateJsonSchema } from 'schema-validation';
import { workflowInterpreterCliArgsSchema, workflowSchemas } from '../../schemas/workflow-schema.mjs';

export function validateWorkflowRuntimeCliArgs(args) {
  return validateJsonSchema(workflowInterpreterCliArgsSchema, args, { schemas: workflowSchemas }).ok;
}
