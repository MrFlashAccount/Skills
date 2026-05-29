import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';
import { fileURLToPath } from 'node:url';
import workflowDoc from '../../workflows/research-critic.workflow.json' with { type: 'json' };
import { validateWorkflowDocument } from '../lib/validate/workflow-validator.mjs';
import { validateAgainstOutputSchema } from '../lib/workflow/output-schema-validation.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const workflowPath = path.join(root, 'workflows/research-critic.workflow.json');
const startRunPath = path.join(root, 'develop/scripts/start-run.mjs');
const interpreterPath = path.join(root, 'develop/scripts/workflow-interpreter.mjs');
const persistPath = path.join(root, 'develop/scripts/persist-run-state.mjs');
const tempDir = mkdtempSync(path.join(tmpdir(), 'research-critic-workflow-'));

function runNode(args) {
  return spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8' });
}

function parseSuccess(label, result) {
  assert.equal(result.status, 0, `${label} failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  return JSON.parse(result.stdout);
}

function writeJson(filePath, value) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
  return filePath;
}

function applyAndPersist({ runDir, index, cursor, output, decision }) {
  const outputPath = writeJson(path.join(runDir, 'outputs', `${String(index).padStart(2, '0')}-${cursor}.json`), output);
  const applyResult = runNode([interpreterPath, 'apply', workflowPath, path.join(runDir, 'baton.json'), outputPath]);
  const response = parseSuccess(`${cursor} apply`, applyResult);
  const responsePath = writeJson(path.join(runDir, 'responses', `${String(index).padStart(2, '0')}-${cursor}-response.json`), response);
  const persistResult = runNode([
    persistPath,
    '--run-dir', runDir,
    '--response', responsePath,
    '--output', outputPath,
    '--decision', decision,
  ]);
  parseSuccess(`${cursor} persist`, persistResult);
  return response;
}

function minimalBlocker(sourceStepId) {
  return {
    summary: `${sourceStepId} cannot continue safely.`,
    source_step_id: sourceStepId,
    needed: 'User or environment input is required before retrying.',
  };
}

function minimalVerdict(summary) {
  return {
    summary: [summary],
    evidence_checked: ['research draft packet'],
    findings: [],
  };
}

function expectSchemaValid(schemaRef, output) {
  const validation = validateAgainstOutputSchema({ workflow: workflowDoc.workflow, workflowPath, schemaRef, output, repositoryRoot: root });
  assert.equal(validation.ok, true, Array.isArray(validation.errors) ? validation.errors.join('\n') : validation.errors);
}

function expectSchemaInvalid(schemaRef, output, expectedError) {
  const validation = validateAgainstOutputSchema({ workflow: workflowDoc.workflow, workflowPath, schemaRef, output, repositoryRoot: root });
  assert.equal(validation.ok, false);
  const errors = Array.isArray(validation.errors) ? validation.errors.join('\n') : validation.errors;
  assert.match(errors, expectedError);
}

function minimalPacket(recommendation) {
  return {
    summary: ['Research workflow candidate for reusable research/critic handoff.'],
    goals: ['Exercise reusable research draft and critic loop.'],
    known_facts_and_evidence: ['Neutral workflow lives under workflows/ and neutral schemas under schemas/research-critic/.'],
    unknowns: [],
    risks: ['Persistence conventions can drift if callers invent run directories.'],
    recommendation,
  };
}

after(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

test('neutral research-critic workflow validates without DevHarness schema coupling', () => {
  const result = validateWorkflowDocument(workflowDoc, { workflowPath, repositoryRoot: root });

  assert.deepEqual(result, { ok: true, workflow: 'research-critic', steps: Object.keys(workflowDoc.workflow.steps).length });
  assert.equal(JSON.stringify(workflowDoc).includes('dev-harness'), false);
  assert.equal(JSON.stringify(workflowDoc).includes('skills/dev-harness'), false);
});


test('research-critic output schemas validate blocked states and conditional requirements', () => {
  expectSchemaValid('schemas/research-critic/research-draft-output.json', {
    outcome: 'blocked',
    blocker: minimalBlocker('research_draft'),
  });
  expectSchemaValid('schemas/research-critic/research-attack-output.json', {
    outcome: 'blocked',
    blocker: minimalBlocker('research_attack'),
  });
  expectSchemaValid('schemas/research-critic/save-research-packet-output.json', {
    outcome: 'blocked',
    blocker: minimalBlocker('save_research_packet'),
  });

  expectSchemaInvalid('schemas/research-critic/research-draft-output.json', { outcome: 'needs_input' }, /questions/);
  expectSchemaInvalid('schemas/research-critic/research-attack-output.json', { outcome: 'needs_input' }, /questions/);
  expectSchemaInvalid('schemas/research-critic/research-draft-output.json', { outcome: 'needs_input', questions: [] }, /must NOT have fewer than 1 items|minItems/);
  expectSchemaInvalid('schemas/research-critic/research-attack-output.json', { outcome: 'needs_input', questions: [] }, /must NOT have fewer than 1 items|minItems/);

  expectSchemaInvalid('schemas/research-critic/save-research-packet-output.json', { outcome: 'saved' }, /saved/);
  expectSchemaValid('schemas/research-critic/save-research-packet-output.json', {
    outcome: 'blocked',
    blocker: minimalBlocker('save_research_packet'),
  });
});

test('research-critic blocked outputs validate and route to blocked', () => {
  let runDir = path.join(tempDir, 'blocked-draft');
  parseSuccess('start blocked draft run', runNode([startRunPath, '--workflow', workflowPath, '--run-dir', runDir]));
  let response = applyAndPersist({
    runDir,
    index: 1,
    cursor: 'research_draft',
    decision: 'draft blocked by missing external input',
    output: {
      outcome: 'blocked',
      blocker: minimalBlocker('research_draft'),
    },
  });
  assert.equal(response.baton.cursor, 'blocked');
  assert.equal(response.steps[0].action, 'stop_blocked');

  runDir = path.join(tempDir, 'blocked-attack');
  parseSuccess('start blocked attack run', runNode([startRunPath, '--workflow', workflowPath, '--run-dir', runDir]));
  response = applyAndPersist({
    runDir,
    index: 1,
    cursor: 'research_draft',
    decision: 'draft ready for blocked critic run',
    output: {
      outcome: 'ready_for_attack',
      research_packet: minimalPacket('Send to critic attack.'),
    },
  });
  assert.equal(response.baton.cursor, 'research_attack');
  response = applyAndPersist({
    runDir,
    index: 2,
    cursor: 'research_attack',
    decision: 'critic blocked by unsafe evidence gap',
    output: {
      outcome: 'blocked',
      blocker: minimalBlocker('research_attack'),
    },
  });
  assert.equal(response.baton.cursor, 'blocked');
  assert.equal(response.steps[0].action, 'stop_blocked');

  runDir = path.join(tempDir, 'blocked-save');
  parseSuccess('start blocked save run', runNode([startRunPath, '--workflow', workflowPath, '--run-dir', runDir]));
  response = applyAndPersist({
    runDir,
    index: 1,
    cursor: 'research_draft',
    decision: 'draft ready for save blocked run',
    output: {
      outcome: 'ready_for_attack',
      research_packet: minimalPacket('Send to critic attack.'),
    },
  });
  assert.equal(response.baton.cursor, 'research_attack');
  response = applyAndPersist({
    runDir,
    index: 2,
    cursor: 'research_attack',
    decision: 'critic approved before save blocker',
    output: {
      outcome: 'approved',
      verdict: minimalVerdict('Research packet is ready to save.'),
    },
  });
  assert.equal(response.baton.cursor, 'save_research_packet');
  response = applyAndPersist({
    runDir,
    index: 3,
    cursor: 'save_research_packet',
    decision: 'save blocked by unavailable persistence target',
    output: {
      outcome: 'blocked',
      blocker: minimalBlocker('save_research_packet'),
    },
  });
  assert.equal(response.baton.cursor, 'blocked');
  assert.equal(response.steps[0].action, 'stop_blocked');
});

test('research-critic workflow exercises input, revision loop, user wait, save, and run-dir persistence', () => {
  const runDir = path.join(tempDir, 'run');
  const start = parseSuccess('start run', runNode([startRunPath, '--workflow', workflowPath, '--run-dir', runDir]));
  assert.equal(start.initialized, true);
  assert.equal(start.response.steps[0].id, 'research_draft');
  assert.equal(start.response.steps[0].action, 'run_worker');

  let response = applyAndPersist({
    runDir,
    index: 1,
    cursor: 'research_draft',
    decision: 'draft needs user input before attack',
    output: {
      outcome: 'needs_input',
      research_packet: {
        ...minimalPacket('Ask the user for the missing acceptance boundary.'),
        unknowns: ['Whether final save should reference the active run outputs folder.'],
      },
      questions: ['Should saved research artifacts live under the active run outputs folder?'],
      results: [{ type: 'question', summary: 'Asked persistence location question.' }],
    },
  });
  assert.equal(response.baton.cursor, 'ask_research_questions');
  assert.equal(response.steps[0].action, 'wait_for_approval');

  response = applyAndPersist({
    runDir,
    index: 2,
    cursor: 'ask_research_questions',
    decision: 'user answered persistence location question',
    output: {
      approval: 'approved',
      results: [{ type: 'user-answer', summary: 'Use the active --run-dir outputs folder.' }],
    },
  });
  assert.equal(response.baton.cursor, 'research_draft');

  response = applyAndPersist({
    runDir,
    index: 3,
    cursor: 'research_draft',
    decision: 'draft ready for critic attack',
    output: {
      outcome: 'ready_for_attack',
      research_packet: minimalPacket('Send to critic attack.'),
      artifacts: [{ id: 'research-packet', type: 'research-packet', summary: 'Draft packet ready for critic.' }],
    },
  });
  assert.equal(response.baton.cursor, 'research_attack');

  response = applyAndPersist({
    runDir,
    index: 4,
    cursor: 'research_attack',
    decision: 'critic requested bounded revision',
    output: {
      outcome: 'needs_revision',
      verdict: {
        summary: ['The draft should explicitly name run-dir output persistence.'],
        evidence_checked: ['research_draft packet', 'user-answer result'],
        findings: [{ severity: 'should-fix', summary: 'Persistence convention needs to be explicit.' }],
      },
      results: [{ type: 'critic-finding', summary: 'Add run-dir outputs convention.' }],
    },
  });
  assert.equal(response.baton.cursor, 'research_draft');

  response = applyAndPersist({
    runDir,
    index: 5,
    cursor: 'research_draft',
    decision: 'revision ready for critic attack',
    output: {
      outcome: 'ready_for_attack',
      research_packet: {
        ...minimalPacket('Approve and save under the active run outputs folder.'),
        known_facts_and_evidence: [
          'User answer: use the active --run-dir outputs folder.',
          'persist-run-state records the output path in history.md.',
        ],
      },
      artifacts: [{ id: 'research-packet', type: 'research-packet', summary: 'Revised packet ready for critic.' }],
    },
  });
  assert.equal(response.baton.cursor, 'research_attack');

  response = applyAndPersist({
    runDir,
    index: 6,
    cursor: 'research_attack',
    decision: 'critic approved revised packet',
    output: {
      outcome: 'approved',
      verdict: {
        summary: ['Research packet is ready to save.'],
        evidence_checked: ['revised research_draft packet', 'run-dir persistence answer'],
        findings: [],
      },
    },
  });
  assert.equal(response.baton.cursor, 'save_research_packet');

  response = applyAndPersist({
    runDir,
    index: 7,
    cursor: 'save_research_packet',
    decision: 'saved final research packet metadata',
    output: {
      outcome: 'saved',
      saved: {
        summary: 'Final research packet saved in run outputs.',
        artifact_path: path.join(runDir, 'outputs/07-save_research_packet.json'),
        history_note: 'persist-run-state appended this save decision to history.md.',
      },
      artifacts: [{ id: 'saved-research-packet', type: 'saved-research-packet', summary: 'Final saved research packet.' }],
      results: [{ type: 'saved', summary: 'Final research packet metadata persisted.' }],
    },
  });

  assert.equal(response.baton.cursor, 'done');
  assert.equal(response.baton.status, 'done');
  assert.equal(response.steps[0].action, 'stop_done');

  const persistedBaton = JSON.parse(readFileSync(path.join(runDir, 'baton.json'), 'utf8'));
  const history = readFileSync(path.join(runDir, 'history.md'), 'utf8');
  assert.equal(persistedBaton.cursor, 'done');
  assert.ok(persistedBaton.state.artifacts.some((artifact) => artifact.id === 'saved-research-packet'));
  assert.ok(persistedBaton.state.results.some((result) => result.type === 'user-answer'));
  assert.ok(persistedBaton.state.outputs.research_draft);
  assert.ok(persistedBaton.state.outputs.research_attack);
  assert.ok(persistedBaton.state.outputs.save_research_packet);
  assert.match(history, /output: .*outputs\/01-research_draft\.json/);
  assert.match(history, /decision: user answered persistence location question/);
  assert.match(history, /output: .*outputs\/07-save_research_packet\.json/);
});
