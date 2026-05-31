/** ValidateWorkflow use-case coordinates DTO -> Workflow entity validation. */
import { Workflow } from '../entities/Workflow.mjs';
import { WorkflowResultDTO } from '../dtos/WorkflowResultDTO.mjs';
import { WorkflowRuntimeError } from '../entities/errors.mjs';
import { WorkflowSchemaError, assertWorkflowSchema } from '../schemas/workflow-schema.mjs';

export function validateWorkflow({ workflowDTO, outputSchemas = new Map(), allowedRoles = [] } = {}) {
  const workflowDoc = typeof workflowDTO?.toJSON === 'function' ? workflowDTO.toJSON() : workflowDTO;
  try {
    assertWorkflowSchema(workflowDoc);
  } catch (error) {
    if (error instanceof WorkflowSchemaError) throw new WorkflowRuntimeError(error.message);
    throw error;
  }
  const workflow = new Workflow(workflowDTO);
  return new WorkflowResultDTO(workflow.validate({ outputSchemas, allowedRoles }));
}

export const ValidateWorkflow = { execute: validateWorkflow };
