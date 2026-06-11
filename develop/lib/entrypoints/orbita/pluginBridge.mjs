import { lstat } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { projectOrbitaResult } from '../../dtos/orbita-lifecycle/projections.mjs';
import { createFileOrbitaRunStore } from '../../persistence/orbita-lifecycle/fileRunStore.mjs';
import { createOrbitaLifecycleController } from '../../use-cases/orbita-lifecycle/controller.mjs';

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
  orbita run [--dry-run] [--kind <kind>]
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
/orbita run — создать или продолжить активный run
/orbita run --dry-run — диагностическая проверка без записи
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

function formatNativeListText(result) {
  const runs = Array.isArray(result?.runs) ? result.runs.filter(Boolean) : [];
  if (runs.length === 0) {
    return `🪐 Orbita
Активных runs нет.

Проверка: /orbita run --dry-run`;
  }

  return `🪐 Orbita
Runs: ${runs.length}

${runs.map(compactRunLine).join('\n')}`;
}

const cliOptions = {
  run: { type: 'string' },
  kind: { type: 'string' },
  state: { type: 'string' },
  limit: { type: 'string' },
  reason: { type: 'string' },
  'runs-root': { type: 'string' },
  'dry-run': { type: 'boolean' },
  keep: { type: 'boolean' },
  help: { type: 'boolean' },
};

function controllerFor(runsRoot) {
  return createOrbitaLifecycleController({ store: createFileOrbitaRunStore({ runsRoot }) });
}

function projectBridgeResult(result) {
  return { ...projectOrbitaResult(result), openclaw_surface: PLUGIN_ID };
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

async function runOrbita(mode, values = {}, { pluginConfig = {}, ctx = {} } = {}) {
  if (mode === 'help') return { ok: true, text: usageText() };
  if (!PUBLIC_MODES.has(mode)) return { ok: false, mode, openclaw_surface: PLUGIN_ID, message: 'unsupported_orbita_command', text: usageText() };
  if (trustedRequesterRequired(mode, values, ctx)) return trustedRequesterError(mode);
  const runsRoot = resolveRunsRoot(values['runs-root'], pluginConfig);
  await assertRunsRootHasNoSymlinkedExistingSegments(runsRoot);
  const controller = controllerFor(runsRoot);
  const requesterRef = requesterRefFrom(ctx);

  if (mode === 'run') {
    return projectBridgeResult(await controller.run({
      dryRun: values['dry-run'] === true,
      requesterRef,
      kind: values.kind,
      opaqueRefs: { surface: PLUGIN_ID },
    }));
  }

  if (mode === 'inbox') return projectBridgeResult(await controller.inbox({ limit: values.limit, requesterRef }));
  if (mode === 'status') return projectBridgeResult(await controller.status({ runId: values.run, requesterRef }));
  if (mode === 'list') return projectBridgeResult(await controller.list({ state: values.state, limit: values.limit, requesterRef }));
  if (mode === 'cancel') return projectBridgeResult(await controller.cancel({ runId: values.run || values._positionals?.[0], reason: values.reason, requesterRef }));

  return { ok: true, text: usageText() };
}

function parseCommandArgs(args = '') {
  const tokens = typeof args === 'string' ? args.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g)?.map((token) => token.replace(/^(["'])(.*)\1$/, '$2')) ?? [] : [];
  const [mode = 'help', ...rest] = tokens;
  if (!PUBLIC_MODES.has(mode) || rest.includes('--help')) return { mode: 'help', values: {} };
  const { values, positionals } = parseArgs({ args: rest, options: cliOptions, strict: true, allowPositionals: true });
  values._positionals = positionals;
  if (mode === 'cancel' && !values.run && positionals[0]) values.run = positionals[0];
  return { mode, values };
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
        const result = await runOrbita(mode, values, { pluginConfig: api.pluginConfig || {}, ctx });
        if (mode === 'help') return { text: formatNativeHelpText() };
        if (mode === 'list' || mode === 'inbox') return { text: formatNativeListText(result) };
        return { text: result.text ?? jsonText(result) };
      },
    });

    api.registerTool?.({
      name: TOOL_NAME,
      description: 'Orbita lifecycle bridge. Returns compact state; does not echo prompts, transcripts, approval tokens, or worker answers.',
      parameters: toolParametersSchema(),
      async execute(_id, params = {}, ctx = {}) {
        const result = await runOrbita(params.mode, toolValues(params), { pluginConfig: api.pluginConfig || {}, ctx });
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
              const { values, positionals } = parsedMode === 'help'
                ? { values: {}, positionals: [] }
                : parseArgs({ args, options: cliOptions, strict: true, allowPositionals: true });
              values._positionals = positionals;
              if (parsedMode === 'cancel' && !values.run && positionals[0]) values.run = positionals[0];
              const result = await runOrbita(parsedMode, values, { pluginConfig: api.pluginConfig || {} });
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

export { formatNativeHelpText, formatNativeListText, runOrbita, usageText };
