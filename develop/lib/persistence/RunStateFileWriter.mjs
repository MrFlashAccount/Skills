import { commitDurableRunState } from './runner/run-state.mjs';
export async function write(paths, patch) { return commitDurableRunState(paths, patch); }
export const RunStateFileWriter = { write };
