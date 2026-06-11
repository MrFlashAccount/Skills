export function projectOrbitaRun(run) {
  if (!run) return null;
  return {
    run_id: run.run_id,
    kind: run.kind,
    state: run.state,
    runtime_gap: run.runtime_gap,
    delivery: run.delivery,
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
