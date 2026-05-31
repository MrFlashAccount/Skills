import { writeFile } from 'node:fs/promises';
export async function write(instructionDTO) { const data = typeof instructionDTO?.toJSON === 'function' ? instructionDTO.toJSON() : instructionDTO; await writeFile(data.path, data.content); return data; }
export const InstructionFileWriter = { write };
