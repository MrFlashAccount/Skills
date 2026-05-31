import { writePersistedRunStateUpdate } from './run-state/PersistedRunStateWriter.mjs';

export async function write(paths, patch) {
  return writePersistedRunStateUpdate(paths, patch);
}

export const RunStateFileWriter = { write };
