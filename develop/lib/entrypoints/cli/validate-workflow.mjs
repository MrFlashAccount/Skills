#!/usr/bin/env node
import { WorkflowInterpreterError } from '../../entities/Workflow/errors.mjs';
import { validateWorkflowFile } from '../../use-cases/workflow-validator.mjs';
import { readJson } from '../../persistence/json-io.mjs';
import { loadOutputSchema } from '../../persistence/output-schema.mjs';
import { defaultRepositoryRootForWorkflow } from '../../persistence/resource-resolver.mjs';
import { assertRoleDirectoryName, listAllowedWorkflowRoles } from '../../persistence/role-material.mjs';

function fail(message) {
  console.error(`validate-workflow: ${message}`);
  process.exit(1);
}

const workflowPaths = process.argv.slice(2);
if (workflowPaths.length === 0) {
  workflowPaths.push('workflows/dev-harness/workflow.json', 'workflows/research-critic/workflow.json');
}

const resourceAdapters = { readJson, loadOutputSchema, defaultRepositoryRootForWorkflow, assertRoleDirectoryName, listAllowedWorkflowRoles };

try {
  const results = workflowPaths.map((workflowPath) => validateWorkflowFile(workflowPath, { resourceAdapters }));
  console.log(JSON.stringify(results.length === 1 ? results[0] : results, null, 2));
} catch (error) {
  if (error instanceof WorkflowInterpreterError) fail(error.message);
  throw error;
}
