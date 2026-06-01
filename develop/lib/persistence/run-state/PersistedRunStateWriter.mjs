import { mkdir } from 'node:fs/promises';
import { assertPersistedRunState } from './persisted-state-schema.mjs';
import { readPersistedRunState } from './PersistedRunStateReader.mjs';
import { commitDurableRunState, recoverDurableCommit } from './durable-commit.mjs';
import { withRunStateLock } from './lock.mjs';

export async function writePersistedRunStateUpdate(paths, patch) {
  return withRunStateLock(paths, async () => {
    await mkdir(paths.runnerDir, { recursive: true });
    await mkdir(paths.instructionsDir, { recursive: true });
    await recoverDurableCommit(paths);
    await readPersistedRunState(paths);
    const result = await commitDurableRunState(paths, patch);
    const after = await readPersistedRunState(paths);
    assertPersistedRunState(after, 'persisted run state after write');
    return result;
  });
}
