import { lstat } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { projectOrbitaResult } from '../../dtos/orbita-lifecycle/projections.mjs';
import { createFileOrbitaRunStore } from '../../persistence/orbita-lifecycle/fileRunStore.mjs';
import { createOrbitaLifecycleController } from '../../use-cases/orbita-lifecycle/controller.mjs';
import { createOrbitaIntakeAgent } from './intakeAgent.mjs';
import { isWorkflowRunRequested, listDevHarnessRuns, runDevHarnessWorkflow } from './workflowAdapter.mjs';

const PLUGIN_ID = 'orbita';
const COMMAND_NAME = 'orbita';
const TOOL_NAME = 'orbita';
const WORKSPACE_DIR = resolve(process.env.OPENCLAW_WORKSPACE_DIR || join(process.env.HOME || process.cwd(), '.openclaw', 'workspace'));
const DEFAULT_RUNS_ROOT = join(WORKSPACE_DIR, '.openclaw-runtime', 'plugins', 'orbita', 'runs');
const PUBLIC_MODES = new Set(['run', 'inbox', 'status', 'list', 'cancel', 'help']);
const PERSISTENT_MODES = new Set(['run', 'inbox', 'status', 'list', 'cancel']);

function defineLocalPluginEntry(entry) {
  return entry;
}

function usageText() {
  return `Orbita lifecycle bridge

Usage:
  orbita run [--dry-run] [--kind <kind>] [messy raw request]
  orbita run --workflow workflows/dev-harness/workflow.json -- <task>
  orbita inbox [--limit <n>]
  orbita status [--run <id>]
  orbita list [--state <state>] [--limit <n>]
  orbita cancel <run> [--reason <text>]
  orbita help

Diagnostic: use orbita run --dry-run.
Privacy: output is compact state only. Prompts, child transcripts, staged replies, approval tokens, and full worker answers are not printed.
Runtime honesty: v1 reports runtime_gap/requires_parent_delivery until parent-session delivery is implemented.
Default runs root: workspace-managed Orbita runtime storage`;
}

function formatNativeHelpText() {
  return `🪐 Orbita
State-aware lifecycle bridge.

Команды
/orbita run <запрос> — разобрать запрос и создать/продолжить активный run
/orbita run --dry-run <запрос> — semantic intake без записи
/orbita run --workflow workflows/dev-harness/workflow.json -- <task> — запустить DevHarness до approval prompt
/orbita inbox — runs, требующие доставки/внимания
/orbita status [--run <id>] — состояние
/orbita list — список runs
/orbita cancel <run> — отменить run
/orbita help — помощь

Privacy
Показываю только компактное состояние. Prompts, child transcripts, staged replies, approval tokens и полные worker answers не вывожу.

Honesty
runtime_gap/requires_parent_delivery остаётся явным, пока same-session delivery не реализован.`;
}

function jsonText(value) {
  return JSON.stringify(value, (_key, val) => val === undefined ? undefined : val, 2);
}

function ensureUnderWorkspace(path) {
  const workspace = `${WORKSPACE_DIR}/`;
  if (path !== WORKSPACE_DIR && !path.startsWith(workspace)) {
    throw new Error('runs_root must stay under the OpenClaw workspace');
  }
  return path;
}

function resolveRunsRoot(value, pluginConfig = {}) {
  if (value) {
    if (isAbsolute(value) || value.split(/[\\/]+/).includes('..')) {
      throw new Error('runs_root must be a relative path without parent traversal');
    }
    return ensureUnderWorkspace(resolve(DEFAULT_RUNS_ROOT, value));
  }
  if (pluginConfig.runsRoot) {
    const configured = pluginConfig.runsRoot;
    const resolved = isAbsolute(configured) ? resolve(configured) : resolve(WORKSPACE_DIR, configured);
    return ensureUnderWorkspace(resolved);
  }
  return DEFAULT_RUNS_ROOT;
}

