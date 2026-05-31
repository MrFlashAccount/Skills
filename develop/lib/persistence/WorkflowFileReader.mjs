/** Filesystem adapter for workflow boundary documents and referenced output schemas. */
import { readJson as readWorkflowJson } from './json-io.mjs';
import { readOutputSchema } from './output-schema-validation.mjs';
import { defaultRepositoryRootForWorkflow } from './resource-resolver.mjs';
import { WorkflowDTO } from '../dtos/WorkflowDTO.mjs';
import { listAllowedWorkflowRoles } from './WorkflowRuntimeReader.mjs';
import { assertWorkflowSchema } from '../entities/workflow-helpers/schema-validation.mjs';

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
    outputSchemas.set(stepId, readOutputSchema({ workflow: doc, workflowPath, schemaRef, repositoryRoot }));
  }
  return outputSchemas;
}

export function readAllowedRoles({ repositoryRoot = defaultRepositoryRootForWorkflow('workflow.json') } = {}) {
  return listAllowedWorkflowRoles({ repositoryRoot });
}

export const WorkflowFileReader = { read, readOutputSchemas, readAllowedRoles };
