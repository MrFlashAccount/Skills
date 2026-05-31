#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const failures = [];

function walk(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const entry of readdirSync(dir)) {
    const p = path.join(dir, entry);
    const st = statSync(p);
    if (st.isDirectory()) out.push(...walk(p));
    else if (/\.mjs$|\.js$|\.json$/.test(entry)) out.push(p);
  }
  return out;
}

function rel(p) { return path.relative(root, p); }
function fail(message) { failures.push(message); }
function scan(files, pattern, label) {
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    const lines = text.split(/\r?\n/);
    for (const [i, line] of lines.entries()) if (pattern.test(line)) fail(`${label}: ${rel(file)}:${i + 1}: ${line.trim()}`);
  }
}
function contains(file, pattern) {
  if (!existsSync(file)) return false;
  return pattern.test(readFileSync(file, 'utf8'));
}

if (existsSync(path.join(root, 'develop/lib/workflow'))) fail('forbidden legacy layout exists: develop/lib/workflow');

const entrypoints = walk(path.join(root, 'develop/lib/entrypoints'));
const cliEntrypoints = walk(path.join(root, 'develop/lib/entrypoints/cli'));
const persistence = walk(path.join(root, 'develop/lib/persistence'));
const schemas = walk(path.join(root, 'develop/lib/schemas'));
const useCases = walk(path.join(root, 'develop/lib/use-cases'));
const entities = walk(path.join(root, 'develop/lib/entities'));
const lib = walk(path.join(root, 'develop/lib'));
const runStatePersistence = [
  ...walk(path.join(root, 'develop/lib/persistence/run-state')),
  ...walk(path.join(root, 'develop/lib/persistence/runner')),
];

scan([...entrypoints, ...persistence], /entities\/(workflow-helpers|step-helpers|template-compiler)/, 'entrypoints/persistence must not import entity internals');
scan([...entrypoints, ...persistence, ...useCases], /entities\/workflow-helpers\/schema-validation\.mjs/, 'schema validators must be schema-owned');
scan(schemas, /\.\.\/entities\//, 'schemas must not import entities');
scan(persistence, /entities\/roles\.mjs|entities\/role-utils\.mjs|entities\/workflow-helpers\/roles\.mjs/, 'persistence must not import entity-owned role/resource helpers');
scan([...entrypoints, ...persistence], /use-cases\/runtime/, 'entrypoints/persistence must not import private use-case runtime');
scan(lib, /from ['"].*entities\/(role-utils|state-keys)(\.mjs)?['"]/, 'deleted facade import is forbidden');
scan(lib, /validateForRuntime|WorkflowEngine|WorkflowRunStore|WorkflowInterpreter|use-cases\/interpreter|services\/|boundaries\/|Templater|fromDTO|fromDto/, 'forbidden workflow runtime compatibility surface');
scan(runStatePersistence, /\bRunStateDTO\b|new RunStateDTO/, 'run-state persistence must not use RunStateDTO as storage schema');
scan(entities, /assertBatonSchema|assertWorkflowSchema|assertResponseSchema|assertWorkerOutputSchema|\bworkflowSchemas\b/, 'entities must not own boundary schema validators');
scan(cliEntrypoints.filter((file) => file.endsWith('persist-run-state.mjs')), /writeFileAtomic|appendFileDurably|appendFile|writeFile\(/, 'persist-run-state CLI must not directly write run-state files');

const writerPath = path.join(root, 'develop/lib/persistence/run-state/PersistedRunStateWriter.mjs');
if (!contains(writerPath, /withContinueRunLock/)) fail('PersistedRunStateWriter must acquire the run-state lock');

const persistedRefs = lib.filter((file) => /PersistedRunState/.test(readFileSync(file, 'utf8'))).map(rel);
if (persistedRefs.length === 0) fail('PersistedRunState contract is not referenced under develop/lib');

if (failures.length > 0) {
  console.error(['workflow runtime boundary check failed:', ...failures.map((failure) => `- ${failure}`)].join('\n'));
  process.exit(1);
}

console.log('workflow runtime boundary check passed');
