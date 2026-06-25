/** Filesystem adapter for workflow boundary documents and referenced output schemas. */
import { readFileSync } from 'node:fs';
import { WorkflowRuntimeError } from '../../errors.mjs';
import { loadOutputSchema } from './output-schema-loader.mjs';
import { defaultRepositoryRootForWorkflow } from './resource-resolver.mjs';
import { WorkflowDTO } from '../../dtos/WorkflowDTO.mjs';
import { listAllowedWorkflowRoles } from './role-material-catalog.mjs';
import { assertWorkflowSchema } from '../../file-contracts/workflow-document-schema.mjs';

function readWorkflowJson(pathname, kind) {
  try {
    return JSON.parse(readFileSync(pathname, 'utf8'));
  } catch (error) {
    throw new WorkflowRuntimeError(`failed to read ${kind} JSON: ${error.message}`);
  }
}

export function read(path) {
  const workflow = readWorkflowJson(path, 'workflow');
  assertWorkflowSchema(workflow);
  return new WorkflowDTO(workflow);
}

export function readOutputSchemas({ workflow, workflowPath, repositoryRoot = defaultRepositoryRootForWorkflow(workflowPath) }) {
  const doc = typeof workflow?.toJSON === 'function' ? workflow.toJSON() : workflow;
  const outputSchemas = new Map();
  for (const [stepId, step] of Object.entries(doc.steps ?? {})) {
    const schemaRef = step.output?.schema;
    if (!schemaRef) continue;
    outputSchemas.set(stepId, loadOutputSchema({ workflow: doc, workflowPath, schemaRef, repositoryRoot }).schema);
  }
  return outputSchemas;
}

export function readAllowedRoles({ repositoryRoot = defaultRepositoryRootForWorkflow('workflow.json') } = {}) {
  return listAllowedWorkflowRoles({ repositoryRoot });
}
