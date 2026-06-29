import assert from 'node:assert/strict';
import test from 'node:test';
import { Template } from '../index.mjs';

const emptyWorkerMetadata = {
  roleMaterial: [],
  projectedStateKeys: [],
  projectedArtifacts: [],
  projectedSummaries: [],
};

test('Template compiler golden: worker projection DTO -> compiled prompt', () => {
  const projectionDTO = {
    stepId: 'implement',
    promptLayer: '# Implementation Brief\n\nUse the research packet.',
    templatePath: 'templates/implement.md',
    workflowInstruction: 'Keep the implementation narrow.',
    requiredReads: [
      { label: "Role material for 'backend'", path: '/repo/roles/backend/ROLE.md' },
      {
        label: "Projected artifact 'packet' from 'research'",
        path: '/runs/research/artifacts/packet.md',
        contentType: 'text/markdown',
      },
    ],
    inlinePrompt: 'Implement the approved change.',
    stateBlock: '```json\n{\n  "research": {\n    "outcome": "ready"\n  }\n}\n```',
    outputContract: '## Output contract\n\nReturn strict JSON.',
    userPrompt: 'Keep the patch small.',
    finalReminder: '## Final reminder\n\nReturn exactly according to the output contract above.',
    usesDefaultPrompt: false,
    metadata: {
      inputTemplate: 'templates/implement.md',
      outputSchema: 'schemas/implementation-output.json',
      roleMaterial: ['/repo/roles/backend/ROLE.md'],
      projectedStateKeys: ['research'],
      projectedArtifacts: [
        {
          label: "Projected artifact 'packet' from 'research'",
          path: '/runs/research/artifacts/packet.md',
          contentType: 'text/markdown',
        },
      ],
      projectedSummaries: [
        { sourceStepId: 'research', kind: 'result', summary: 'ready' },
      ],
    },
  };

  const rendered = new Template().render(projectionDTO, 'worker');

  assert.deepEqual(rendered, {
    compiledPrompt: {
      prompt: `# Implementation Brief

Use the research packet.

## Workflow instruction

Keep the implementation narrow.

## Required reads

Read these files before acting, in order:

1. Role material for 'backend': \`/repo/roles/backend/ROLE.md\`
2. Projected artifact 'packet' from 'research' (text/markdown): \`/runs/research/artifacts/packet.md\`

Do not proceed until all required reads are complete.

## Output contract

Return strict JSON.

## Projected baton state

\`\`\`json
{
  "research": {
    "outcome": "ready"
  }
}
\`\`\`

## Workflow step prompt

Implement the approved change.


## User prompt

Keep the patch small.


## Final reminder

Return exactly according to the output contract above.
`,
      metadata: {
        inputTemplate: 'templates/implement.md',
        outputSchema: 'schemas/implementation-output.json',
        roleMaterial: ['/repo/roles/backend/ROLE.md'],
        projectedStateKeys: ['research'],
        projectedArtifacts: [
          {
            label: "Projected artifact 'packet' from 'research'",
            path: '/runs/research/artifacts/packet.md',
            contentType: 'text/markdown',
          },
        ],
        projectedSummaries: [
          { sourceStepId: 'research', kind: 'result', summary: 'ready' },
        ],
      },
    },
  });
});

test('Template compiler golden: approval projection DTO -> approval prompt payload', () => {
  const projectionDTO = {
    title: 'Approve Implementation',
    inputPrompt: 'Approve the implementation result.',
    promptLayer: '# Approval Brief\n\nReview attached patch before deciding.',
    workflowInstruction: 'Approval decides whether the workflow can finish.',
    artifacts: [
      {
        id: 'patch',
        label: "Projected artifact 'patch' from 'implement'",
        path: '/runs/implement/artifacts/patch.md',
        sourceStepId: 'implement',
        contentType: 'text/markdown',
      },
    ],
    summaries: [
      { sourceStepId: 'implement', kind: 'result', summary: 'implementation complete' },
    ],
    choices: { path: ['decision', 'choice'], values: ['approved', 'rejected'] },
  };

  assert.deepEqual(new Template().render(projectionDTO, 'approval'), {
    approvalPrompt: projectionDTO,
  });
});

