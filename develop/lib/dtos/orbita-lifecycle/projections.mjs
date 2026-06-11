import { normalizeOrbitaIntakePacket } from '../../entities/orbita-lifecycle/intake.mjs';

export function projectOrbitaIntake(intake) {
  if (!intake) return undefined;
  const safeIntake = normalizeOrbitaIntakePacket(intake);
  const projected = {
    intake_status: safeIntake.intake_status,
    task_kind: safeIntake.task_kind,
    confidence: safeIntake.confidence,
    selected_workflow: safeIntake.selected_workflow,
    candidate_options: safeIntake.candidate_options,
    proposed_path: safeIntake.proposed_path,
    brief_available: Boolean(safeIntake.clean_subagent_brief && safeIntake.clean_subagent_brief_safe === true),
    degradation_reason: safeIntake.degradation_reason,
  };
  if (safeIntake.clean_subagent_brief && safeIntake.clean_subagent_brief_safe === true) {
    projected.clean_subagent_brief = safeIntake.clean_subagent_brief;
  }
  return projected;
}

export function projectOrbitaRun(run) {
  if (!run) return null;
  return {
    run_id: run.run_id,
    kind: run.kind,
    state: run.state,
    runtime_gap: run.runtime_gap,
    delivery: run.delivery,
    intake: projectOrbitaIntake(run.intake),
    created_at: run.created_at,
    updated_at: run.updated_at,
    revision: run.revision,
  };
}

export function projectOrbitaResult(result = {}) {
  return {
    ok: result.ok === true,
    mode: result.mode,
    experimental: true,
    surface: 'orbita_lifecycle',
    run: projectOrbitaRun(result.run),
    runs: Array.isArray(result.runs) ? result.runs.map(projectOrbitaRun) : undefined,
    active_count: result.activeCount,
    dry_run: result.dryRun === true || undefined,
    runtime_gap: result.runtimeGap,
    delivery: result.delivery ?? result.run?.delivery,
    diagnostics: result.diagnostics,
    message: result.message,
  };
}
