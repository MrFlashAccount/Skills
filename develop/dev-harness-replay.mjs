#!/usr/bin/env node
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

function fail(message, detail) {
  console.error(`dev-harness-replay: ${message}`);
  if (detail) console.error(detail);
  process.exit(1);
}

function parseArgs(argv) {
  const args = {
    workflow: 'develop/demo/simple-file-workflow.yaml',
    baton: 'develop/demo/initial-baton.yaml',
    actions: 'develop/demo/step-actions.json',
    negative: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--workflow') args.workflow = argv[++index];
    else if (arg === '--baton') args.baton = argv[++index];
    else if (arg === '--actions') args.actions = argv[++index];
    else if (arg === '--negative') args.negative = argv[++index] ?? 'missing-produced-artifact';
    else if (arg === '--help' || arg === '-h') {
      console.log('usage: node develop/dev-harness-replay.mjs [--workflow <yaml>] [--baton <yaml>] [--actions <json>] [--negative missing-produced-artifact]');
      process.exit(0);
    } else {
      fail(`unknown argument: ${arg}`);
    }
  }
  return args;
}

function parseScalar(value) {
  if (value === '') return '';
  if (value === 'null') return null;
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  return value.replace(/^["']|["']$/g, '');
}

function stripComment(line) {
  let quote = null;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if ((char === '"' || char === "'") && line[i - 1] !== '\\') quote = quote === char ? null : quote ?? char;
    if (char === '#' && !quote) return line.slice(0, i);
  }
  return line;
}

function parseInlineMap(value) {
  const inner = value.slice(1, -1).trim();
  if (!inner) return {};
  return Object.fromEntries(inner.split(',').map((part) => {
    const [key, ...rest] = part.split(':');
    if (!key || rest.length === 0) fail(`cannot parse inline map entry: ${part}`);
    return [key.trim(), parseScalar(rest.join(':').trim())];
  }));
}

function parseYamlSubset(text) {
  const root = {};
  const stack = [{ indent: -1, value: root }];
  const lines = text.split(/\r?\n/);

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = stripComment(lines[lineIndex]).replace(/\s+$/, '');
    if (!line.trim()) continue;
    const indent = line.match(/^ */)[0].length;
    const trimmed = line.trim();

    while (stack.at(-1).indent >= indent) stack.pop();
    const parent = stack.at(-1).value;

    if (trimmed.startsWith('- ')) {
      if (!Array.isArray(parent)) fail(`list item has non-list parent: ${trimmed}`);
      const item = trimmed.slice(2).trim();
      parent.push(item.startsWith('{') && item.endsWith('}') ? parseInlineMap(item) : parseScalar(item));
      continue;
    }

    const match = trimmed.match(/^([^:]+):(.*)$/);
    if (!match) fail(`cannot parse line: ${trimmed}`);
    const key = match[1].trim();
    const rest = match[2].trim();

    if (Array.isArray(parent)) fail(`map entry has list parent: ${trimmed}`);

    if (rest === '') {
      const nextLine = lines.slice(lineIndex + 1).find((candidate) => stripComment(candidate).trim());
      const child = nextLine && nextLine.match(/^ */)[0].length > indent && stripComment(nextLine).trim().startsWith('- ') ? [] : {};
      parent[key] = child;
      stack.push({ indent, value: child });
    } else if (rest.startsWith('{') && rest.endsWith('}')) {
      parent[key] = parseInlineMap(rest);
    } else {
      parent[key] = parseScalar(rest);
    }
  }
  return root;
}

function readData(path) {
  const text = readFileSync(path, 'utf8');
  try {
    return JSON.parse(text);
  } catch {
    return parseYamlSubset(text);
  }
}

function ensureParent(path) {
  mkdirSync(dirname(path), { recursive: true });
}

function writeArtifact(path, content) {
  ensureParent(path);
  writeFileSync(path, content, 'utf8');
}

function relativeArtifact(workspace, path) {
  return relative(workspace, path).replaceAll('\\', '/');
}

