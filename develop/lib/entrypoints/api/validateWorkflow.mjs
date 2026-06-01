import { WorkflowFileReader } from '../../persistence/workflow-resources/workflow-file-reader.mjs';
import { validateWorkflow } from '../../use-cases/ValidateWorkflow.mjs';
import { defaultRepositoryRootForWorkflow } from '../../persistence/workflow-resources/resource-resolver.mjs';
export function validateWorkflowFile(workflowPath, options = {}) {
  const workflowDTO = WorkflowFileReader.read(workflowPath);
  const repositoryRoot = options.repositoryRoot ?? defaultRepositoryRootForWorkflow(workflowPath);
  const outputSchemas = WorkflowFileReader.readOutputSchemas({ workflow: workflowDTO, workflowPath, repositoryRoot });
  const allowedRoles = WorkflowFileReader.readAllowedRoles({ repositoryRoot });
  return validateWorkflow({ workflowDTO, outputSchemas, allowedRoles }).toJSON();
}
