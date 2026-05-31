function requireObject(value, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${name} must be an object`);
}

function compact(value) {
  if (value === undefined || value === null || value === '') return undefined;
  return String(value).replace(/\s+/g, ' ').trim();
}

function historyEntry({ baton, steps, source, output, decision }) {
  const lines = [
    `## ${new Date().toISOString()}`,
    '',
    `- source: ${source}`,
    `- baton: cursor=${baton.cursor ?? 'unknown'} status=${baton.status ?? 'unknown'}`,
  ];

  if (steps) lines.push(`- steps: ${steps.map((step) => `id=${step.id ?? 'unknown'} action=${step.action ?? 'unknown'}`).join('; ')}`);
  if (output) lines.push(`- output: ${output}`);
  if (decision) lines.push(`- decision: ${decision}`);
  if (baton.blocker) lines.push(`- blocker: ${compact(JSON.stringify(baton.blocker))}`);

  lines.push('', '');
  return lines.join('\n');
}

/** Builds the DTO/value payload that the CLI writes after persistence loads input JSON. */
export function preparePersistedRun({ input, output, decision }) {
  const value = input.value;
  if (input.kind === 'response') requireObject(value, 'workflow interpreter response');

  const baton = input.kind === 'response' ? value.baton : value;
  const steps = input.kind === 'response' ? value.steps : undefined;
  requireObject(baton, 'baton');

  return {
    baton,
    historyEntry: historyEntry({
      baton,
      steps,
      source: input.source,
      output: compact(output),
      decision: compact(decision),
    }),
  };
}
