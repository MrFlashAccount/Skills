#!/usr/bin/env node
import { WorkflowInterpreterError } from '../../workflow/errors.mjs';
import { validateWorkflowFile } from '../../validate/workflow-validator.mjs';

function fail(message) {
  console.error(`validate-workflow: ${message}`);
  process.exit(1);
}

const workflowPaths = process.argv.slice(2);
if (workflowPaths.length === 0) {
  workflowPaths.push('workflows/dev-harness/workflow.json', 'workflows/research-critic/workflow.json');
}

try {
  const results = workflowPaths.map((workflowPath) => validateWorkflowFile(workflowPath));
  console.log(JSON.stringify(results.length === 1 ? results[0] : results, null, 2));
} catch (error) {
  if (error instanceof WorkflowInterpreterError) fail(error.message);
  throw error;
}
