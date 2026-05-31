import { WorkflowFileReader } from '../../persistence/WorkflowFileReader.mjs';
import { validateWorkflow } from '../../use-cases/ValidateWorkflow.mjs';
import { defaultRepositoryRootForWorkflow } from '../../persistence/resource-resolver.mjs';
export function validateWorkflowFile(workflowPath, options = {}) {
  const workflowDTO = WorkflowFileReader.read(workflowPath);
  const repositoryRoot = options.repositoryRoot ?? defaultRepositoryRootForWorkflow(workflowPath);
  const outputSchemas = WorkflowFileReader.readOutputSchemas({ workflow: workflowDTO, workflowPath, repositoryRoot });
  const allowedRoles = WorkflowFileReader.readAllowedRoles({ repositoryRoot });
  return validateWorkflow({ workflowDTO, outputSchemas, allowedRoles }).toJSON();
}
