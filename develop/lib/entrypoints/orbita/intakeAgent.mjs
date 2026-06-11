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

function subagentPrompt({ rawRequest, kind } = {}) {
  return `You are the Orbita semantic intake adapter. Return only JSON, no markdown.

Classify this raw user request and produce a safe structured intake packet. Do not include the raw request verbatim except as a concise cleaned subagent brief.

Allowed JSON fields:
- intake_status: one of selected, ambiguous, create_new, degraded, needs_intake_agent
- task_kind: short neutral kind
- selected_workflow: optional object { id, label, path }
- candidate_options: optional array of { id, label, workflow }
- proposed_path: optional object { kind, label, path }
- clean_subagent_brief: concise subagent-readable task brief, safe to show publicly
- confidence: number from 0 to 1

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
    async intake({ rawRequest, kind } = {}) {
      const prompt = subagentPrompt({ rawRequest, kind });
      try {
        const result = await callRuntimeSubagent(api, {
          label: 'orbita-semantic-intake',
          task: prompt,
          prompt,
          cleanup: 'delete',
        });
        if (result !== undefined) return markAgentValidatedIntakePacket(parseJsonPacket(result));
      } catch {
        return createDegradedOrbitaIntakePacket({ reason: 'runtime_subagent_intake_failed' });
      }
      return createFallbackOrbitaIntakePacket();
    },
  };
}
