import { writeFile } from 'node:fs/promises';
export async function write(instructionData) { const data = typeof instructionData?.toJSON === 'function' ? instructionData.toJSON() : instructionData; await writeFile(data.path, data.content); return data; }
export const InstructionFileWriter = { write };
