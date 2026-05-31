import { WorkflowFileReader } from '../../persistence/WorkflowFileReader.mjs';
import { validateWorkflow } from '../../use-cases/ValidateWorkflow.mjs';
export function validateWorkflowFile(workflowPath, options = {}) {
  const workflowDTO = WorkflowFileReader.read(workflowPath);
  const repositoryRoot = options.repositoryRoot;
  const outputSchemas = WorkflowFileReader.readOutputSchemas({ workflow: workflowDTO, workflowPath, repositoryRoot });
  const allowedRoles = WorkflowFileReader.readAllowedRoles({ repositoryRoot });
  return validateWorkflow({ workflowDTO, outputSchemas, allowedRoles }).toJSON();
}
