import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';
import { fileURLToPath } from 'node:url';
import { renderStepPrompts } from '../use-cases/runtime/parallel/render.mjs';
import { projectState } from '../runtime/state-projection.mjs';
import { renderWorkflowPrompt } from '../entities/Template/index.mjs';
import { validateAgainstOutputSchema } from '../use-cases/runtime/output/output-schema-validation.mjs';
import { loadWorkflowResources } from '../persistence/workflow-resources/runtime-reader.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const tempDir = realpathSync(mkdtempSync(path.join(tmpdir(), 'prompt-rendering-check-')));
writeFileSync(path.join(tempDir, 'output.md'), '## Output contract\nReturn markdown.\n');
writeFileSync(path.join(tempDir, 'worker-output.schema.json'), `${JSON.stringify({
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  required: ['outcome'],
  properties: {
    outcome: { enum: ['ready', 'retry', 'blocked'] },
    artifacts: { type: 'array' },
    results: { type: 'array' },
    blocker: { type: 'object' },
    summary: { type: 'string' },
  },
  additionalProperties: false,
}, null, 2)}\n`);
writeFileSync(path.join(tempDir, 'review-output.schema.json'), `${JSON.stringify({
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  required: ['outcome'],
  properties: {
    outcome: { enum: ['ready', 'blocked'] },
    artifacts: { type: 'array' },
    results: { type: 'array' },
    blocker: { type: 'object' },
    summary: { type: 'string' },
  },
  additionalProperties: false,
}, null, 2)}\n`);
writeFileSync(path.join(tempDir, 'approval-output.schema.json'), `${JSON.stringify({
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  required: ['approval'],
  properties: {
    approval: { enum: ['approved', 'rejected', 'blocked'] },
    artifacts: { type: 'array' },
    results: { type: 'array' },
    blocker: { type: 'object' },
    choice: { enum: ['approved', 'blocked'] },
  },
  additionalProperties: false,
}, null, 2)}\n`);
mkdirSync(path.join(tempDir, 'templates'), { recursive: true });
writeFileSync(path.join(tempDir, 'templates', 'implementation-plan-template.md'), '## Implementation plan\nReturn implementation plan.\n');
writeFileSync(path.join(tempDir, 'templates', 'research-packet-template.md'), '## Research packet\nReturn research packet.\n');
writeFileSync(path.join(tempDir, 'templates', 'review-verdict-template.md'), '## Review verdict\nReturn review verdict.\n');

function outputContract(name = 'worker') {
  const templates = {
    worker: 'templates/implementation-plan-template.md',
    research: 'templates/research-packet-template.md',
    review: 'templates/review-verdict-template.md',
  };
  const schemas = {
    worker: 'worker-output.schema.json',
    research: 'worker-output.schema.json',
    review: 'review-output.schema.json',
    approval: 'approval-output.schema.json',
  };
  return { template: templates[name] ?? 'templates/review-verdict-template.md', schema: schemas[name] ?? 'worker-output.schema.json' };
}

const schemaWorkflowDoc = {
    name: 'schema-spec',
    version: 1,
    start: 'worker_step',
    done: 'done',
    blocked: 'blocked',
    steps: {
      worker_step: {
        name: 'Worker step',
        kind: 'worker',
        input: { template: 'worker.md', role: 'backend', prompt: 'Run worker.' },
        output: outputContract(),
        next: { match: '${{ output.outcome }}', cases: { ready: 'approval_step', retry: 'worker_step', blocked: 'blocked' } },
      },
      approval_step: {
        name: 'Approval step',
        kind: 'approval',
        input: { prompt: 'Approve.' },
        next: { match: '${{ output.approval }}', cases: { approved: 'direct_next_worker', rejected: 'worker_step', blocked: 'blocked' } },
      },
      direct_next_worker: {
        name: 'Direct next worker',
        kind: 'worker',
        input: { template: 'direct.md' },
        output: outputContract(),
        next: 'done',
      },
      done: { name: 'Done', kind: 'done', input: { prompt: 'Finished.' } },
      blocked: { name: 'Blocked', kind: 'blocked', input: { prompt: 'Blocked.' } },
    },

};

const emptyState = { artifacts: [], results: [] };

function safeName(label) {
  return label.replace(/[^a-z0-9_-]+/gi, '-');
}

function writeJson(fileName, value) {
  const filePath = path.join(tempDir, fileName);
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
  return filePath;
}

function writeRoleMaterial(role, { roleBody = `# ${role} role\nUse role guidance.\n`, rubricBody = `# ${role} rubric\nCheck rubric guidance.\n` } = {}) {
  const roleDir = path.join(tempDir, 'roles', role);
  mkdirSync(roleDir, { recursive: true });
  writeFileSync(path.join(roleDir, 'ROLE.md'), roleBody);
  writeFileSync(path.join(roleDir, 'RUBRIC.md'), rubricBody);
}

function baton(overrides = {}) {
  return {
    cursor: 'worker_step',
    status: 'running',
    state: structuredClone(emptyState),
    ...overrides,
  };
}

function runNode(args, cwd = root) {
  return spawnSync(process.execPath, args, { cwd, encoding: 'utf8' });
}

function resourcesForRender({ workflow, workflowPath, repositoryRoot }) {
  return loadWorkflowResources({ workflow, workflowPath, repositoryRoot });
}

function renderPromptWithResources(context) {
  return renderWorkflowPrompt({
    ...context,
    resources: context.resources ?? resourcesForRender(context),
  });
}

function renderStepsWithResources(context) {
  return renderStepPrompts({
    ...context,
    resources: context.resources ?? resourcesForRender(context),
  });
}

function assertMarkersInOrder(value, markers) {
  let previousIndex = -1;
  for (const marker of markers) {
    const index = value.indexOf(marker);
    assert.notEqual(index, -1, `missing marker: ${marker}`);
    assert.ok(index > previousIndex, `marker out of order: ${marker}`);
    previousIndex = index;
  }
}

