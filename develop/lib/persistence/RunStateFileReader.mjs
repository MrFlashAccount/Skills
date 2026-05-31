import { RunStateDTO } from '../dtos/RunStateDTO.mjs';
import { projectRuntimeRunState } from './run-state/persisted-state-schema.mjs';
import { readPersistedRunState } from './run-state/PersistedRunStateReader.mjs';

export async function read(paths) {
  const persisted = await readPersistedRunState(paths);
  const projection = projectRuntimeRunState(persisted);
  return new RunStateDTO({ baton: projection.baton });
}

export const RunStateFileReader = { read };