test('Template compiler golden: approval instruction projection DTO -> host instructions', () => {
  const projectionDTO = {
    stepId: 'approve_implementation',
    title: 'Approve Implementation',
    inputPrompt: 'Approve the implementation result.',
    promptLayer: '# Approval Brief\n\nReview attached patch before deciding.',
    workflowInstruction: 'Approval decides whether the workflow can finish.',
    artifacts: [
      {
        label: "Projected artifact 'patch' from 'implement'",
        path: '/runs/implement/artifacts/patch.md',
        contentType: 'text/markdown',
      },
    ],
    summaries: [
      { sourceStepId: 'implement', kind: 'result', summary: 'implementation complete' },
    ],
    outputSchema: {
      type: 'object',
      required: ['decision'],
      properties: {
        decision: {
          type: 'object',
          required: ['choice'],
          properties: {
            choice: { enum: ['approved', 'rejected'] },
          },
          additionalProperties: false,
        },
      },
      additionalProperties: false,
    },
    choices: { path: ['decision', 'choice'], values: ['approved', 'rejected'] },
    writeOutputCommand: "node workflow-runner.mjs write-output --step-id approve_implementation <<'JSON'\n<paste strict JSON here>\nJSON",
  };

  assert.equal(new Template().render(projectionDTO, 'approvalInstruction'), `Approval request: approve_implementation

Do exactly:

Attach these artifacts before asking the user:
- Projected artifact 'patch' from 'implement' (text/markdown): /runs/implement/artifacts/patch.md

If an artifact cannot be attached or linked, say so in the user message and include its path.

Render this message to the user as the final message:

<message>
**Approve Implementation**

# Approval Brief

Review attached patch before deciding.

Workflow context:
Approval decides whether the workflow can finish.

Context:
- Approve the implementation result.
- implement result: implementation complete
- Attached artifact: Projected artifact 'patch' from 'implement'

Choose one:
- approved
- rejected
</message>

Normalize the user's answer to strict JSON that satisfies the output schema.
Known choices:
- approved -> {"decision":{"choice":"approved"}}
- rejected -> {"decision":{"choice":"rejected"}}

Submit with:

node workflow-runner.mjs write-output --step-id approve_implementation <<'JSON'
<paste strict JSON here>
JSON`);
});

test('Template compiler golden: worker instruction projection DTO -> host instructions', () => {
  const projectionDTO = {
    stepId: 'implement',
    prompt: '# Implementation Brief\n\nRun the worker.',
  };

  assert.equal(
    new Template().render(projectionDTO, 'workerInstruction'),
    '# Implementation Brief\n\nRun the worker.',
  );
});

