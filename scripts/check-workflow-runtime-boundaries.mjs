import { existsSync, readdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const rel = (p) => path.relative(root, p).replaceAll(path.sep, '/');
const abs = (p) => path.join(root, p);

let selfTestMode = false;

function fail(message) {
  if (!selfTestMode) console.error(message);
  process.exitCode = 1;
}

function walk(start) {
  if (!existsSync(start)) return [];
  const statPaths = [];
  for (const entry of readdirSync(start, { withFileTypes: true })) {
    const full = path.join(start, entry.name);
    if (entry.isDirectory()) statPaths.push(...walk(full));
    else statPaths.push(full);
  }
  return statPaths;
}

function scan(files, pattern, message) {
  for (const file of files.filter(existsSync)) {
    const text = readFileSync(file, 'utf8');
    if (pattern.test(text)) fail(`${message}: ${rel(file)}`);
  }
}

function assertExists(file) {
  if (!existsSync(abs(file))) fail(`required owner path missing: ${file}`);
}

function assertAbsent(file) {
  if (existsSync(abs(file))) fail(`forbidden old path exists: ${file}`);
}

function assertContains(text, pattern, message) {
  if (!pattern.test(text)) fail(message);
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
  const text = readFileSync(file, 'utf8');
  const imports = [];
  for (const match of text.matchAll(MODULE_SPECIFIER_PATTERN)) {
    const specifier = match[1] ?? match[2];
    const resolved = specifier ? resolveRelativeModule(file, specifier) : undefined;
    if (resolved) imports.push(resolved);
  }
  return imports;
}

function formatChain(parents, leaf) {
  const chain = [leaf];
  let current = leaf;
  while (parents.has(current)) {
    current = parents.get(current);
    chain.unshift(current);
  }
  return chain.map(rel).join(' -> ');
}

function entityOwnerFor(file) {
  const relativePath = rel(file);
  const match = relativePath.match(/^develop\/lib\/entities\/([^/]+)\//);
  return match?.[1];
}

function assertNoCrossEntityImports(entries = walk(abs('develop/lib/entities')).filter((file) => /\.(?:mjs|js|json)$/.test(file))) {
  for (const file of entries.filter(existsSync)) {
    const owner = entityOwnerFor(file);
    if (!owner) continue;

    for (const imported of relativeModuleImports(file)) {
      const importedOwner = entityOwnerFor(imported);
      if (!importedOwner || importedOwner === owner) continue;
      fail(`cross-entity import forbidden: ${rel(file)} -> ${rel(imported)}`);
    }
  }
}

function checkBoundaries() {
  const sourceFiles = [
    ...walk(abs('develop/lib')),
    ...walk(abs('workflows')),
    existsSync(abs('README.md')) ? abs('README.md') : undefined,
  ].filter(Boolean).filter((file) => /\.(mjs|js|json|md)$/.test(file));

  const forbiddenPaths = [
    'develop/lib/entities/Workflow.mjs',
    'develop/lib/entities/Step.mjs',
    'develop/lib/entities/Template.mjs',
    'develop/lib/entities/Baton.mjs',
    'develop/lib/entities/Workflow/expression.mjs',
    'develop/lib/entities/Workflow/role-ref.mjs',
    'develop/lib/entities/Workflow/state-keys.mjs',
    'develop/lib/entities/Workflow/status.mjs',
    'develop/lib/entities/Workflow/transition-next.mjs',
    'develop/lib/entities/Workflow/transition-targets.mjs',
    'develop/lib/entities/Step/projection.mjs',
    'develop/lib/entities/Step/expressions/parse.mjs',
    'develop/lib/entities/Step/transition-targets.mjs',
    'develop/lib/entities/errors.mjs',
    'develop/lib/entities/workflow-helpers',
    'develop/lib/entities/Workflow/schema',
    'develop/lib/entities/template-compiler',
    'develop/lib/entities/step-helpers',
    'develop/lib/entities/transition-next.mjs',
    'develop/lib/entities/workflow-semantic-validation-context.mjs',
    'develop/lib/resource-helpers',
    'develop/lib/persistence/runner',
    'develop/lib/persistence/WorkflowRuntimeReader.mjs',
    'develop/lib/persistence/WorkflowFileReader.mjs',
    'develop/lib/persistence/resource-resolver.mjs',
    'develop/lib/persistence/role-material-catalog.mjs',
    'develop/lib/persistence/output-schema.mjs',
    'develop/lib/persistence/output-schema-validation.mjs',
    'develop/lib/persistence/json-io.mjs',
    'develop/lib/persistence/path-utils.mjs',
    'develop/lib/persistence/RunStateFileWriter.mjs',
    'develop/lib/persistence/RunStateFileReader.mjs',
    'develop/lib/persistence/InstructionFileReader.mjs',
    'develop/lib/persistence/InstructionFileWriter.mjs',
    'develop/lib/persistence/workflow-resources/instruction-file-writer.mjs',
    'develop/lib/persistence/TemplateFileReader.mjs',
    'develop/lib/use-cases/runtime/parallel/targets.mjs',
    'develop/lib/dtos/index.mjs',
    'develop/lib/dtos/RunStateDTO.mjs',
    'develop/lib/schemas',
  ];
  forbiddenPaths.forEach(assertAbsent);

  [
    'develop/lib/entities/Workflow/index.mjs',
    'develop/lib/entities/Step/index.mjs',
    'develop/lib/entities/Template/index.mjs',
    'develop/lib/entities/Baton/index.mjs',
    'develop/lib/runtime/baton-state.mjs',
    'develop/lib/runtime/expression.mjs',
    'develop/lib/runtime/role-ref.mjs',
    'develop/lib/runtime/state-keys.mjs',
    'develop/lib/runtime/state-projection.mjs',
    'develop/lib/runtime/step-status.mjs',
    'develop/lib/runtime/transition-next.mjs',
    'develop/lib/runtime/transition-targets.mjs',
    'develop/lib/persistence/workflow-resources/runtime-reader.mjs',
    'develop/lib/persistence/workflow-resources/workflow-file-reader.mjs',
    'develop/lib/persistence/workflow-resources/resource-resolver.mjs',
    'develop/lib/persistence/workflow-resources/output-schema-loader.mjs',
    'develop/lib/persistence/workflow-resources/role-material-catalog.mjs',
    'develop/lib/persistence/filesystem/path-safety.mjs',
    'develop/lib/entrypoints/api/runner/host-requests.mjs',
    'develop/lib/use-cases/workflow-semantic-validation.mjs',
    'develop/lib/use-cases/runtime/output/output-schema-validation.mjs',
    'develop/lib/file-contracts/workflow-document.json',
    'develop/lib/file-contracts/workflow-document-schema.mjs',
    'develop/lib/entities/Baton/schema/baton.json',
    'develop/lib/entities/Baton/schema/baton-schema.mjs',
    'develop/lib/use-cases/runtime/output/schema/worker-output.json',
    'develop/lib/use-cases/runtime/output/schema/workflow-interpreter-response.json',
    'develop/lib/persistence/run-state/schema/runner-host-response.json',
    'develop/lib/persistence/run-state/schema/runner-host-response-schema.mjs',
    'develop/lib/entrypoints/cli/schema/workflow-interpreter-args.json',
  ].forEach(assertExists);

  scan(sourceFiles, /entities\/(Workflow|Step|Template|Baton)\.mjs|entities\/errors\.mjs|entities\/Workflow\/schema|entities\/Workflow\/(expression|transition-next|transition-targets|state-keys|role-ref|status)\.mjs|entities\/(workflow-helpers|step-helpers|template-compiler)|entities\/Step\/(expressions\/parse|projection|transition-targets)\.mjs|resource-helpers|persistence\/(runner|WorkflowRuntimeReader|WorkflowFileReader|resource-resolver|role-material-catalog|json-io|path-utils|output-schema-validation|output-schema|RunStateFileWriter|RunStateFileReader|InstructionFileReader|InstructionFileWriter|TemplateFileReader)|persistence\/workflow-resources\/instruction-file-writer\.mjs|use-cases\/runtime\/parallel\/targets\.mjs|develop\/lib\/schemas|schemas\/output-schema-validation|dtos\/index\.mjs|RunStateDTO/, 'forbidden old workflow runtime surface reference');
  scan(sourceFiles, /applyOutputToBatonState[^\n]*entities\/Baton\/index\.mjs|entities\/Baton\/index\.mjs[^\n]*applyOutputToBatonState/, 'forbidden Baton helper import path');

  scan(walk(abs('develop/docs')), /develop\/lib\/entities\/(Workflow|Baton|Step|Template)\.mjs|develop\/lib\/entities\/Workflow\/schema\//, 'develop docs cite stale workflow runtime layout reference');

  scan(walk(abs('develop/lib/entities')), /from ['"].*persistence\//, 'entities must not import persistence');
  scan(walk(abs('develop/lib/entities')), /from ['"].*entrypoints\//, 'entities must not import entrypoints');
  scan(walk(abs('develop/lib/entities/Workflow')), /use-cases\/runtime\/output|entrypoints\/cli\/schema|persistence\/run-state\/schema|workflows\/dev-harness|dtos\//, 'Workflow owner imports forbidden external owner');
  scan(walk(abs('develop/lib/entities')).filter((file) => !rel(file).startsWith('develop/lib/entities/Baton/')), /from ['"].*Baton\/schema\//, 'entities outside Baton owner must not import Baton schema owner');
  assertNoCrossEntityImports();
  scan(walk(abs('develop/lib/persistence/run-state')), /from ['"].*dtos\//, 'run-state persistence must not import DTOs');
  scan(walk(abs('develop/lib/persistence')), /from ['"].*use-cases\//, 'persistence must not import use-cases');
  scan([...walk(abs('develop/lib/entities/Baton')), ...walk(abs('develop/lib/use-cases')), ...walk(abs('develop/lib/persistence')), ...walk(abs('develop/lib/entrypoints'))], /WorkflowSchemaError/, 'WorkflowSchemaError must stay file-contract-owned');
  scan([abs('develop/lib/validate/workflow-validation.md'), ...walk(abs('develop/docs')), ...walk(abs('docs')), ...walk(abs('scripts')), ...walk(abs('workflows'))].filter(existsSync), /develop\/lib\/schemas\/workflow-schema\.mjs|develop\/lib\/entities\/Workflow\/schema\/|\.\.\/schemas\/workflow-schema\.mjs|from ['"].*\/schemas\/workflow-schema\.mjs/, 'docs/scripts must not cite old workflow schema owner');

  const apiRunner = readFileSync(abs('develop/lib/entrypoints/api/workflowRunner.mjs'), 'utf8');
  assertContains(apiRunner, /readPersistedRunState\(paths\)/, 'API runner must read persisted run-state before rendering');
  assertContains(apiRunner, /projectRuntimeRunState\(persisted\)/, 'API runner must project persisted run-state before rendering');
  assertContains(apiRunner, /assertLastResponseMatchesCurrentBaton\(lastResponse, current\.baton\)/, 'API runner must reject stale last-response baton before continue');
  assertContains(apiRunner, /lastResponse\.requests \?\? \[\]/, 'API runner must validate current lastResponse.requests when loading instructions');
  assertContains(apiRunner, /assertNamedOutputRefsMatchRequests\(parsedOutputRefs, requests\)/, 'API runner must validate host outputs against lastResponse.requests before continue');
  assertContains(apiRunner, /readInstructionDTO\(instructionPath, `instructions for workflow step \$\{stepId\}`\)/, 'API runner must read/validate committed instruction files before serving instructions');
  assertContains(apiRunner, /missing compiled instructions for workflow step/, 'API runner must fail when compiled instructions are missing');
}

function runNegativeBoundaryCheck(setup, teardown) {
  const before = process.exitCode;
  setup();
  selfTestMode = true;
  checkBoundaries();
  selfTestMode = false;
  const failed = process.exitCode !== 1;
  teardown();
  process.exitCode = before;
  return failed;
}

const batonFixture = abs('develop/lib/entities/Workflow/__boundary-negative-fixture.mjs');
const batonSelfTestFailed = runNegativeBoundaryCheck(
  () => writeFileSync(batonFixture, "import { batonSchema } from '../Baton/schema/baton-schema.mjs';\nvoid batonSchema;\n"),
  () => rmSync(batonFixture, { force: true }),
);
if (batonSelfTestFailed) fail('boundary negative self-test failed: forbidden Baton schema import was accepted');

const stepToWorkflowFixture = abs('develop/lib/entities/Step/__cross-entity-negative-fixture.mjs');
const stepToWorkflowSelfTestFailed = runNegativeBoundaryCheck(
  () => writeFileSync(stepToWorkflowFixture, "import '../Workflow/index.mjs';\n"),
  () => rmSync(stepToWorkflowFixture, { force: true }),
);
if (stepToWorkflowSelfTestFailed) fail('boundary negative self-test failed: Step owner Workflow import was accepted');

const workflowToStepFixture = abs('develop/lib/entities/Workflow/__cross-entity-negative-fixture.mjs');
const workflowToStepSelfTestFailed = runNegativeBoundaryCheck(
  () => writeFileSync(workflowToStepFixture, "import '../Step/index.mjs';\n"),
  () => rmSync(workflowToStepFixture, { force: true }),
);
if (workflowToStepSelfTestFailed) fail('boundary negative self-test failed: Workflow owner Step import was accepted');

checkBoundaries();
