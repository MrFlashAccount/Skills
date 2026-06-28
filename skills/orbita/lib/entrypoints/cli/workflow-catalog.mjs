#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

function fail(message) {
  console.error(`workflow-catalog: ${message}`);
  process.exit(1);
}

function usage() {
  return 'usage: node skills/orbita/lib/entrypoints/cli/workflow-catalog.mjs list [--human|--json] [--workflows-root <dir>] | resolve <query> [--human|--json] [--workflows-root <dir>]';
}

function repoRoot() {
  const scriptDir = dirname(fileURLToPath(import.meta.url));
  return join(scriptDir, '../../../../..');
}

function parseCliArgs(argv) {
  const [mode, ...rest] = argv;
  if (!['list', 'resolve'].includes(mode)) fail(usage());
  try {
    const parsed = parseArgs({
      args: rest,
      options: {
        human: { type: 'boolean', default: false },
        json: { type: 'boolean', default: false },
        'workflows-root': { type: 'string' },
      },
      strict: true,
      allowPositionals: mode === 'resolve',
    });
    if (parsed.values.human && parsed.values.json) fail(usage());
    if (mode === 'list' && parsed.positionals.length > 0) fail(usage());
    if (mode === 'resolve' && parsed.positionals.length !== 1) fail(usage());
    return { mode, values: parsed.values, positionals: parsed.positionals };
  } catch (error) {
    fail(`${error.message}\n${usage()}`);
  }
}

function readWorkflowCatalog({ workflowsRoot = join(repoRoot(), 'workflows') } = {}) {
  workflowsRoot = resolve(workflowsRoot);
  if (!existsSync(workflowsRoot)) fail(`workflows directory not found: ${workflowsRoot}`);

  const root = repoRoot();
  const workflows = [];
  for (const entry of readdirSync(workflowsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const workflowPath = join(workflowsRoot, entry.name, 'workflow.json');
    if (!existsSync(workflowPath)) continue;

    let workflow;
    try {
      workflow = JSON.parse(readFileSync(workflowPath, 'utf8'));
    } catch (error) {
      fail(`failed to read ${relative(root, workflowPath)}: ${error.message}`);
    }

    const name = typeof workflow.name === 'string' ? workflow.name.trim() : '';
    const description = typeof workflow.description === 'string' ? workflow.description.trim() : '';
    if (!name) fail(`workflow is missing top-level name: ${relative(root, workflowPath)}`);
    if (!description) fail(`workflow is missing top-level description: ${relative(root, workflowPath)}`);

    workflows.push({
      name,
      description,
      path: resolve(workflowPath),
    });
  }

  return workflows.sort((a, b) => a.name.localeCompare(b.name));
}

function formatHuman(workflows) {
  if (workflows.length === 0) return 'No workflows found.';
  return workflows.map((workflow) => `${workflow.name} - ${workflow.description}\n  absolute workflow path for --workflow: ${workflow.path}`).join('\n');
}

function normalize(value) {
  return String(value)
    .toLowerCase()
    .replace(/\.json$/u, '')
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-|-$/gu, '');
}

function includesAllTokens(haystack, needle) {
  const tokens = normalize(needle).split('-').filter(Boolean);
  if (tokens.length === 0) return false;
  return tokens.every((token) => haystack.includes(token));
}

function scoreWorkflow(workflow, query) {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return 0;

  const normalizedName = normalize(workflow.name);
  const normalizedDescription = normalize(workflow.description);

  if (normalizedQuery === normalizedName) return 100;
  if (normalizedName.includes(normalizedQuery) || normalizedQuery.includes(normalizedName)) return 80;
  if (includesAllTokens(normalizedName, normalizedQuery)) return 60;
  if (normalizedDescription.includes(normalizedQuery)) return 30;
  if (includesAllTokens(normalizedDescription, normalizedQuery)) return 20;
  return 0;
}

function resolveWorkflow(workflows, query) {
  const scored = workflows
    .map((workflow) => ({ ...workflow, score: scoreWorkflow(workflow, query) }))
    .filter((workflow) => workflow.score > 0)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

  if (scored.length === 0) return { status: 'none', query, candidates: [] };

  const topScore = scored[0].score;
  const candidates = scored.filter((workflow) => workflow.score === topScore).map(({ score: _score, ...workflow }) => workflow);
  return {
    status: candidates.length === 1 ? 'single' : 'multiple',
    query,
    candidates,
  };
}

function formatResolveHuman(result) {
  if (result.status === 'none') return `No workflow matched: ${result.query}`;
  if (result.status === 'single') {
    const workflow = result.candidates[0];
    return `Matched workflow: ${workflow.name}\n  description: ${workflow.description}\n  absolute workflow path for --workflow: ${workflow.path}`;
  }
  return `Multiple workflows matched: ${result.query}\n${result.candidates.map((workflow) => `- ${workflow.name}: ${workflow.description}`).join('\n')}`;
}

const { mode, values, positionals } = parseCliArgs(process.argv.slice(2));
const workflows = readWorkflowCatalog({ workflowsRoot: values['workflows-root'] });

if (mode === 'resolve') {
  const result = resolveWorkflow(workflows, positionals[0]);
  if (values.json) console.log(JSON.stringify(result, null, 2));
  else console.log(formatResolveHuman(result));
} else if (values.json) {
  console.log(JSON.stringify({ workflows }, null, 2));
} else {
  console.log(formatHuman(workflows));
}