const workerProjectionGoldenCases = [
  {
    name: 'minimal prompt layer',
    projectionDTO: {
      stepId: 'plan',
      promptLayer: '# Plan',
      requiredReads: [],
      metadata: emptyWorkerMetadata,
    },
    expected: {
      compiledPrompt: {
        prompt: '# Plan\n',
      },
    },
  },
  {
    name: 'workflow instruction only',
    projectionDTO: {
      stepId: 'plan',
      promptLayer: '# Plan',
      workflowInstruction: 'Keep context tight.',
      requiredReads: [],
      metadata: emptyWorkerMetadata,
    },
    expected: {
      compiledPrompt: {
        prompt: `# Plan

## Workflow instruction

Keep context tight.
`,
      },
    },
  },
  {
    name: 'required reads only',
    projectionDTO: {
      stepId: 'review',
      promptLayer: '# Review',
      requiredReads: [
        { label: 'Research packet', path: '/runs/research/packet.md' },
        { label: 'Design artifact', path: '/runs/design/design.md', contentType: 'text/markdown' },
      ],
      metadata: emptyWorkerMetadata,
    },
    expected: {
      compiledPrompt: {
        prompt: `# Review

## Required reads

Read these files before acting, in order:

1. Research packet: \`/runs/research/packet.md\`
2. Design artifact (text/markdown): \`/runs/design/design.md\`

Do not proceed until all required reads are complete.
`,
      },
    },
  },
  {
    name: 'output contract only',
    projectionDTO: {
      stepId: 'write',
      promptLayer: '# Write',
      requiredReads: [],
      outputContract: '## Output contract\n\nReturn JSON.',
      metadata: emptyWorkerMetadata,
    },
    expected: {
      compiledPrompt: {
        prompt: `# Write

## Output contract

Return JSON.
`,
      },
    },
  },
  {
    name: 'projected state only',
    projectionDTO: {
      stepId: 'consume',
      promptLayer: '# Consume',
      requiredReads: [],
      stateBlock: '```json\n{\n  "producer": "ready"\n}\n```',
      metadata: emptyWorkerMetadata,
    },
    expected: {
      compiledPrompt: {
        prompt: `# Consume

## Projected baton state

\`\`\`json
{
  "producer": "ready"
}
\`\`\`
`,
      },
    },
  },
  {
    name: 'inline prompt only',
    projectionDTO: {
      stepId: 'implement',
      promptLayer: '# Implement',
      requiredReads: [],
      inlinePrompt: 'Patch the bug.',
      metadata: emptyWorkerMetadata,
    },
    expected: {
      compiledPrompt: {
        prompt: `# Implement

## Workflow step prompt

Patch the bug.

`,
      },
    },
  },
  {
    name: 'user prompt only',
    projectionDTO: {
      stepId: 'implement',
      promptLayer: '# Implement',
      requiredReads: [],
      userPrompt: 'Prefer the small fix.',
      metadata: emptyWorkerMetadata,
    },
    expected: {
      compiledPrompt: {
        prompt: `# Implement

## User prompt

Prefer the small fix.

`,
      },
    },
  },
  {
    name: 'metadata emitted',
    projectionDTO: {
      stepId: 'implement',
      promptLayer: '# Implement',
      requiredReads: [],
      metadata: {
        inputTemplate: 'templates/implement.md',
        outputTemplate: 'templates/output.md',
        outputSchema: 'schemas/output.json',
        roleMaterial: ['/roles/backend/ROLE.md'],
        projectedStateKeys: ['research'],
        projectedArtifacts: [{ label: 'Packet', path: '/runs/research/packet.md' }],
        projectedSummaries: [{ sourceStepId: 'research', kind: 'result', summary: 'ready' }],
      },
    },
    expected: {
      compiledPrompt: {
        prompt: '# Implement\n',
        metadata: {
          inputTemplate: 'templates/implement.md',
          outputTemplate: 'templates/output.md',
          outputSchema: 'schemas/output.json',
          roleMaterial: ['/roles/backend/ROLE.md'],
          projectedStateKeys: ['research'],
          projectedArtifacts: [{ label: 'Packet', path: '/runs/research/packet.md' }],
          projectedSummaries: [{ sourceStepId: 'research', kind: 'result', summary: 'ready' }],
        },
      },
    },
  },
  {
    name: 'default prompt diagnostic included when requested',
    projectionDTO: {
      stepId: 'defaulted',
      promptLayer: '# Defaulted',
      requiredReads: [],
      usesDefaultPrompt: true,
      metadata: emptyWorkerMetadata,
    },
    options: { includeDiagnostics: true },
    expected: {
      compiledPrompt: {
        prompt: '# Defaulted\n',
        diagnostics: [
          {
            severity: 'info',
            code: 'default_prompt_used',
            message: 'No input.template declared; assembled deterministic default prompt.',
          },
        ],
      },
    },
  },
];

for (const { name, projectionDTO, options, expected } of workerProjectionGoldenCases) {
  test(`Template compiler golden worker: ${name}`, () => {
    assert.deepEqual(new Template().render(projectionDTO, 'worker', options), expected);
  });
}

