import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BatonDTO } from '../dtos/BatonDTO.mjs';
import { InstructionDTO } from '../dtos/InstructionDTO.mjs';
import { OutputDTO } from '../dtos/OutputDTO.mjs';
import { RunStateProjectionDTO } from '../dtos/RunStateProjectionDTO.mjs';
import { StepDTO } from '../dtos/StepDTO.mjs';
import { TemplateDTO } from '../dtos/TemplateDTO.mjs';
import { WorkflowDTO } from '../dtos/WorkflowDTO.mjs';
import { WorkflowResultDTO } from '../dtos/WorkflowResultDTO.mjs';

const LIB_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DTO_DIR = path.join(LIB_DIR, 'dtos');
const DTO_CLASSES = [BatonDTO, InstructionDTO, OutputDTO, RunStateProjectionDTO, StepDTO, TemplateDTO, WorkflowDTO, WorkflowResultDTO];

test('DTOs are plain transfer containers, not validation owners', () => {
  for (const DTO of DTO_CLASSES) {
    assert.doesNotThrow(() => new DTO(undefined));
    assert.doesNotThrow(() => new DTO('not an object'));
  }
});

test('DTO source files do not contain validation or runtime error logic', () => {
  const forbidden = /\b(?:assert|fail|WorkflowRuntimeError|throw new)\b/;
  const offenders = readdirSync(DTO_DIR)
    .filter((name) => name.endsWith('.mjs'))
    .filter((name) => forbidden.test(readFileSync(path.join(DTO_DIR, name), 'utf8')));

  assert.deepEqual(offenders, []);
});

test('DTO source files document transfer shape with JSDoc typedefs', () => {
  const missingTypedef = readdirSync(DTO_DIR)
    .filter((name) => name.endsWith('DTO.mjs'))
    .filter((name) => !/@typedef \{/.test(readFileSync(path.join(DTO_DIR, name), 'utf8')));

  assert.deepEqual(missingTypedef, []);
});

test('template DTO transfers data without mechanical validation', () => {
  assert.deepEqual(new TemplateDTO({ ref: undefined }).toJSON(), { ref: undefined });
  assert.deepEqual(new TemplateDTO({ ref: 42 }).toJSON(), { ref: 42 });
});
