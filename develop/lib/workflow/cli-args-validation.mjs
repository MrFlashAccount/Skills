import validateWorkflowInterpreterCliArgsSchema from '../../dist/validators/internal/cli-args/workflow-interpreter.mjs';

export function validateWorkflowInterpreterCliArgs(args) {
  return validateWorkflowInterpreterCliArgsSchema(args);
}
