function placeholderForSchema(schema) {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return '...';
  if (Object.hasOwn(schema, 'const')) return schema.const;
  if (Array.isArray(schema.enum) && schema.enum.length > 0) return schema.enum[0];
  if (Array.isArray(schema.type)) {
    return placeholderForSchema({ ...schema, type: schema.type[0] });
  }
  switch (schema.type) {
    case 'boolean':
      return false;
    case 'integer':
    case 'number':
      return 0;
    case 'array':
      return [];
    case 'object': {
      const value = {};
      const properties = schema.properties && typeof schema.properties === 'object' && !Array.isArray(schema.properties)
        ? schema.properties
        : {};
      for (const key of schema.required ?? []) {
        value[key] = placeholderForSchema(properties[key]);
      }
      return value;
    }
    case 'null':
      return null;
    case 'string':
    default:
      return '...';
  }
}

function setPathValue(target, path, value) {
  if (!Array.isArray(path) || path.length === 0) return;
  let current = target;
  for (const segment of path.slice(0, -1)) {
    if (!current[segment] || typeof current[segment] !== 'object' || Array.isArray(current[segment])) {
      current[segment] = {};
    }
    current = current[segment];
  }
  current[path.at(-1)] = value;
}

function exampleForChoice({ path, value, schema }) {
  const choicePath = Array.isArray(path) && path.length > 0 ? path : ['approval'];
  const properties = schema?.properties && typeof schema.properties === 'object' && !Array.isArray(schema.properties)
    ? schema.properties
    : {};
  const example = schema?.type === 'object' ? placeholderForSchema(schema) : {};
  if (!example || typeof example !== 'object' || Array.isArray(example)) return JSON.stringify({ [choicePath.at(-1)]: value });
  for (const key of schema?.required ?? []) {
    if (!Object.hasOwn(example, key)) example[key] = placeholderForSchema(properties[key]);
  }
  setPathValue(example, choicePath, value);
  if (value === 'blocked' && schema?.properties?.blocker && !Object.hasOwn(example, 'blocker')) example.blocker = { reason: '...' };
  return JSON.stringify(example);
}

function attachArtifactsBlock(artifacts) {
  if (artifacts.length === 0) return '';

  return [
    'Attach these artifacts before asking the user:',
    ...artifacts.map((artifact) => {
      const suffix = artifact.contentType ? ` (${artifact.contentType})` : '';
      return `- ${artifact.label}${suffix}: ${artifact.path}`;
    }),
    '',
    'If an artifact cannot be attached or linked, say so in the user message and include its path.',
  ].join('\n');
}

function userMessageBlock({ title, inputPrompt, promptLayer, workflowInstruction, artifacts, summaries, choices }) {
  const lines = [
    `**${title}**`,
    '',
  ];
  if (promptLayer) lines.push(promptLayer, '');
  if (workflowInstruction) lines.push('Workflow context:', workflowInstruction, '');
  lines.push('Context:', `- ${inputPrompt}`);
  lines.push(...summaries.map((item) => `- ${item.sourceStepId} ${item.kind}: ${item.summary}`));
  if (artifacts.length > 0) {
    lines.push(...artifacts.map((artifact) => `- Attached artifact: ${artifact.label}`));
  }
  if (choices) {
    lines.push('', 'Choose one:', ...choices.values.map((value) => `- ${value}`));
  } else {
    lines.push('', 'Provide the requested input.');
  }
  return lines.join('\n');
}

function normalizationBlock({ choices, outputSchema }) {
  if (!choices) {
    return [
      "Normalize the user's answer to strict JSON that satisfies the output schema.",
      "Use the user's response to fill JSON matching this schema:",
      '',
      '```json',
      JSON.stringify(outputSchema ?? {}, null, 2),
      '```',
    ].join('\n');
  }
  return [
    "Normalize the user's answer to strict JSON that satisfies the output schema.",
    'Known choices:',
    ...choices.values.map((value) => `- ${value} -> ${exampleForChoice({ path: choices.path, value, schema: outputSchema })}`),
  ].join('\n');
}

function writeOutputBlock(writeOutputCommand) {
  if (!writeOutputCommand) {
    return 'If no validating write-output command is present, stop as blocked with a runner contract bug.';
  }
  return [
    'Submit with:',
    '',
    writeOutputCommand,
  ].join('\n');
}

export function renderApprovalInstructionProjection(projection) {
  return [
    `Approval request: ${projection.stepId}`,
    'Do exactly:',
    attachArtifactsBlock(projection.artifacts),
    [
      'Render this message to the user as the final message:',
      '',
      '<message>',
      userMessageBlock(projection),
      '</message>',
    ].join('\n'),
    normalizationBlock(projection),
    writeOutputBlock(projection.writeOutputCommand),
  ].filter((part) => part !== '').join('\n\n');
}
