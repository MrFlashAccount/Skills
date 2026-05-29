#!/usr/bin/env node
import { WorkflowInterpreterError } from '../lib/workflow/errors.mjs';
import { validateWorkflowFile } from '../lib/validate/workflow-validator.mjs';

function fail(message) {
  console.error(`validate-workflow: ${message}`);
  process.exit(1);
}

const [workflowPath = 'develop/dev-harness.workflow.json'] = process.argv.slice(2);

try {
  const result = validateWorkflowFile(workflowPath);
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  if (error instanceof WorkflowInterpreterError) fail(error.message);
  throw error;
}
