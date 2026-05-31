/** ValidateWorkflow use-case coordinates DTO -> Workflow entity validation. */
import { Workflow } from '../entities/Workflow.mjs';
import { WorkflowResultDTO } from '../dtos/WorkflowResultDTO.mjs';

export function validateWorkflow({ workflowDTO, outputSchemas = new Map(), repositoryRoot } = {}) {
  const workflow = new Workflow(workflowDTO);
  return new WorkflowResultDTO(workflow.validate({ outputSchemas, repositoryRoot }));
}

export const ValidateWorkflow = { execute: validateWorkflow };
