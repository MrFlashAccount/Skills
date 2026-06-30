import assert from 'node:assert/strict';
import test from 'node:test';
import { renderWorkflowPrompt as renderCompiledWorkflowPrompt } from '../compiler/index.mjs';
import { Template, renderWorkflowPrompt } from '../index.mjs';

const workflow = {
  name: 'template-fixture',
  version: 1,
  instruction: 'Keep workflow-level context visible.',
  start: 'consumer',
  done: 'done',
  blocked: 'blocked',
  steps: {
    producer: { name: 'Producer', kind: 'worker', output: { schema: 'producer.schema.json' }, next: 'consumer' },
    consumer: {
      name: 'Consumer',
      kind: 'worker',
      input: { role: 'backend', template: 'consumer-input.md', prompt: 'Use producer output.\n\nArtifacts:\n${{ input.producer.artifacts }}' },
      output: { template: 'consumer-output.md', schema: 'consumer.schema.json' },
      next: 'done',
    },
    done: { name: 'Done', kind: 'done' },
    blocked: { name: 'Blocked', kind: 'blocked' },
  },
};

const resources = {
  templates: {
    'consumer-input.md': { content: '# Custom Consumer\n', path: '/templates/consumer-input.md' },
    'consumer-output.md': { content: 'Return a compact result.', path: '/templates/consumer-output.md' },
  },
  roleMaterials: {
    backend: {
      role: { path: '/roles/backend/ROLE.md', content: 'Backend role material.' },
      rubric: { path: '/roles/backend/RUBRIC.md', content: 'Backend rubric.' },
    },
  },
  schemaDefinitions: [
    {
      $id: 'https://github.com/MrFlashAccount/Skills/schemas/workflow/baton',
      $defs: {
        artifact: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Artifact id unique within the producer step.' },
            content_type: {
              type: 'string',
              description: 'MIME/content type, for example text/markdown or application/json.',
              'x-usage': 'Use to render or parse the artifact content. Do not duplicate artifact meaning with type or kind fields.',
            },
            path: {
              type: 'string',
              description: 'Optional full absolute filesystem path to the generated artifact file.',
              'x-usage': 'When producing an artifact file, write it inside the step\'s artifact output directory and emit the full absolute filesystem path here. Treat this path as the baton/output artifact pointer for later review, approval, or export. Do not rewrite it or use temp dirs, ad-hoc export paths, or paths outside the step artifact output directory.',
            },
            summary: { type: 'string', description: 'Optional compact handoff summary for the artifact.' },
          },
        },
      },
    },
  ],
  outputSchemas: new Map([
    [
      'producer.schema.json',
      {
        type: 'object',
        properties: {
          outcome: { type: 'string', description: 'Producer outcome.' },
          route: { type: 'string', 'x-usage': 'Selects the next route.' },
          artifacts: {
            type: 'array',
            items: { $ref: 'https://github.com/MrFlashAccount/Skills/schemas/workflow/baton#/$defs/artifact' },
            description: 'Producer artifacts.',
            'x-usage': 'Read producer artifacts before review.',
          },
        },
      },
    ],
    [
      'consumer.schema.json',
      {
        type: 'object',
        required: ['outcome'],
        properties: {
          outcome: { enum: ['ok'] },
          artifacts: {
            type: 'array',
            items: { $ref: 'https://github.com/MrFlashAccount/Skills/schemas/workflow/baton#/$defs/artifact' },
            description: 'Consumer artifacts.',
            'x-usage': 'Emit consumer artifact metadata when producing an artifact.',
          },
        },
      },
    ],
  ]),
};

const baton = {
  cursor: 'consumer',
  status: 'running',
  state: {
    producer: {
      outcome: 'ready',
      route: 'review',
      artifacts: [{ id: 'research-packet', content_type: 'text/markdown', path: '/tmp/workflow-runner-test/producer/artifacts/research-packet.md' }],
    },
    artifacts: [],
    results: [],
  },
};

test('Template renders inline content with userPrompt placeholder replacement', () => {
  const rendered = new Template({ content: 'Question: ${{ userPrompt }}' }).render({ userPrompt: 'ship it?' });

  assert.deepEqual(rendered, { prompt: 'Question: ship it?' });
});

