const INTAKE_STATUSES = new Set(['selected', 'ambiguous', 'create_new', 'degraded', 'needs_intake_agent']);
const KNOWN_TASK_KINDS = new Set(['unknown', 'backend', 'frontend', 'documentation', 'review', 'bugfix', 'general']);
const WORKFLOW_ALLOWLIST = new Map([
  ['dev-harness', { id: 'dev-harness', label: 'Dev Harness', path: 'skills/dev-harness/SKILL.md' }],
  ['implementation-harness', { id: 'implementation-harness', label: 'Implementation Harness', path: 'skills/implementation-harness/SKILL.md' }],
  ['docs-writer', { id: 'docs-writer', label: 'Docs Writer', path: 'skills/docs-writer/SKILL.md' }],
  ['github', { id: 'github', label: 'GitHub', path: 'skills/github/SKILL.md' }],
  ['gh-issues', { id: 'gh-issues', label: 'GitHub Issues', path: 'skills/gh-issues/SKILL.md' }],
]);
const DEFAULT_CONFIDENCE = 0.2;
const DEGRADED_CONFIDENCE = 0.05;
const SECRETISH_PATTERN = /(?:token|secret|password|passwd|api[_-]?key|access[_-]?key|private[_-]?key)\s*[:=]/i;
const LOCAL_PATH_PATTERN = /(?:^|\s)(?:~|\/[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)+|[A-Za-z]:\\[^\s]+)/;
const SAFE_OPAQUE_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,119}$/i;

function cleanString(value, { max = 400, fallback } = {}) {
  if (typeof value !== 'string') return fallback;
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!cleaned) return fallback;
  return cleaned.slice(0, max);
}

function safePublicText(value, { max = 400, fallback } = {}) {
  const cleaned = cleanString(value, { max, fallback });
  if (!cleaned) return fallback;
  if (SECRETISH_PATTERN.test(cleaned) || LOCAL_PATH_PATTERN.test(cleaned)) return fallback;
  return cleaned;
}

function normalizeConfidence(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return DEFAULT_CONFIDENCE;
  if (numeric < 0) return 0;
  if (numeric > 1) return 1;
  return numeric;
}

function normalizeTaskKind(value) {
  const cleaned = cleanString(value, { max: 80, fallback: 'unknown' });
  return KNOWN_TASK_KINDS.has(cleaned) ? cleaned : 'unknown';
}

