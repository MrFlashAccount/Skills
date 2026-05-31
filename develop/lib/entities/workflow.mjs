import { invariant } from '../workflow/errors.mjs';
import { actionForStep, statusForStep } from '../workflow/model.mjs';
import { assertNoReservedWorkflowStepIds } from '../workflow/reserved-state.mjs';
import { assertBatonSchema, assertWorkflowSchema } from '../workflow/schema-validation.mjs';
import { assertProjectableStateSelector, isReservedStateKey, RESERVED_STEP_IDS } from '../workflow/state-keys.mjs';
import { assertTransitionDescriptorTargets, isDynamicTransitionNext, isStaticParallelNext, normalizeTransitionNext, resolveTransition } from '../workflow/transitions.mjs';
import { hasAppliedOutputForStep } from '../workflow/interpreter/output/response.mjs';
import { Baton } from './baton.mjs';

function dtoForBaton(baton) {
  return baton instanceof Baton ? baton.dto : baton;
}

/** Behavior wrapper over a workflow DTO. */
export class Workflow {
  constructor(dto) {
    this.dto = dto;
  }

  get name() { return this.dto?.name; }
  get start() { return this.dto?.start; }
  get done() { return this.dto?.done; }
  get blocked() { return this.dto?.blocked; }
  get steps() { return this.dto?.steps ?? {}; }

  step(stepId) {
    const step = this.steps[stepId];
    return step ? new Step(stepId, step, this) : undefined;
  }

  actionFor(stepId) {
    return actionForStep(this.steps[stepId]);
  }

  statusFor(stepId) {
    return statusForStep(this.dto, stepId, this.steps[stepId]);
  }

  transitionFor(stepId) {
    return normalizeTransitionNext(this.steps[stepId]?.next);
  }

  assertRuntimeState(batonInput) {
    const baton = dtoForBaton(batonInput);
    assertWorkflowSchema(this.dto);
    assertBatonSchema(baton);
    assertNoReservedWorkflowStepIds(this.dto);
    this.assertRootTargets();
    this.assertRuntimeStateBoundary();
    this.assertTransitionTargets();

    const cursorStep = this.steps[baton.cursor];
    invariant(cursorStep, `baton cursor not found in workflow: ${baton.cursor}`);

    const expectedStatus = this.statusFor(baton.cursor);
    invariant(
      baton.status === expectedStatus,
      `baton status '${baton.status}' is inconsistent with cursor '${baton.cursor}'; expected '${expectedStatus}'`,
    );

    return { workflow: this.dto, baton, cursorStep };
  }

  assertRootTargets() {
    const startStep = this.steps[this.start];
    invariant(startStep, `workflow start target not found: ${this.start}`);

    const doneStep = this.steps[this.done];
    invariant(doneStep, `workflow done target not found: ${this.done}`);
    invariant(doneStep.kind === 'done', `workflow done target '${this.done}' must be a done step`);

    const blockedStep = this.steps[this.blocked];
    invariant(blockedStep, `workflow blocked target not found: ${this.blocked}`);
    invariant(blockedStep.kind === 'blocked', `workflow blocked target '${this.blocked}' must be a blocked step`);
  }

  assertRuntimeStateBoundary() {
    for (const [stepId, step] of Object.entries(this.steps)) {
      invariant(
        !isReservedStateKey(stepId),
        `workflow step id '${stepId}' is reserved for runtime aggregate state; reserved ids: ${RESERVED_STEP_IDS.join(', ')}`,
      );

      for (const selector of step.input?.state ?? []) {
        try {
          assertProjectableStateSelector(selector, { stepId, errorPrefix: 'workflow runtime validation failed' });
        } catch (error) {
          if (error instanceof Error) invariant(false, error.message);
          throw error;
        }
        invariant(
          Object.hasOwn(this.steps, selector),
          `workflow runtime validation failed: step '${stepId}' input.state selector '${selector}' does not reference a declared workflow step`,
        );
      }
    }
  }

  assertTransitionTargets() {
    for (const [stepId, step] of Object.entries(this.steps)) {
      if (!Object.hasOwn(step, 'next')) continue;
      assertTransitionDescriptorTargets(this.dto, stepId, normalizeTransitionNext(step.next));
    }
  }

  preparedParallelStep(batonInput) {
    const baton = dtoForBaton(batonInput);
    const runtime = this.assertRuntimeState(baton);
    if (!hasAppliedOutputForStep(baton, baton.cursor)) return { ...runtime, step: runtime.cursorStep, parallelTargets: false };
    if (isStaticParallelNext(runtime.cursorStep.next)) return { ...runtime, step: runtime.cursorStep, parallelTargets: true };
    if (!isDynamicTransitionNext(runtime.cursorStep.next)) return { ...runtime, step: runtime.cursorStep, parallelTargets: false };

    const resolved = resolveTransition({ workflow: this.dto, baton, stepId: baton.cursor, step: runtime.cursorStep, output: baton.state[baton.cursor] });
    if (!resolved.targetStepIds) return { ...runtime, step: runtime.cursorStep, parallelTargets: false };
    return { ...runtime, step: { ...runtime.cursorStep, next: resolved.targetStepIds }, parallelTargets: true };
  }

  isStaticParallelStep(step) {
    return isStaticParallelNext(step?.next);
  }

}

/** Behavior wrapper over a step DTO. */
export class Step {
  constructor(id, dto, workflow) {
    this.id = id;
    this.dto = dto;
    this.workflow = workflow;
  }

  get kind() { return this.dto?.kind; }
  get input() { return this.dto?.input ?? {}; }
  get output() { return this.dto?.output ?? {}; }
  get next() { return this.dto?.next; }

  action() { return actionForStep(this.dto); }
  status() { return this.workflow ? statusForStep(this.workflow.dto, this.id, this.dto) : undefined; }
  normalizedNext() { return normalizeTransitionNext(this.next); }
}