test('Template compiles workflow expressions through the entity API', () => {
  assert.deepEqual(new Template().compileExpression('${{ input.producer.route }}').segments, ['input', 'producer', 'route']);
});

test('template compiler renders already-resolved required read paths without resolving them', () => {
  const rendered = renderCompiledWorkflowPrompt({
    workflow,
    stepId: 'consumer',
    step: workflow.steps.consumer,
    resources,
    promptInput: {
      value: {
        producer: {
          artifacts: [{ id: 'research-packet', content_type: 'text/markdown', path: '/abs/run/producer/artifacts/research-packet.md' }],
        },
      },
      keys: ['producer'],
    },
    requiredReads: [
      { label: "Role material for 'backend'", path: '/abs/project/roles/backend/ROLE.md' },
      { label: "Prompt input artifact 'research-packet' from 'producer'", path: '/abs/run/producer/artifacts/research-packet.md', contentType: 'text/markdown' },
    ],
    roleMetadataPaths: ['/abs/project/roles/backend/ROLE.md'],
  });

  assert.match(rendered.prompt, /1\. Role material for 'backend': `\/abs\/project\/roles\/backend\/ROLE\.md`/);
  assert.match(rendered.prompt, /2\. Prompt input artifact 'research-packet' from 'producer' \(text\/markdown\): `\/abs\/run\/producer\/artifacts\/research-packet\.md`/);
  assert.doesNotMatch(rendered.prompt, /workflow-runner-test/);
  assert.deepEqual(rendered.metadata.roleMaterial, ['/abs/project/roles/backend/ROLE.md']);
});

