import { mkdir } from 'node:fs/promises';
import { readPersistedRunState, assertPersistedRunState } from './PersistedRunStateReader.mjs';
import { commitDurableRunState, withContinueRunLock } from '../runner/run-state.mjs';

export async function writePersistedRunStateUpdate(paths, patch) {
  return withContinueRunLock(paths, async () => {
    await mkdir(paths.runnerDir, { recursive: true });
    await mkdir(paths.instructionsDir, { recursive: true });
    await readPersistedRunState(paths);
    const result = await commitDurableRunState(paths, patch);
    const after = await readPersistedRunState(paths);
    assertPersistedRunState(after, 'persisted run state after write');
    return result;
  });
}
