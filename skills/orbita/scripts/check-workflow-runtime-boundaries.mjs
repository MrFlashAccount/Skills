import { existsSync, readdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const abs = (relativePath) => path.join(root, relativePath);
const rel = (absolutePath) => path.relative(root, absolutePath).replaceAll(path.sep, '/');

let selfTestMode = false;

function fail(message) {
  if (!selfTestMode) console.error(message);
  process.exitCode = 1;
}

function walk(start) {
  if (!existsSync(start)) return [];
  const entries = [];
  for (const entry of readdirSync(start, { withFileTypes: true })) {
    const full = path.join(start, entry.name);
    if (entry.isDirectory()) entries.push(...walk(full));
    else entries.push(full);
  }
  return entries;
}

function read(file) {
  return readFileSync(file, 'utf8');
}

function assertExists(relativePath) {
  if (!existsSync(abs(relativePath))) fail(`required owner path missing: ${relativePath}`);
}

function assertAbsent(relativePath) {
  if (existsSync(abs(relativePath))) fail(`retired or forbidden path exists: ${relativePath}`);
}

function scan(files, pattern, message, { exclude = () => false } = {}) {
  for (const file of files.filter((candidate) => existsSync(candidate) && !exclude(candidate))) {
    if (pattern.test(read(file))) fail(`${message}: ${rel(file)}`);
  }
}

const MODULE_SPECIFIER_PATTERN = /\b(?:import|export)\s+(?:[^'"`]*?\sfrom\s+)?['"]([^'"]+)['"]|\bimport\(\s*['"]([^'"]+)['"]\s*\)/g;

function resolveRelativeModule(file, specifier) {
  if (!specifier.startsWith('.')) return undefined;
  const base = path.resolve(path.dirname(file), specifier);
  const candidates = [
    base,
    `${base}.mjs`,
    `${base}.js`,
    `${base}.json`,
    path.join(base, 'index.mjs'),
    path.join(base, 'index.js'),
    path.join(base, 'index.json'),
  ];
  return candidates.find(existsSync);
}

function relativeModuleImports(file) {
  const imports = [];
  for (const match of read(file).matchAll(MODULE_SPECIFIER_PATTERN)) {
    const specifier = match[1] ?? match[2];
    const resolved = specifier ? resolveRelativeModule(file, specifier) : undefined;
    if (resolved) imports.push(resolved);
  }
  return imports;
}

function assertNoResolvedImport(files, predicate, message) {
  for (const file of files.filter(existsSync)) {
    for (const imported of relativeModuleImports(file)) {
      if (predicate(imported, file)) fail(`${message}: ${rel(file)} -> ${rel(imported)}`);
    }
  }
}

function isSource(file) {
  return /\.(?:mjs|js|json|md)$/.test(file);
}

function checkBoundaries() {
  const orbitaLib = abs('skills/orbita/lib');
  const entrypointFiles = walk(abs('skills/orbita/lib/entrypoints')).filter(isSource);
  const cliEntrypointFiles = walk(abs('skills/orbita/lib/entrypoints/cli')).filter(isSource);
  const runtimeHelperFiles = walk(abs('skills/orbita/lib/use-cases/runtime')).filter(isSource);
  const persistenceFiles = walk(abs('skills/orbita/lib/persistence')).filter(isSource);
  const docsAndExports = [
    ...walk(orbitaLib).filter(isSource),
    ...walk(abs('skills/orbita')).filter((file) => isSource(file) && !rel(file).startsWith('skills/orbita/lib/tests/')),
    ...walk(abs('workflows')).filter(isSource),
    existsSync(abs('README.md')) ? abs('README.md') : undefined,
  ].filter(Boolean);

  [
    'skills/orbita/lib/entrypoints/cli/start-run.mjs',
    'skills/orbita/lib/entrypoints/cli/persist-run-state.mjs',
    'skills/orbita/lib/entrypoints/cli/workflow-interpreter.mjs',
    'skills/orbita/lib/entrypoints/cli/cli-args-validation.mjs',
    'skills/orbita/lib/entrypoints/cli/schema/workflow-interpreter-args.json',
    'skills/orbita/lib/entrypoints/cli/schema/workflow-interpreter-args-schema.mjs',
    'skills/orbita/lib/entrypoints/api/runner/host-requests.mjs',
    'skills/orbita/lib/entrypoints/api/runner/runner-command-builder.mjs',
    'skills/orbita/lib/use-cases/runtime/output/schema/workflow-interpreter-response.json',
  ].forEach(assertAbsent);

  [
    'skills/orbita/ARCHITECTURE.md',
    'skills/orbita/lib/use-cases/WorkflowRunnerCommand.mjs',
    'skills/orbita/lib/use-cases/WorkflowRuns.mjs',
    'skills/orbita/lib/use-cases/ValidateWorkflowFile.mjs',
    'skills/orbita/lib/use-cases/internal/runner/host-requests.mjs',
    'skills/orbita/lib/use-cases/internal/runner/runner-command-builder.mjs',
    'skills/orbita/lib/use-cases/runtime/output/schema/workflow-runtime-response.json',
    'skills/orbita/lib/public-error.mjs',
    'skills/orbita/scripts/check-workflow-runtime-boundaries.mjs',
  ].forEach(assertExists);

  assertNoResolvedImport(entrypointFiles, (imported) => rel(imported).startsWith('skills/orbita/lib/use-cases/runtime/'), 'entrypoints must not import runtime internals');
  assertNoResolvedImport(cliEntrypointFiles, (imported) => rel(imported).startsWith('skills/orbita/lib/entrypoints/api/'), 'CLI entrypoints must not import API entrypoints');
  assertNoResolvedImport(runtimeHelperFiles, (imported) => rel(imported).startsWith('skills/orbita/lib/persistence/'), 'runtime helpers must not import persistence');
  assertNoResolvedImport(persistenceFiles, (imported) => rel(imported).startsWith('skills/orbita/lib/use-cases/'), 'persistence must not import use cases');

  scan(runtimeHelperFiles, /from ['"]node:(?:fs|path)|from ['"]fs['"]|from ['"]path['"]/, 'runtime helpers must stay IO-free');
  scan(docsAndExports, /entrypoints\/cli\/(?:start-run|persist-run-state|workflow-interpreter)\.mjs|workflow-interpreter-response|workflow-interpreter-args|entrypoints\/api\/runner\//, 'retired workflow-runner surface reference', {
    exclude: (file) => rel(file) === 'skills/orbita/ARCHITECTURE.md' || rel(file).endsWith('check-workflow-runtime-boundaries.mjs'),
  });
}

function runNegativeBoundaryCheck(setup, teardown) {
  const before = process.exitCode;
  setup();
  selfTestMode = true;
  checkBoundaries();
  selfTestMode = false;
  const accepted = process.exitCode !== 1;
  teardown();
  process.exitCode = before;
  return accepted;
}

const runtimePersistenceFixture = abs('skills/orbita/lib/use-cases/runtime/__boundary-negative-fixture.mjs');
if (runNegativeBoundaryCheck(
  () => writeFileSync(runtimePersistenceFixture, "import '../../persistence/run-state/paths.mjs';\n"),
  () => rmSync(runtimePersistenceFixture, { force: true }),
)) fail('boundary negative self-test failed: runtime persistence import was accepted');

const cliApiFixture = abs('skills/orbita/lib/entrypoints/cli/__boundary-negative-fixture.mjs');
if (runNegativeBoundaryCheck(
  () => writeFileSync(cliApiFixture, "import '../api/workflowRunner.mjs';\n"),
  () => rmSync(cliApiFixture, { force: true }),
)) fail('boundary negative self-test failed: CLI API import was accepted');

const retiredFixture = abs('skills/orbita/lib/docs/__boundary-negative-fixture.md');
if (runNegativeBoundaryCheck(
  () => writeFileSync(retiredFixture, 'Use entrypoints/cli/workflow-interpreter.mjs here.\n'),
  () => rmSync(retiredFixture, { force: true }),
)) fail('boundary negative self-test failed: retired surface reference was accepted');

checkBoundaries();
