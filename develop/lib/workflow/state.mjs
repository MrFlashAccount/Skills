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

export function applyOutputToBatonState(baton, output, attempts) {
  const state = {
    ...baton.state,
    artifacts: mergeArtifacts(baton.state?.artifacts ?? [], output.artifacts ?? []),
    results: appendResults(baton.state?.results ?? [], output.results ?? []),
  };

  if (attempts && Object.keys(attempts).length > 0) state.attempts = attempts;
  else delete state.attempts;

  return state;
}