const approvalProjectionGoldenCases = [
  {
    name: 'minimal approval prompt',
    projectionDTO: { title: 'Approve', inputPrompt: 'Approve it.', artifacts: [], summaries: [] },
  },
  {
    name: 'prompt layer',
    projectionDTO: { title: 'Approve', inputPrompt: 'Approve it.', promptLayer: '# Brief', artifacts: [], summaries: [] },
  },
  {
    name: 'workflow instruction',
    projectionDTO: { title: 'Approve', inputPrompt: 'Approve it.', workflowInstruction: 'Use workflow context.', artifacts: [], summaries: [] },
  },
  {
    name: 'single artifact',
    projectionDTO: {
      title: 'Approve',
      inputPrompt: 'Approve it.',
      artifacts: [{ id: 'packet', label: 'Packet', path: '/runs/packet.md', sourceStepId: 'research' }],
      summaries: [],
    },
  },
  {
    name: 'artifact content type',
    projectionDTO: {
      title: 'Approve',
      inputPrompt: 'Approve it.',
      artifacts: [{ id: 'packet', label: 'Packet', path: '/runs/packet.md', sourceStepId: 'research', contentType: 'text/markdown' }],
      summaries: [],
    },
  },
  {
    name: 'single summary',
    projectionDTO: {
      title: 'Approve',
      inputPrompt: 'Approve it.',
      artifacts: [],
      summaries: [{ sourceStepId: 'research', kind: 'result', summary: 'ready' }],
    },
  },
  {
    name: 'choices root path',
    projectionDTO: {
      title: 'Approve',
      inputPrompt: 'Approve it.',
      artifacts: [],
      summaries: [],
      choices: { path: ['approval'], values: ['approved', 'rejected'] },
    },
  },
  {
    name: 'choices nested path',
    projectionDTO: {
      title: 'Route',
      inputPrompt: 'Pick route.',
      artifacts: [],
      summaries: [],
      choices: { path: ['decision', 'choice'], values: ['ship', 'revise'] },
    },
  },
  {
    name: 'full approval prompt',
    projectionDTO: {
      title: 'Approve Implementation',
      inputPrompt: 'Approve the implementation.',
      promptLayer: '# Approval Brief',
      workflowInstruction: 'Finish only after approval.',
      artifacts: [{ id: 'patch', label: 'Patch', path: '/runs/patch.md', sourceStepId: 'implement', contentType: 'text/markdown' }],
      summaries: [{ sourceStepId: 'implement', kind: 'result', summary: 'complete' }],
      choices: { path: ['approval'], values: ['approved', 'blocked'] },
    },
  },
];

for (const { name, projectionDTO } of approvalProjectionGoldenCases) {
  test(`Template compiler golden approval: ${name}`, () => {
    assert.deepEqual(new Template().render(projectionDTO, 'approval'), { approvalPrompt: projectionDTO });
  });
}