function expectCliResult(label, result, expectSuccess) {
  const succeeded = result.status === 0;
  assert.equal(
    succeeded,
    expectSuccess,
    `check '${label}' expected ${expectSuccess ? 'success' : 'failure'} but got ${result.status}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
  );

  if (!expectSuccess) return { stdout: result.stdout, stderr: result.stderr };

  const response = JSON.parse(result.stdout);
  assert.ok(response.baton, `check '${label}' returned no baton`);
  assert.ok(response.steps[0], `check '${label}' returned no step`);
  return response;
}

after(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

test('state projection: projects explicit top-level keys in selector order', () => {
  const projected = projectState({ stepId: 'worker_step', batonState: { zed: 1, alpha: { ok: true }, beta: [2] }, selectors: ['alpha', 'zed'] });

  assert.deepEqual(Object.keys(projected.value), ['alpha', 'zed']);
  assert.deepEqual(projected.value, { alpha: { ok: true }, zed: 1 });
  assert.deepEqual(projected.projectedKeys, ['alpha', 'zed']);
});

test('state projection: absent selectors project empty object', () => {
  const projected = projectState({ stepId: 'worker_step', batonState: { worker_step: ['hidden'] } });

  assert.deepEqual(projected.value, {});
  assert.deepEqual(projected.projectedKeys, []);
});

test('state projection: skips valid selectors that are absent from the current baton state', () => {
  const projected = projectState({
    stepId: 'join',
    batonState: { required: { ok: true }, selected_branch: { done: true } },
    selectors: ['required', 'selected_branch', 'unselected_branch'],
  });

  assert.deepEqual(projected.value, { required: { ok: true }, selected_branch: { done: true } });
  assert.deepEqual(projected.projectedKeys, ['required', 'selected_branch']);
  assert.deepEqual(projected.diagnostics, []);
});

test('state projection: nested selectors are rejected', () => {
  assert.throws(
    () => projectState({ stepId: 'research', batonState: { worker_step: [] }, selectors: ['worker_step.0'] }),
    /unsupported state selector 'worker_step\.0'.*top-level workflow step ids only/,
  );
});

test('state projection: reserved runtime aggregate selectors are rejected even when present in baton state', () => {
  for (const selector of ['artifacts', 'results', 'outputs', 'attempts']) {
    assert.throws(
      () => projectState({ stepId: 'research', batonState: { [selector]: [{ type: 'packet', summary: 'leaked' }] }, selectors: [selector] }),
      new RegExp(`reserved state selector '${selector}'.*runtime aggregate state`),
    );
  }
});

function renderFixture(overrides = {}) {
  const stepId = overrides.stepId ?? 'approval_step';
  const step = overrides.step ?? schemaWorkflowDoc.steps.approval_step;
  const baseWorkflow = overrides.workflowDoc ?? overrides.workflow ?? schemaWorkflowDoc;
  const workflow = {
    ...baseWorkflow,
    steps: {
      ...(baseWorkflow.steps ?? {}),
      [stepId]: step,
    },
  };
  const workflowPath = writeJson(`${safeName(overrides.label ?? 'render')}-workflow.json`, workflow);
  return renderPromptWithResources({
    workflowPath,
    workflow,
    baton: overrides.batonDoc ?? baton(),
    stepId,
    step,
    repositoryRoot: overrides.repositoryRoot ?? tempDir,
    templateBaseDir: overrides.templateBaseDir,
    includeDiagnostics: overrides.includeDiagnostics,
    userPrompt: overrides.userPrompt,
  });
}

test('prompt renderer: default prompt omits projected state dump and keeps deterministic newline formatting without diagnostics by default', () => {
  const step = { name: 'Approval step', kind: 'approval', input: { prompt: 'Approve.' }, next: 'done' };
  const compiled = renderFixture({ label: 'render-default', step, batonDoc: baton({ cursor: 'approval_step', state: { artifacts: [], results: [], worker_step: [{ id: 'a' }], approval_step: [] } }) });

  assert.equal(Object.hasOwn(compiled, 'stepId'), false);
  assert.equal(Object.hasOwn(compiled, 'action'), false);
  assert.equal(Object.hasOwn(compiled, 'kind'), false);
  assert.equal(Object.hasOwn(compiled, 'name'), false);
  assert.match(compiled.prompt, /^# Approval step\n/);
  assertMarkersInOrder(compiled.prompt, [
    '## Workflow step prompt',
    'Approve.',
  ]);
  assert.doesNotMatch(compiled.prompt, /## Projected baton state/);
  assert.equal(Object.hasOwn(compiled, 'diagnostics'), false);
  assert.equal(compiled.prompt.endsWith('\n'), true);
});

test('prompt renderer: default prompt diagnostics are opt-in', () => {
  const step = { name: 'Approval step', kind: 'approval', input: { prompt: 'Approve.' }, next: 'done' };
  const compiled = renderFixture({ label: 'render-default-diagnostics', step, includeDiagnostics: true });

  assert.deepEqual(compiled.diagnostics, [
    {
      severity: 'info',
      code: 'default_prompt_used',
      message: 'No input.template declared; assembled deterministic default prompt.',
    },
  ]);
});

test('prompt renderer: interpolates prompt input expressions in workflow step prompt', () => {
  const step = {
    name: 'Worker step',
    kind: 'worker',
    input: {
      prompt: 'Previous summary: ${{ input.worker_step.summary }}\n\nCritic findings:\n${{ input.critic_step.verdict.findings }}',
    },
    output: { template: 'output.md' },
    next: 'done',
  };

  const compiled = renderFixture({
    label: 'render-prompt-interpolation',
    stepId: 'worker_step',
    step,
    batonDoc: baton({
      state: {
        artifacts: [],
        results: [],
        worker_step: { outcome: 'ready', summary: 'drafted' },
        critic_step: { outcome: 'needs_revision', verdict: { findings: ['tighten scope'] } },
      },
    }),
  });

  assertMarkersInOrder(compiled.prompt, [
    '## Workflow step prompt',
    'Previous summary: drafted',
    'Critic findings:',
    '```json\n[\n  "tighten scope"\n]',
  ]);
});

test('prompt renderer: joins prompt arrays before interpolation', () => {
  const step = {
    name: 'Worker step',
    kind: 'worker',
    input: {
      prompt: [
        'Previous summary: ${{ input.worker_step.summary }}',
        '',
        'Critic findings:',
        '${{ input.critic_step.verdict.findings }}',
      ],
    },
    output: { template: 'output.md' },
    next: 'done',
  };

  const compiled = renderFixture({
    label: 'render-prompt-array-interpolation',
    stepId: 'worker_step',
    step,
    batonDoc: baton({
      state: {
        artifacts: [],
        results: [],
        worker_step: { outcome: 'ready', summary: 'drafted' },
        critic_step: { outcome: 'needs_revision', verdict: { findings: ['tighten scope'] } },
      },
    }),
  });

  assertMarkersInOrder(compiled.prompt, [
    '## Workflow step prompt',
    'Previous summary: drafted',
    'Critic findings:',
    '```json\n[\n  "tighten scope"\n]',
  ]);
});

test('prompt renderer: uses prompt interpolation default for missing prompt input paths', () => {
  const step = {
    name: 'Draft step',
    kind: 'worker',
    input: {
      prompt: 'Previous critic feedback:\n${{ input.critic_step.verdict.findings | default: "No previous critic feedback yet." }}',
    },
    output: { template: 'output.md' },
    next: 'done',
  };

  const compiled = renderFixture({
    label: 'render-prompt-interpolation-default',
    stepId: 'draft_step',
    step,
    batonDoc: baton({ state: { artifacts: [], results: [] } }),
  });

  assert.match(compiled.prompt, /Previous critic feedback:\nNo previous critic feedback yet\./);
});

test('prompt renderer: rejects missing prompt interpolation paths without a default', () => {
  const step = {
    name: 'Draft step',
    kind: 'worker',
    input: {
      prompt: 'Previous critic feedback:\n${{ input.critic_step.verdict.findings }}',
    },
    output: { template: 'output.md' },
    next: 'done',
  };

  assert.throws(
    () => renderFixture({ label: 'render-prompt-interpolation-missing', stepId: 'draft_step', step }),
    /workflow prompt render failed: prompt expression '\$\{\{ input\.critic_step\.verdict\.findings \}\}' could not resolve missing path 'input\.critic_step'/,
  );
});

