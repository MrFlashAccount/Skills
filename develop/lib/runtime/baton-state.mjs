import { WorkflowRuntimeError } from '../errors.mjs';

function cloneBoundaryData(dto) {
  return typeof dto?.toJSON === 'function' ? dto.toJSON() : structuredClone(dto);
}

function mergeArtifacts(existingArtifacts, newArtifacts = []) {
  const merged = [...existingArtifacts];
  for (const artifact of newArtifacts) {
    const index = artifact.id ? merged.findIndex((existing) => existing.id === artifact.id) : -1;
    if (index >= 0) merged[index] = artifact;
    else merged.push(artifact);
  }
  return merged;
}

function appendResults(existingResults = [], newResults = []) {
  return [...existingResults, ...newResults];
}

function aggregateArray(output, fieldName) {
  const value = output[fieldName];
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new WorkflowRuntimeError(`worker output failed schema validation: /${fieldName} must be array`);
  return value;
}

export function applyOutputToBatonState(baton, output, attempts, stepId, { mirrorToOutputs = false } = {}) {
  const batonData = cloneBoundaryData(baton);
  const state = {
    ...batonData.state,
    artifacts: mergeArtifacts(batonData.state?.artifacts ?? [], aggregateArray(output, 'artifacts')),
    results: appendResults(batonData.state?.results ?? [], aggregateArray(output, 'results')),
  };

  if (stepId) {
    state[stepId] = structuredClone(output);
    if (mirrorToOutputs) {
      state.outputs = {
        ...(batonData.state?.outputs ?? {}),
        [stepId]: structuredClone(output),
      };
    }
  }

  if (attempts) state.attempts = attempts;
  return state;
}
