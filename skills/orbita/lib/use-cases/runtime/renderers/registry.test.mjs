import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { STEP_RENDERERS, renderExecutableStep } from './registry.mjs';

const tempDir = mkdtempSync(path.join(tmpdir(), 'orbita-step-renderers-'));
const workflow = {
  instruction: 'Keep workflow context visible.',
};
const resources = {
  templates: {
    'approval.md': {
      content: '# Approval Brief\n\nReview packet before deciding.\n',
      path: 'approval.md',
    },
    'worker.md': {
      content: '# Worker Brief\n',
      path: 'worker.md',
    },
    'output.md': {
      content: 'Return strict output.\n',
      path: 'output.md',
    },
  },
  resolveRunArtifactPath: (artifactPath) => artifactPath,
};

test('step renderer registry exposes projection-first strategies', () => {
  for (const renderer of Object.values(STEP_RENDERERS)) {
    assert.equal(typeof renderer.project, 'function');
    assert.equal(typeof renderer.render, 'function');
  }
});

test('step renderer registry keeps workflow compiled prompt on worker steps', () => {
  const rendered = renderExecutableStep({
    workflow,
    baton: { state: {} },
    entry: {
      id: 'build',
      step: {
        name: 'Build',
        kind: 'worker',
        input: { template: 'worker.md', prompt: 'Build it.' },
        output: { template: 'output.md' },
      },
    },
    resources,
  });

  assert.equal(Object.hasOwn(rendered, 'compiledPrompt'), true);
  assert.equal(Object.hasOwn(rendered, 'approvalPrompt'), false);
  assert.match(rendered.compiledPrompt.prompt, /# Worker Brief/);
  assert.match(rendered.compiledPrompt.prompt, /## Output contract/);
});

test('step renderer registry keeps approval projection out of compiledPrompt', () => {
  const artifactPath = path.join(tempDir, 'packet.md');
  writeFileSync(artifactPath, 'packet body\n');
  const rendered = renderExecutableStep({
    workflow,
    baton: {
      state: {
        design: {
          results: [{ summary: 'ready for approval' }],
          artifacts: [{ id: 'packet', path: artifactPath, content_type: 'text/markdown', summary: 'approval packet' }],
        },
      },
    },
    entry: {
      id: 'approve',
      step: {
        name: 'Approve',
        kind: 'approval',
        input: { template: 'approval.md', state: ['design'], prompt: 'Approve it.' },
      },
    },
    resources,
  });

  assert.equal(Object.hasOwn(rendered, 'compiledPrompt'), false);
  assert.deepEqual(rendered.approvalPrompt, {
    promptLayer: '# Approval Brief\n\nReview packet before deciding.',
    workflowInstruction: 'Keep workflow context visible.',
    state: {
      design: {
        results: [{ summary: 'ready for approval' }],
        artifacts: [{ id: 'packet', path: artifactPath, content_type: 'text/markdown', summary: 'approval packet' }],
      },
    },
    artifacts: [{
      id: 'packet',
      label: "Projected artifact 'packet' from 'design'",
      path: artifactPath,
      sourceStepId: 'design',
      contentType: 'text/markdown',
    }],
    summaries: [
      { sourceStepId: 'design', kind: 'result', summary: 'ready for approval' },
      { sourceStepId: 'design', kind: 'artifact', summary: "Artifact 'packet': approval packet" },
    ],
  });
});