test('prompt renderer: keeps prompt interpolation scoped to prompt input paths', () => {
  const step = {
    name: 'Draft step',
    kind: 'worker',
    input: {
      prompt: 'Bad root: ${{ output.outcome | default: "ready" }}',
    },
    output: { template: 'output.md' },
    next: 'done',
  };

  assert.throws(
    () => renderFixture({ label: 'render-prompt-interpolation-output-root', stepId: 'draft_step', step }),
    /workflow prompt render failed: prompt expression '\$\{\{ output\.outcome \| default: "ready" \}\}' is invalid: root 'input' is required in input\.prompt interpolation/,
  );
});

test('prompt renderer: treats interpolated values as data, not nested templates', () => {
  const step = {
    name: 'Draft step',
    kind: 'worker',
    input: {
      prompt: 'Previous critic feedback:\n${{ input.critic_step.note }}',
    },
    output: { template: 'output.md' },
    next: 'done',
  };

  const compiled = renderFixture({
    label: 'render-prompt-interpolation-data-token',
    stepId: 'draft_step',
    step,
    batonDoc: baton({
      state: {
        artifacts: [],
        results: [],
        critic_step: { note: 'Literal example: ${{ input.other.value }}' },
      },
    }),
  });

  assert.match(compiled.prompt, /Literal example: \$\{\{ input\.other\.value \}\}/);
});

test('prompt renderer: rejects input template placeholders as unsupported', () => {
  writeFileSync(path.join(tempDir, 'placeholder-template.md'), '# {{step.name}}\n');
  const step = {
    name: 'Worker step',
    kind: 'worker',
    input: { template: 'placeholder-template.md' },
    output: { template: 'output.md' },
    next: 'done',
  };

  assert.throws(
    () => renderFixture({ label: 'render-placeholders-unsupported', stepId: 'worker_step', step }),
    /placeholders are unsupported in input template 'placeholder-template\.md': {{step\.name}}/,
  );
});

