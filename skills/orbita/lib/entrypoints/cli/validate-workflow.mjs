#!/usr/bin/env node
import { WorkflowRuntimeError } from '../../errors.mjs';
import { validateWorkflowFile } from '../validate-workflow-file.mjs';

function fail(message) {
  console.error(`validate-workflow: ${message}`);
  process.exit(1);
}

const workflowPaths = process.argv.slice(2);
if (workflowPaths.length === 0) {
  fail('workflow path is required');
}

try {
  const results = workflowPaths.map((workflowPath) => validateWorkflowFile(workflowPath));
  console.log(JSON.stringify(results.length === 1 ? results[0] : results, null, 2));
} catch (error) {
  if (error instanceof WorkflowRuntimeError) fail(error.message);
  throw error;
}
