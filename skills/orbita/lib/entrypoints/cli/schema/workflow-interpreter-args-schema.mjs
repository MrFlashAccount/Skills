import workflowInterpreterCliArgsSchema from './workflow-interpreter-args.json' with { type: 'json' };
import { assertJsonSchema } from 'schema-validation';

export { workflowInterpreterCliArgsSchema };

export function assertWorkflowRuntimeCliArgsSchema(args) {
  assertJsonSchema(workflowInterpreterCliArgsSchema, args, 'workflow interpreter cli args', { schemas: [workflowInterpreterCliArgsSchema] });
}
