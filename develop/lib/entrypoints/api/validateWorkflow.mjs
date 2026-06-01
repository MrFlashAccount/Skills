import { read, readOutputSchemas, readAllowedRoles } from '../../persistence/workflow-resources/workflow-file-reader.mjs';
import { validateWorkflow } from '../../use-cases/ValidateWorkflow.mjs';
import { defaultRepositoryRootForWorkflow } from '../../persistence/workflow-resources/resource-resolver.mjs';
export function validateWorkflowFile(workflowPath, options = {}) {
  const workflowDTO = read(workflowPath);
  const repositoryRoot = options.repositoryRoot ?? defaultRepositoryRootForWorkflow(workflowPath);
  const outputSchemas = readOutputSchemas({ workflow: workflowDTO, workflowPath, repositoryRoot });
  const allowedRoles = readAllowedRoles({ repositoryRoot });
  return validateWorkflow({ workflowDTO, outputSchemas, allowedRoles }).toJSON();
}
