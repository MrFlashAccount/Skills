/** Filesystem adapter for workflow boundary documents and referenced output schemas. */
import { readJson as readWorkflowJson } from '../workflow/json-io.mjs';
import { readOutputSchema } from '../workflow/output-schema-validation.mjs';
import { defaultRepositoryRootForWorkflow } from '../workflow/resource-resolver.mjs';
import { WorkflowDTO } from '../dtos/WorkflowDTO.mjs';

export function read(path) {
  return new WorkflowDTO(readWorkflowJson(path, 'workflow'));
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

export const WorkflowFileReader = { read, readOutputSchemas };