test('prompt renderer: appends required reads, output, and workflow prompt in fixed compiled layer order', () => {
  writeRoleMaterial('backend');
  writeFileSync(path.join(tempDir, 'minimal-template.md'), '# Worker step\n');
  writeFileSync(path.join(tempDir, 'minimal-output.md'), '## Required return\nUse this contract.\n');
  const step = {
    name: 'Worker step',
    kind: 'worker',
    input: { template: 'minimal-template.md', role: 'backend', prompt: 'Do the task.' },
    output: { template: 'minimal-output.md' },
    next: 'done',
  };

  const compiled = renderFixture({
    label: 'render-append',
    stepId: 'worker_step',
    step,
    batonDoc: baton({ state: { artifacts: [], results: [], worker_step: { outcome: 'ready', summary: 'done' } } }),
    workflow: {
      ...schemaWorkflowDoc,
      instruction: 'Use the deterministic workflow renderer.',
    },
  });

  assertMarkersInOrder(compiled.prompt, [
    '# Worker step',
    '## Workflow instruction',
    'Use the deterministic workflow renderer.',
    '## Required reads',
    `1. Role material for 'backend': \`${path.join(tempDir, 'roles', 'backend', 'ROLE.md')}\``,
    `2. Role material for 'backend': \`${path.join(tempDir, 'roles', 'backend', 'RUBRIC.md')}\``,
    '## Output contract',
    '<!-- output template: minimal-output.md -->',
    '## Required return\nUse this contract.',
    '## Workflow step prompt',
    'Do the task.',
    '## Final reminder',
    'Return exactly according to the output contract above.',
  ]);
  assert.doesNotMatch(compiled.prompt, /## Projected baton state/);
});

test('prompt renderer: runtime layer resolves role and artifact required-read paths before compilation', () => {
  writeRoleMaterial('backend');
  writeFileSync(path.join(tempDir, 'runtime-required-reads-template.md'), '# Worker step\n');
  const runDir = path.join(tempDir, 'runs', 'runtime-required-reads');
  mkdirSync(path.join(runDir, 'worker_step', 'artifacts'), { recursive: true });
  const step = {
    name: 'Approval step',
    kind: 'approval',
    input: { template: 'runtime-required-reads-template.md', role: 'backend', prompt: 'Approve.\n\nArtifacts:\n${{ input.worker_step.artifacts }}' },
    next: 'done',
  };
  const workflow = {
    ...schemaWorkflowDoc,
    steps: { ...schemaWorkflowDoc.steps, approval_step: step },
  };
  const workflowPath = writeJson('runtime-required-reads-workflow.json', workflow);
  const resources = loadWorkflowResources({ workflow, workflowPath, repositoryRoot: tempDir, runDir });

  const compiled = renderPromptWithResources({
    workflowPath,
    workflow,
    baton: baton({ cursor: 'approval_step', state: { artifacts: [], results: [], worker_step: { artifacts: [{ id: 'packet', content_type: 'text/markdown', path: 'worker_step/artifacts/packet.md' }] } } }),
    stepId: 'approval_step',
    step,
    repositoryRoot: tempDir,
    resources,
  });

  assert.ok(compiled.prompt.includes(`1. Role material for 'backend': \`${path.join(tempDir, 'roles', 'backend', 'ROLE.md')}\``));
  assert.ok(compiled.prompt.includes(`3. Projected artifact 'packet' from 'worker_step' (text/markdown): \`${path.join(runDir, 'worker_step', 'artifacts', 'packet.md')}\``));
});

test('prompt renderer: rejects relative projected artifact read paths when no runtime resolver is available', () => {
  writeFileSync(path.join(tempDir, 'cwd-ambiguity-template.md'), '# Worker step\n');
  const step = {
    name: 'Approval step',
    kind: 'approval',
    input: { template: 'cwd-ambiguity-template.md', prompt: 'Approve.\n\nArtifacts:\n${{ input.worker_step.artifacts }}' },
    next: 'done',
  };

  assert.throws(
    () => renderFixture({
      label: 'cwd-ambiguity',
      stepId: 'approval_step',
      step,
      batonDoc: baton({ cursor: 'approval_step', state: { artifacts: [], results: [], worker_step: { artifacts: [{ id: 'packet', path: 'worker_step/artifacts/packet.md' }] } } }),
    }),
    /projected artifact path must be absolute before template compilation: worker_step\/artifacts\/packet\.md/,
  );
});

test('prompt renderer: renders workflow instruction alias when instructions is non-empty', () => {
  const compiled = renderFixture({
    label: 'render-instructions-alias',
    workflow: {
      ...schemaWorkflowDoc,
      instructions: 'Use the legacy instructions alias.',
    },
  });

  assert.match(compiled.prompt, /## Workflow instruction\n\nUse the legacy instructions alias\./);
});

test('prompt renderer: omits workflow instruction section when instruction is absent or empty', () => {
  const absent = renderFixture({ label: 'render-no-workflow-instruction', workflow: schemaWorkflowDoc });
  assert.doesNotMatch(absent.prompt, /## Workflow instruction/);

  const empty = renderFixture({
    label: 'render-empty-workflow-instruction',
    workflow: {
      ...schemaWorkflowDoc,
      instruction: '',
    },
  });
  assert.doesNotMatch(empty.prompt, /## Workflow instruction/);

  const whitespace = renderFixture({
    label: 'render-whitespace-workflow-instruction',
    workflow: {
      ...schemaWorkflowDoc,
      instruction: '  \n\t',
    },
  });
  assert.doesNotMatch(whitespace.prompt, /## Workflow instruction/);
});


test('prompt renderer: renders raw user prompt only when render context provides it', () => {
  const rawPrompt = 'Fix the bug as reported.\nDo not infer GitHub context.';
  const step = {
    name: 'Worker step',
    kind: 'worker',
    input: { prompt: 'Do the task.' },
    output: { template: 'output.md' },
    next: 'approval_step',
  };

  const compiled = renderFixture({
    label: 'render-initial-user-prompt',
    stepId: 'worker_step',
    step,
    batonDoc: baton({ user_prompt: rawPrompt }),
    userPrompt: rawPrompt,
  });

  assert.ok(compiled.prompt.includes(`## User prompt\n\n${rawPrompt}\n`));
  assertMarkersInOrder(compiled.prompt, [
    '## Workflow step prompt',
    'Do the task.',
    '## User prompt',
    rawPrompt,
    '## Final reminder',
  ]);
});

test('prompt renderer: ignores render-time user prompt after persisted injection marker', () => {
  const rawPrompt = 'Already injected prompt must not repeat.';
  const step = {
    name: 'Later worker',
    kind: 'worker',
    input: { prompt: 'Run later.' },
    output: { template: 'output.md' },
    next: 'done',
  };

  const compiled = renderFixture({
    label: 'render-user-prompt-marker-guard',
    stepId: 'later_worker',
    step,
    batonDoc: baton({ cursor: 'later_worker', user_prompt: rawPrompt, user_prompt_injected: true }),
    userPrompt: rawPrompt,
  });

  assert.doesNotMatch(compiled.prompt, /## User prompt/);
  assert.equal(compiled.prompt.includes(rawPrompt), false);
});

test('prompt renderer: ignores render-time user prompt for non-worker steps', () => {
  const rawPrompt = 'Approval steps must not receive startup prompt.';
  const step = {
    name: 'Approval step',
    kind: 'approval',
    input: { prompt: 'Approve.' },
    next: 'done',
  };

  const compiled = renderFixture({
    label: 'render-user-prompt-approval-guard',
    stepId: 'approval_step',
    step,
    batonDoc: baton({ cursor: 'approval_step', user_prompt: rawPrompt }),
    userPrompt: rawPrompt,
  });

  assert.doesNotMatch(compiled.prompt, /## User prompt/);
  assert.equal(compiled.prompt.includes(rawPrompt), false);
});

test('prompt renderer: does not render empty user prompt even when render context provides it', () => {
  const step = {
    name: 'Worker step',
    kind: 'worker',
    input: { prompt: 'Do the task.' },
    output: { template: 'output.md' },
    next: 'done',
  };

  const compiled = renderFixture({
    label: 'render-empty-user-prompt',
    stepId: 'worker_step',
    step,
    batonDoc: baton({ user_prompt: '  \n' }),
    userPrompt: '  \n',
  });

  assert.doesNotMatch(compiled.prompt, /## User prompt/);
});

test('prompt renderer: renders provided startup user prompt for worker selected after control steps', () => {
  const rawPrompt = 'Use the original startup task after approval.';
  const workflow = {
    ...schemaWorkflowDoc,
    start: 'approval_step',
  };
  const step = {
    name: 'First worker after control',
    kind: 'worker',
    input: { prompt: 'Run first worker.' },
    output: { template: 'output.md' },
    next: 'done',
  };

  const compiled = renderFixture({
    label: 'render-first-worker-after-control-start',
    workflow,
    stepId: 'direct_next_worker',
    step,
    batonDoc: baton({
      cursor: 'direct_next_worker',
      user_prompt: rawPrompt,
      state: { artifacts: [], results: [], approval_step: { approval: 'approved' } },
    }),
    userPrompt: rawPrompt,
  });

  assert.ok(compiled.prompt.includes(`## User prompt\n\n${rawPrompt}\n`));
});

test('prompt renderer: does not infer user prompt eligibility from baton by default', () => {
  const step = {
    name: 'Direct next worker',
    kind: 'worker',
    input: {},
    output: { template: 'output.md' },
    next: 'done',
  };

  const compiled = renderFixture({
    label: 'render-later-user-prompt',
    stepId: 'direct_next_worker',
    step,
    batonDoc: baton({
      cursor: 'direct_next_worker',
      user_prompt: 'Do not leak me.',
      state: { artifacts: [], results: [], worker_step: { results: [{ summary: 'already ran first worker' }] } },
    }),
  });

  assert.doesNotMatch(compiled.prompt, /## User prompt/);
  assert.doesNotMatch(compiled.prompt, /Do not leak me\./);
});

test('prompt renderer: initial parallel workers put user prompt on first worker in response order only', () => {
  const workflow = {
    ...schemaWorkflowDoc,
    steps: {
      ...schemaWorkflowDoc.steps,
      branch_a: {
        name: 'Branch A',
        kind: 'worker',
        input: { prompt: 'Run branch A.' },
        output: { template: 'output.md' },
        next: 'done',
      },
      branch_b: {
        name: 'Branch B',
        kind: 'worker',
        input: { prompt: 'Run branch B.' },
        output: { template: 'output.md' },
        next: 'done',
      },
    },
  };
  const rawPrompt = 'Only the first current worker sees this.';
  const rendered = renderStepsWithResources({
    workflowPath: writeJson('initial-parallel-user-prompt-workflow.json', workflow),
    workflow,
    baton: baton({ user_prompt: rawPrompt, user_prompt_target: 'branch_b' }),
    steps: [
      { id: 'branch_b', action: 'run_worker', step: workflow.steps.branch_b },
      { id: 'branch_a', action: 'run_worker', step: workflow.steps.branch_a },
    ],
    repositoryRoot: tempDir,
  });

  assert.deepEqual(rendered.map((entry) => entry.id), ['branch_b', 'branch_a']);
  assert.match(rendered[0].compiledPrompt.prompt, /## User prompt/);
  assert.equal(rendered[0].compiledPrompt.prompt.includes(rawPrompt), true);
  assert.doesNotMatch(rendered[1].compiledPrompt.prompt, /## User prompt/);
  assert.equal(rendered[1].compiledPrompt.prompt.includes(rawPrompt), false);
});

test('prompt renderer: mixed current approval and worker gives user prompt only to worker', () => {
  const workflow = {
    ...schemaWorkflowDoc,
    steps: {
      ...schemaWorkflowDoc.steps,
      current_gate: {
        name: 'Current gate',
        kind: 'approval',
        input: { prompt: 'Ask for approval.' },
        next: 'done',
      },
      current_worker: {
        name: 'Current worker',
        kind: 'worker',
        input: { prompt: 'Run current worker.' },
        output: { template: 'output.md' },
        next: 'done',
      },
    },
  };
  const rawPrompt = 'Worker gets startup prompt after a same-batch gate.';
  const rendered = renderStepsWithResources({
    workflowPath: writeJson('mixed-current-user-prompt-workflow.json', workflow),
    workflow,
    baton: baton({ user_prompt: rawPrompt, user_prompt_target: 'current_worker' }),
    steps: [
      { id: 'current_gate', action: 'wait_for_approval', step: workflow.steps.current_gate },
      { id: 'current_worker', action: 'run_worker', step: workflow.steps.current_worker },
    ],
    repositoryRoot: tempDir,
  });

  assert.doesNotMatch(rendered[0].compiledPrompt.prompt, /## User prompt/);
  assert.equal(rendered[0].compiledPrompt.prompt.includes(rawPrompt), false);
  assert.match(rendered[1].compiledPrompt.prompt, /## User prompt/);
  assert.equal(rendered[1].compiledPrompt.prompt.includes(rawPrompt), true);
});

test('prompt renderer: resolves input.role as required reads for ROLE.md and RUBRIC.md', () => {
  writeRoleMaterial('custom-backend', {
    roleBody: '# Custom Role\n\nBackend role instructions.\n',
    rubricBody: '# Custom Rubric\n\nBackend rubric checks.\n',
  });
  writeFileSync(path.join(tempDir, 'role-template.md'), '# Worker step\n');
  const step = {
    name: 'Worker step',
    kind: 'worker',
    input: { template: 'role-template.md', role: 'custom-backend' },
    output: { template: 'output.md' },
    next: 'done',
  };

  const compiled = renderFixture({ label: 'render-role-material', stepId: 'worker_step', step });

  assert.match(compiled.prompt, /## Required reads/);
  const rolePath = path.join(tempDir, 'roles', 'custom-backend', 'ROLE.md');
  const rubricPath = path.join(tempDir, 'roles', 'custom-backend', 'RUBRIC.md');
  assert.match(compiled.prompt, new RegExp(`1\\. Role material for 'custom-backend': \`${rolePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\``));
  assert.match(compiled.prompt, new RegExp(`2\\. Role material for 'custom-backend': \`${rubricPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\``));
  assert.doesNotMatch(compiled.prompt, /Backend role instructions\./);
  assert.doesNotMatch(compiled.prompt, /Backend rubric checks\./);
  assert.deepEqual(compiled.metadata.roleMaterial, [rolePath, rubricPath]);
});

test('prompt renderer: input.role rejects traversal and external escape attempts', () => {
  const traversalStep = {
    name: 'Worker step',
    kind: 'worker',
    input: { role: '../backend' },
    next: 'done',
  };

  assert.throws(
    () => renderFixture({ label: 'render-role-traversal', stepId: 'worker_step', step: traversalStep }),
    /input\.role must be a role directory name: \.\.\/backend/,
  );

  const outsideRolePath = path.resolve(tempDir, '../outside-role.md');
  const escapedRoleDir = path.join(tempDir, 'roles', 'escaped-role');
  mkdirSync(escapedRoleDir, { recursive: true });
  writeFileSync(outsideRolePath, '# Outside role\n');
  writeFileSync(path.join(escapedRoleDir, 'RUBRIC.md'), '# Rubric\n');
  try {
    symlinkSync(outsideRolePath, path.join(escapedRoleDir, 'ROLE.md'));
    const escapeStep = {
      name: 'Worker step',
      kind: 'worker',
      input: { role: 'escaped-role' },
      next: 'done',
    };

    assert.throws(
      () => renderFixture({ label: 'render-role-symlink-escape', stepId: 'worker_step', step: escapeStep }),
      /input\.role material escapes repository root: roles\/escaped-role\/ROLE\.md/,
    );
  } finally {
    rmSync(outsideRolePath, { force: true });
  }
});

test('prompt renderer: missing role material fails deterministically', () => {
  const roleDir = path.join(tempDir, 'roles', 'missing-rubric');
  mkdirSync(roleDir, { recursive: true });
  writeFileSync(path.join(roleDir, 'ROLE.md'), '# Role only\n');
  const step = {
    name: 'Worker step',
    kind: 'worker',
    input: { role: 'missing-rubric' },
    next: 'done',
  };

  assert.throws(
    () => renderFixture({ label: 'render-role-missing-material', stepId: 'worker_step', step }),
    new RegExp(`missing role material for input\\.role 'missing-rubric': ${path.join(roleDir, 'RUBRIC.md').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`),
  );
});

test('prompt renderer: prompt without input expressions omits projected state section', () => {
  const step = {
    name: 'Worker step',
    kind: 'worker',
    input: { prompt: 'Do the task.' },
    next: 'done',
  };

  const compiled = renderFixture({ label: 'render-empty-state', stepId: 'worker_step', step });

  assert.doesNotMatch(compiled.prompt, /## Projected baton state/);
  assert.doesNotMatch(compiled.prompt, /```json\n\{\}\n```/);
  assert.equal(compiled.metadata, undefined);
  assert.equal(Object.hasOwn(compiled, 'diagnostics'), false);
});

test('prompt renderer: input templates are static and still omit empty projected state', () => {
  writeFileSync(path.join(tempDir, 'static-template.md'), '# Static wrapper\n');
  const step = {
    name: 'Worker step',
    kind: 'worker',
    input: { template: 'static-template.md' },
    next: 'done',
  };

  const compiled = renderFixture({ label: 'render-static-empty-state', stepId: 'worker_step', step });

  assert.match(compiled.prompt, /^# Static wrapper\n/);
  assert.doesNotMatch(compiled.prompt, /## Projected baton state/);
  assert.doesNotMatch(compiled.prompt, /```json\n\{\}\n```/);
});

test('prompt renderer: output template content is included as markdown, not interpreted as schema', () => {
  writeFileSync(path.join(tempDir, 'schema-looking-output.md'), '{ "type": "object", "required": ["notValidated"] }\n');
  const step = {
    name: 'Worker step',
    kind: 'worker',
    input: { prompt: 'Return output.' },
    output: { template: 'schema-looking-output.md' },
    next: 'done',
  };

  const compiled = renderFixture({ label: 'render-output-markdown', stepId: 'worker_step', step });

  assert.match(compiled.prompt, /## Output contract\n\nReturn output that satisfies the workflow worker-output envelope/);
  assert.match(compiled.prompt, /<!-- output template: schema-looking-output\.md -->/);
  assert.match(compiled.prompt, /\{ "type": "object", "required": \["notValidated"\] \}/);
});




test('workflow resource refs resolve from the workflow package directory after package copy', () => {
  const repoDir = path.join(tempDir, 'portable-workflow-repo');
  const workflowDir = path.join(repoDir, 'workflows', 'nested', 'portable');
  const copiedWorkflowDir = path.join(repoDir, 'copied', 'portable');
  mkdirSync(path.join(workflowDir, 'schemas'), { recursive: true });
  mkdirSync(path.join(workflowDir, 'templates'), { recursive: true });
  writeFileSync(path.join(workflowDir, 'input.md'), '# Local input template\n');
  writeFileSync(path.join(workflowDir, 'templates', 'output.md'), '## Local output template\n');
  writeFileSync(path.join(workflowDir, 'schemas', 'output.schema.json'), JSON.stringify({
    type: 'object',
    required: ['outcome'],
    properties: { outcome: { const: 'ready' } },
    additionalProperties: false,
  }, null, 2));
  const workflow = {
    name: 'portable',
    version: 1,
    start: 'worker_step',
    done: 'done',
    blocked: 'blocked',
    steps: {
      worker_step: {
        name: 'Worker step',
        kind: 'worker',
        input: { template: 'input.md' },
        output: { template: 'templates/output.md', schema: 'schemas/output.schema.json' },
        next: 'done',
      },
      done: { name: 'Done', kind: 'done' },
      blocked: { name: 'Blocked', kind: 'blocked' },
    },
  };
  const workflowPath = path.join(workflowDir, 'workflow.json');
  writeFileSync(workflowPath, `${JSON.stringify(workflow, null, 2)}\n`);

  const render = (nextWorkflowPath) => renderPromptWithResources({
    workflowPath: nextWorkflowPath,
    workflow,
    baton: baton(),
    stepId: 'worker_step',
    step: workflow.steps.worker_step,
    repositoryRoot: repoDir,
  });

  const compiled = render(workflowPath);
  assertMarkersInOrder(compiled.prompt, ['# Local input template', '<!-- output template: templates/output.md -->', '## Local output template', '<!-- output schema: schemas/output.schema.json -->']);
  assert.equal(validateAgainstOutputSchema({ workflow, workflowPath, schemaRef: 'schemas/output.schema.json', output: { outcome: 'ready' }, repositoryRoot: repoDir }).ok, true);

  cpSync(workflowDir, copiedWorkflowDir, { recursive: true });
  const copiedWorkflowPath = path.join(copiedWorkflowDir, 'workflow.json');
  const copied = render(copiedWorkflowPath);
  assertMarkersInOrder(copied.prompt, ['# Local input template', '## Local output template', '"const": "ready"']);
  assert.equal(validateAgainstOutputSchema({ workflow, workflowPath: copiedWorkflowPath, schemaRef: 'schemas/output.schema.json', output: { outcome: 'ready' }, repositoryRoot: repoDir }).ok, true);

  mkdirSync(path.join(repoDir, 'workflows', 'portable', 'schemas'), { recursive: true });
  writeFileSync(path.join(repoDir, 'workflows', 'portable', 'schemas', 'output.schema.json'), JSON.stringify({ type: 'object' }));
  assert.throws(
    () => validateAgainstOutputSchema({ workflow, workflowPath, schemaRef: 'workflows/portable/schemas/output.schema.json', output: { outcome: 'ready' }, repositoryRoot: repoDir }),
    /output\.schema not found: workflows\/portable\/schemas\/output\.schema\.json/,
  );
});




test('prompt renderer: role required reads use full repository paths, not cwd-relative paths', () => {
  const workflowDir = path.join(tempDir, 'role-required-read-repo', 'workflows', 'demo');
  const repositoryRoot = path.dirname(path.dirname(workflowDir));
  mkdirSync(workflowDir, { recursive: true });
  const roleDir = path.join(repositoryRoot, 'roles', 'backend');
  mkdirSync(roleDir, { recursive: true });
  writeFileSync(path.join(roleDir, 'ROLE.md'), '# Backend role\n');
  writeFileSync(path.join(roleDir, 'RUBRIC.md'), '# Backend rubric\n');
  writeFileSync(path.join(workflowDir, 'workflow.json'), '{}\n');
  const workflowPath = path.join(workflowDir, 'workflow.json');
  const doc = structuredClone(schemaWorkflowDoc);
  doc.steps.worker_step.input = { role: 'backend', prompt: 'Run worker.' };
  doc.steps.worker_step.output = {};

  const rendered = renderPromptWithResources({
    workflowPath,
    workflow: doc,
    baton: baton(),
    stepId: 'worker_step',
    step: doc.steps.worker_step,
    repositoryRoot,
  });

  assert.match(rendered.prompt, new RegExp(`Role material for 'backend': \`${path.join(roleDir, 'ROLE.md').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\``));
  assert.match(rendered.prompt, new RegExp(`Role material for 'backend': \`${path.join(roleDir, 'RUBRIC.md').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\``));
  assert.doesNotMatch(rendered.prompt, /Role material for 'backend': `roles\/backend\/ROLE\.md`/);
  assert.deepEqual(rendered.metadata.roleMaterial, [path.join(roleDir, 'ROLE.md'), path.join(roleDir, 'RUBRIC.md')]);
});


test('prompt renderer: default repository boundary allows workflow package shared schema refs', () => {
  const repoDir = path.join(tempDir, 'default-render-shared-repo');
  const workflowDir = path.join(repoDir, 'workflows', 'demo');
  const sharedDir = path.join(repoDir, 'shared');
  mkdirSync(workflowDir, { recursive: true });
  mkdirSync(sharedDir, { recursive: true });
  writeFileSync(path.join(workflowDir, 'output.md'), '## Output contract\nReturn markdown.\n');
  writeFileSync(path.join(workflowDir, 'worker.md'), '# Worker\n');
  writeFileSync(path.join(sharedDir, 'shared.schema.json'), JSON.stringify({
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    required: ['outcome'],
    properties: { outcome: { const: 'ready' } },
    additionalProperties: false,
  }));
  const workflowPath = path.join(workflowDir, 'workflow.json');
  const doc = structuredClone(schemaWorkflowDoc);
  doc.steps.worker_step.input = { prompt: 'Run worker.' };
  doc.steps.worker_step.output = { template: 'output.md', schema: '../../shared/shared.schema.json' };
  writeFileSync(workflowPath, `${JSON.stringify(doc, null, 2)}\n`);

  const rendered = renderPromptWithResources({
    workflowPath,
    workflow: doc,
    baton: baton(),
    stepId: 'worker_step',
    step: doc.steps.worker_step,
  });

  assert.match(rendered.prompt, /Generate strict JSON matching this schema/);
  assert.match(rendered.prompt, /"outcome"/);
});

test('prompt renderer: shared template refs are explicit and reusable across workflow packages', () => {
  const repoDir = path.join(tempDir, 'shared-template-repo');
  const sharedTemplateDir = path.join(repoDir, 'shared', 'templates');
  const firstWorkflowDir = path.join(repoDir, 'workflows', 'first');
  const secondWorkflowDir = path.join(repoDir, 'workflows', 'second');
  mkdirSync(sharedTemplateDir, { recursive: true });
  mkdirSync(firstWorkflowDir, { recursive: true });
  mkdirSync(secondWorkflowDir, { recursive: true });
  writeFileSync(path.join(sharedTemplateDir, 'reused-output.md'), '## Shared reusable output template\n');
  writeFileSync(path.join(repoDir, 'root-only-output.md'), '## Root fallback must not be used\n');

  const workflow = {
    name: 'shared-template-reuse',
    version: 1,
    start: 'worker_step',
    done: 'done',
    blocked: 'blocked',
    steps: {
      worker_step: {
        name: 'Worker step',
        kind: 'worker',
        input: {},
        output: { template: '../../shared/templates/reused-output.md' },
        next: 'done',
      },
      done: { name: 'Done', kind: 'done' },
      blocked: { name: 'Blocked', kind: 'blocked' },
    },
  };

  const render = (workflowDir) => renderPromptWithResources({
    workflowPath: path.join(workflowDir, 'workflow.json'),
    workflow,
    baton: baton(),
    stepId: 'worker_step',
    step: workflow.steps.worker_step,
    repositoryRoot: repoDir,
  });

  assertMarkersInOrder(render(firstWorkflowDir).prompt, ['<!-- output template: ../../shared/templates/reused-output.md -->', '## Shared reusable output template']);
  assertMarkersInOrder(render(secondWorkflowDir).prompt, ['<!-- output template: ../../shared/templates/reused-output.md -->', '## Shared reusable output template']);

  const rootFallbackWorkflow = structuredClone(workflow);
  rootFallbackWorkflow.steps.worker_step.output.template = 'root-only-output.md';
  assert.throws(
    () => renderPromptWithResources({
      workflowPath: path.join(firstWorkflowDir, 'workflow.json'),
      workflow: rootFallbackWorkflow,
      baton: baton(),
      stepId: 'worker_step',
      step: rootFallbackWorkflow.steps.worker_step,
      repositoryRoot: repoDir,
    }),
    /missing output template 'root-only-output\.md'/,
  );
});

test('prompt renderer: workflow resource refs cannot escape repository root', () => {
  const repoDir = path.join(tempDir, 'resource-boundary-repo');
  const workflowDir = path.join(repoDir, 'workflows', 'demo');
  const outsideDir = path.join(tempDir, 'outside-resource-boundary');
  mkdirSync(workflowDir, { recursive: true });
  mkdirSync(outsideDir, { recursive: true });
  writeFileSync(path.join(workflowDir, 'workflow.json'), '{}\n');
  writeFileSync(path.join(outsideDir, 'secret.md'), 'LEAK MUST NOT APPEAR\n');
  writeFileSync(path.join(outsideDir, 'secret.schema.json'), JSON.stringify({ type: 'object' }));

  const workflowPath = path.join(workflowDir, 'workflow.json');
  const baseWorkflow = {
    name: 'resource-boundary',
    version: 1,
    start: 'worker_step',
    done: 'done',
    blocked: 'blocked',
    steps: {
      worker_step: { name: 'Worker step', kind: 'worker', input: { prompt: 'Run.' }, next: 'done' },
      done: { name: 'Done', kind: 'done' },
      blocked: { name: 'Blocked', kind: 'blocked' },
    },
  };

  const escapedTemplate = path.relative(workflowDir, path.join(outsideDir, 'secret.md'));
  const inputWorkflow = structuredClone(baseWorkflow);
  inputWorkflow.steps.worker_step.input.template = escapedTemplate;
  assert.throws(
    () => renderPromptWithResources({ workflowPath, workflow: inputWorkflow, baton: baton(), stepId: 'worker_step', step: inputWorkflow.steps.worker_step, repositoryRoot: repoDir }),
    /input template escapes repository root/,
  );

  const outputWorkflow = structuredClone(baseWorkflow);
  outputWorkflow.steps.worker_step.output = { template: escapedTemplate };
  assert.throws(
    () => renderPromptWithResources({ workflowPath, workflow: outputWorkflow, baton: baton(), stepId: 'worker_step', step: outputWorkflow.steps.worker_step, repositoryRoot: repoDir }),
    /output template escapes repository root/,
  );

  const schemaWorkflow = structuredClone(baseWorkflow);
  const escapedSchema = path.relative(workflowDir, path.join(outsideDir, 'secret.schema.json'));
  schemaWorkflow.steps.worker_step.output = { schema: escapedSchema };
  assert.throws(
    () => validateAgainstOutputSchema({ workflow: schemaWorkflow, workflowPath, schemaRef: escapedSchema, output: {}, repositoryRoot: repoDir }),
    /output schema escapes repository root/,
  );

  const symlinkPath = path.join(workflowDir, 'linked-secret.md');
  try {
    symlinkSync(path.join(outsideDir, 'secret.md'), symlinkPath);
    const symlinkWorkflow = structuredClone(baseWorkflow);
    symlinkWorkflow.steps.worker_step.input.template = 'linked-secret.md';
    assert.throws(
      () => renderPromptWithResources({ workflowPath, workflow: symlinkWorkflow, baton: baton(), stepId: 'worker_step', step: symlinkWorkflow.steps.worker_step, repositoryRoot: repoDir }),
      /input template escapes repository root/,
    );
  } finally {
    rmSync(symlinkPath, { force: true });
  }
});

test('prompt renderer: output schema is validated and injected in the output contract layer', () => {
  writeFileSync(path.join(tempDir, 'static-schema-wrapper.md'), '# Static wrapper\n');
  writeFileSync(path.join(tempDir, 'schema-output.md'), '## Required return\nUse this contract.\n');
  writeFileSync(path.join(tempDir, 'artifact.schema.json'), JSON.stringify({
    type: 'object',
    required: ['outcome'],
    properties: {
      outcome: { const: 'ready', 'x-usage': 'Use this field only for routing the worker outcome.' },
    },
    additionalProperties: false,
  }, null, 2));
  const step = {
    name: 'Worker step',
    kind: 'worker',
    input: { template: 'static-schema-wrapper.md', prompt: 'Return output.' },
    output: { template: 'schema-output.md', schema: 'artifact.schema.json' },
    next: 'done',
  };

  const compiled = renderFixture({ label: 'render-output-schema', stepId: 'worker_step', step });

  assert.equal(compiled.metadata.outputSchema, 'artifact.schema.json');
  assertMarkersInOrder(compiled.prompt, [
    '# Static wrapper',
    '## Output contract',
    '<!-- output template: schema-output.md -->',
    '## Required return\nUse this contract.',
    'Generate strict JSON matching this schema. No validating writer command is provided in these instructions, so do not invent one and do not create or hand off a separate JSON output path. Stop and report that the validating writer command is missing.',
    '<!-- output schema: artifact.schema.json -->',
    '```json\n{\n  "type": "object",',
    '"x-usage": "Use this field only for routing the worker outcome."',
    '## Workflow step prompt',
  ]);
  assert.doesNotMatch(compiled.prompt, /Usage: Use this field only for routing the worker outcome\./);
});

test('prompt renderer: missing output schema fails deterministically', () => {
  const step = {
    name: 'Worker step',
    kind: 'worker',
    input: {},
    output: { template: 'output.md', schema: 'missing.schema.json' },
    next: 'done',
  };

  assert.throws(
    () => renderFixture({ label: 'render-missing-output-schema', stepId: 'worker_step', step }),
    /output\.schema not found: missing\.schema\.json/,
  );
});

test('prompt renderer: invalid output schema JSON fails deterministically', () => {
  writeFileSync(path.join(tempDir, 'invalid.schema.json'), '{ "type": ');
  const step = {
    name: 'Worker step',
    kind: 'worker',
    input: {},
    output: { template: 'output.md', schema: 'invalid.schema.json' },
    next: 'done',
  };

  assert.throws(
    () => renderFixture({ label: 'render-invalid-output-schema', stepId: 'worker_step', step }),
    /invalid output schema JSON 'invalid\.schema\.json'/,
  );
});

test('prompt renderer: absent output schema preserves existing output contract rendering', () => {
  writeFileSync(path.join(tempDir, 'no-schema-wrapper.md'), '# Static wrapper\n');
  writeFileSync(path.join(tempDir, 'no-schema-output.md'), '## Required return\nUse this contract.\n');
  const step = {
    name: 'Worker step',
    kind: 'worker',
    input: { template: 'no-schema-wrapper.md' },
    output: { template: 'no-schema-output.md' },
    next: 'done',
  };

  const compiled = renderFixture({ label: 'render-no-output-schema', stepId: 'worker_step', step });

  assert.equal(compiled.metadata.outputSchema, undefined);
  assert.doesNotMatch(compiled.prompt, /output schema|Generate strict JSON matching this schema/);
  assertMarkersInOrder(compiled.prompt, [
    '# Static wrapper',
    '## Output contract',
    '<!-- output template: no-schema-output.md -->',
    '## Required return\nUse this contract.',
    '## Final reminder',
  ]);
});

test('prompt renderer: output contract is always appended as static included text', () => {
  writeFileSync(path.join(tempDir, 'static-wrapper.md'), '# Static wrapper\n');
  writeFileSync(path.join(tempDir, 'wrapped-output.md'), '## Required return\nUse this contract.\n');
  const step = {
    name: 'Worker step',
    kind: 'worker',
    input: { template: 'static-wrapper.md' },
    output: { template: 'wrapped-output.md' },
    next: 'done',
  };

  const compiled = renderFixture({ label: 'render-output-wrapper-static', stepId: 'worker_step', step });

  assertMarkersInOrder(compiled.prompt, [
    '# Static wrapper',
    '## Output contract',
    '<!-- output template: wrapped-output.md -->',
    '## Required return\nUse this contract.',
  ]);
});

test('prompt renderer: path resolver rejects missing templates without fallback', () => {
  const missingStep = {
    name: 'Worker step',
    kind: 'worker',
    input: { template: 'missing-template.md' },
    output: { template: 'output.md' },
    next: 'done',
  };

  assert.throws(() => renderFixture({ label: 'render-missing', stepId: 'worker_step', step: missingStep }), /missing input template 'missing-template\.md'/);
});

test('prompt renderer: validation feedback appends to prompt arrays', () => {
  const workflowDoc = structuredClone(schemaWorkflowDoc);
  workflowDoc.steps.worker_step.input = { prompt: ['Run worker.', '', 'Use strict output.'] };
  workflowDoc.steps.worker_step.output = { template: 'output.md', schema: 'worker-output.schema.json' };
  const workflowPath = writeJson('prompt-array-feedback-workflow.json', workflowDoc);
  const batonPath = writeJson('prompt-array-feedback-baton.json', baton());
  const outputPath = writeJson('prompt-array-feedback-output.json', { outcome: 'invalid' });

  const result = runNode(['skills/orbita/lib/entrypoints/cli/workflow-interpreter.mjs', 'apply', workflowPath, batonPath, outputPath]);
  const response = expectCliResult('prompt-array-feedback', result, true);

  assert.equal(response.steps[0].step.input.prompt.includes('Run worker.\n\nUse strict output.'), true);
  assert.match(response.steps[0].step.input.prompt, /Previous output failed output\.schema validation/);
});

test('CLI render: prompt input expressions cannot read aggregate runtime state', () => {
  const workflowDoc = structuredClone(schemaWorkflowDoc);
  workflowDoc.steps.approval_step.input.prompt = 'Bad aggregate:\n${{ input.artifacts }}';
  const workflowPath = writeJson('runtime-reserved-render-workflow.json', workflowDoc);
  const batonPath = writeJson('runtime-reserved-render-baton.json', baton({ cursor: 'approval_step', status: 'running', state: { artifacts: [{ producerStepId: 'worker_step', artifact: { id: 'packet', content_type: 'text/markdown', path: '/runs/worker_step/artifacts/packet.md', summary: 'leaked' } }], results: [] } }));

  const result = runNode(['skills/orbita/lib/entrypoints/cli/workflow-interpreter.mjs', 'render', workflowPath, batonPath]);
  const response = expectCliResult('runtime-reserved-render', result, false);

  assert.match(response.stderr, /input step 'artifacts' is not a declared workflow step/);
});

test('CLI render: fixture returns compiledPrompt and does not mutate baton', () => {
  const outputTemplateRef = `${path.basename(tempDir)}-worker-output.md`;
  writeFileSync(path.join(tempDir, 'worker.md'), '# Worker template\n');
  writeFileSync(path.join(tempDir, outputTemplateRef), '## Required return\nUse this contract.\n');
  const workflowDoc = structuredClone(schemaWorkflowDoc);
  delete workflowDoc.steps.worker_step.input.role;
  workflowDoc.steps.worker_step.output = { template: outputTemplateRef, schema: 'worker-output.schema.json' };
  const workflowPath = writeJson('fixture-render-workflow.json', workflowDoc);
  const batonPath = writeJson('fixture-render-baton.json', baton({ state: { artifacts: [], results: [], worker_step: { outcome: 'ready', summary: 'ready' } } }));
  const before = readFileSync(batonPath, 'utf8');

  const result = runNode(['skills/orbita/lib/entrypoints/cli/workflow-interpreter.mjs', 'render', workflowPath, batonPath]);
  const response = expectCliResult('fixture-render', result, true);

  assert.equal(readFileSync(batonPath, 'utf8'), before, 'render mutated baton file');
  assert.equal(response.steps[0].id, 'worker_step');
  assert.equal(Object.hasOwn(response.steps[0].compiledPrompt, 'stepId'), false);
  assert.equal(Object.hasOwn(response.steps[0].compiledPrompt, 'action'), false);
  assert.equal(Object.hasOwn(response.steps[0].compiledPrompt, 'kind'), false);
  assert.equal(Object.hasOwn(response.steps[0].compiledPrompt, 'name'), false);
  assert.equal(response.steps[0].compiledPrompt.metadata.outputTemplate, outputTemplateRef);
  assert.equal(Object.hasOwn(response.steps[0].compiledPrompt.metadata, 'projectedStateKeys'), false);
  assert.equal(Object.hasOwn(response.steps[0].compiledPrompt, 'diagnostics'), false);
  assertMarkersInOrder(response.steps[0].compiledPrompt.prompt, [
    '# Worker template',
    '## Output contract',
    `<!-- output template: ${outputTemplateRef} -->`,
    '## Required return\nUse this contract.',
    '## Workflow step prompt',
    'Run worker.',
    '## Final reminder',
    'Return exactly according to the output contract above.',
  ]);
  assert.doesNotMatch(response.steps[0].compiledPrompt.prompt, /## Projected baton state/);
});

test('CLI render: diagnostics are included only when explicitly requested', () => {
  const workflowPath = writeJson('render-diagnostics-workflow.json', schemaWorkflowDoc);
  const batonPath = writeJson('render-diagnostics-baton.json', baton({ cursor: 'approval_step' }));

  const defaultResponse = expectCliResult(
    'render-diagnostics-default',
    runNode(['skills/orbita/lib/entrypoints/cli/workflow-interpreter.mjs', 'render', workflowPath, batonPath]),
    true,
  );
  assert.equal(Object.hasOwn(defaultResponse.steps[0].compiledPrompt, 'diagnostics'), false);

  const diagnosticsResponse = expectCliResult(
    'render-diagnostics-opt-in',
    runNode(['skills/orbita/lib/entrypoints/cli/workflow-interpreter.mjs', 'render', '--diagnostics', workflowPath, batonPath]),
    true,
  );
  assert.deepEqual(diagnosticsResponse.steps[0].compiledPrompt.diagnostics.map((diagnostic) => diagnostic.code), ['default_prompt_used']);
});
