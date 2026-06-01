/** LoadInstructions use-case coordinates Workflow/Baton/Step validation for instruction reads. */
import { InstructionDTO } from '../dtos/InstructionDTO.mjs';
import { RunStateDTO } from '../dtos/RunStateDTO.mjs';
import { WorkflowDTO } from '../dtos/WorkflowDTO.mjs';
import { WorkflowResultDTO } from '../dtos/WorkflowResultDTO.mjs';
import { Baton } from '../entities/Baton.mjs';
import { Workflow } from '../entities/Workflow.mjs';

function materialize(value) {
  return typeof value?.toJSON === 'function' ? value.toJSON() : value;
}

function outputSchemasByStep(workflow, resources = {}) {
  const schemas = new Map();
  for (const [stepId, step] of Object.entries(workflow.steps ?? {})) {
    const schemaRef = step.output?.schema;
    if (!schemaRef) continue;
    const loaded = resources.outputSchemas?.[schemaRef] ?? resources.outputSchemas?.[stepId];
    if (loaded?.schema) schemas.set(stepId, loaded.schema);
    else if (loaded) schemas.set(stepId, loaded);
  }
  return schemas;
}

function normalizeRunState({ runStateDTO, batonDoc, batonData }) {
  if (runStateDTO) return materialize(new RunStateDTO(materialize(runStateDTO)));
  const baton = batonDoc ?? batonData?.baton ?? batonData;
  return materialize(new RunStateDTO({ baton, requests: batonData?.requests ?? [] }));
}

export function loadInstructions({ workflowDTO, runStateDTO, instructionDTO, resources, stepId, workflowDoc, batonDoc, batonData } = {}) {
  const workflowData = materialize(new WorkflowDTO(materialize(workflowDTO ?? workflowDoc)));
  const runState = normalizeRunState({ runStateDTO, batonDoc, batonData });
  const instruction = instructionDTO ? materialize(new InstructionDTO(materialize(instructionDTO))) : undefined;
  const requestedStepId = stepId ?? instruction?.stepId;

  const workflow = new Workflow(workflowData);
  workflow.validate({
    allowedRoles: resources?.allowedRoles,
    outputSchemas: outputSchemasByStep(workflowData, resources),
  });

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
