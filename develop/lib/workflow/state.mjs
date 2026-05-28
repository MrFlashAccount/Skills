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

export function applyOutputToBatonState(baton, output, attempts, stepId, { mirrorToOutputs = false } = {}) {
  const state = {
    ...baton.state,
    artifacts: mergeArtifacts(baton.state?.artifacts ?? [], output.artifacts ?? []),
    results: appendResults(baton.state?.results ?? [], output.results ?? []),
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
