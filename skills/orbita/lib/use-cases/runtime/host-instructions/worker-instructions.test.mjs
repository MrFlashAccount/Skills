import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildHostInstructionProjection,
  renderHostInstructionProjection,
  renderHostDirectiveForStep,
  renderStepInstructionsForStep,
} from './pipeline.mjs';

const compiledWorkerPrompt = `# Implementation Brief

Use the approved research packet.

## Required reads

Read these files before acting, in order:

1. Projected artifact 'packet' from 'research': \`/runs/research/artifacts/packet.md\`

Do not proceed until all required reads are complete.

## Output contract

Return strict JSON through the validating writer command.

## Workflow step prompt

Implement the approved change.
`;

test('worker instruction pipeline golden: rendered step -> projection DTO -> host instructions', () => {
  const renderedStep = {
    id: 'implement',
    action: 'run_worker',
    compiledPrompt: {
      prompt: compiledWorkerPrompt,
      metadata: {
        inputTemplate: 'templates/implementation.md',
        outputSchema: 'schemas/implementation-output.json',
        projectedStateKeys: ['research'],
      },
    },
    step: {
      name: 'Implement',
      kind: 'worker',
      input: { template: 'templates/implementation.md', state: ['research'] },
      next: 'approve',
    },
  };

  const projectionDTO = buildHostInstructionProjection(renderedStep);

  assert.deepEqual(projectionDTO, {
    stepId: 'implement',
    prompt: compiledWorkerPrompt,
  });
  assert.equal(renderHostInstructionProjection(projectionDTO, 'workerInstruction'), compiledWorkerPrompt);
  assert.equal(renderStepInstructionsForStep(renderedStep), compiledWorkerPrompt);
});

test('worker renderer keeps worker prompt out of host directives', () => {
  const step = {
    id: 'implement',
    action: 'run_worker',
    compiledPrompt: {
      prompt: 'Do worker task.\n\nWrite output with the validating command.',
    },
  };

  assert.equal(renderHostDirectiveForStep(step), '');
});

test('worker renderer returns compiled prompt for step instructions', () => {
  const step = {
    id: 'implement',
    action: 'run_worker',
    compiledPrompt: {
      prompt: 'Do worker task.\n\nWrite output with the validating command.',
    },
  };

  assert.equal(
    renderStepInstructionsForStep(step),
    'Do worker task.\n\nWrite output with the validating command.',
  );
});

test('worker renderer rejects missing compiled prompt for step instructions', () => {
  const step = {
    id: 'implement',
    action: 'run_worker',
    compiledPrompt: {},
  };

  assert.throws(
    () => renderStepInstructionsForStep(step),
    /missing compiled instructions for workflow step 'implement'/,
  );
});
