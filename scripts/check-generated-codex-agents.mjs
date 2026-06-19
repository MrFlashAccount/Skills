import { spawnSync } from 'node:child_process';

const run = (command, args) => {
  const result = spawnSync(command, args, { stdio: 'inherit' });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
};

run('node', ['scripts/generate-codex-agents.mjs']);
run('git', ['diff', '--exit-code', '--', 'agents']);
run('git', ['diff', '--cached', '--exit-code', '--', 'agents']);

const status = spawnSync('git', ['status', '--porcelain', '--', 'agents'], {
  encoding: 'utf8',
});

if (status.error) {
  throw status.error;
}

if (status.status !== 0) {
  process.exit(status.status ?? 1);
}

if (status.stdout.trim() !== '') {
  console.error('Generated Codex agents are stale or untracked:');
  process.stderr.write(status.stdout);
  process.exit(1);
}
