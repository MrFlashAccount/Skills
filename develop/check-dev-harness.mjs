#!/usr/bin/env node
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const tempDir = mkdtempSync(path.join(tmpdir(), 'dev-harness-check-'));

function writeJson(fileName, value) {
  const filePath = path.join(tempDir, fileName);
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
  return filePath;
}

function assertResult(label, result, expectSuccess) {
  const succeeded = result.status === 0;
  if (succeeded !== expectSuccess) {
    process.stderr.write(`check '${label}' expected ${expectSuccess ? 'success' : 'failure'} but got ${result.status}\n`);
    if (result.stdout) process.stderr.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    process.exit(1);
  }

  if (!expectSuccess) return null;
  const response = JSON.parse(result.stdout);
  if (!response.baton || !response.directive) {
    process.stderr.write(`check '${label}' returned malformed handoff response\n`);
    process.exit(1);
  }
  return response;
}

function runHelper(label, baton, output, expectSuccess) {
  const batonPath = writeJson(`${label}-baton.json`, baton);
  const outputPath = writeJson(`${label}-output.json`, output);
  const result = spawnSync(
    process.execPath,
    ['develop/dev-harness-step.mjs', 'apply', 'develop/dev-harness.workflow.json', batonPath, outputPath],
    { cwd: root, encoding: 'utf8' },
  );

  return assertResult(label, result, expectSuccess);
}

function runDirective(label, baton, expectSuccess) {
  const batonPath = writeJson(`${label}-baton.json`, baton);
  const result = spawnSync(
    process.execPath,
    ['develop/dev-harness-step.mjs', 'inspect', 'develop/dev-harness.workflow.json', batonPath],
    { cwd: root, encoding: 'utf8' },
  );

  return assertResult(label, result, expectSuccess);
}

try {
  const initialBaton = { cursor: 'research', status: 'running', state: { artifacts: [] } };
  const directiveResponse = runDirective('directive-research', initialBaton, true);
  if (directiveResponse.directive.id !== 'research' || directiveResponse.directive.action !== 'run_worker') {
    process.stderr.write(`check 'directive-research' returned wrong directive\n`);
    process.exit(1);
  }
  if (JSON.stringify(directiveResponse.baton) !== JSON.stringify(initialBaton)) {
    process.stderr.write(`check 'directive-research' mutated baton\n`);
    process.exit(1);
  }

  const researchReadyResponse = runHelper(
    'research-ready',
    initialBaton,
    {
      outcome: 'ready_for_approval',
      artifacts: [{ type: 'research', summary: 'minimal research packet' }],
      results: [{ type: 'research_summary', summary: 'non-durable operator note' }],
    },
    true,
  );
  if (researchReadyResponse.baton.cursor !== 'approve_research') {
    process.stderr.write(`check 'research-ready' did not advance cursor\n`);
    process.exit(1);
  }
  if (researchReadyResponse.baton.state.results?.[0]?.type !== 'research_summary') {
    process.stderr.write(`check 'research-ready' did not append state.results\n`);
    process.exit(1);
  }
  const historyEvent = researchReadyResponse.baton.state.history?.[0];
  if (historyEvent?.event !== 'handoff_applied' || historyEvent.cursor !== 'research' || historyEvent.target !== 'approve_research') {
    process.stderr.write(`check 'research-ready' did not append expected state.history event\n`);
    process.exit(1);
  }

  const approvalResponse = runHelper(
    'approval',
    { cursor: 'approve_research', status: 'running', state: { artifacts: [{ type: 'research', summary: 'minimal research packet' }] } },
    { approval: 'approved', artifacts: [{ type: 'research_approval', summary: 'approved' }] },
    true,
  );
  if ('approval' in approvalResponse.baton) {
    process.stderr.write(`check 'approval' stored top-level approval state\n`);
    process.exit(1);
  }

  runHelper(
    'missing-artifact',
    { cursor: 'research', status: 'running', state: { artifacts: [] } },
    { outcome: 'ready_for_approval', artifacts: [] },
    false,
  );
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
