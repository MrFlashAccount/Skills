const INTAKE_STATUSES = new Set(['needs_intake_agent', 'ready', 'degraded']);
const LEGACY_READY_STATUSES = new Set(['selected', 'ambiguous', 'create_new']);
const MATCH_STATUSES = new Set(['no_match', 'single_match', 'multiple_matches', 'needs_intake_agent']);
const KNOWN_TASK_KINDS = new Set(['unknown', 'backend', 'frontend', 'documentation', 'review', 'bugfix', 'general']);
const DEFAULT_CONFIDENCE = 0.2;
const DEGRADED_CONFIDENCE = 0.05;
const SECRETISH_PATTERN = /(?:token|secret|password|passwd|api[_-]?key|access[_-]?key|private[_-]?key)\s*[:=]/i;
const LOCAL_PATH_PATTERN = /(?:^|\s)(?:~|\/[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)+|[A-Za-z]:\\[^\s]+)/;

function cleanString(value, { max = 400, fallback } = {}) {
  if (typeof value !== 'string') return fallback;
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!cleaned) return fallback;
  return cleaned.slice(0, max);
}

function safePrivateBrief(value, { max = 800, fallback } = {}) {
  const cleaned = cleanString(value, { max, fallback });
  if (!cleaned) return fallback;
  if (SECRETISH_PATTERN.test(cleaned) || LOCAL_PATH_PATTERN.test(cleaned)) return fallback;
  return cleaned;
}

function safeStableRef(value, { max = 160 } = {}) {
  const cleaned = cleanString(value, { max });
  if (!cleaned) return undefined;
  if (SECRETISH_PATTERN.test(cleaned) || LOCAL_PATH_PATTERN.test(cleaned)) return undefined;
  return cleaned;
}

function normalizeConfidence(value, { fallback = DEFAULT_CONFIDENCE } = {}) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  if (numeric < 0) return 0;
  if (numeric > 1) return 1;
  return numeric;
}

function normalizeTaskKind(value) {
  const cleaned = cleanString(value, { max: 80, fallback: 'unknown' });
  return KNOWN_TASK_KINDS.has(cleaned) ? cleaned : 'unknown';
}

function safeReasonCode(value) {
  const cleaned = cleanString(value, { max: 160 });
  if (!cleaned) return undefined;
  if (SECRETISH_PATTERN.test(cleaned) || LOCAL_PATH_PATTERN.test(cleaned)) return undefined;
  return cleaned.replace(/[^a-z0-9._-]+/gi, '_').replace(/^_+|_+$/g, '').slice(0, 160) || undefined;
}

function normalizeIntakeStatus(value) {
  if (INTAKE_STATUSES.has(value)) return value;
  if (LEGACY_READY_STATUSES.has(value)) return 'ready';
  return 'degraded';
}

function knownRefSet(candidateRefs) {
  if (!Array.isArray(candidateRefs)) return undefined;
  return new Set(candidateRefs.map((candidate) => safeStableRef(candidate?.ref ?? candidate?.id ?? candidate)).filter(Boolean));
}

function candidateRefFromMatch(match) {
  if (typeof match === 'string') return match;
  if (!match || typeof match !== 'object') return undefined;
  return match.ref ?? match.id;
}

function normalizeMatchedRefs(packet = {}, { candidateRefs } = {}) {
  const allowedRefs = knownRefSet(candidateRefs);
  const rawMatches = packet.matched_refs ?? packet.matchedRefs ?? packet.matches ?? packet.candidate_matches ?? [];
  if (!Array.isArray(rawMatches) || rawMatches.length === 0) return [];
  if (!allowedRefs || allowedRefs.size === 0) return [];

  const byRef = new Map();
  for (const rawMatch of rawMatches) {
    const ref = safeStableRef(candidateRefFromMatch(rawMatch));
    if (!ref) continue;
    if (allowedRefs && allowedRefs.size > 0 && !allowedRefs.has(ref)) continue;
    const confidence = normalizeConfidence(rawMatch?.confidence, { fallback: DEFAULT_CONFIDENCE });
    const existing = byRef.get(ref);
    if (!existing || confidence > existing.confidence) byRef.set(ref, { ref, confidence });
  }
  return [...byRef.values()].sort((left, right) => right.confidence - left.confidence).slice(0, 10);
}

function normalizeMatchStatus(value, matchedRefs, intakeStatus) {
  if (intakeStatus === 'needs_intake_agent' || intakeStatus === 'degraded') return 'needs_intake_agent';
  if (MATCH_STATUSES.has(value) && value === 'needs_intake_agent') return value;
  if (matchedRefs.length === 0) return 'no_match';
  if (matchedRefs.length === 1) return 'single_match';
  return 'multiple_matches';
}

export function createDegradedOrbitaIntakePacket({ reason = 'intake_agent_unavailable', status = 'degraded' } = {}) {
  return normalizeOrbitaIntakePacket({
    intake_status: status,
    task_kind: 'unknown',
    confidence: DEGRADED_CONFIDENCE,
    degraded_reason: reason,
    match_status: 'needs_intake_agent',
  });
}

export function createFallbackOrbitaIntakePacket({ reason = 'runtime_intake_agent_unavailable' } = {}) {
  return createDegradedOrbitaIntakePacket({ status: 'needs_intake_agent', reason });
}

export function markAgentValidatedIntakePacket(packet, options = {}) {
  const normalized = normalizeOrbitaIntakePacket(packet, options);
  normalized.intake_source = 'runtime_intake_agent';
  return normalized;
}

export function normalizeOrbitaIntakePacket(packet = {}, options = {}) {
  const status = normalizeIntakeStatus(packet.intake_status);
  const matchedRefs = normalizeMatchedRefs(packet, options);
  const matchStatus = normalizeMatchStatus(packet.match_status ?? packet.matchStatus, matchedRefs, status);
  const normalized = {
    schema_version: 1,
    intake_status: status,
    match_status: matchStatus,
    matched_refs: matchedRefs,
    task_kind: normalizeTaskKind(packet.task_kind ?? packet.taskKind),
  };

  const confidence = normalizeConfidence(packet.confidence, { fallback: undefined });
  if (confidence !== undefined) {
    normalized.confidence = status === 'needs_intake_agent'
      ? Math.min(confidence, 0.1)
      : confidence;
  }

  const privateBrief = safePrivateBrief(
    packet.internal_private_clean_brief
      ?? packet.private_clean_brief
      ?? packet.clean_subagent_brief
      ?? packet.cleanSubagentBrief
      ?? packet.summary,
    { max: 800 },
  );
  if (privateBrief) normalized.internal_private_clean_brief = privateBrief;

  const degradedReason = safeReasonCode(packet.degraded_reason ?? packet.degradedReason ?? packet.degradation_reason ?? packet.degradationReason);
  if (degradedReason) normalized.degraded_reason = degradedReason;

  if (normalized.intake_status === 'needs_intake_agent' || normalized.intake_status === 'degraded') {
    normalized.confidence = Math.min(normalized.confidence ?? DEFAULT_CONFIDENCE, 0.1);
  }

  return normalized;
}

export function orbitaStateForIntake(packet, { dryRun = false, defaultState = 'created' } = {}) {
  if (dryRun) return 'completed';
  if (packet?.intake_status === 'needs_intake_agent' || packet?.intake_status === 'degraded') return 'waiting_human';
  if (packet?.match_status === 'multiple_matches') return 'waiting_human';
  return defaultState;
}
