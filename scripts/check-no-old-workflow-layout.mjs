#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.cwd();
const forbiddenDir = join(root, 'develop/lib/workflow');
const forbiddenPatterns = [
  /develop\/lib\/workflow/,
  /\.\.\/workflow(?:\/|['"])/,
  /workflow\/interpreter/,
  /workflow\/prompt-renderer/,
  /workflow\/state/,
  /workflow\/transitions/,
  /WorkflowInterpreter/,
  /use-cases\/interpreter/,
];
const ignoredDirs = new Set(['.git', 'node_modules', '.worktrees']);
const ignoredFiles = new Set(['scripts/check-no-old-workflow-layout.mjs', 'scripts/check-workflow-runtime-boundaries.mjs']);

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

function walk(dir, files = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!ignoredDirs.has(entry.name)) walk(join(dir, entry.name), files);
      continue;
    }
    if (entry.isFile()) files.push(join(dir, entry.name));
  }
  return files;
}

if (existsSync(forbiddenDir)) fail('old workflow layout must not exist: develop/lib/workflow');

for (const scope of ['develop', 'scripts', 'package.json', 'Makefile']) {
  const start = join(root, scope);
  if (!existsSync(start)) continue;
  const scopedFiles = scope.includes('.') || scope === 'Makefile' ? [start] : walk(start);
  for (const file of scopedFiles) {
  const rel = relative(root, file);
  if (ignoredFiles.has(rel)) continue;
  if (!/\.(?:mjs|js|json|md|ts|tsx|jsx|cjs|sh|mk|Makefile)$|(?:^|\/)Makefile$|package\.json$/.test(rel)) continue;
  const text = readFileSync(file, 'utf8');
  for (const pattern of forbiddenPatterns) {
    if (pattern.test(text)) fail(`forbidden old workflow reference in ${rel}: ${pattern}`);
  }
  }
}