function performAction(stepId, actionSpec, baton, workspace) {
  const artifactPath = join(workspace, actionSpec.relativePath);
  const artifacts = baton.artifacts ?? {};

  if (actionSpec.action === 'prepare_workspace') {
    mkdirSync(join(workspace, 'files'), { recursive: true });
    writeArtifact(artifactPath, `${JSON.stringify({ workspace, prepared: true }, null, 2)}\n`);
  } else if (actionSpec.action === 'write_file') {
    writeArtifact(artifactPath, actionSpec.content ?? '');
  } else if (actionSpec.action === 'append_summary') {
    const seedPath = join(workspace, artifacts.seedFile);
    const seed = readFileSync(seedPath, 'utf8');
    writeArtifact(artifactPath, `# Demo summary\n\n${seed}summary: appended by replay harness\n`);
  } else if (actionSpec.action === 'verify_files') {
    const checks = {
      seedFileExists: Boolean(artifacts.seedFile && readFileSync(join(workspace, artifacts.seedFile), 'utf8').includes('DevHarness')),
      summaryFileExists: Boolean(artifacts.summaryFile && readFileSync(join(workspace, artifacts.summaryFile), 'utf8').includes('summary: appended')),
    };
    if (!checks.seedFileExists || !checks.summaryFileExists) {
      return { outcome: 'blocked', blocker: `verification failed at ${stepId}`, artifacts: {} };
    }
    writeArtifact(artifactPath, `${JSON.stringify({ verified: true, checks }, null, 2)}\n`);
  } else if (actionSpec.action === 'finalize') {
    writeArtifact(artifactPath, `# Simple file workflow report\n\nstatus: done\nworkspace: ${workspace}\nverification: ${artifacts.verification}\n`);
  } else {
    fail(`unsupported demo action '${actionSpec.action}' for step '${stepId}'`);
  }

  return {
    outcome: actionSpec.outcome,
    artifacts: {
      [actionSpec.artifact]: relativeArtifact(workspace, artifactPath),
    },
  };
}

function diffBaton(before, after) {
  const beforeArtifacts = before.artifacts ?? {};
  const afterArtifacts = after.artifacts ?? {};
  const addedArtifacts = Object.fromEntries(Object.entries(afterArtifacts).filter(([key, value]) => beforeArtifacts[key] !== value));
  return {
    currentStep: `${before.currentStep} -> ${after.currentStep}`,
    status: `${before.status} -> ${after.status}`,
    addedArtifacts,
  };
}

const args = parseArgs(process.argv.slice(2));
const repoRoot = resolve(dirname(new URL(import.meta.url).pathname), '..');
const workflowPath = resolve(args.workflow);
const initialBatonPath = resolve(args.baton);
const actionsPath = resolve(args.actions);
const stepScriptPath = join(repoRoot, 'develop', 'dev-harness-step.mjs');
const workflowDoc = readData(workflowPath);
const workflow = workflowDoc.workflow ?? workflowDoc;
const actions = JSON.parse(readFileSync(actionsPath, 'utf8'));
if (args.negative && args.negative !== 'missing-produced-artifact') {
  fail(`unsupported negative scenario: ${args.negative}`);
}
let baton = readData(initialBatonPath);
const workspace = mkdtempSync(join(tmpdir(), 'dev-harness-demo-'));
const trace = [];

for (let index = 0; index < 20; index += 1) {
  if (baton.status === 'done' || baton.status === 'blocked') break;

  const stepId = baton.currentStep;
  const step = workflow.steps?.[stepId];
  if (!step) fail(`current step not found in workflow: ${stepId}`);
  const actionSpec = actions[stepId];
  if (!actionSpec) fail(`missing demo action for step: ${stepId}`);

  const before = structuredClone(baton);
  const output = performAction(stepId, actionSpec, baton, workspace);
  if (args.negative === 'missing-produced-artifact' && stepId === 'write_seed_file') {
    output.artifacts = {};
  }

  const outputPath = join(workspace, `output-${String(index + 1).padStart(2, '0')}-${stepId}.json`);
  const batonPath = join(workspace, `baton-${String(index).padStart(2, '0')}-${stepId}.json`);
  writeArtifact(outputPath, `${JSON.stringify(output, null, 2)}\n`);
  writeArtifact(batonPath, `${JSON.stringify(baton, null, 2)}\n`);

  const transition = spawnSync(process.execPath, [stepScriptPath, workflowPath, batonPath, outputPath], {
    cwd: repoRoot,
    encoding: 'utf8',
  });

  if (transition.status !== 0) {
    trace.push({
      step: stepId,
      action: actionSpec.action,
      outputArtifact: relativeArtifact(workspace, outputPath),
      transition: 'failed',
      error: transition.stderr.trim(),
    });
    console.log(JSON.stringify({ workspace, status: 'failed', trace }, null, 2));
    process.exit(1);
  }

  const result = JSON.parse(transition.stdout);
  baton = result.baton;
  trace.push({
    step: stepId,
    action: actionSpec.action,
    outputArtifact: relativeArtifact(workspace, outputPath),
    transition: {
      nextStep: result.nextStep.id,
      nextAction: result.nextStep.action,
    },
    batonDiff: diffBaton(before, baton),
  });

  if (result.nextStep.action.startsWith('stop')) break;
}

if (baton.status !== 'done') {
  console.log(JSON.stringify({ workspace, status: baton.status, trace }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  workspace,
  status: baton.status,
  finalStep: baton.currentStep,
  finalArtifacts: baton.artifacts,
  trace,
}, null, 2));
