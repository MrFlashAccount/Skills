import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';
import { fileURLToPath } from 'node:url';
import { projectState } from '../lib/workflow/projection.mjs';
import { renderWorkflowPrompt } from '../lib/workflow/prompt-renderer.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const tempDir = mkdtempSync(path.join(tmpdir(), 'prompt-rendering-check-'));
writeFileSync(path.join(tempDir, 'output.md'), '## Output contract\nReturn markdown.\n');

function outputContract(name = 'worker') {
  const templates = {
    worker: '../../shared/templates/implementation-plan-template.md',
    research: '../../shared/templates/research-packet-template.md',
  };
  return { template: templates[name] ?? '../../shared/templates/review-verdict-template.md' };
}

const schemaWorkflowDoc = {
  workflow: {
    name: 'schema-spec',
    version: 1,
    start: 'worker_step',
    done: 'done',
    blocked: 'blocked',
    steps: {
      worker_step: {
        name: 'Worker step',
        kind: 'worker',
        input: { template: 'worker.md', role: 'backend', state: ['artifacts'], prompt: 'Run worker.' },
        output: outputContract(),
        next: { match: '${{ output.outcome }}', cases: { ready: 'approval_step', retry: 'worker_step', blocked: 'blocked' } },
      },
      approval_step: {
        name: 'Approval step',
        kind: 'approval',
        input: { state: ['artifacts'], prompt: 'Approve.' },
        next: { match: '${{ output.approval }}', cases: { approved: 'direct_next_worker', rejected: 'worker_step', blocked: 'blocked' } },
      },
      direct_next_worker: {
        name: 'Direct next worker',
        kind: 'worker',
        input: { template: 'direct.md', state: ['results'] },
        output: outputContract(),
        next: 'done',
      },
      done: { name: 'Done', kind: 'done', input: { prompt: 'Finished.' } },
      blocked: { name: 'Blocked', kind: 'blocked', input: { prompt: 'Blocked.' } },
    },
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
  const projected = projectState({ stepId: 'worker_step', batonState: { artifacts: ['hidden'] } });

  assert.deepEqual(projected.value, {});
  assert.deepEqual(projected.projectedKeys, []);
});

test('state projection: missing key fails hard with step selector and available keys', () => {
  assert.throws(
    () => projectState({ stepId: 'research', batonState: { artifacts: [], results: [] }, selectors: ['artifact'] }),
    /step 'research' selected missing baton state key 'artifact'; available keys: artifacts, results/,
  );
});

test('state projection: nested selectors are rejected', () => {
  assert.throws(
    () => projectState({ stepId: 'research', batonState: { artifacts: [] }, selectors: ['artifacts.0'] }),
    /unsupported state selector 'artifacts\.0'.*top-level baton state keys only/,
  );
});

function renderFixture(overrides = {}) {
  const workflowPath = writeJson(`${safeName(overrides.label ?? 'render')}-workflow.json`, overrides.workflowDoc ?? schemaWorkflowDoc);
  return renderWorkflowPrompt({
    workflowPath,
    workflow: overrides.workflow ?? schemaWorkflowDoc.workflow,
    baton: overrides.batonDoc ?? baton(),
    stepId: overrides.stepId ?? 'approval_step',
    step: overrides.step ?? schemaWorkflowDoc.workflow.steps.approval_step,
    repositoryRoot: overrides.repositoryRoot ?? tempDir,
    templateBaseDir: overrides.templateBaseDir,
    includeDiagnostics: overrides.includeDiagnostics,
  });
}

