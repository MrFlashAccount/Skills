import { readJson } from './runner/run-state.mjs';
import { RunStateDTO } from '../dtos/RunStateDTO.mjs';
import { assertBatonSchema } from '../entities/workflow-helpers/schema-validation.mjs';

export async function read(paths) {
  const baton = await readJson(paths.batonPath, 'baton');
  assertBatonSchema(baton);
  return new RunStateDTO({ baton });
}

export const RunStateFileReader = { read };
