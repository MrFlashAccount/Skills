import { WorkflowRuntimeError } from '../errors.mjs';
import { read, readOutputSchemas, readAllowedRoles } from '../persistence/workflow-resources/workflow-file-reader.mjs';
import { validateWorkflow } from './ValidateWorkflow.mjs';
import { defaultRepositoryRootForWorkflow } from '../persistence/workflow-resources/resource-resolver.mjs';
export function validateWorkflowFile(workflowPath, options = {}) {
  if (typeof workflowPath !== 'string' || workflowPath.length === 0) {
    throw new WorkflowRuntimeError('workflow path is required');
  }
  const workflowDTO = read(workflowPath);
  const repositoryRoot = options.repositoryRoot ?? defaultRepositoryRootForWorkflow(workflowPath);
  const outputSchemas = readOutputSchemas({ workflow: workflowDTO, workflowPath, repositoryRoot });
  const allowedRoles = readAllowedRoles({ repositoryRoot });
  return validateWorkflow({ workflowDTO, outputSchemas, allowedRoles }).toJSON();
}
