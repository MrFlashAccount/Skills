import { readText } from './runner/run-state.mjs';
import { InstructionDTO } from '../dtos/InstructionDTO.mjs';
export async function read(path, label = 'instructions') { return new InstructionDTO({ path, content: await readText(path, label) }); }
export const InstructionFileReader = { read };