test('prompt renderer: default prompt includes task projected state and deterministic newline formatting without diagnostics by default', () => {
  const step = { name: 'Approval step', kind: 'approval', input: { state: ['artifacts'], prompt: 'Approve.' }, next: 'done' };
  const compiled = renderFixture({ label: 'render-default', step, batonDoc: baton({ cursor: 'approval_step', state: { artifacts: [{ id: 'a' }], results: [] } }) });

  assert.equal(Object.hasOwn(compiled, 'stepId'), false);
  assert.equal(Object.hasOwn(compiled, 'action'), false);
  assert.equal(Object.hasOwn(compiled, 'kind'), false);
  assert.equal(Object.hasOwn(compiled, 'name'), false);
  assert.match(compiled.prompt, /^# Approval step\n/);
  assertMarkersInOrder(compiled.prompt, [
    '## Projected baton state\n\n```json\n{\n  "artifacts": [',
    '## Workflow step prompt',
    'Approve.',
  ]);
  assert.equal(Object.hasOwn(compiled, 'diagnostics'), false);
  assert.equal(compiled.prompt.endsWith('\n'), true);
});

test('prompt renderer: default prompt diagnostics are opt-in', () => {
  const step = { name: 'Approval step', kind: 'approval', input: { state: ['artifacts'], prompt: 'Approve.' }, next: 'done' };
  const compiled = renderFixture({ label: 'render-default-diagnostics', step, includeDiagnostics: true });

  assert.deepEqual(compiled.diagnostics, [
    {
      severity: 'info',
      code: 'default_prompt_used',
      message: 'No input.template declared; assembled deterministic default prompt.',
    },
  ]);
});

test('prompt renderer: rejects input template placeholders as unsupported', () => {
  writeFileSync(path.join(tempDir, 'placeholder-template.md'), '# {{step.name}}\n');
  const step = {
    name: 'Worker step',
    kind: 'worker',
    input: { template: 'placeholder-template.md', state: [] },
    output: { template: 'output.md' },
    next: 'done',
  };

  assert.throws(
    () => renderFixture({ label: 'render-placeholders-unsupported', stepId: 'worker_step', step }),
    /placeholders are unsupported in input template 'placeholder-template\.md': {{step\.name}}/,
  );
});

test('prompt renderer: appends role output state and task sections in fixed compiled layer order', () => {
  writeRoleMaterial('backend');
  writeFileSync(path.join(tempDir, 'minimal-template.md'), '# Worker step\n');
  writeFileSync(path.join(tempDir, 'minimal-output.md'), '## Required return\nUse this contract.\n');
  const step = {
    name: 'Worker step',
    kind: 'worker',
    input: { template: 'minimal-template.md', role: 'backend', state: ['artifacts'], prompt: 'Do the task.' },
    output: { template: 'minimal-output.md' },
    next: 'done',
  };

  const compiled = renderFixture({
    label: 'render-append',
    stepId: 'worker_step',
    step,
    workflow: {
      ...schemaWorkflowDoc.workflow,
      instruction: 'Use the deterministic workflow renderer.',
      userTask: 'Fix the customer-visible bug.',
    },
  });

  assertMarkersInOrder(compiled.prompt, [
    '# Worker step',
    '## Workflow instruction',
    'Use the deterministic workflow renderer.',
    '## Role material',
    '<!-- role material: roles/backend/ROLE.md -->',
    '<!-- role material: roles/backend/RUBRIC.md -->',
    '## Output contract',
    '<!-- output template: minimal-output.md -->',
    '## Required return\nUse this contract.',
    '## Projected baton state',
    '```json',
    '## Workflow step prompt',
    'Do the task.',
    '## Concrete user task',
    'Fix the customer-visible bug.',
    '## Final reminder',
    'Return exactly according to the output contract above.',
  ]);
});



test('prompt renderer: resolves input.role and inlines ROLE.md and RUBRIC.md', () => {
  writeRoleMaterial('custom-backend', {
    roleBody: '# Custom Role\n\nBackend role instructions.\n',
    rubricBody: '# Custom Rubric\n\nBackend rubric checks.\n',
  });
  writeFileSync(path.join(tempDir, 'role-template.md'), '# Worker step\n');
  const step = {
    name: 'Worker step',
    kind: 'worker',
    input: { template: 'role-template.md', role: 'custom-backend', state: [] },
    output: { template: 'output.md' },
    next: 'done',
  };

  const compiled = renderFixture({ label: 'render-role-material', stepId: 'worker_step', step });

  assert.match(compiled.prompt, /<!-- role material: roles\/custom-backend\/ROLE\.md -->/);
  assert.match(compiled.prompt, /# Custom Role\n\nBackend role instructions\./);
  assert.match(compiled.prompt, /<!-- role material: roles\/custom-backend\/RUBRIC\.md -->/);
  assert.match(compiled.prompt, /# Custom Rubric\n\nBackend rubric checks\./);
  assert.deepEqual(compiled.metadata.roleMaterial, ['roles/custom-backend/ROLE.md', 'roles/custom-backend/RUBRIC.md']);
});

test('prompt renderer: input.role rejects traversal and external escape attempts', () => {
  const traversalStep = {
    name: 'Worker step',
    kind: 'worker',
    input: { role: '../backend', state: [] },
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
      input: { role: 'escaped-role', state: [] },
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
    input: { role: 'missing-rubric', state: [] },
    next: 'done',
  };

  assert.throws(
    () => renderFixture({ label: 'render-role-missing-material', stepId: 'worker_step', step }),
    /missing role material for input\.role 'missing-rubric': roles\/missing-rubric\/RUBRIC\.md/,
  );
});

test('prompt renderer: empty input.state omits projected state section', () => {
  const step = {
    name: 'Worker step',
    kind: 'worker',
    input: { state: [], prompt: 'Do the task.' },
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
    input: { template: 'static-template.md', state: [] },
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
    input: { state: [], prompt: 'Return output.' },
    output: { template: 'schema-looking-output.md' },
    next: 'done',
  };

  const compiled = renderFixture({ label: 'render-output-markdown', stepId: 'worker_step', step });

  assert.match(compiled.prompt, /## Output contract\n\nReturn output that satisfies the workflow worker-output envelope/);
  assert.match(compiled.prompt, /<!-- output template: schema-looking-output\.md -->/);
  assert.match(compiled.prompt, /\{ "type": "object", "required": \["notValidated"\] \}/);
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
    input: { template: 'static-schema-wrapper.md', state: [], prompt: 'Return output.' },
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
    'Return valid JSON matching this schema. If a validation command or tool is available in this agent/subagent context, validate the generated JSON against this schema before the final answer; fix validation errors and repeat for a bounded number of attempts. The harness/orchestrator will validate the final returned JSON again after the answer, so this agent-side validation is a preflight, not the final authority. If no validation command or tool is available in this context, still return strict schema-matching JSON and expect harness-level validation.',
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
    input: { state: [] },
    output: { template: 'output.md', schema: 'missing.schema.json' },
    next: 'done',
  };

  assert.throws(
    () => renderFixture({ label: 'render-missing-output-schema', stepId: 'worker_step', step }),
    /missing output schema 'missing\.schema\.json'/,
  );
});

test('prompt renderer: invalid output schema JSON fails deterministically', () => {
  writeFileSync(path.join(tempDir, 'invalid.schema.json'), '{ "type": ');
  const step = {
    name: 'Worker step',
    kind: 'worker',
    input: { state: [] },
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
    input: { template: 'no-schema-wrapper.md', state: [] },
    output: { template: 'no-schema-output.md' },
    next: 'done',
  };

  const compiled = renderFixture({ label: 'render-no-output-schema', stepId: 'worker_step', step });

  assert.equal(compiled.metadata.outputSchema, undefined);
  assert.doesNotMatch(compiled.prompt, /output schema|Return valid JSON matching this schema/);
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
    input: { template: 'static-wrapper.md', state: [] },
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

test('prompt renderer: path resolver rejects escape and missing templates', () => {
  const escapedTemplatePath = path.resolve(tempDir, '../outside.md');
  writeFileSync(escapedTemplatePath, 'outside repo\n');
  try {
    const escapedStep = {
      name: 'Worker step',
      kind: 'worker',
      input: { template: '../outside.md', state: [] },
      output: { template: 'output.md' },
      next: 'done',
    };
    const missingStep = {
      name: 'Worker step',
      kind: 'worker',
      input: { template: 'missing-template.md', state: [] },
      output: { template: 'output.md' },
      next: 'done',
    };

    assert.throws(() => renderFixture({ label: 'render-escape', stepId: 'worker_step', step: escapedStep }), /input template escapes repository root/);
    assert.throws(() => renderFixture({ label: 'render-missing', stepId: 'worker_step', step: missingStep }), /missing input template 'missing-template\.md'/);
  } finally {
    rmSync(escapedTemplatePath, { force: true });
  }
});

test('prompt renderer: template root confinement rejects symlink escapes and external bases', () => {
  const outsideTemplatePath = path.resolve(tempDir, '../outside-symlink-template.md');
  const symlinkPath = path.join(tempDir, 'symlink-template.md');
  const externalTemplateDir = path.resolve(tempDir, '../external-template-base');
  const externalTemplatePath = path.join(externalTemplateDir, 'external-template.md');
  writeFileSync(outsideTemplatePath, 'outside symlink repo\n');
  rmSync(externalTemplateDir, { recursive: true, force: true });
  try {
    symlinkSync(outsideTemplatePath, symlinkPath);
    const symlinkStep = {
      name: 'Worker step',
      kind: 'worker',
      input: { template: 'symlink-template.md', state: [] },
      next: 'done',
    };

    assert.throws(() => renderFixture({ label: 'render-symlink-escape', stepId: 'worker_step', step: symlinkStep }), /input template escapes repository root/);

    const externalBaseStep = {
      name: 'Worker step',
      kind: 'worker',
      input: { template: 'external-template.md', state: [] },
      next: 'done',
    };
    symlinkSync(path.dirname(outsideTemplatePath), externalTemplateDir, 'dir');
    writeFileSync(externalTemplatePath, 'outside base repo\n');

    assert.throws(
      () => renderFixture({ label: 'render-external-base', stepId: 'worker_step', step: externalBaseStep, templateBaseDir: externalTemplateDir }),
      /input template escapes repository root/,
    );
  } finally {
    rmSync(symlinkPath, { force: true });
    rmSync(externalTemplateDir, { recursive: true, force: true });
    rmSync(outsideTemplatePath, { force: true });
  }
});

test('CLI render: fixture returns compiledPrompt and does not mutate baton', () => {
  const outputTemplateRef = `${path.basename(tempDir)}-worker-output.md`;
  writeFileSync(path.join(tempDir, 'worker.md'), '# Worker template\n');
  writeFileSync(path.resolve(tempDir, '..', outputTemplateRef), '## Required return\nUse this contract.\n');
  const workflowDoc = structuredClone(schemaWorkflowDoc);
  delete workflowDoc.workflow.steps.worker_step.input.role;
  workflowDoc.workflow.steps.worker_step.output = { template: outputTemplateRef };
  const workflowPath = writeJson('fixture-render-workflow.json', workflowDoc);
  const batonPath = writeJson('fixture-render-baton.json', baton({ state: { artifacts: [{ type: 'packet', summary: 'ready' }], results: [] } }));
  const before = readFileSync(batonPath, 'utf8');

  const result = runNode(['develop/scripts/workflow-interpreter.mjs', 'render', workflowPath, batonPath]);
  const response = expectCliResult('fixture-render', result, true);

  assert.equal(readFileSync(batonPath, 'utf8'), before, 'render mutated baton file');
  assert.equal(response.steps[0].id, 'worker_step');
  assert.equal(Object.hasOwn(response.steps[0].compiledPrompt, 'stepId'), false);
  assert.equal(Object.hasOwn(response.steps[0].compiledPrompt, 'action'), false);
  assert.equal(Object.hasOwn(response.steps[0].compiledPrompt, 'kind'), false);
  assert.equal(Object.hasOwn(response.steps[0].compiledPrompt, 'name'), false);
  assert.equal(response.steps[0].compiledPrompt.metadata.outputTemplate, outputTemplateRef);
  assert.deepEqual(response.steps[0].compiledPrompt.metadata.projectedStateKeys, ['artifacts']);
  assert.equal(Object.hasOwn(response.steps[0].compiledPrompt, 'diagnostics'), false);
  assertMarkersInOrder(response.steps[0].compiledPrompt.prompt, [
    '# Worker template',
    '## Output contract',
    `<!-- output template: ${outputTemplateRef} -->`,
    '## Required return\nUse this contract.',
    '## Projected baton state',
    '## Workflow step prompt',
    'Run worker.',
    '## Final reminder',
    'Return exactly according to the output contract above.',
  ]);
});

test('CLI render: diagnostics are included only when explicitly requested', () => {
  const workflowPath = writeJson('render-diagnostics-workflow.json', schemaWorkflowDoc);
  const batonPath = writeJson('render-diagnostics-baton.json', baton({ cursor: 'approval_step' }));

  const defaultResponse = expectCliResult(
    'render-diagnostics-default',
    runNode(['develop/scripts/workflow-interpreter.mjs', 'render', workflowPath, batonPath]),
    true,
  );
  assert.equal(Object.hasOwn(defaultResponse.steps[0].compiledPrompt, 'diagnostics'), false);

  const diagnosticsResponse = expectCliResult(
    'render-diagnostics-opt-in',
    runNode(['develop/scripts/workflow-interpreter.mjs', 'render', '--diagnostics', workflowPath, batonPath]),
    true,
  );
  assert.deepEqual(diagnosticsResponse.steps[0].compiledPrompt.diagnostics.map((diagnostic) => diagnostic.code), ['default_prompt_used']);
});
