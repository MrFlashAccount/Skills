import {
  buildApprovalHostInstructionCommands,
  buildApprovalInstructionProjection,
} from "./approval-projection.mjs";
import { renderApprovalInstructionProjection } from "./approval-renderer.mjs";
import {
  buildWorkerInstructionProjection,
  renderWorkerHostDirective,
  renderWorkerStepInstructions,
} from "./worker-renderer.mjs";

export function buildHostInstructionProjection(step, options = {}) {
  if (step.action === "run_worker") return buildWorkerInstructionProjection({ step });
  if (step.action !== "wait_for_approval") return undefined;
  const commands = buildApprovalHostInstructionCommands({
    step,
    runId: options.runId,
    runsRoot: options.runsRoot,
    leaseToken: options.leaseToken,
  });
  return buildApprovalInstructionProjection({ step, request: options.request, commands });
}

export function renderHostDirectiveForStep(step, options = {}) {
  const projection = buildHostInstructionProjection(step, options);
  if (!projection) return "";
  if (step.action === "run_worker") return renderWorkerHostDirective(projection);
  if (step.action === "wait_for_approval") return renderApprovalInstructionProjection(projection);
  return "";
}

export function renderStepInstructionsForStep(step, options = {}) {
  const projection = buildHostInstructionProjection(step, options);
  if (!projection) return "";
  if (step.action === "run_worker") return renderWorkerStepInstructions(projection);
  if (step.action === "wait_for_approval") return renderApprovalInstructionProjection(projection);
  return "";
}
