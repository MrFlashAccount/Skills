import assert from 'node:assert/strict';
import test from 'node:test';
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
      input: { state: ['producer'], role: 'backend', template: 'consumer-input.md', prompt: 'Use projected producer output.' },
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
  outputSchemas: new Map([
    [
      'producer.schema.json',
      {
        type: 'object',
        properties: {
          outcome: { type: 'string', description: 'Producer outcome.' },
          route: { type: 'string', 'x-usage': 'Selects the next route.' },
        },
      },
    ],
    ['consumer.schema.json', { type: 'object', required: ['outcome'], properties: { outcome: { enum: ['ok'] } } }],
  ]),
};

const baton = {
  cursor: 'consumer',
  status: 'running',
  state: { producer: { outcome: 'ready', route: 'review' }, artifacts: [], results: [] },
};

test('Template renders inline content with userPrompt placeholder replacement', () => {
  const rendered = new Template({ content: 'Question: ${{ userPrompt }}' }).render({ userPrompt: 'ship it?' });

  assert.deepEqual(rendered, { prompt: 'Question: ship it?' });
});

test('Template compiles workflow expressions through the entity API', () => {
  assert.deepEqual(new Template().compileExpression('${{ input.producer.route }}').segments, ['input', 'producer', 'route']);
});

test('renderWorkflowPrompt assembles templates, role material, output contract, projected state, and metadata', () => {
  const rendered = renderWorkflowPrompt({ workflow, baton, stepId: 'consumer', step: workflow.steps.consumer, resources, userPrompt: 'extra operator context' });

  assert.match(rendered.prompt, /^# Custom Consumer/m);
  assert.match(rendered.prompt, /## Workflow instruction\n\nKeep workflow-level context visible\./);
  assert.match(rendered.prompt, /<!-- role material: \/roles\/backend\/ROLE\.md -->/);
  assert.match(rendered.prompt, /## Output contract/);
  assert.match(rendered.prompt, /<!-- output template: consumer-output\.md -->/);
  assert.match(rendered.prompt, /<!-- output schema: consumer\.schema\.json -->/);
  assert.match(rendered.prompt, /Field notes for projected step outputs/);
  assert.match(rendered.prompt, /Description: Producer outcome\./);
  assert.match(rendered.prompt, /Usage: Selects the next route\./);
  assert.match(rendered.prompt, /"route": "review"/);
  assert.match(rendered.prompt, /## Workflow step prompt\n\nUse projected producer output\./);
  assert.match(rendered.prompt, /## User prompt\n\nextra operator context/);
  assert.match(rendered.prompt, /## Final reminder/);

  assert.deepEqual(rendered.metadata, {
    inputTemplate: 'consumer-input.md',
    outputTemplate: 'consumer-output.md',
    outputSchema: 'consumer.schema.json',
    roleMaterial: ['/roles/backend/ROLE.md', '/roles/backend/RUBRIC.md'],
    projectedStateKeys: ['producer'],
  });
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
