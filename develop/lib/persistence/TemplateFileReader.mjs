import { TemplateDTO } from '../dtos/TemplateDTO.mjs';
export function read(ref, context = {}) { return new TemplateDTO({ ref, ...context }); }
export const TemplateFileReader = { read };
