/** LoadInstructions use-case validates an instruction request against current baton requests. */
export function loadInstructions({ batonDTO, stepId, instructionDTO } = {}) {
  const baton = typeof batonDTO?.toJSON === 'function' ? batonDTO.toJSON() : batonDTO;
  const request = (baton?.requests ?? []).find((candidate) => candidate.stepId === stepId || candidate.id === stepId);
  if (!request) throw new Error(`unknown current workflow step id: ${stepId}`);
  return instructionDTO;
}
export const LoadInstructions = { execute: loadInstructions };
