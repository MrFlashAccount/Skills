import { createDegradedOrbitaIntakePacket, createFallbackOrbitaIntakePacket, markAgentValidatedIntakePacket } from '../../entities/orbita-lifecycle/intake.mjs';

const MAX_RUNTIME_INTAKE_RESPONSE_CHARS = 12_000;

function extractText(value) {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return undefined;
  if (typeof value.text === 'string') return value.text;
  if (typeof value.output === 'string') return value.output;
  if (Array.isArray(value.content)) {
    return value.content.map((part) => typeof part === 'string' ? part : part?.text).filter(Boolean).join('\n');
  }
  return undefined;
}

function parseJsonPacket(value) {
  const text = extractText(value);
  if (!text) return value;
  if (text.length > MAX_RUNTIME_INTAKE_RESPONSE_CHARS) {
    throw new Error('runtime_subagent_intake_response_too_large');
  }
  const trimmed = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  return JSON.parse(trimmed);
}

function candidateListText(candidateRefs = []) {
  if (!Array.isArray(candidateRefs) || candidateRefs.length === 0) return 'No existing candidate refs were provided. Return match_status no_match and matched_refs [].';
  const refs = candidateRefs
    .map((candidate) => candidate?.ref ?? candidate?.id ?? candidate)
    .filter((ref) => typeof ref === 'string' && ref.trim())
    .slice(0, 50);
  if (refs.length === 0) return 'No existing candidate refs were provided. Return match_status no_match and matched_refs [].';
  return `Existing candidate refs. You may return ONLY these exact refs in matched_refs; never invent refs, labels, paths, or workflow names:\n${refs.map((ref) => `- ${ref}`).join('\n')}`;
}

function subagentPrompt({ rawRequest, kind, candidateRefs } = {}) {
  return `You are the Orbita semantic intake adapter. Return only JSON, no markdown.

Your responsibility is narrow:
1. Rewrite the raw user request into a normal concise internal brief suitable for a subagent.
2. Match that request against the provided existing task/baton/run refs.
3. Return zero, one, or multiple candidate matches sorted by your confidence.

Do not select workflow catalogs. Do not classify analyst ambiguity. Multiple matches are only a selection outcome. Do not include the raw request verbatim; summarize only the task need when a private brief is useful.

Allowed JSON fields:
- intake_status: one of ready, degraded, needs_intake_agent
- match_status: one of no_match, single_match, multiple_matches, needs_intake_agent
- matched_refs: array of { "ref": string, "confidence": number } using only refs from the provided list
- task_kind: short neutral kind, or unknown when not safe to infer
- internal_private_clean_brief: concise cleaned task brief for internal runtime use only; do not include secrets, local paths, or the raw request verbatim
- confidence: optional top-level number from 0 to 1
- degraded_reason: optional short reason code when degraded or needs_intake_agent

${candidateListText(candidateRefs)}

Requested kind hint: ${kind ?? 'none'}
Raw request:
${rawRequest ?? ''}`;
}

async function callRuntimeSubagent(api, request) {
  const runtime = api?.runtime;
  const subagent = runtime?.subagent;
  if (!subagent) return undefined;

  if (typeof subagent === 'function') return subagent(request);
  if (typeof subagent.run === 'function') return subagent.run(request);
  if (typeof subagent.spawn === 'function') return subagent.spawn(request);
  if (typeof subagent.create === 'function') return subagent.create(request);
  return undefined;
}

export function createOrbitaIntakeAgent({ api } = {}) {
  return {
    async intake({ rawRequest, kind, candidateRefs } = {}) {
      const prompt = subagentPrompt({ rawRequest, kind, candidateRefs });
      try {
        const result = await callRuntimeSubagent(api, {
          label: 'orbita-semantic-intake',
          task: prompt,
          prompt,
          cleanup: 'delete',
        });
        if (result !== undefined) return markAgentValidatedIntakePacket(parseJsonPacket(result), { candidateRefs });
      } catch {
        return createDegradedOrbitaIntakePacket({ reason: 'runtime_subagent_intake_failed' });
      }
      return createFallbackOrbitaIntakePacket();
    },
  };
}