const approvalInstructionGoldenCases = [
  {
    name: 'minimal choice message',
    projectionDTO: {
      stepId: 'approve',
      title: 'Approve',
      inputPrompt: 'Approve it.',
      artifacts: [],
      summaries: [],
      choices: { path: ['approval'], values: ['approved', 'rejected'] },
      writeOutputCommand: 'write-output approve',
    },
    expected: `Approval request: approve

Do exactly:

Render this message to the user as the final message:

<message>
**Approve**

Context:
- Approve it.

Choose one:
- approved
- rejected
</message>

Normalize the user's answer to strict JSON that satisfies the output schema.
Known choices:
- approved -> {"approval":"approved"}
- rejected -> {"approval":"rejected"}

Submit with:

write-output approve`,
  },
  {
    name: 'free-form schema',
    projectionDTO: {
      stepId: 'capture',
      title: 'Capture',
      inputPrompt: 'Ask for note.',
      artifacts: [],
      summaries: [],
      outputSchema: { type: 'object', required: ['note'], properties: { note: { type: 'string' } } },
      writeOutputCommand: 'write-output capture',
    },
    expected: `Approval request: capture

Do exactly:

Render this message to the user as the final message:

<message>
**Capture**

Context:
- Ask for note.

Provide the requested input.
</message>

Normalize the user's answer to strict JSON that satisfies the output schema.
Use the user's response to fill JSON matching this schema:

\`\`\`json
{
  "type": "object",
  "required": [
    "note"
  ],
  "properties": {
    "note": {
      "type": "string"
    }
  }
}
\`\`\`

Submit with:

write-output capture`,
  },
  {
    name: 'prompt layer',
    projectionDTO: {
      stepId: 'approve_brief',
      title: 'Approve Brief',
      inputPrompt: 'Approve it.',
      promptLayer: '# Brief\n\nRead carefully.',
      artifacts: [],
      summaries: [],
      choices: { path: ['approval'], values: ['approved'] },
      writeOutputCommand: 'write-output approve_brief',
    },
    expected: `Approval request: approve_brief

Do exactly:

Render this message to the user as the final message:

<message>
**Approve Brief**

# Brief

Read carefully.

Context:
- Approve it.

Choose one:
- approved
</message>

Normalize the user's answer to strict JSON that satisfies the output schema.
Known choices:
- approved -> {"approval":"approved"}

Submit with:

write-output approve_brief`,
  },
  {
    name: 'workflow instruction',
    projectionDTO: {
      stepId: 'approve_context',
      title: 'Approve Context',
      inputPrompt: 'Approve it.',
      workflowInstruction: 'Only approve if all prior gates passed.',
      artifacts: [],
      summaries: [],
      choices: { path: ['approval'], values: ['approved'] },
      writeOutputCommand: 'write-output approve_context',
    },
    expected: `Approval request: approve_context

Do exactly:

Render this message to the user as the final message:

<message>
**Approve Context**

Workflow context:
Only approve if all prior gates passed.

Context:
- Approve it.

Choose one:
- approved
</message>

Normalize the user's answer to strict JSON that satisfies the output schema.
Known choices:
- approved -> {"approval":"approved"}

Submit with:

write-output approve_context`,
  },
  {
    name: 'artifact attachment',
    projectionDTO: {
      stepId: 'approve_artifact',
      title: 'Approve Artifact',
      inputPrompt: 'Approve packet.',
      artifacts: [{ label: 'Packet', path: '/runs/packet.md', contentType: 'text/markdown' }],
      summaries: [],
      choices: { path: ['approval'], values: ['approved'] },
      writeOutputCommand: 'write-output approve_artifact',
    },
    expected: `Approval request: approve_artifact

Do exactly:

Attach these artifacts before asking the user:
- Packet (text/markdown): /runs/packet.md

If an artifact cannot be attached or linked, say so in the user message and include its path.

Render this message to the user as the final message:

<message>
**Approve Artifact**

Context:
- Approve packet.
- Attached artifact: Packet

Choose one:
- approved
</message>

Normalize the user's answer to strict JSON that satisfies the output schema.
Known choices:
- approved -> {"approval":"approved"}

Submit with:

write-output approve_artifact`,
  },
  {
    name: 'summaries',
    projectionDTO: {
      stepId: 'approve_summary',
      title: 'Approve Summary',
      inputPrompt: 'Approve it.',
      artifacts: [],
      summaries: [
        { sourceStepId: 'research', kind: 'result', summary: 'ready' },
        { sourceStepId: 'implementation', kind: 'artifact', summary: 'patch attached' },
      ],
      choices: { path: ['approval'], values: ['approved'] },
      writeOutputCommand: 'write-output approve_summary',
    },
    expected: `Approval request: approve_summary

Do exactly:

Render this message to the user as the final message:

<message>
**Approve Summary**

Context:
- Approve it.
- research result: ready
- implementation artifact: patch attached

Choose one:
- approved
</message>

Normalize the user's answer to strict JSON that satisfies the output schema.
Known choices:
- approved -> {"approval":"approved"}

Submit with:

write-output approve_summary`,
  },
  {
    name: 'nested choice path',
    projectionDTO: {
      stepId: 'approve_nested',
      title: 'Approve Nested',
      inputPrompt: 'Pick route.',
      artifacts: [],
      summaries: [],
      outputSchema: {
        type: 'object',
        required: ['decision'],
        properties: { decision: { type: 'object', required: ['choice'], properties: { choice: { enum: ['ship', 'revise'] } } } },
      },
      choices: { path: ['decision', 'choice'], values: ['ship', 'revise'] },
      writeOutputCommand: 'write-output approve_nested',
    },
    expected: `Approval request: approve_nested

Do exactly:

Render this message to the user as the final message:

<message>
**Approve Nested**

Context:
- Pick route.

Choose one:
- ship
- revise
</message>

Normalize the user's answer to strict JSON that satisfies the output schema.
Known choices:
- ship -> {"decision":{"choice":"ship"}}
- revise -> {"decision":{"choice":"revise"}}

Submit with:

write-output approve_nested`,
  },
  {
    name: 'blocked choice adds blocker',
    projectionDTO: {
      stepId: 'approve_blocked',
      title: 'Approve Blocked',
      inputPrompt: 'Approve it.',
      artifacts: [],
      summaries: [],
      outputSchema: { type: 'object', required: ['approval'], properties: { approval: { enum: ['approved', 'blocked'] }, blocker: { type: 'object' } } },
      choices: { path: ['approval'], values: ['approved', 'blocked'] },
      writeOutputCommand: 'write-output approve_blocked',
    },
    expected: `Approval request: approve_blocked

Do exactly:

Render this message to the user as the final message:

<message>
**Approve Blocked**

Context:
- Approve it.

Choose one:
- approved
- blocked
</message>

Normalize the user's answer to strict JSON that satisfies the output schema.
Known choices:
- approved -> {"approval":"approved"}
- blocked -> {"approval":"blocked","blocker":{"reason":"..."}}

Submit with:

write-output approve_blocked`,
  },
  {
    name: 'missing write output command',
    projectionDTO: {
      stepId: 'approve_no_command',
      title: 'Approve No Command',
      inputPrompt: 'Approve it.',
      artifacts: [],
      summaries: [],
      choices: { path: ['approval'], values: ['approved'] },
      writeOutputCommand: '',
    },
    expected: `Approval request: approve_no_command

Do exactly:

Render this message to the user as the final message:

<message>
**Approve No Command**

Context:
- Approve it.

Choose one:
- approved
</message>

Normalize the user's answer to strict JSON that satisfies the output schema.
Known choices:
- approved -> {"approval":"approved"}

If no validating write-output command is present, stop as blocked with a runner contract bug.`,
  },
];

