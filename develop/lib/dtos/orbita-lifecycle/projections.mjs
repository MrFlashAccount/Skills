import { normalizeOrbitaIntakePacket } from '../../entities/orbita-lifecycle/intake.mjs';

export function projectOrbitaIntake(intake) {
  if (!intake) return undefined;
  const candidateRefs = Array.isArray(intake.matched_refs) ? intake.matched_refs.map((match) => match?.ref ?? match).filter(Boolean) : [];
  const safeIntake = normalizeOrbitaIntakePacket(intake, { candidateRefs });
  const projected = {
    intake_status: safeIntake.intake_status,
    match_status: safeIntake.match_status,
    matched_refs: safeIntake.matched_refs,
    confidence: safeIntake.confidence,
    brief_available: Boolean(safeIntake.internal_private_clean_brief),
  };
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