function safeSymbolId(value, { max = 120, fallback } = {}) {
  const cleaned = cleanString(value, { max, fallback });
  if (!cleaned) return fallback;
  const symbolic = cleaned.toLowerCase().replace(/[^a-z0-9._/-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, max);
  return symbolic || fallback;
}

function safeOpaqueId(value, { fallback } = {}) {
  const cleaned = cleanString(value, { max: 120 });
  if (!cleaned) return fallback;
  if (SECRETISH_PATTERN.test(cleaned) || LOCAL_PATH_PATTERN.test(cleaned)) return fallback;
  if (!SAFE_OPAQUE_ID_PATTERN.test(cleaned)) return fallback;
  return cleaned.toLowerCase();
}

function knownWorkflow(id) {
  const normalizedId = safeSymbolId(id, { max: 120 });
  return normalizedId ? WORKFLOW_ALLOWLIST.get(normalizedId) : undefined;
}

function normalizeOption(option, index) {
  if (!option || typeof option !== 'object') return null;
  const fallbackId = `option-${index + 1}`;
  const known = knownWorkflow(option.id ?? option.workflow_id);
  const id = known?.id ?? safeOpaqueId(option.id ?? option.workflow_id, { fallback: fallbackId });
  const normalized = { id, label: known?.label ?? id };
  const workflow = normalizeWorkflow(option.workflow ?? option.selected_workflow, { allowUnknown: true });
  if (workflow) normalized.workflow = workflow;
  return normalized;
}

function normalizeWorkflow(value, { allowUnknown = false } = {}) {
  if (!value || typeof value !== 'object') return null;
  const rawId = value.id ?? value.workflow_id;
  const known = knownWorkflow(rawId);
  if (known) return { ...known };
  if (!allowUnknown) return null;
  const id = safeOpaqueId(rawId, { fallback: undefined });
  if (!id) return null;
  return { id, label: id };
}

function normalizeProposedPath(value) {
  if (!value || typeof value !== 'object') return undefined;
  const kind = normalizeTaskKind(value.kind ?? value.task_kind ?? 'unknown');
  const label = safePublicText(value.label ?? value.title ?? value.name, { max: 160 });
  const path = safeOpaqueId(value.path ?? value.suggested_path, { fallback: undefined });
  if (!label && !path) return undefined;
  const normalized = { kind };
  if (label) normalized.label = label;
  if (path) normalized.path = path;
  return normalized;
}

export function createDegradedOrbitaIntakePacket({ reason = 'intake_agent_unavailable', status = 'degraded' } = {}) {
  return normalizeOrbitaIntakePacket({
    intake_status: status,
    task_kind: 'unknown',
    confidence: DEGRADED_CONFIDENCE,
    degradation_reason: reason,
  });
}

export function createFallbackOrbitaIntakePacket({ reason = 'runtime_intake_agent_unavailable' } = {}) {
  return createDegradedOrbitaIntakePacket({ status: 'needs_intake_agent', reason });
}

export function markAgentValidatedIntakePacket(packet) {
  const normalized = normalizeOrbitaIntakePacket(packet);
  normalized.intake_source = 'runtime_intake_agent';
  return normalized;
}

export function normalizeOrbitaIntakePacket(packet = {}) {
  const status = INTAKE_STATUSES.has(packet.intake_status) ? packet.intake_status : 'degraded';
  const normalized = {
    schema_version: 1,
    intake_status: status,
    task_kind: normalizeTaskKind(packet.task_kind ?? packet.taskKind),
    confidence: status === 'needs_intake_agent'
      ? Math.min(normalizeConfidence(packet.confidence), 0.1)
      : normalizeConfidence(packet.confidence),
  };

  const cleanBrief = safePublicText(packet.clean_subagent_brief ?? packet.cleanSubagentBrief ?? packet.summary, { max: 800 });
  if (cleanBrief) {
    normalized.clean_subagent_brief = cleanBrief;
    normalized.clean_subagent_brief_safe = true;
  }

  if (status === 'selected') {
    const workflow = normalizeWorkflow(packet.selected_workflow ?? packet.selectedWorkflow);
    if (workflow) normalized.selected_workflow = workflow;
    else normalized.intake_status = 'needs_intake_agent';
  }

  const options = Array.isArray(packet.candidate_options ?? packet.candidateOptions)
    ? (packet.candidate_options ?? packet.candidateOptions).map(normalizeOption).filter(Boolean).slice(0, 5)
    : [];
  if (options.length > 0) normalized.candidate_options = options;

  const proposedPath = normalizeProposedPath(packet.proposed_path ?? packet.proposedPath);
  if (proposedPath) normalized.proposed_path = proposedPath;

  const degradationReason = safePublicText(packet.degradation_reason ?? packet.degradationReason, { max: 160 });
  if (degradationReason) normalized.degradation_reason = degradationReason;

  if (normalized.intake_status === 'needs_intake_agent' || normalized.intake_status === 'degraded') {
    delete normalized.selected_workflow;
    normalized.confidence = Math.min(normalized.confidence, 0.1);
  }

  return normalized;
}

export function orbitaStateForIntake(packet, { dryRun = false, defaultState = 'created' } = {}) {
  if (dryRun) return 'completed';
  if (packet?.intake_status === 'ambiguous' || packet?.intake_status === 'create_new' || packet?.intake_status === 'needs_intake_agent' || packet?.intake_status === 'degraded') return 'waiting_human';
  return defaultState;
}
