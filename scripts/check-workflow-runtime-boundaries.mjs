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

function assertNotContains(text, pattern, message) {
  if (pattern.test(text)) fail(message);
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
  const match = relativePath.match(/^skills\/orbita\/lib\/entities\/([^/]+)\//);
  return match?.[1];
}

function assertNoCrossEntityImports(entries = walk(abs('skills/orbita/lib/entities')).filter((file) => /\.(?:mjs|js|json)$/.test(file))) {
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
    ...walk(abs('skills/orbita/lib')),
    ...walk(abs('workflows')),
    existsSync(abs('README.md')) ? abs('README.md') : undefined,
  ].filter(Boolean).filter((file) => /\.(mjs|js|json|md)$/.test(file));

  const forbiddenPaths = [
    'skills/orbita/lib/entities/Workflow.mjs',
    'skills/orbita/lib/entities/Step.mjs',
    'skills/orbita/lib/entities/Template.mjs',
    'skills/orbita/lib/entities/Baton.mjs',
    'skills/orbita/lib/entities/Workflow/expression.mjs',
    'skills/orbita/lib/entities/Workflow/role-ref.mjs',
    'skills/orbita/lib/entities/Workflow/state-keys.mjs',
    'skills/orbita/lib/entities/Workflow/status.mjs',
    'skills/orbita/lib/entities/Workflow/transition-next.mjs',
    'skills/orbita/lib/entities/Workflow/transition-targets.mjs',
    'skills/orbita/lib/entities/Step/projection.mjs',
    'skills/orbita/lib/entities/Step/expressions/parse.mjs',
    'skills/orbita/lib/entities/Step/transition-targets.mjs',
    'skills/orbita/lib/entities/errors.mjs',
    'skills/orbita/lib/entities/workflow-helpers',
    'skills/orbita/lib/entities/Workflow/schema',
    'skills/orbita/lib/entities/template-compiler',
    'skills/orbita/lib/entities/step-helpers',
    'skills/orbita/lib/entities/transition-next.mjs',
    'skills/orbita/lib/entities/workflow-semantic-validation-context.mjs',
    'skills/orbita/lib/resource-helpers',
    'skills/orbita/lib/persistence/runner',
    'skills/orbita/lib/persistence/WorkflowRuntimeReader.mjs',
    'skills/orbita/lib/persistence/WorkflowFileReader.mjs',
    'skills/orbita/lib/persistence/resource-resolver.mjs',
    'skills/orbita/lib/persistence/role-material-catalog.mjs',
    'skills/orbita/lib/persistence/output-schema.mjs',
    'skills/orbita/lib/persistence/output-schema-validation.mjs',
    'skills/orbita/lib/persistence/json-io.mjs',
    'skills/orbita/lib/persistence/path-utils.mjs',
    'skills/orbita/lib/persistence/RunStateFileWriter.mjs',
    'skills/orbita/lib/persistence/RunStateFileReader.mjs',
    'skills/orbita/lib/persistence/InstructionFileReader.mjs',
    'skills/orbita/lib/persistence/InstructionFileWriter.mjs',
    'skills/orbita/lib/persistence/workflow-resources/instruction-file-writer.mjs',
    'skills/orbita/lib/persistence/TemplateFileReader.mjs',
    'skills/orbita/lib/use-cases/runtime/parallel/targets.mjs',
    'skills/orbita/lib/dtos/index.mjs',
    'skills/orbita/lib/dtos/RunStateDTO.mjs',
    'skills/orbita/lib/schemas',
  ];
  forbiddenPaths.forEach(assertAbsent);

  [
    'skills/orbita/lib/entities/Workflow/index.mjs',
    'skills/orbita/lib/entities/Step/index.mjs',
    'skills/orbita/lib/entities/Template/index.mjs',
    'skills/orbita/lib/entities/Baton/index.mjs',
    'skills/orbita/lib/runtime/baton-state.mjs',
    'skills/orbita/lib/runtime/expression.mjs',
    'skills/orbita/lib/runtime/role-ref.mjs',
    'skills/orbita/lib/runtime/state-keys.mjs',
    'skills/orbita/lib/runtime/state-projection.mjs',
    'skills/orbita/lib/runtime/step-status.mjs',
    'skills/orbita/lib/runtime/transition-next.mjs',
    'skills/orbita/lib/runtime/transition-targets.mjs',
    'skills/orbita/lib/persistence/workflow-resources/runtime-reader.mjs',
    'skills/orbita/lib/persistence/workflow-resources/workflow-file-reader.mjs',
    'skills/orbita/lib/persistence/workflow-resources/resource-resolver.mjs',
    'skills/orbita/lib/persistence/workflow-resources/output-schema-loader.mjs',
    'skills/orbita/lib/persistence/workflow-resources/role-material-catalog.mjs',
    'skills/orbita/lib/persistence/filesystem/path-safety.mjs',
    'skills/orbita/lib/entrypoints/api/runner/host-requests.mjs',
    'skills/orbita/lib/use-cases/workflow-semantic-validation.mjs',
    'skills/orbita/lib/use-cases/runtime/output/output-schema-validation.mjs',
    'skills/orbita/lib/file-contracts/workflow-document.json',
    'skills/orbita/lib/file-contracts/workflow-document-schema.mjs',
    'skills/orbita/lib/entities/Baton/schema/baton.json',
    'skills/orbita/lib/entities/Baton/schema/baton-schema.mjs',
    'skills/orbita/lib/use-cases/runtime/output/schema/worker-output.json',
    'skills/orbita/lib/use-cases/runtime/output/schema/workflow-interpreter-response.json',
    'skills/orbita/lib/entrypoints/cli/schema/workflow-interpreter-args.json',
  ].forEach(assertExists);

  scan(sourceFiles, /entities\/(Workflow|Step|Template|Baton)\.mjs|entities\/errors\.mjs|entities\/Workflow\/schema|entities\/Workflow\/(expression|transition-next|transition-targets|state-keys|role-ref|status)\.mjs|entities\/(workflow-helpers|step-helpers|template-compiler)|entities\/Step\/(expressions\/parse|projection|transition-targets)\.mjs|resource-helpers|persistence\/(runner|WorkflowRuntimeReader|WorkflowFileReader|resource-resolver|role-material-catalog|json-io|path-utils|output-schema-validation|output-schema|RunStateFileWriter|RunStateFileReader|InstructionFileReader|InstructionFileWriter|TemplateFileReader)|persistence\/workflow-resources\/instruction-file-writer\.mjs|use-cases\/runtime\/parallel\/targets\.mjs|skills\/orbita\/lib\/schemas|schemas\/output-schema-validation|dtos\/index\.mjs|RunStateDTO/, 'forbidden old workflow runtime surface reference');
  scan(sourceFiles, /applyOutputToBatonState[^\n]*entities\/Baton\/index\.mjs|entities\/Baton\/index\.mjs[^\n]*applyOutputToBatonState/, 'forbidden Baton helper import path');

  scan(walk(abs('skills/orbita/docs')), /skills\/orbita\/lib\/entities\/(Workflow|Baton|Step|Template)\.mjs|skills\/orbita\/lib\/entities\/Workflow\/schema\//, 'develop docs cite stale workflow runtime layout reference');

  scan(walk(abs('skills/orbita/lib/entities')), /from ['"].*persistence\//, 'entities must not import persistence');
  scan(walk(abs('skills/orbita/lib/entities')), /from ['"].*entrypoints\//, 'entities must not import entrypoints');
  scan(walk(abs('skills/orbita/lib/entities/Template/compiler')), /from ['"].*use-cases\//, 'Template compiler must render DTOs without importing runtime use-cases');
  scan(walk(abs('skills/orbita/lib/entities/Workflow')), /use-cases\/runtime\/output|entrypoints\/cli\/schema|persistence\/run-state\/schema|workflows\/dev-harness|dtos\//, 'Workflow owner imports forbidden external owner');
  scan(walk(abs('skills/orbita/lib/entities')).filter((file) => !rel(file).startsWith('skills/orbita/lib/entities/Baton/')), /from ['"].*Baton\/schema\//, 'entities outside Baton owner must not import Baton schema owner');
  assertNoCrossEntityImports();
  scan(walk(abs('skills/orbita/lib/persistence/run-state')), /from ['"].*dtos\//, 'run-state persistence must not import DTOs');
  scan(walk(abs('skills/orbita/lib/persistence')), /from ['"].*use-cases\//, 'persistence must not import use-cases');
  scan([...walk(abs('skills/orbita/lib/entities/Baton')), ...walk(abs('skills/orbita/lib/use-cases')), ...walk(abs('skills/orbita/lib/persistence')), ...walk(abs('skills/orbita/lib/entrypoints'))], /WorkflowSchemaError/, 'WorkflowSchemaError must stay file-contract-owned');
  scan([abs('skills/orbita/lib/validate/workflow-validation.md'), ...walk(abs('skills/orbita/docs')), ...walk(abs('docs')), ...walk(abs('scripts')), ...walk(abs('workflows'))].filter(existsSync), /skills\/orbita\/lib\/schemas\/workflow-schema\.mjs|skills\/orbita\/lib\/entities\/Workflow\/schema\/|\.\.\/schemas\/workflow-schema\.mjs|from ['"].*\/schemas\/workflow-schema\.mjs/, 'docs/scripts must not cite old workflow schema owner');

  const apiRunner = readFileSync(abs('skills/orbita/lib/entrypoints/api/workflowRunner.mjs'), 'utf8');
  assertContains(apiRunner, /readPersistedRunState\(paths\)/, 'API runner must read persisted run-state before rendering');
  assertContains(apiRunner, /renderCurrentHostResponse\(paths, current\.baton/, 'API runner must derive current host response from persisted baton');
  assertContains(apiRunner, /response\.requests \?\? \[\]/, 'API runner must validate current rendered response.requests');
  assertContains(apiRunner, /assertNamedOutputRefsMatchRequests\(parsedOutputRefs, requests\)/, 'API runner must validate host outputs against current rendered requests before continue');
  assertContains(apiRunner, /currentRequestForStep\(response, stepId\)/, 'API runner must validate instruction and output step ids against current rendered requests');
  assertContains(apiRunner, /renderStepInstructionsForStep\(renderedStep/, 'API runner must delegate step instruction rendering');

  const workerInstructionRenderer = readFileSync(abs('skills/orbita/lib/entities/Template/compiler/worker-instruction-renderer.mjs'), 'utf8');
  assertContains(workerInstructionRenderer, /missing compiled instructions for workflow step/, 'Template worker instruction renderer must fail when compiled instructions are missing');
  assertAbsent('skills/orbita/lib/entrypoints/api/runner/host-instructions/registry.mjs');
  assertAbsent('skills/orbita/lib/entrypoints/api/runner/host-instructions/approval-projection.mjs');
  assertAbsent('skills/orbita/lib/entrypoints/api/runner/host-instructions/approval-renderer.mjs');
  assertAbsent('skills/orbita/lib/entrypoints/api/runner/host-instructions/worker-renderer.mjs');

  const stepRenderPipeline = readFileSync(abs('skills/orbita/lib/use-cases/runtime/parallel/render.mjs'), 'utf8');
  assertContains(stepRenderPipeline, /renderExecutableStep/, 'Runtime prompt rendering must delegate executable step rendering');
  const stepRendererRegistry = readFileSync(abs('skills/orbita/lib/use-cases/runtime/renderers/registry.mjs'), 'utf8');
  assertContains(stepRendererRegistry, /approvalStepRenderer/, 'Runtime step renderer registry must register approval renderer');
  assertContains(stepRendererRegistry, /workflowStepRenderer/, 'Runtime step renderer registry must register workflow renderer');
  assertContains(stepRendererRegistry, /new Template\(\)\.render\(projection, renderer\.kind/, 'Runtime step rendering must route projection DTOs through Template.render(kind)');
  const hostInstructionPipeline = readFileSync(abs('skills/orbita/lib/use-cases/runtime/host-instructions/pipeline.mjs'), 'utf8');
  assertContains(hostInstructionPipeline, /new Template\(\)\.render\(projection, kind/, 'Host instruction use case must route projection DTOs through Template.render(kind)');
  const approvalInstructionProjection = readFileSync(abs('skills/orbita/lib/use-cases/runtime/host-instructions/approval-projection.mjs'), 'utf8');
  assertNotContains(approvalInstructionProjection, /step\?\.step|\.step\.next|next\.match|normalizeTransitionNext|parsePathExpression/, 'Host approval instruction projection must consume compiled approvalPrompt data instead of parsing raw workflow steps');
  const apiHostInstructionPipeline = readFileSync(abs('skills/orbita/lib/entrypoints/api/runner/host-instructions/pipeline.mjs'), 'utf8');
  assertContains(apiHostInstructionPipeline, /renderRuntimeStepInstructionsForStep/, 'API host-instruction adapter must delegate instruction rendering to runtime use case');
  assertNotContains(apiHostInstructionPipeline, /renderApprovalInstructionProjection|renderWorkerStepInstructions/, 'API host-instruction adapter must not own concrete renderers');
  scan(walk(abs('skills/orbita/lib/entrypoints/api/runner/host-instructions')), /new Template\(\)\.render|from ['"].*entities\/Template/, 'API host-instruction adapters must not render through Template directly');
  const workflowRenderer = readFileSync(abs('skills/orbita/lib/use-cases/runtime/renderers/workflow-renderer.mjs'), 'utf8');
  assertContains(workflowRenderer, /buildWorkflowStepProjection/, 'Workflow renderer must build an explicit step projection');
  assertNotContains(workflowRenderer, /renderWorkflowPrompt/, 'Workflow renderer must not delegate back to the old Template prompt renderer');
  const templateCompiler = readFileSync(abs('skills/orbita/lib/entities/Template/compiler/index.mjs'), 'utf8');
  assertContains(templateCompiler, /renderWorkflowStepProjection/, 'Template compiler must expose workflow projection renderer');
  assertContains(templateCompiler, /renderApprovalStepProjection/, 'Template compiler must expose approval projection renderer');
  assertContains(templateCompiler, /renderApprovalInstructionProjection/, 'Template compiler must expose approval host-instruction renderer');
  assertContains(templateCompiler, /renderWorkerInstructionProjection/, 'Template compiler must expose worker host-instruction renderer');
  assertNotContains(templateCompiler, /approvalPromptLayer|approvalWorkflowInstruction|step\.kind === ['"]approval['"]/, 'Template compiler must not own approval host projection');
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

const batonFixture = abs('skills/orbita/lib/entities/Workflow/__boundary-negative-fixture.mjs');
const batonSelfTestFailed = runNegativeBoundaryCheck(
  () => writeFileSync(batonFixture, "import { batonSchema } from '../Baton/schema/baton-schema.mjs';\nvoid batonSchema;\n"),
  () => rmSync(batonFixture, { force: true }),
);
if (batonSelfTestFailed) fail('boundary negative self-test failed: forbidden Baton schema import was accepted');

const stepToWorkflowFixture = abs('skills/orbita/lib/entities/Step/__cross-entity-negative-fixture.mjs');
const stepToWorkflowSelfTestFailed = runNegativeBoundaryCheck(
  () => writeFileSync(stepToWorkflowFixture, "import '../Workflow/index.mjs';\n"),
  () => rmSync(stepToWorkflowFixture, { force: true }),
);
if (stepToWorkflowSelfTestFailed) fail('boundary negative self-test failed: Step owner Workflow import was accepted');

const workflowToStepFixture = abs('skills/orbita/lib/entities/Workflow/__cross-entity-negative-fixture.mjs');
const workflowToStepSelfTestFailed = runNegativeBoundaryCheck(
  () => writeFileSync(workflowToStepFixture, "import '../Step/index.mjs';\n"),
  () => rmSync(workflowToStepFixture, { force: true }),
);
if (workflowToStepSelfTestFailed) fail('boundary negative self-test failed: Workflow owner Step import was accepted');

checkBoundaries();
