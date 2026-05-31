import { WorkflowFileReader } from '../../persistence/WorkflowFileReader.mjs';
import { validateWorkflow } from '../../use-cases/ValidateWorkflow.mjs';
export function validateWorkflowFile(workflowPath, options = {}) {
  const workflowDTO = WorkflowFileReader.read(workflowPath);
  const outputSchemas = WorkflowFileReader.readOutputSchemas({ workflow: workflowDTO, workflowPath, repositoryRoot: options.repositoryRoot });
  return validateWorkflow({ workflowDTO, outputSchemas, repositoryRoot: options.repositoryRoot }).toJSON();
}
