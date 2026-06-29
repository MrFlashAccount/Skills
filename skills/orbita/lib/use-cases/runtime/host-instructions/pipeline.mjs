import { Template } from '../../../entities/Template/index.mjs';
import { buildApprovalInstructionProjection } from './approval-projection.mjs';
import { buildWorkerInstructionProjection } from './worker-projection.mjs';

const INSTRUCTION_KIND_BY_ACTION = Object.freeze({
  run_worker: 'workerInstruction',
  wait_for_approval: 'approvalInstruction',
});

function instructionKindForStep(step) {
  return INSTRUCTION_KIND_BY_ACTION[step.action];
}

export function buildHostInstructionProjection(step, options = {}) {
  if (step.action === 'run_worker') return buildWorkerInstructionProjection({ step });
  if (step.action === 'wait_for_approval') {
    return buildApprovalInstructionProjection({
      step,
      request: options.request,
      commands: options.commands,
    });
  }
  return undefined;
}

export function renderHostInstructionProjection(projection, kind) {
  return new Template().render(projection, kind);
}

export function renderHostDirectiveForStep(step, options = {}) {
  const projection = buildHostInstructionProjection(step, options);
  const kind = instructionKindForStep(step);
  if (!projection || !kind) return '';
  if (step.action === 'run_worker') return '';
  return renderHostInstructionProjection(projection, kind);
}

export function renderStepInstructionsForStep(step, options = {}) {
  const projection = buildHostInstructionProjection(step, options);
  const kind = instructionKindForStep(step);
  if (!projection || !kind) return '';
  return renderHostInstructionProjection(projection, kind);
}
