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

function runHelper(label, baton, output, expectSuccess) {
  const batonPath = writeJson(`${label}-baton.json`, baton);
  const outputPath = writeJson(`${label}-output.json`, output);
  const result = spawnSync(
    process.execPath,
    ['develop/dev-harness-step.mjs', 'develop/dev-harness.workflow.json', batonPath, outputPath],
    { cwd: root, encoding: 'utf8' },
  );

  const succeeded = result.status === 0;
  if (succeeded !== expectSuccess) {
    process.stderr.write(`check '${label}' expected ${expectSuccess ? 'success' : 'failure'} but got ${result.status}\n`);
    if (result.stdout) process.stderr.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    process.exit(1);
  }

  if (expectSuccess) {
    const response = JSON.parse(result.stdout);
    if (!response.baton || !response.nextStep) {
      process.stderr.write(`check '${label}' returned malformed handoff response\n`);
      process.exit(1);
    }
  }
}

try {
  runHelper(
    'research-ready',
    { currentStep: 'research', status: 'running', artifacts: {}, approvals: {} },
    { outcome: 'ready_for_approval', artifacts: { research: 'minimal research packet' } },
    true,
  );

  runHelper(
    'approval',
    { currentStep: 'approve_research', status: 'running', artifacts: { research: 'minimal research packet' }, approvals: {} },
    { approval: 'approved', approvals: { research: 'approved' } },
    true,
  );

  runHelper(
    'missing-artifact',
    { currentStep: 'research', status: 'running', artifacts: {}, approvals: {} },
    { outcome: 'ready_for_approval', artifacts: {} },
    false,
  );
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
