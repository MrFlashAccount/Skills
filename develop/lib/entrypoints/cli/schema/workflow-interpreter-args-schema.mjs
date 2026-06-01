import workflowInterpreterCliArgsSchema from './workflow-interpreter-args.json' with { type: 'json' };
import { assertSchema } from '../../../schema-kernel/index.mjs';

export { workflowInterpreterCliArgsSchema };

export function assertWorkflowRuntimeCliArgsSchema(args) {
  assertSchema(workflowInterpreterCliArgsSchema, args, 'workflow interpreter cli args', { schemas: [workflowInterpreterCliArgsSchema] });
}
