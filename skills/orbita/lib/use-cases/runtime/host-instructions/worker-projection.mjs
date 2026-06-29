export function buildWorkerInstructionProjection({ step } = {}) {
  return {
    stepId: step.id,
    prompt: step?.compiledPrompt?.prompt,
  };
}
