import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import workflowDoc from '../../../../workflows/dev-harness/workflow.json' with { type: 'json' };

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

function promptText(step) {
  const prompt = step.input?.prompt ?? '';
  return Array.isArray(prompt) ? prompt.join('\n') : prompt;
}

test('issue 197: dev-harness implementation instructions and schema align on self-caused red-test semantics', () => {
  for (const stepId of ['backend_implementation', 'frontend_implementation']) {
    const text = promptText(workflowDoc.steps[stepId]);
    assert.match(text, /red tests, lint failures, typecheck failures/);
    assert.match(text, /own in-scope .* changes as implementation work to fix and rerun, not as blockers by themselves/);
    assert.match(text, /missing external input, permission, an approved-contract change, a redesign\/plan decision/);
  }

  const schemaText = readFileSync(path.join(REPO_ROOT, 'workflows/dev-harness/schemas/implementation-output.json'), 'utf8');
  assert.match(schemaText, /own in-scope changes are implementation work to fix and rerun/);
  assert.match(schemaText, /external or contract-level stop condition/);
  assert.doesNotMatch(schemaText, /failed checks as blockers by themselves|red tests.*blockers by themselves/);

  const testingReference = readFileSync(path.join(REPO_ROOT, 'skills/implementation-harness/references/testing.md'), 'utf8');
  const outputContractReference = readFileSync(path.join(REPO_ROOT, 'skills/implementation-harness/references/output-contract.md'), 'utf8');
  assert.match(testingReference, /own in-scope implementation changes as work to fix and rerun/);
  assert.match(outputContractReference, /Red tests caused by your own in-scope changes are implementation work to fix and rerun/);
});

test('issue 197: Orbita host watchdog instructions split bootstrap silence from active progress evidence', () => {
  const skillText = readFileSync(path.join(REPO_ROOT, 'skills/orbita/SKILL.md'), 'utf8');
  assert.match(skillText, /bootstrap\/instruction-load silence separately from active implementation progress/);
  assert.match(skillText, /current work, inspected or changed surfaces, verification state, and the next bounded checkpoint/);
  assert.match(skillText, /continue that same worker and ask for the next bounded checkpoint/);
  assert.match(skillText, /Do not persist progress in baton, scrape transcripts, read private runner state, or add durable worker status storage/);
});
