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
    'develop/lib/entities/errors.mjs',
    'develop/lib/entities/workflow-helpers',
    'develop/lib/entities/Workflow/schema',
    'develop/lib/entities/template-compiler',
    'develop/lib/entities/step-helpers',
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
    'develop/lib/schema-kernel/index.mjs',
    'develop/lib/persistence/workflow-resources/runtime-reader.mjs',
    'develop/lib/persistence/workflow-resources/workflow-file-reader.mjs',
    'develop/lib/persistence/workflow-resources/resource-resolver.mjs',
    'develop/lib/persistence/workflow-resources/output-schema-loader.mjs',
    'develop/lib/persistence/workflow-resources/role-material-catalog.mjs',
    'develop/lib/persistence/filesystem/path-safety.mjs',
    'develop/lib/entrypoints/api/runner/host-requests.mjs',
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

  scan(sourceFiles, /entities\/(Workflow|Step|Template|Baton)\.mjs|entities\/errors\.mjs|entities\/Workflow\/schema|entities\/(workflow-helpers|step-helpers|template-compiler)|resource-helpers|persistence\/(runner|WorkflowRuntimeReader|WorkflowFileReader|resource-resolver|role-material-catalog|json-io|path-utils|output-schema-validation|output-schema|RunStateFileWriter|RunStateFileReader|InstructionFileReader|InstructionFileWriter|TemplateFileReader)|persistence\/workflow-resources\/instruction-file-writer\.mjs|develop\/lib\/schemas|schemas\/output-schema-validation|dtos\/index\.mjs|RunStateDTO/, 'forbidden old workflow runtime surface reference');

  scan(walk(abs('develop/docs')), /develop\/lib\/entities\/(Workflow|Baton|Step|Template)\.mjs|develop\/lib\/entities\/Workflow\/schema\//, 'develop docs cite stale workflow runtime layout reference');

  scan(walk(abs('develop/lib/entities')), /from ['"].*persistence\//, 'entities must not import persistence');
  scan(walk(abs('develop/lib/entities')), /from ['"].*entrypoints\//, 'entities must not import entrypoints');
  scan(walk(abs('develop/lib/entities/Workflow')), /use-cases\/runtime\/output|entrypoints\/cli\/schema|persistence\/run-state\/schema|workflows\/dev-harness|dtos\//, 'Workflow owner imports forbidden external owner');
  scan(walk(abs('develop/lib/schema-kernel')), /from ['"].*(entities|use-cases|persistence|entrypoints|workflows\/dev-harness)\//, 'schema-kernel must remain infrastructure-only');
  scan(walk(abs('develop/lib/persistence/run-state')), /from ['"].*dtos\//, 'run-state persistence must not import DTOs');
  scan(walk(abs('develop/lib/persistence')), /from ['"].*use-cases\//, 'persistence must not import use-cases');
  scan([abs('develop/lib/schema-kernel/index.mjs'), ...walk(abs('develop/lib/schema-kernel'))], /WorkflowSchemaError/, 'schema-kernel must not use WorkflowSchemaError');
  scan([...walk(abs('develop/lib/entities/Baton')), ...walk(abs('develop/lib/use-cases')), ...walk(abs('develop/lib/persistence')), ...walk(abs('develop/lib/entrypoints'))], /WorkflowSchemaError/, 'WorkflowSchemaError must stay file-contract-owned');
  scan([abs('develop/lib/validate/workflow-validation.md'), ...walk(abs('develop/docs')), ...walk(abs('docs')), ...walk(abs('scripts')), ...walk(abs('workflows'))].filter(existsSync), /develop\/lib\/schemas\/workflow-schema\.mjs|develop\/lib\/entities\/Workflow\/schema\/|\.\.\/schemas\/workflow-schema\.mjs|from ['"].*\/schemas\/workflow-schema\.mjs/, 'docs/scripts must not cite old workflow schema owner');

  const apiRunner = readFileSync(abs('develop/lib/entrypoints/api/workflowRunner.mjs'), 'utf8');
  assertContains(apiRunner, /readPersistedRunState\(paths\)/, 'API runner must read persisted run-state before rendering');
  assertContains(apiRunner, /projectRuntimeRunState\(persisted\)/, 'API runner must project persisted run-state before rendering');
  assertContains(apiRunner, /assertLastResponseMatchesCurrentBaton\(lastResponse, current\.baton\)/, 'API runner must reject stale last-response baton before continue');
  assertContains(apiRunner, /assertLastResponseMatchesWorkflowPath\(lastResponse, paths\.workflowPath\)/, 'API runner must reject stale last-response workflow path before continue');
  assertContains(apiRunner, /lastResponse\.requests \?\? \[\]/, 'API runner must validate current lastResponse.requests when loading instructions');
  assertContains(apiRunner, /assertNamedOutputRefsMatchRequests\(parsedOutputRefs, requests\)/, 'API runner must validate host outputs against lastResponse.requests before continue');
  assertContains(apiRunner, /readInstructionDTO\(instructionPath, `instructions for workflow step \$\{stepId\}`\)/, 'API runner must read/validate committed instruction files before serving instructions');
  assertContains(apiRunner, /missing compiled instructions for workflow step/, 'API runner must fail when compiled instructions are missing');
}

const fixture = abs('develop/lib/entities/Workflow/__boundary-negative-fixture.mjs');
writeFileSync(fixture, "import '../../persistence/run-state/schema/runner-host-response-schema.mjs';\n");
const before = process.exitCode;
selfTestMode = true;
checkBoundaries();
selfTestMode = false;
const selfTestFailed = process.exitCode !== 1;
rmSync(fixture, { force: true });
process.exitCode = before;
if (selfTestFailed) fail('boundary negative self-test failed: forbidden Workflow import was accepted');
checkBoundaries();