test('renderWorkflowPrompt assembles templates, required reads, output contract, workflow prompt, and metadata', () => {
  const rendered = renderWorkflowPrompt({
    workflow,
    baton,
    stepId: 'consumer',
    step: workflow.steps.consumer,
    resources: { ...resources, runDir: '/tmp/workflow-runner-test', artifactOutputDir: '/tmp/workflow-runner-test/consumer/artifacts' },
    userPrompt: 'extra operator context',
  });

  assert.match(rendered.prompt, /^# Custom Consumer/m);
  assert.match(rendered.prompt, /## Workflow instruction\n\nKeep workflow-level context visible\./);
  assert.match(rendered.prompt, /## Required reads/);
  assert.match(rendered.prompt, /1\. Role material for 'backend': `\/roles\/backend\/ROLE\.md`/);
  assert.match(rendered.prompt, /2\. Role material for 'backend': `\/roles\/backend\/RUBRIC\.md`/);
  assert.match(rendered.prompt, /3\. Prompt input artifact 'research-packet' from 'producer' \(text\/markdown\): `\/tmp\/workflow-runner-test\/producer\/artifacts\/research-packet\.md`/);
  assert.match(rendered.prompt, /## Output contract/);
  assert.match(rendered.prompt, /No validating writer command is provided in these instructions, so do not invent one/);
  assert.match(rendered.prompt, /do not create or hand off a separate JSON output path/);
  assert.doesNotMatch(rendered.prompt, /host passes the output file to workflow-runner continue/);
  assert.match(rendered.prompt, /<!-- output template: consumer-output\.md -->/);
  assert.match(rendered.prompt, /<!-- output schema: consumer\.schema\.json -->/);
  assert.match(rendered.prompt, /Artifact output directory for this step: \/tmp\/workflow-runner-test\/consumer\/artifacts/);
  assert.match(rendered.prompt, /Use the artifact id as the artifact file name\/stem/);
  assert.match(rendered.prompt, /artifacts\[\]\.path to the full absolute filesystem path/);
  assert.match(rendered.prompt, /Schema-derived artifact field notes/);
  assert.match(rendered.prompt, /artifacts\[\]\.content_type/);
  assert.match(rendered.prompt, /Fill: Use to render or parse the artifact content/);
  assert.match(rendered.prompt, /Fill: When producing an artifact file, write it inside the step's artifact output directory and emit the full absolute filesystem path here/);
  assert.doesNotMatch(rendered.prompt, /Field notes for prompt input step outputs/);
  assert.doesNotMatch(rendered.prompt, /"route": "review"/);
  assert.doesNotMatch(rendered.prompt, /## Prompt input context/);
  assert.match(rendered.prompt, /## Workflow step prompt\n\nUse producer output\./);
  assert.match(rendered.prompt, /## User prompt\n\nextra operator context/);
  assert.match(rendered.prompt, /## Final reminder/);

  assert.deepEqual(rendered.metadata, {
    inputTemplate: 'consumer-input.md',
    outputTemplate: 'consumer-output.md',
    outputSchema: 'consumer.schema.json',
    roleMaterial: ['/roles/backend/ROLE.md', '/roles/backend/RUBRIC.md'],
  });
});

test('renderWorkflowPrompt injects provided validating writer command into output schema instructions', () => {
  const rendered = renderWorkflowPrompt({
    workflow,
    baton,
    stepId: 'consumer',
    step: workflow.steps.consumer,
    resources: {
      ...resources,
      validatingWriterCommand: "node ./lib/entrypoints/cli/workflow-runner.mjs write-output --run-id example --step-id consumer --lease-token example-token <<'JSON'\n<paste strict JSON here>\nJSON",
    },
  });

  assert.match(rendered.prompt, /Write the request output by calling this validating writer command/);
  assert.match(rendered.prompt, /workflow-runner\.mjs write-output --run-id example --step-id consumer/);
  assert.match(rendered.prompt, /If it fails with validation errors, fix the JSON and run the same command again/);
  assert.match(rendered.prompt, /Do not create a separate JSON output file and do not pass an output path to the orchestrator/);
  assert.match(rendered.prompt, /Artifact content files are allowed and required when producing artifacts/);
  assert.match(rendered.prompt, /handed off through the workflow artifacts metadata accepted into baton\/state/);
  assert.match(rendered.prompt, /do not create arbitrary temp\/export files as substitutes for baton artifacts/);
  assert.doesNotMatch(rendered.prompt, /No validating writer command is provided/);
});

test('renderWorkflowPrompt reports unsupported prompt placeholders from explicit input templates', () => {
  assert.throws(
    () => renderWorkflowPrompt({
      workflow,
      baton,
      stepId: 'consumer',
      step: workflow.steps.consumer,
      resources: { ...resources, templates: { ...resources.templates, 'consumer-input.md': 'Hello {{ oldPlaceholder }}' } },
    }),
    /placeholders are unsupported in input template 'consumer-input\.md': {{ oldPlaceholder }}/,
  );
});

test('renderWorkflowPrompt fails clearly when schema-derived notes contain unresolved external refs', () => {
  const brokenResources = {
    ...resources,
    outputSchemas: new Map([
      ...resources.outputSchemas,
      [
        'consumer.schema.json',
        {
          type: 'object',
          properties: {
            outcome: { enum: ['ok'] },
            artifacts: {
              type: 'array',
              items: { $ref: 'https://example.invalid/schemas/missing#/$defs/artifact' },
            },
          },
        },
      ],
    ]),
  };

  assert.throws(
    () => renderWorkflowPrompt({ workflow, baton, stepId: 'consumer', step: workflow.steps.consumer, resources: brokenResources }),
    /schema field notes failed: unresolved schema \$ref 'https:\/\/example\.invalid\/schemas\/missing#\/\$defs\/artifact'/,
  );
});

test('renderWorkflowPrompt keeps local JSON pointer refs in schema-derived notes', () => {
  const localRefResources = {
    ...resources,
    outputSchemas: new Map([
      ...resources.outputSchemas,
      [
        'consumer.schema.json',
        {
          type: 'object',
          properties: {
            outcome: { enum: ['ok'] },
            artifacts: {
              type: 'array',
              items: { $ref: '#/$defs/localArtifact' },
              description: 'Consumer artifacts.',
            },
          },
          $defs: {
            localArtifact: {
              type: 'object',
              properties: {
                content_type: { type: 'string', description: 'Local content type.', 'x-usage': 'Local usage note.' },
              },
            },
          },
        },
      ],
    ]),
  };

  const rendered = renderWorkflowPrompt({ workflow, baton, stepId: 'consumer', step: workflow.steps.consumer, resources: localRefResources });

  assert.match(rendered.prompt, /artifacts\[\]\.content_type/);
  assert.match(rendered.prompt, /Fill: Local usage note\./);
});
