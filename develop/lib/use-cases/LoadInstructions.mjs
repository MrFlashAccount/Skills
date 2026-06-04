/** LoadInstructions use-case coordinates Workflow/Baton/Step validation for instruction reads. */
import { InstructionDTO } from '../dtos/InstructionDTO.mjs';
import { RunStateProjectionDTO } from '../dtos/RunStateProjectionDTO.mjs';
import { WorkflowDTO } from '../dtos/WorkflowDTO.mjs';
import { WorkflowResultDTO } from '../dtos/WorkflowResultDTO.mjs';
import { Baton } from '../entities/Baton/index.mjs';
import { Workflow } from '../entities/Workflow/index.mjs';
import { validateWorkflowSemantics } from '../entities/Workflow/semantic-validation.mjs';

function materialize(value) {
  return typeof value?.toJSON === 'function' ? value.toJSON() : value;
}

function normalizeRunState({ runStateDTO, batonDoc, batonData }) {
  if (runStateDTO) return materialize(new RunStateProjectionDTO(materialize(runStateDTO)));
  const baton = batonDoc ?? batonData?.baton ?? batonData;
  return materialize(new RunStateProjectionDTO({ baton, requests: batonData?.requests ?? [] }));
}

export function loadInstructions({ workflowDTO, runStateDTO, instructionDTO, resources, stepId, workflowDoc, batonDoc, batonData } = {}) {
  const workflowData = materialize(new WorkflowDTO(materialize(workflowDTO ?? workflowDoc)));
  const runState = normalizeRunState({ runStateDTO, batonDoc, batonData });
  const instruction = instructionDTO ? materialize(new InstructionDTO(materialize(instructionDTO))) : undefined;
  const requestedStepId = stepId ?? instruction?.stepId;

  const workflow = new Workflow(workflowData);
  validateWorkflowSemantics(workflow, { resources });

  const baton = new Baton(runState.baton);
  baton.validateAgainst(workflow);
  const step = workflow.inferStep(baton);
  const validation = step.validateInstructionRequest({ workflow, baton, runState, stepId: requestedStepId });

  return materialize(new WorkflowResultDTO({
    ok: true,
    stepId: validation.stepId,
    instruction: instruction ? { path: instruction.path, content: instruction.content } : undefined,
  }));
}

export const LoadInstructions = { execute: loadInstructions };