for (const { name, projectionDTO, expected } of approvalInstructionGoldenCases) {
  test(`Template compiler golden approvalInstruction: ${name}`, () => {
    assert.equal(new Template().render(projectionDTO, 'approvalInstruction'), expected);
  });
}

const workerInstructionGoldenCases = [
  { name: 'minimal prompt', projectionDTO: { stepId: 'a', prompt: '# A\n' }, expected: '# A\n' },
  { name: 'required reads prompt', projectionDTO: { stepId: 'b', prompt: '# B\n\n## Required reads\n\nRead file.' }, expected: '# B\n\n## Required reads\n\nRead file.' },
  { name: 'output contract prompt', projectionDTO: { stepId: 'c', prompt: '# C\n\n## Output contract\n\nReturn JSON.' }, expected: '# C\n\n## Output contract\n\nReturn JSON.' },
  { name: 'projected state prompt', projectionDTO: { stepId: 'd', prompt: '# D\n\n## Projected baton state\n\n```json\n{}\n```' }, expected: '# D\n\n## Projected baton state\n\n```json\n{}\n```' },
  { name: 'workflow step prompt', projectionDTO: { stepId: 'e', prompt: '# E\n\n## Workflow step prompt\n\nDo it.' }, expected: '# E\n\n## Workflow step prompt\n\nDo it.' },
  { name: 'user prompt', projectionDTO: { stepId: 'f', prompt: '# F\n\n## User prompt\n\nUser text.' }, expected: '# F\n\n## User prompt\n\nUser text.' },
  { name: 'long prompt', projectionDTO: { stepId: 'g', prompt: '# G\n\nLine 1\n\nLine 2\n\nLine 3' }, expected: '# G\n\nLine 1\n\nLine 2\n\nLine 3' },
  { name: 'command prompt', projectionDTO: { stepId: 'h', prompt: 'Run:\n\n```bash\nworkflow-runner write-output\n```' }, expected: 'Run:\n\n```bash\nworkflow-runner write-output\n```' },
  { name: 'trailing newline preserved', projectionDTO: { stepId: 'i', prompt: '# I\n\nDone.\n' }, expected: '# I\n\nDone.\n' },
];

for (const { name, projectionDTO, expected } of workerInstructionGoldenCases) {
  test(`Template compiler golden workerInstruction: ${name}`, () => {
    assert.equal(new Template().render(projectionDTO, 'workerInstruction'), expected);
  });
}
