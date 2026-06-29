import { writeOutputCommandForStep } from "../runner-command-builder.mjs";
import {
  buildHostInstructionProjection as buildRuntimeHostInstructionProjection,
  renderHostDirectiveForStep as renderRuntimeHostDirectiveForStep,
  renderStepInstructionsForStep as renderRuntimeStepInstructionsForStep,
} from "../../../../use-cases/runtime/host-instructions/pipeline.mjs";

function buildApprovalHostInstructionCommands({ step, runId, runsRoot, leaseToken } = {}) {
  return {
    writeOutputCommand: typeof runId === "string" && runId.length > 0
      ? writeOutputCommandForStep(runId, step.id, { runsRoot, leaseToken })
      : "",
  };
}

export function buildHostInstructionProjection(step, options = {}) {
  const commands = buildApprovalHostInstructionCommands({
    step,
    runId: options.runId,
    runsRoot: options.runsRoot,
    leaseToken: options.leaseToken,
  });
  return buildRuntimeHostInstructionProjection(step, { ...options, commands });
}

export function renderHostDirectiveForStep(step, options = {}) {
  const commands = buildApprovalHostInstructionCommands({
    step,
    runId: options.runId,
    runsRoot: options.runsRoot,
    leaseToken: options.leaseToken,
  });
  return renderRuntimeHostDirectiveForStep(step, { ...options, commands });
}

export function renderStepInstructionsForStep(step, options = {}) {
  const commands = buildApprovalHostInstructionCommands({
    step,
    runId: options.runId,
    runsRoot: options.runsRoot,
    leaseToken: options.leaseToken,
  });
  return renderRuntimeStepInstructionsForStep(step, { ...options, commands });
}
