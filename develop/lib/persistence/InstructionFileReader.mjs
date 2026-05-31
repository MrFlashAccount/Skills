import { readText } from './run-state/atomic-file.mjs';
import { InstructionDTO } from '../dtos/InstructionDTO.mjs';
export async function read(path, label = 'instructions') { return new InstructionDTO({ path, content: await readText(path, label) }); }
export const InstructionFileReader = { read };
