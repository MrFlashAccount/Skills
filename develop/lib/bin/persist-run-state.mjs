#!/usr/bin/env node
// Transport shim kept for existing package scripts and documented CLI paths.
// Meaningful CLI parsing and runtime logic lives in develop/lib/entrypoints/cli/persist-run-state.mjs.
await import('../entrypoints/cli/persist-run-state.mjs');
