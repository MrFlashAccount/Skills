/** ValidateWorkflow use-case coordinates DTO -> Workflow entity validation. */
import { Workflow } from '../entities/Workflow/index.mjs';
import { WorkflowResultDTO } from '../dtos/WorkflowResultDTO.mjs';
import { WorkflowRuntimeError } from '../errors.mjs';
import { assertWorkflowSchema } from '../file-contracts/workflow-document-schema.mjs';
import { workflowSemanticValidationOptions } from './workflow-semantic-validation.mjs';

export function validateWorkflow({ workflowDTO, outputSchemas = new Map(), allowedRoles, externalSchemas } = {}) {
  const workflowDoc = typeof workflowDTO?.toJSON === 'function' ? workflowDTO.toJSON() : workflowDTO;
  try {
    assertWorkflowSchema(workflowDoc);
  } catch (error) {
    if (error?.name === `Workflow${'SchemaError'}`) throw new WorkflowRuntimeError(error.message);
    throw error;
  }
  const workflow = new Workflow(workflowDTO);
  return new WorkflowResultDTO(workflow.validate(workflowSemanticValidationOptions({ outputSchemas, allowedRoles, externalSchemas })));
}

export const ValidateWorkflow = { execute: validateWorkflow };
