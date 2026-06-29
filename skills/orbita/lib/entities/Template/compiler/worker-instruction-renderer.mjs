export function renderWorkerInstructionProjection({ stepId, prompt }) {
  if (typeof prompt !== 'string' || prompt.trim().length === 0) {
    throw new Error(`missing compiled instructions for workflow step '${stepId}'`);
  }
  return prompt;
}
