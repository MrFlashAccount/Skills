/**
 * Validation adapter: filesystem concerns stay here/persistence; workflow semantics are owned by Workflow entity.
 */
import { WorkflowInterpreterError } from '../workflow/errors.mjs';
import { readJson } from '../workflow/json-io.mjs';
import { defaultRepositoryRootForWorkflow } from '../workflow/resource-resolver.mjs';
import { Workflow } from '../entities/Workflow.mjs';
import { WorkflowFileReader } from '../persistence/WorkflowFileReader.mjs';

export function validateWorkflowDocument(workflow, { workflowPath = 'workflow.json', repositoryRoot, outputSchemas } = {}) {
  const entity = new Workflow(workflow);
  const schemas = outputSchemas ?? WorkflowFileReader.readOutputSchemas({
    workflow,
    workflowPath,
    repositoryRoot: repositoryRoot ?? defaultRepositoryRootForWorkflow(workflowPath),
  });
  try {
    return entity.validate({ outputSchemas: schemas, repositoryRoot: repositoryRoot ?? process.cwd() });
  } catch (error) {
    if (error instanceof WorkflowInterpreterError) throw error;
    throw error;
  }
}

export function validateWorkflowFile(workflowPath, options = {}) {
  const workflowDoc = readJson(workflowPath, 'workflow');
  return validateWorkflowDocument(workflowDoc, {
    repositoryRoot: defaultRepositoryRootForWorkflow(workflowPath),
    ...options,
    workflowPath,
  });
}
