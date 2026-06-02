---
name: develop-workflow-runtime
description: Use for running a workflow from the repo root through workflow-runner host requests, bounded workers, and user-input waits.
---

# Workflow Runtime

Run workflows by driving the `workflow-runner` request loop from the repository root. Do not decide workflow transitions yourself.

## Variables

- `<run-id>`: public workflow run identity; keep using the same value for the whole run. Runtime files and topology are private runner state.
- `<workflow>`: workflow definition path for the initial `next`; same-run `continue` reuses the workflow stored in the run unless you explicitly override it.
- `<result.json>`: JSON host-output file produced for one host request.
- `<step-id>`: id of a request/step from `response.requests[]`.

## Run identity selection

Before calling `workflow-runner`, always discover public runs through the index helper instead of inspecting private runner files yourself:

```bash
node develop/lib/entrypoints/cli/workflow-runs.mjs list
```

Use the JSON output to match resumable/current candidates semantically by human-readable fields such as `runId`, title/summary, workflow identity, status, timestamps, task key/fingerprint, and occupancy state. Do not ask the user to choose by private directories or hidden authority metadata.

- If exactly one candidate clearly matches the current task, reuse its `runId` only after claiming it.
- If multiple plausible candidates match, ask the user to choose using human-readable summaries from the JSON.
- If extra info is needed to disambiguate, ask for that specific info with the candidate summaries.
- If a candidate has `occupancy.state: "occupied"`, it has a fresh worker lease. Do not attach blindly; ask the user whether to wait, choose another task/run, or explicitly resolve the occupation.
- If a candidate has `occupancy.state: "stale"`, its lease expired and may be taken over by claiming it.
- If no candidate matches, create/register a new run identity and claim it in the same command:

```bash
node develop/lib/entrypoints/cli/workflow-runs.mjs create --claim --workflow <workflow> --title <title> --summary <summary> --owner <owner> --harness <harness> --session-id <session-id>
```

Before starting or resuming any run, claim the selected `runId` atomically. Unclaimed/stale claims issue a transient `leaseToken`; keep it only long enough to pass explicitly to runner commands:

```bash
claim_json=$(node develop/lib/entrypoints/cli/workflow-runs.mjs claim --run-id <run-id> --owner <owner> --harness <harness> --session-id <session-id>)
lease_token=$(node -e 'const fs=require("node:fs"); process.stdout.write(JSON.parse(fs.readFileSync(0,"utf8")).leaseToken)' <<<"$claim_json")
```

Lease metadata is diagnostics only: `owner`, `harness`, `sessionId`, and `workerId` may describe the caller at command time but never grants authority and is not retained in durable lease state. Durable storage keeps only the token hash, token epoch, and lease expiry. A fresh lease requires the raw token via explicit `--lease-token`; metadata alone must return occupied. Long-running harnesses should renew with `heartbeat --lease-token "$lease_token"` before `leaseExpiresAt`.

Create-with-claim and claim responses may include `leaseToken` for the holder only. Use only the public `--run-id <run-id>` plus the transient explicit token with runtime commands after selection/creation; do not pass or derive private `runDir`/`runsRoot` paths.

## Runner commands

Start or resume a run from the repo root:

```bash
node develop/lib/entrypoints/cli/workflow-runner.mjs next --run-id <run-id> --lease-token "$lease_token"
```

Continue after host request outputs are ready:

```bash
node develop/lib/entrypoints/cli/workflow-runner.mjs continue --run-id <run-id> --output <result.json> --lease-token "$lease_token"
```

For multiple request outputs, name every output:

```bash
node develop/lib/entrypoints/cli/workflow-runner.mjs continue --run-id <run-id> \
  --output <step-id>=<result.json> \
  --output <step-id>=<result.json> \
  --lease-token "$lease_token"
```

Load instructions for one request:

```bash
node develop/lib/entrypoints/cli/workflow-runner.mjs instructions --run-id <run-id> --step-id <step-id> --lease-token "$lease_token"
```

## Request loop

1. From the repo root, call `workflow-runner next` for a new/resumed run, or `workflow-runner continue` after request outputs are ready.
2. Read `response.status`.
3. If `response.status` is `done`, stop and report the completed result.
4. If `response.status` is `blocked`, stop and report the blocker.
5. If `response.status` is `needs_host_actions`, execute every request in `response.requests[]`; the runner may return one or many requests.
6. For each `run_worker` request, launch a fresh worker with the bootstrap below.
7. For each `wait_for_approval` request, ask Sergey/the user for the input described by the loaded request instructions. Despite the legacy action name, this is a generic user-input request, not only an approve/reject/block gate.
8. Capture one JSON host-output file per request.
9. Pass all host outputs back to `workflow-runner continue`.
10. Repeat from step 2.

## Host request rules

- Treat `response.requests[]` as the complete list of required host actions.
- Execute every request in the list before continuing.
- Do not run two `workflow-runner continue` commands concurrently for the same `<run-id>`; the runner rejects same-run concurrent continues with a lock error. Collect all current outputs, then continue once.
- `run_worker` may appear more than once; run those workers in parallel when safe.
- `wait_for_approval` is also a host request; do not skip it, infer approval, or force it into a fixed approval envelope.
- User input for `wait_for_approval` may be an approval verdict, an option choice, or free-form text.
- Normalize the user answer into JSON that matches the request/step output contract. Examples: `{ "approval": "approved" }`, `{ "choice": "option_b" }`, `{ "answer": "free-form text" }`, or another shape required by the request instructions/schema.
- When request instructions provide options, a schema, field names, or routing rules, use them to normalize the answer.
- If the user answer is ambiguous for the requested output shape, ask a follow-up before continuing.
- Use each request `id`/`stepId` when naming outputs for multiple requests.
- Host-output files and paths are only transport for `workflow-runner continue`; do not treat them as business concepts.
- If a worker, user answer, or host-output file is missing, stop as blocked instead of guessing.

## Worker bootstrap template

```text
Load the step instructions by running:

<command>

Then follow the loaded instructions exactly.

Do not add any behavior, role, output format, or constraints beyond the loaded instructions.

If the instructions cannot be loaded, stop with an error and do not continue.
```
