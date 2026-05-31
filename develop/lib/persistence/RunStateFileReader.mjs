import { readJson } from './runner/run-state.mjs';
import { RunStateDTO } from '../dtos/RunStateDTO.mjs';
export async function read(paths) { return new RunStateDTO({ baton: await readJson(paths.batonPath, 'baton') }); }
export const RunStateFileReader = { read };
