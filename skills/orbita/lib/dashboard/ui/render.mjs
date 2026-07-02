import { dashboardCopy, dashboardLaneIds, dashboardLanes, fallbackLaneId } from './constants.mjs';

const runnerControlPattern = /\b(next|continue|write-output|bind-agent|retry|rerun|repair|move|drag|drop)\b/i;

export function renderDashboardShell(snapshot = {}, options = {}) {
  const title = escapeHtml(options.title ?? 'Orbita Dashboard');
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <link rel="stylesheet" href="${escapeAttribute(options.stylesHref ?? '/dashboard/style.css')}">
</head>
<body>
${renderDashboard(snapshot)}
  <script type="module" src="${escapeAttribute(options.clientSrc ?? '/dashboard/client.js')}"></script>
</body>
</html>`;
}

export function renderDashboard(snapshot = {}) {
  const runs = filterRuns(normalizeRuns(snapshot.runs), snapshot.searchQuery);
  const selectedRunId = Object.hasOwn(snapshot, 'selectedRunId') ? snapshot.selectedRunId : runs[0]?.id;
  const selectedRun = runs.find((run) => run.id === selectedRunId);
  const rootLabel = snapshot.rootLabel || dashboardCopy.emptyRoot;
  const freshness = snapshot.freshnessLabel ?? relativeTimeLabel(snapshot.generatedAt);
  const counts = countsByLane(runs);

  return `<main class="orbita-dashboard" data-read-only="true">
  <header class="topbar" aria-label="Dashboard status">
    <div>
      <p class="eyebrow">Orbita runs</p>
      <h1>Read-only workflow board</h1>
    </div>
    <div class="topbar__meta">
      <span class="source-pill" title="${escapeAttribute(rootLabel)}">${escapeHtml(rootLabel)}</span>
      <label class="search-label">
        <span>Search</span>
        <input type="search" name="q" autocomplete="off" placeholder="Filter runs" value="${escapeAttribute(snapshot.searchQuery ?? '')}">
      </label>
      <span class="freshness" aria-live="polite">${escapeHtml(freshness)}</span>
      <span class="run-count">${runs.length} runs</span>
    </div>
  </header>
  <section class="board-shell" aria-label="Runs board">
    <div class="board" data-lane-count="${dashboardLanes.length}">
${dashboardLanes.map((lane) => renderLane(lane, runs, counts.get(lane.id) ?? 0, selectedRunId)).join('\n')}
    </div>
    ${renderDrawer(selectedRun)}
  </section>
</main>`;
}

export function normalizeRuns(runs = []) {
  if (!Array.isArray(runs)) return [];
  return runs.map((run) => {
    const id = String(run.runId ?? run.id ?? '');
    const laneId = dashboardLaneIds.has(run.lane?.id) ? run.lane.id : (dashboardLaneIds.has(run.laneId) ? run.laneId : fallbackLaneId);
    const cursorBranches = normalizeCursorBranches(run.cursorBranches ?? run.cursor);
    return {
      id,
      laneId,
      title: run.title || run.summary || run.promptSummary || 'Untitled run',
      summary: run.summary,
      workflowName: run.workflowName || run.workflow?.identity || 'Unknown workflow',
      stepId: run.stepId || run.currentStepId || run.cursor?.display || cursorBranches[0] || 'unknown_step',
      statusLabel: run.statusLabel || run.lane?.label || labelForLane(laneId),
      updatedAt: run.updatedAt,
      createdAt: run.createdAt,
      cursorBranches,
      artifacts: normalizeArtifacts(run.artifacts),
      historyExcerpt: normalizeHistoryExcerpt(run.historyExcerpt),
      diagnostics: normalizeDiagnostics(run),
      miniMap: normalizeMiniMap(run.miniMap),
      miniMapProvenance: run.miniMap?.provenance,
    };
  });
}

function renderLane(lane, runs, count, selectedRunId) {
  const laneRuns = runs.filter((run) => run.laneId === lane.id);
  return `      <section class="lane lane--${lane.tone}" aria-labelledby="lane-${lane.id}">
        <header class="lane__header">
          <h2 id="lane-${lane.id}">${escapeHtml(lane.label)}</h2>
          <span class="lane__count">${count}</span>
        </header>
        <div class="lane__cards">
${laneRuns.length > 0 ? laneRuns.map((run) => renderRunCard(run, run.id === selectedRunId)).join('\n') : renderEmptyLane(lane)}
        </div>
      </section>`;
}

function renderRunCard(run, selected) {
  const selectedAttribute = selected ? ' aria-current="true"' : '';
  return `          <article class="run-card${selected ? ' run-card--selected' : ''}" tabindex="0" data-run-id="${escapeAttribute(run.id)}"${selectedAttribute}>
            <div class="run-card__topline">
              <span class="status-chip status-chip--${escapeAttribute(run.laneId)}">${escapeHtml(run.statusLabel)}</span>
              <time datetime="${escapeAttribute(run.updatedAt ?? '')}">${escapeHtml(run.updatedAge ?? relativeTimeLabel(run.updatedAt))}</time>
            </div>
            <h3>${escapeHtml(run.title)}</h3>
            <dl class="run-card__meta">
              <div><dt>Run</dt><dd><code>${escapeHtml(shortRunId(run.id))}</code></dd></div>
              <div><dt>Workflow</dt><dd>${escapeHtml(run.workflowName)}</dd></div>
              <div><dt>Step</dt><dd><code>${escapeHtml(run.stepId)}</code></dd></div>
            </dl>
            ${renderCursorChips(run.cursorBranches, 'card')}
          </article>`;
}

function renderDrawer(run) {
  if (!run) {
    return `<aside class="drawer drawer--empty" aria-label="Run details">
      <p>${escapeHtml(dashboardCopy.drawerEmpty)}</p>
    </aside>`;
  }

  return `<aside class="drawer" aria-label="Run details" data-run-id="${escapeAttribute(run.id)}" tabindex="-1">
    <header class="drawer__header">
      <p class="eyebrow">Run details</p>
      <h2>${escapeHtml(run.title)}</h2>
      <p class="drawer__summary">${escapeHtml(run.summary ?? run.promptSummary ?? '')}</p>
    </header>
    <dl class="drawer__facts">
      <div><dt>Run id</dt><dd><code>${escapeHtml(run.id)}</code></dd></div>
      <div><dt>Workflow</dt><dd>${escapeHtml(run.workflowName)}</dd></div>
      <div><dt>Current status</dt><dd>${escapeHtml(run.statusLabel)}</dd></div>
      <div><dt>Current step</dt><dd><code>${escapeHtml(run.stepId)}</code></dd></div>
    </dl>
    ${renderCursorChips(run.cursorBranches, 'drawer')}
    ${renderMiniMap(run.miniMap, run.cursorBranches, run.miniMapProvenance)}
    ${renderArtifacts(run.artifacts)}
    ${renderHistory(run.historyExcerpt)}
    ${renderDiagnostics(run.diagnostics)}
  </aside>`;
}

function renderCursorChips(cursorBranches, scope) {
  if (cursorBranches.length === 0) return '';
  return `<div class="cursor-chips cursor-chips--${scope}" aria-label="Active cursor branches">
${cursorBranches.map((branch) => `              <span class="cursor-chip"><code>${escapeHtml(branch)}</code></span>`).join('\n')}
            </div>`;
}

function renderMiniMap(steps, cursorBranches, provenance) {
  if (steps.length === 0) return '';
  const active = new Set(cursorBranches);
  return `<section class="drawer-section mini-map" data-secondary-surface="mini-map" aria-label="${dashboardCopy.minimapLabel}">
      <h3>Workflow mini-map</h3>
      <ol>
${steps.map((step) => {
  const id = String(step.id ?? step.stepId ?? '');
  const state = active.has(id) ? 'active' : step.state || 'pending';
  return `        <li class="mini-map__step mini-map__step--${escapeAttribute(state)}"><code>${escapeHtml(id)}</code><span>${escapeHtml(state)}</span></li>`;
}).join('\n')}
      </ol>
      ${provenance ? `<p class="mini-map__provenance">${escapeHtml(provenance)}</p>` : ''}
    </section>`;
}

function renderArtifacts(artifacts) {
  if (artifacts.length === 0) return '';
  return `<section class="drawer-section" aria-label="Artifacts">
      <h3>Artifacts</h3>
      <ul class="artifact-list">
${artifacts.map((artifact) => `        <li><code>${escapeHtml(artifact.id ?? artifact.name ?? 'artifact')}</code><span>${escapeHtml(artifact.summary ?? artifact.contentType ?? '')}</span></li>`).join('\n')}
      </ul>
    </section>`;
}

function renderHistory(historyExcerpt) {
  if (historyExcerpt.length === 0) return '';
  return `<section class="drawer-section" aria-label="Bounded history excerpt">
      <h3>Bounded history excerpt</h3>
      <ol class="history-list">
${historyExcerpt.slice(0, 6).map((entry) => `        <li><time datetime="${escapeAttribute(entry.at ?? '')}">${escapeHtml(entry.age ?? entry.at ?? '')}</time><span>${escapeHtml(redactControlText(entry.summary ?? ''))}</span></li>`).join('\n')}
      </ol>
    </section>`;
}

function renderDiagnostics(diagnostics) {
  if (diagnostics.length === 0) return '';
  return `<section class="drawer-section diagnostics" aria-label="Degraded diagnostics">
      <h3>Degraded diagnostics</h3>
      <ul>
${diagnostics.map((diagnostic) => `        <li><strong>${escapeHtml(diagnostic.severity ?? 'info')}</strong><span>${escapeHtml(diagnostic.message ?? diagnostic.summary ?? '')}</span></li>`).join('\n')}
      </ul>
    </section>`;
}

function renderEmptyLane(lane) {
  const message = lane.id === fallbackLaneId ? 'No degraded reads' : dashboardCopy.emptyResults;
  return `          <p class="lane__empty">${escapeHtml(message)}</p>`;
}

function countsByLane(runs) {
  const counts = new Map(dashboardLanes.map((lane) => [lane.id, 0]));
  for (const run of runs) counts.set(run.laneId, (counts.get(run.laneId) ?? 0) + 1);
  return counts;
}

function filterRuns(runs, searchQuery = '') {
  const query = String(searchQuery ?? '').trim().toLowerCase();
  if (!query) return runs;
  return runs.filter((run) => [
    run.id,
    run.title,
    run.summary,
    run.workflowName,
    run.stepId,
    run.statusLabel,
  ].some((value) => String(value ?? '').toLowerCase().includes(query)));
}

function normalizeCursorBranches(cursor) {
  if (Array.isArray(cursor)) return cursor.map((item) => String(item.stepId ?? item.id ?? item)).filter(Boolean);
  if (Array.isArray(cursor?.steps)) return cursor.steps.map((step) => String(step)).filter(Boolean);
  if (cursor && typeof cursor === 'object') return [String(cursor.stepId ?? cursor.id ?? '')].filter(Boolean);
  if (typeof cursor === 'string') return [cursor];
  return [];
}

function normalizeArtifacts(artifacts) {
  if (!Array.isArray(artifacts)) return [];
  return artifacts.map((artifact) => ({
    id: artifact.id,
    contentType: artifact.contentType ?? artifact.content_type,
    summary: artifact.summary,
  }));
}

function normalizeHistoryExcerpt(historyExcerpt) {
  if (Array.isArray(historyExcerpt)) return historyExcerpt;
  if (Array.isArray(historyExcerpt?.lines)) {
    return historyExcerpt.lines.map((line) => ({ summary: line }));
  }
  return [];
}

function normalizeDiagnostics(run) {
  if (Array.isArray(run.diagnostics)) return run.diagnostics;
  if (run.degraded) return [{ severity: 'warning', message: run.degraded.message ?? run.degraded.reason ?? 'degraded read' }];
  return [];
}

function normalizeMiniMap(miniMap) {
  if (Array.isArray(miniMap)) return miniMap;
  if (!miniMap || typeof miniMap !== 'object') return [];
  const current = new Set(Array.isArray(miniMap.currentSteps) ? miniMap.currentSteps : []);
  const completed = new Set(Array.isArray(miniMap.completedSteps) ? miniMap.completedSteps : []);
  const ids = [...new Set([...completed, ...current])];
  return ids.map((id) => ({
    id,
    state: current.has(id) ? 'active' : 'completed',
  }));
}

function labelForLane(laneId) {
  return dashboardLanes.find((lane) => lane.id === laneId)?.label ?? 'Degraded';
}

function shortRunId(runId) {
  return runId.length > 18 ? `${runId.slice(0, 10)}...${runId.slice(-6)}` : runId;
}

function relativeTimeLabel(value) {
  if (!value) return 'freshness unknown';
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return String(value);
  const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.round(minutes / 60)}h ago`;
}

function redactControlText(value) {
  return String(value).replace(runnerControlPattern, 'control action');
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll('`', '&#96;');
}
