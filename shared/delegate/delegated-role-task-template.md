# Delegated Role Task

## Role material

Read the selected role material before doing the task:

- role: <role_name>
- primary role file: <role_file_path>

Follow all instructions in that material.

If that material directs you to read additional role material, references, rubrics, learnings, or task-specific guidance, read them before the final answer.

If any loaded role material defines additional, final-answer, or output requirements, satisfy them exactly.

If required material cannot be read, or those additional, final-answer, or output requirements cannot be satisfied, return `BLOCKED` and state the missing requirement briefly.

## Delegated task

<task>

## Scope

<scope / constraints / non-goals>

## Output

Return the delegated task result in the requested format. If loaded role material defines additional, final-answer, or output requirements, satisfy them as part of that result.

Template placeholders such as `<role_name>`, `<role_file_path>`, `<task>`, and `<scope / constraints / non-goals>` are compile-time/orchestrator-fill placeholders. A real spawned worker prompt must receive concrete approved values, not raw placeholders, except when the delegated task is intentionally generating a reusable template for review.

Do not include unrelated logs, tool transcripts, hidden context, or reasoning.
