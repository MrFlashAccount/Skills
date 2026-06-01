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

const retainedRunnerRunStatePath = path.join(root, 'develop/lib/persistence/runner/run-state.mjs');
const runStateContextPath = path.join(root, 'develop/lib/persistence/run-state/CONTEXT.md');
if (!existsSync(retainedRunnerRunStatePath)) fail('retained run-state owner surface is missing: develop/lib/persistence/runner/run-state.mjs');
scan([retainedRunnerRunStatePath], /function\s+|async\s+function|from 'node:fs|from 'node:fs\/promises|from 'node:path/, 'retained runner run-state surface must be facade-only');
if (!contains(runStateContextPath, /persistence\/runner\/run-state\.mjs/) || !contains(runStateContextPath, /removal condition/i) || !contains(runStateContextPath, /keep_temporarily.+facade-only/s)) {
  fail('PersistedRunState context must document retained persistence/runner/run-state.mjs as keep_temporarily facade-only with removal condition');
}
if (!contains(runStateContextPath, /Use-case surface classification/) || !contains(runStateContextPath, /`RunNext`.+keep/s)) {
  fail('PersistedRunState context must include compact use-case keep/delete/demote classification');
}

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
scan(schemas, /\.\.(?:\/\.\.)*\/entities\//, 'schemas must not import entities');
scan(schemas, /from ['"].*persistence/, 'schemas must not import persistence');
scan(persistence, /from ['"].*use-cases\//, 'persistence must not import use-cases');
scan([path.join(root, 'develop/lib/persistence/WorkflowFileReader.mjs')], /WorkflowRuntimeReader\.mjs/, 'workflow file reader must use resource-specific catalogs instead of the runtime reader');
scan(persistence, /entities\/roles\.mjs|entities\/role-utils\.mjs|entities\/workflow-helpers\/roles\.mjs/, 'persistence must not import entity-owned role/resource helpers');
scan([...entrypoints, ...persistence], /use-cases\/runtime/, 'entrypoints/persistence must not import private use-case runtime');
scan(lib, /from ['"].*entities\/(role-utils|state-keys)(\.mjs)?['"]/, 'deleted facade import is forbidden');
scan(lib, /validateForRuntime|WorkflowEngine|WorkflowRunStore|WorkflowInterpreter|use-cases\/interpreter|services\/|boundaries\/|Templater|fromDTO|fromDto/, 'forbidden workflow runtime compatibility surface');
scan(runStatePersistence, /\bRunStateDTO\b|new RunStateDTO/, 'run-state persistence must not use RunStateDTO as storage schema');
scan(entities, /assertBatonSchema|assertWorkflowSchema|assertResponseSchema|assertWorkerOutputSchema|\bworkflowSchemas\b/, 'entities must not own boundary schema validators');
scan(cliEntrypoints.filter((file) => file.endsWith('persist-run-state.mjs')), /writeFileAtomic|appendFileDurably|appendFile|writeFile\(/, 'persist-run-state CLI must not directly write run-state files');
scan(entrypoints, /persistence\/runner\/run-state\.mjs/, 'entrypoints must not import old runner run-state internals');
scan(entrypoints, /from ['"].*runner\/run-state\.mjs['"]|import \{[^}]*\b(readJson|readText|recoverDurableCommit|withContinueRunLock)\b[^}]*\} from ['"].*runner\/run-state\.mjs['"]/, 'entrypoints must not import old direct split-file run-state readers');
scan([path.join(root, 'develop/lib/persistence/run-state/persisted-state-schema.mjs')], /PersistedRunStateReader|readPersistedRunState/, 'persisted-state schema must not re-export reader/projection implementation');
scan([path.join(root, 'develop/lib/persistence/output-schema-validation.mjs')], /function\s+(validateAgainstOutputSchema|outputSchemaRetryKey|validationRetryPrompt)|const\s+OUTPUT_SCHEMA_MAX_ATTEMPTS/, 'persistence output-schema-validation must be facade-only');
const schemaOutputValidationPath = path.join(root, 'develop/lib/schemas/output-schema-validation.mjs');
if (!contains(schemaOutputValidationPath, /function\s+validateAgainstOutputSchema/) || !contains(schemaOutputValidationPath, /const\s+OUTPUT_SCHEMA_MAX_ATTEMPTS/) || !contains(schemaOutputValidationPath, /function\s+outputSchemaRetryKey/) || !contains(schemaOutputValidationPath, /function\s+validationRetryPrompt/)) {
  fail('schema-owned output validation policy must exist');
}
const apiWorkflowRunnerPath = path.join(root, 'develop/lib/entrypoints/api/workflowRunner.mjs');
if (contains(apiWorkflowRunnerPath, /loadWorkflowRuntime\(\{ workflowPath: paths\.workflowPath, batonPath: paths\.batonPath \}\)/)) {
  fail('API next path must pass a persisted run-state baton projection into runtime loading instead of raw baton loading');
}
if (!contains(apiWorkflowRunnerPath, /readPersistedRunState\(paths\)/) || !contains(apiWorkflowRunnerPath, /projectRuntimeRunState\(persisted\)/)) {
  fail('API next path must read and project PersistedRunState before rendering');
}

const writerPath = path.join(root, 'develop/lib/persistence/run-state/PersistedRunStateWriter.mjs');
if (!contains(writerPath, /withRunStateLock/)) fail('PersistedRunStateWriter must acquire the run-state lock');
const readerPath = path.join(root, 'develop/lib/persistence/run-state/PersistedRunStateReader.mjs');
if (!contains(readerPath, /lastResponse\.requests/) || !contains(readerPath, /missing committed instruction file/)) {
  fail('PersistedRunStateReader must validate committed instruction refs/files from current lastResponse');
}

const runStateDtoPath = path.join(root, 'develop/lib/dtos/RunStateDTO.mjs');
if (existsSync(runStateDtoPath) && !contains(runStateDtoPath, /runtime run-state projection only/i)) {
  fail('RunStateDTO must be documented as projection-only or renamed');
}

const persistedRefs = lib.filter((file) => /PersistedRunState/.test(readFileSync(file, 'utf8'))).map(rel);
if (persistedRefs.length === 0) fail('PersistedRunState contract is not referenced under develop/lib');

if (failures.length > 0) {
  console.error(['workflow runtime boundary check failed:', ...failures.map((failure) => `- ${failure}`)].join('\n'));
  process.exit(1);
}

console.log('workflow runtime boundary check passed');
