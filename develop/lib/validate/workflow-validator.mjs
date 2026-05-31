/**
 * Validation adapter: filesystem concerns stay here/persistence; workflow semantics are owned by Workflow entity.
 */
import { WorkflowInterpreterError } from '../entities/errors.mjs';
import { readJson } from '../persistence/json-io.mjs';
import { defaultRepositoryRootForWorkflow } from '../persistence/resource-resolver.mjs';
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
    const allowedRoles = WorkflowFileReader.readAllowedRoles({ repositoryRoot: repositoryRoot ?? defaultRepositoryRootForWorkflow(workflowPath) });
    return entity.validate({ outputSchemas: schemas, allowedRoles });
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