async function assertRunsRootHasNoSymlinkedExistingSegments(runsRoot) {
  const pathFromWorkspace = relative(WORKSPACE_DIR, runsRoot);
  if (!pathFromWorkspace) return;
  let cursor = WORKSPACE_DIR;
  for (const segment of pathFromWorkspace.split(/[\\/]+/).filter(Boolean)) {
    cursor = join(cursor, segment);
    try {
      if ((await lstat(cursor)).isSymbolicLink()) {
        throw new Error('runs_root must stay under the OpenClaw workspace without symlink escapes');
      }
    } catch (error) {
      if (error?.code === 'ENOENT') return;
      throw error;
    }
  }
}

const MAX_WORKFLOW_RUN_TITLE_CHARS = 96;

function redactSensitivePublicText(value) {
  return String(value)
    .replace(/<{2,}\s*(?:begin|end)?[-_\s]*(?:prompt|transcript)[^>]*>{2,}/gi, '[redacted-runtime]')
    .replace(/\b(?:begin|end)[-_\s]*(?:prompt|transcript)\b/gi, '[redacted-runtime]')
    .replace(/(?:[A-Za-z]:)?[\\/](?:[^\s:;|,<>'"`{}()[\]]+[\\/]){1,}[^\s:;|,<>'"`{}()[\]]*/g, '[redacted-path]')
    .replace(/~[\\/][^\s:;|,<>'"`{}()[\]]*/g, '[redacted-path]')
    .replace(/\b(lease[-_ ]?token|prompt|transcript)\b\s*[:=]\s*\S+/gi, '$1=[redacted]')
    .replace(/\b[A-Za-z0-9_-]{24,}\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\b/g, '[redacted-token]')
    .replace(/\b(?:sk|ghp|github_pat|xox[baprs]|ya29|glpat|oc_[A-Za-z0-9]*)[_-][A-Za-z0-9_=-]{12,}\b/gi, '[redacted-token]')
    .replace(/\b[A-Za-z0-9_=-]{40,}\b/g, '[redacted-token]')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b(prompt|transcript)\b/gi, '[redacted-runtime]')
    .replace(/\b(?:lease[-_ ]?token|token)\b/gi, '[redacted-token-label]')
    .trim();
}

function safeWorkflowRunTitle(value) {
  if (typeof value !== 'string') return undefined;
  const redacted = redactSensitivePublicText(value);
  if (!redacted) return undefined;
  const bounded = redacted.length > MAX_WORKFLOW_RUN_TITLE_CHARS ? redacted.slice(0, MAX_WORKFLOW_RUN_TITLE_CHARS) : redacted;
  return bounded.trim() || undefined;
}

function compactLineValue(value) {
  if (value === undefined || value === null || value === '') return '—';
  return String(value);
}

function compactRunLine(run) {
  const parts = [
    `id: ${compactLineValue(run.run_id)}`,
    `state: ${compactLineValue(run.state)}`,
    `kind: ${compactLineValue(run.kind)}`,
  ];
  if (run.runtime_gap) parts.push(`runtime_gap: ${run.runtime_gap}`);
  return `• ${parts.join(' · ')}`;
}

function compactWorkflowRunLine(run) {
  const parts = [
    `id: ${compactLineValue(run.workflow_run_id)}`,
    `request: ${compactLineValue(run.request_id)}`,
    `status: ${compactLineValue(run.status)}`,
  ];
  if (run.current_step) parts.push(`step: ${run.current_step}`);
  if (run.current_gate) parts.push(`gate: ${run.current_gate}`);
  if (run.failure_code) parts.push(`failure: ${run.failure_code}`);
  if (run.title) parts.push(`title: ${run.title}`);
  return `• ${parts.join(' · ')}`;
}

function formatConfidencePercent(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '—';
  return `${Math.round(Math.max(0, Math.min(1, numeric)) * 100)}%`;
}

function formatNativeRunText(result) {
  const intake = result?.run?.intake;
  if (intake?.match_status === 'multiple_matches') {
    const matches = Array.isArray(intake.matched_refs) ? intake.matched_refs : [];
    const lines = matches.map((match, index) => `${index + 1}. ${compactLineValue(match?.ref)} — ${formatConfidencePercent(match?.confidence)}`);
    return `🪐 Orbita
Нашла несколько похожих runs:
${lines.join('\n')}

Выбери run id или скажи: создать новый.`;
  }
  return result?.text ?? jsonText(result);
}

function formatNativeListText(result) {
  const runs = Array.isArray(result?.runs) ? result.runs.filter(Boolean) : [];
  const harnessRuns = Array.isArray(result?.workflow_runs) ? result.workflow_runs.filter(Boolean) : [];
  if (runs.length === 0 && harnessRuns.length === 0) {
    return `🪐 Orbita
Активных runs нет.

Проверка: /orbita run --dry-run`;
  }

  const sections = [];
  if (runs.length > 0) sections.push(`Runs: ${runs.length}\n\n${runs.map(compactRunLine).join('\n')}`);
  if (harnessRuns.length > 0) sections.push(`Workflow runs: ${harnessRuns.length}\n\n${harnessRuns.map(compactWorkflowRunLine).join('\n')}`);
  return `🪐 Orbita\n${sections.join('\n\n')}`;
}

const cliOptions = {
  run: { type: 'string' },
  kind: { type: 'string' },
  state: { type: 'string' },
  limit: { type: 'string' },
  reason: { type: 'string' },
  request: { type: 'string' },
  workflow: { type: 'string' },
  'runs-root': { type: 'string' },
  'dry-run': { type: 'boolean' },
  keep: { type: 'boolean' },
  help: { type: 'boolean' },
};

function controllerFor(runsRoot) {
  return createOrbitaLifecycleController({ store: createFileOrbitaRunStore({ runsRoot }) });
}

function projectWorkflowRun(run) {
  if (!run) return null;
  return {
    workflow_run_id: run.runId,
    request_id: run.requestId ?? run.failure?.request_id,
    title: safeWorkflowRunTitle(run.title),
    status: run.status,
    current_step: run.currentStep,
    current_gate: run.currentGate,
    failure_code: run.failure?.failure_code,
    error_code: run.failure?.error_code,
    created_at: run.createdAt,
    updated_at: run.updatedAt,
    task_flow_id: run.taskFlowId ?? null,
  };
}

function projectDevHarnessRuns(runs = []) {
  return runs.map(projectWorkflowRun).filter(Boolean);
}

function filterDevHarnessRuns(runs = [], { state, limit } = {}) {
  let filtered = state ? runs.filter((run) => run.status === state) : runs;
  const max = limit === undefined || limit === null || limit === '' ? undefined : Number(limit);
  if (Number.isInteger(max) && max >= 1) filtered = filtered.slice(0, max);
  return filtered;
}

async function listDevHarnessRunsForOrbita(pluginConfig = {}, values = {}) {
  const runs = await listDevHarnessRuns({ pluginConfig });
  return projectDevHarnessRuns(filterDevHarnessRuns(runs, { state: values.state, limit: values.limit }));
}

function projectBridgeResult(result, options = {}) {
  return { ...projectOrbitaResult(result, options), openclaw_surface: PLUGIN_ID };
}

function requesterRefFrom(ctx = {}) {
  return ctx.sessionKey || ctx.session?.key || ctx.sessionId || ctx.sender?.id || ctx.senderId || ctx.requesterRef;
}

function isDryRun(values = {}) {
  return values['dry-run'] === true;
}

function trustedRequesterRequired(mode, values = {}, ctx = {}) {
  if (!PERSISTENT_MODES.has(mode)) return false;
  if (mode === 'run' && isDryRun(values)) return false;
  return !requesterRefFrom(ctx);
}

function trustedRequesterError(mode) {
  return { ok: false, mode, openclaw_surface: PLUGIN_ID, message: 'trusted_requester_required' };
}

function rawRequestFromValues(values = {}) {
  if (typeof values.request === 'string' && values.request.trim()) return values.request.trim();
  if (Array.isArray(values._positionals) && values._positionals.length > 0) return values._positionals.join(' ').trim();
  return undefined;
}

async function runOrbita(mode, values = {}, { pluginConfig = {}, ctx = {}, api } = {}) {
  if (mode === 'help') return { ok: true, text: usageText() };
  if (!PUBLIC_MODES.has(mode)) return { ok: false, mode, openclaw_surface: PLUGIN_ID, message: 'unsupported_orbita_command', text: usageText() };
  if (trustedRequesterRequired(mode, values, ctx)) return trustedRequesterError(mode);
  const runsRoot = resolveRunsRoot(values['runs-root'], pluginConfig);
  await assertRunsRootHasNoSymlinkedExistingSegments(runsRoot);
  const controller = controllerFor(runsRoot);
  const requesterRef = requesterRefFrom(ctx);

  if (mode === 'run') {
    if (isWorkflowRunRequested(values)) return runDevHarnessWorkflow(values, { pluginConfig, ctx, api });
    const rawRequest = rawRequestFromValues(values);
    const candidateRefs = pluginConfig.candidateRefs ?? pluginConfig.matchCandidates;
    const intakeAgent = createOrbitaIntakeAgent({ api });
    return projectBridgeResult(await controller.run({
      dryRun: values['dry-run'] === true,
      requesterRef,
      kind: values.kind,
      candidateRefs,
      prepareIntake: () => intakeAgent.intake({ rawRequest, kind: values.kind, candidateRefs }),
      opaqueRefs: { surface: PLUGIN_ID },
    }), { candidateRefs });
  }

  const projectionOptions = { candidateRefs: pluginConfig.candidateRefs ?? pluginConfig.matchCandidates };
  if (mode === 'inbox') return projectBridgeResult(await controller.inbox({ limit: values.limit, requesterRef }), projectionOptions);
  if (mode === 'status') return projectBridgeResult(await controller.status({ runId: values.run, requesterRef }), projectionOptions);
  if (mode === 'list') {
    const lifecycle = projectBridgeResult(await controller.list({ state: values.state, limit: values.limit, requesterRef }), projectionOptions);
    return { ...lifecycle, workflow_runs: await listDevHarnessRunsForOrbita(pluginConfig, values) };
  }
  if (mode === 'cancel') return projectBridgeResult(await controller.cancel({ runId: values.run || values._positionals?.[0], reason: values.reason, requesterRef }), projectionOptions);

  return { ok: true, text: usageText() };
}

function parseModeValues(mode, args = []) {
  if (mode === 'help') return { values: {}, positionals: [] };

  const separatorIndex = args.indexOf('--');
  const optionTokens = separatorIndex >= 0 ? args.slice(0, separatorIndex) : args;
  const requestTokens = separatorIndex >= 0 ? args.slice(separatorIndex + 1) : [];

  if (optionTokens.includes('--help')) return { help: true, values: {}, positionals: [] };

  if (mode !== 'run') {
    const { values, positionals } = parseArgs({ args, options: cliOptions, strict: true, allowPositionals: true });
    values._positionals = positionals;
    if (mode === 'cancel' && !values.run && positionals[0]) values.run = positionals[0];
    return { values, positionals };
  }

  const scanTokens = separatorIndex >= 0 ? optionTokens : args;
  let firstRequestIndex = scanTokens.length;
  for (let index = 0; index < scanTokens.length; index += 1) {
    const token = scanTokens[index];
    if (!token.startsWith('-')) {
      firstRequestIndex = index;
      break;
    }
    if (['--kind', '--run', '--state', '--limit', '--reason', '--request', '--workflow', '--runs-root'].includes(token)) index += 1;
  }

  const parsedOptionTokens = scanTokens.slice(0, firstRequestIndex);
  const trailingRequestTokens = separatorIndex >= 0 ? requestTokens : scanTokens.slice(firstRequestIndex);
  const { values } = parseArgs({ args: parsedOptionTokens, options: cliOptions, strict: true, allowPositionals: true });
  values._positionals = trailingRequestTokens;
  return { values, positionals: trailingRequestTokens };
}

function parseCommandArgs(args = '') {
  const tokens = typeof args === 'string' ? args.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g)?.map((token) => token.replace(/^(["'])(.*)\1$/, '$2')) ?? [] : [];
  const [mode = 'help', ...rest] = tokens;
  if (!PUBLIC_MODES.has(mode)) return { mode: 'help', values: {} };
  const parsed = parseModeValues(mode, rest);
  if (parsed.help) return { mode: 'help', values: {} };
  return { mode, values: parsed.values };
}

function toolParametersSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['mode'],
    properties: {
      mode: { type: 'string', enum: ['run', 'inbox', 'status', 'list', 'cancel', 'help'] },
      run: { type: 'string' },
      kind: { type: 'string' },
      state: { type: 'string' },
      limit: { type: 'number' },
      reason: { type: 'string' },
      request: { type: 'string' },
      workflow: { type: 'string' },
      runs_root: { type: 'string' },
      dry_run: { type: 'boolean' },
    },
  };
}

function toolValues(params = {}) {
  return {
    run: params.run,
    kind: params.kind,
    state: params.state,
    limit: params.limit,
    reason: params.reason,
    request: params.request,
    workflow: params.workflow,
    'runs-root': params.runs_root,
    'dry-run': params.dry_run,
  };
}

export default defineLocalPluginEntry({
  id: PLUGIN_ID,
  name: 'Orbita',
  description: 'State-aware OpenClaw adapter for the Skills-owned Orbita lifecycle controller.',
  register(api) {
    api.registerCommand?.({
      name: COMMAND_NAME,
      nativeNames: { default: COMMAND_NAME, telegram: COMMAND_NAME },
      description: 'Run Orbita lifecycle commands: run/inbox/status/list/cancel/help.',
      acceptsArgs: true,
      handler: async (ctx = {}) => {
        const { mode, values } = parseCommandArgs(ctx.args || 'help');
        const result = await runOrbita(mode, values, { pluginConfig: api.pluginConfig || {}, ctx, api });
        if (mode === 'help') return { text: formatNativeHelpText() };
        if (mode === 'list' || mode === 'inbox') return { text: formatNativeListText(result) };
        if (mode === 'run') return { text: formatNativeRunText(result) };
        return { text: result.text ?? jsonText(result) };
      },
    });

    api.registerTool?.({
      name: TOOL_NAME,
      description: 'Orbita lifecycle bridge. Returns compact state; does not echo prompts, transcripts, approval tokens, or worker answers.',
      parameters: toolParametersSchema(),
      async execute(_id, params = {}, ctx = {}) {
        const result = await runOrbita(params.mode, toolValues(params), { pluginConfig: api.pluginConfig || {}, ctx, api });
        return { content: [{ type: 'text', text: result.text ?? jsonText(result) }] };
      },
    });

    api.registerCli?.(({ program }) => {
      const root = program
        .command(COMMAND_NAME)
        .description('Orbita lifecycle bridge')
        .allowUnknownOption(true)
        .allowExcessArguments(true);

      for (const mode of ['run', 'inbox', 'status', 'list', 'cancel', 'help']) {
        root
          .command(`${mode} [args...]`)
          .description(mode === 'help' ? 'Show Orbita help' : `Run ${mode}`)
          .allowUnknownOption(true)
          .action(async (args = []) => {
            try {
              const parsedMode = mode === 'help' ? 'help' : mode;
              const parsed = parseModeValues(parsedMode, args);
              if (parsed.help) {
                console.log(formatNativeHelpText());
                return;
              }
              const { values } = parsed;
              const result = await runOrbita(parsedMode, values, { pluginConfig: api.pluginConfig || {}, api });
              console.log(result.text ?? jsonText(result));
            } catch (error) {
              console.error(`orbita: ${error?.message ?? String(error)}`);
              process.exitCode = 1;
            }
          });
      }
    }, {
      descriptors: [{ name: COMMAND_NAME, description: 'Orbita lifecycle bridge', hasSubcommands: true }],
    });
  },
});

export { formatNativeHelpText, formatNativeListText, formatNativeRunText, parseCommandArgs, runOrbita, usageText };
