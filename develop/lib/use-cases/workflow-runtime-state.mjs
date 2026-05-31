import { Workflow } from '../entities/index.mjs';
import { Baton } from '../entities/baton.mjs';

function dtoForBaton(baton) {
  return baton instanceof Baton ? baton.dto : baton;
}

function requireRuntimeDependency(runtime, name) {
  const dependency = runtime?.[name];
  if (typeof dependency !== 'function') throw new Error(`${name} runtime dependency is required`);
  return dependency;
}

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function assertRootTargets(model) {
  const startStep = model.steps[model.start];
  invariant(startStep, `workflow start target not found: ${model.start}`);

  const doneStep = model.steps[model.done];
  invariant(doneStep, `workflow done target not found: ${model.done}`);
  invariant(doneStep.kind === 'done', `workflow done target '${model.done}' must be a done step`);

  const blockedStep = model.steps[model.blocked];
  invariant(blockedStep, `workflow blocked target not found: ${model.blocked}`);
  invariant(blockedStep.kind === 'blocked', `workflow blocked target '${model.blocked}' must be a blocked step`);
}

function assertRuntimeStateBoundary(model, runtime) {
  const isReservedStateKey = requireRuntimeDependency(runtime, 'isReservedStateKey');
  const assertProjectableStateSelector = requireRuntimeDependency(runtime, 'assertProjectableStateSelector');
  const reservedStepIds = runtime.RESERVED_STEP_IDS ?? [];

  for (const [stepId, step] of Object.entries(model.steps)) {
    invariant(
      !isReservedStateKey(stepId),
      `workflow step id '${stepId}' is reserved for runtime aggregate state; reserved ids: ${reservedStepIds.join(', ')}`,
    );

    for (const selector of step.input?.state ?? []) {
      assertProjectableStateSelector(selector, { stepId, errorPrefix: 'workflow runtime validation failed' });
      invariant(
        Object.hasOwn(model.steps, selector),
        `workflow runtime validation failed: step '${stepId}' input.state selector '${selector}' does not reference a declared workflow step`,
      );
    }
  }
}

function assertTransitionTargets(model, runtime) {
  const assertTransitionDescriptorTargets = requireRuntimeDependency(runtime, 'assertTransitionDescriptorTargets');
  const normalizeTransitionNext = requireRuntimeDependency(runtime, 'normalizeTransitionNext');

  for (const [stepId, step] of Object.entries(model.steps)) {
    if (!Object.hasOwn(step, 'next')) continue;
    assertTransitionDescriptorTargets(model.dto, stepId, normalizeTransitionNext(step.next));
  }
}

/** Validates workflow+baton DTOs at the runtime boundary and returns normalized runtime context. */
export function assertRuntimeWorkflowState({ workflow, baton: batonInput, runtime }) {
  const model = new Workflow(workflow);
  const baton = dtoForBaton(batonInput);
  requireRuntimeDependency(runtime, 'assertWorkflowSchema')(model.dto);
  requireRuntimeDependency(runtime, 'assertBatonSchema')(baton);
  requireRuntimeDependency(runtime, 'assertNoReservedWorkflowStepIds')(model.dto);
  assertRootTargets(model);
  assertRuntimeStateBoundary(model, runtime);
  assertTransitionTargets(model, runtime);

  const cursorStep = model.steps[baton.cursor];
  invariant(cursorStep, `baton cursor not found in workflow: ${baton.cursor}`);

  const expectedStatus = model.statusFor(baton.cursor);
  invariant(
    baton.status === expectedStatus,
    `baton status '${baton.status}' is inconsistent with cursor '${baton.cursor}'; expected '${expectedStatus}'`,
  );

  return { workflow: model.dto, baton, cursorStep, model };
}

/** Resolves whether the current runtime state should render/apply a prepared parallel branch. */
export function prepareWorkflowRuntimeStep({ workflow, baton, runtime }) {
  const hasAppliedOutputForStep = requireRuntimeDependency(runtime, 'hasAppliedOutputForStep');
  const isStaticParallelNext = requireRuntimeDependency(runtime, 'isStaticParallelNext');
  const isDynamicTransitionNext = requireRuntimeDependency(runtime, 'isDynamicTransitionNext');
  const resolveTransition = requireRuntimeDependency(runtime, 'resolveTransition');

  const prepared = assertRuntimeWorkflowState({ workflow, baton, runtime });
  if (!hasAppliedOutputForStep(prepared.baton, prepared.baton.cursor)) return { ...prepared, step: prepared.cursorStep, parallelTargets: false };
  if (isStaticParallelNext(prepared.cursorStep.next)) return { ...prepared, step: prepared.cursorStep, parallelTargets: true };
  if (!isDynamicTransitionNext(prepared.cursorStep.next)) return { ...prepared, step: prepared.cursorStep, parallelTargets: false };

  const resolved = resolveTransition({
    workflow: prepared.workflow,
    baton: prepared.baton,
    stepId: prepared.baton.cursor,
    step: prepared.cursorStep,
    output: prepared.baton.state[prepared.baton.cursor],
  });
  if (!resolved.targetStepIds) return { ...prepared, step: prepared.cursorStep, parallelTargets: false };
  return { ...prepared, step: { ...prepared.cursorStep, next: resolved.targetStepIds }, parallelTargets: true };
}

export function isStaticParallelRuntimeStep(step, runtime) {
  return requireRuntimeDependency(runtime, 'isStaticParallelNext')(step?.next);
}
