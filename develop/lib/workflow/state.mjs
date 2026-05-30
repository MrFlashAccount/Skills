import { WorkflowInterpreterError } from './errors.mjs';

function artifactType(artifact) {
  return artifact?.type ?? artifact?.id;
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
  if (!Array.isArray(value)) throw new WorkflowInterpreterError(`worker output failed schema validation: /${fieldName} must be array`);
  return value;
}

export function applyOutputToBatonState(baton, output, attempts, stepId, { mirrorToOutputs = false } = {}) {
  const state = {
    ...baton.state,
    artifacts: mergeArtifacts(baton.state?.artifacts ?? [], aggregateArray(output, 'artifacts')),
    results: appendResults(baton.state?.results ?? [], aggregateArray(output, 'results')),
  };

  if (stepId) {
    state[stepId] = structuredClone(output);
    if (mirrorToOutputs) {
      state.outputs = {
        ...(baton.state?.outputs ?? {}),
        [stepId]: structuredClone(output),
      };
    }
  }

  if (attempts) state.attempts = attempts;

  return state;
}
