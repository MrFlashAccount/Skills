#!/usr/bin/env node
import { runCli } from '../entrypoints/workflow-runner-cli.mjs';
import { workflowRuntimeDependencies } from './workflow-runtime-dependencies.mjs';

await runCli(process.argv.slice(2), workflowRuntimeDependencies);
