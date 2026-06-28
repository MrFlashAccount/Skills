export function buildWorkerInstructionProjection({ step } = {}) {
  return {
    stepId: step.id,
    prompt: step?.compiledPrompt?.prompt,
  };
}

export function renderWorkerHostDirective() {
  return "";
}

export function renderWorkerStepInstructions({ stepId, prompt }) {
  if (typeof prompt !== "string" || prompt.trim().length === 0) {
    throw new Error(`missing compiled instructions for workflow step '${stepId}'`);
  }
  return prompt;
}
