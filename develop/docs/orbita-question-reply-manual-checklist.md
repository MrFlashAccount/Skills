# Orbita question/reply manual test checklist

Use a local/dev Orbita setup only. Do not run this against a production Telegram/OpenClaw session unless the requester explicitly approves it.

## Preconditions

- Orbita plugin is available in a requester session.
- A workflow fixture or test workflow can reach a worker `needs_input` outcome that routes to a question gate, for example `research_draft` → `ask_*question*`.
- You can see messages delivered to the original requester session.
- Background delivery uses a trusted internal Orbita relay event injected into the original requester OpenClaw session via Gateway `sessions.send`; that relay header is assistant-private and must not be copied verbatim to the user. The main assistant should relay only the safe public card.

## Steps and expected results

1. Start a workflow that reaches a question gate.
   - Example command: `/orbita run workflows/research-critic/workflow.json <task that requires one concise clarification>`
   - Expected immediate message: workflow started in background, including `Workflow run: <run>` and a request id.
   - Pass: command returns without blocking the session.
   - Fail: command exposes raw workflow path internals, prompt text, lease tokens, or errors before the workflow reaches a public state.

2. Verify the requester session receives a question card.
   - Expected internal session event is marked `openclaw.orbita.background_relay.v1` and contains a `PUBLIC ORBITA CARD`; the user-visible assistant reply should show only that public card, not the assistant-private relay header copied verbatim.
   - Expected delivered message starts with `🪐 Orbita ждёт ответ`.
   - Expected content includes `run id: <run>`, `Needed: answer`, a safe summary/open question, and `Expected answer:` with only `/orbita reply <run> text`.
   - Pass: the card arrives in the original requester session.
   - Fail: no card arrives, it is sent to another session, or it includes `/orbita approve`, `/orbita reject`, internal step schemas, raw prompts, lease tokens, session refs, filesystem paths, or requester binding internals.

3. Answer the question from the requester session.
   - Command: `/orbita reply <run> <text>`
   - Example: `/orbita reply <run> Use repo path develop/lib and keep scope to the regression test.`
   - Expected immediate ack: `🪐 Workflow answered`, the same workflow run id, status, and request id.
   - Pass: the reply is accepted.
   - Fail: Orbita says the run is not waiting, rejects a normal text answer, requires approve/reject, or leaks private diagnostics.

4. Verify workflow continuation and terminal/update delivery.
   - Expected later message: `🪐 Orbita workflow update` with terminal status such as `done` or the next safe public gate.
   - Pass: workflow continues after the reply and delivers the update to the original requester session exactly once.
   - Fail: workflow stays stuck on the question gate, duplicates the terminal delivery, or routes the update to the wrong session.

5. Final privacy/surface check.
   - Pass: question card and terminal/update delivery contain no private internals: `requesterBinding`, `sessionRef`, `origin`, `leaseToken`, raw prompt/transcript markers, schema names, local absolute paths, unsafe artifact paths, worker raw output, or workflow runner implementation details.
   - Pass: relay envelope text, Gateway details, and idempotency/delivery diagnostics are not shown in the final user-visible assistant message.
   - Fail: any private/internal value appears in user-visible messages or stored public delivery diagnostics.
