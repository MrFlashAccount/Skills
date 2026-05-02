#!/usr/bin/env node

import assert from 'node:assert/strict';

import { buildSummary } from './inspect-project.mjs';

const summary = buildSummary(
  { id: 'PVT_kwDOC', title: 'Backlog', number: 7 },
  'octo-org',
  {
    fields: [
      {
        id: 'PVTSSF_status',
        name: 'Status',
        type: 'ProjectV2SingleSelectField',
        options: [
          { id: 'todo', name: 'Todo' },
          { id: 'doing', name: 'Doing' },
        ],
      },
      {
        id: 'PVTF_text',
        name: 'Notes',
        type: 'ProjectV2Field',
      },
    ],
  },
);

assert.deepEqual(summary, {
  project: {
    id: 'PVT_kwDOC',
    title: 'Backlog',
    number: 7,
    owner: 'octo-org',
  },
  fields: [
    {
      id: 'PVTSSF_status',
      name: 'Status',
      type: 'ProjectV2SingleSelectField',
      options: [
        { id: 'todo', name: 'Todo' },
        { id: 'doing', name: 'Doing' },
      ],
    },
    {
      id: 'PVTF_text',
      name: 'Notes',
      type: 'ProjectV2Field',
      options: [],
    },
  ],
});

process.stdout.write('inspect-project envelope verification passed\n');
