# UI Baseline Red Flags

Use this as a compact frontend PR checklist for ordinary user-facing UI surfaces. It catches small implementation choices that often create brittle, inaccessible, or inconsistent UI.

This is an engineering baseline. It does not replace `ui-engineering-gate.md`, accessibility review, or Frontend-Taste visual judgment.

## Primitive and design-system discipline

- Use existing primitives, tokens, and component patterns before inventing new local UI.
- Do not mix primitive systems on one surface unless the migration boundary is explicit and visually contained.
- Avoid local visual law: arbitrary colors, local z-index games, one-off shadows/radii, and bespoke state styling when the system already has a path.
- If the design system lacks a needed primitive, name the gap and keep the implementation minimal instead of silently creating a second system.

## Destructive and irreversible actions

- Destructive, irreversible, expensive, or permission-changing actions need a confirmation primitive or an equivalent safe review step.
- The confirmation should name the object and consequence, not just ask "Are you sure?"
- Do not hide destructive actions beside common actions without visual and interaction separation.
- Keep cancel/escape paths obvious and keyboard reachable.

## Mobile viewport and fixed UI traps

- Avoid treating `h-screen` as a safe mobile viewport; mobile browser chrome can make it trap or clip content.
- Prefer dynamic viewport units or repo-standard viewport helpers when available.
- Fixed headers, footers, drawers, and bottom bars must account for safe areas and should not cover focused inputs or final actions.
- Check narrow widths for horizontal overflow, unreachable controls, and clipped sticky/fixed regions.

## Forms and errors

- Put validation errors near the field or action they explain.
- Preserve user input after errors; do not clear fields on failed submit unless there is a strong safety reason.
- Never block paste in ordinary text, code, email, password, token, or verification fields.
- Keep helper text, required state, invalid state, and retry actions discoverable before or immediately after submission.
- Use text, not only color or iconography, to communicate the error.

## Data and text presentation

- Use tabular numbers for aligned numeric data, totals, financials, metrics, and dense tables where the font supports it.
- Use real table semantics for tabular relationships when possible.
- Enable balanced or pretty text wrapping for headings/body where browser support and repo conventions make it safe; do not rely on fragile manual line breaks.
- Test long names, missing values, zero states, and localized/variable-length text.

## Layering and z-index

- Use a fixed z-index scale or design-system layering tokens.
- Do not introduce arbitrary local z-index values that compete with modals, popovers, tooltips, toasts, sticky chrome, and focus rings.
- Ensure overlays trap, restore, or pass focus according to their role instead of only appearing above other content.
- Check that focus indicators are not clipped or hidden behind layered surfaces.

## Empty states

- An empty state should explain what happened and offer one clear next action when a useful action exists.
- Avoid generic illustration-only emptiness with no recovery path.
- Distinguish first-use empty, filtered-empty, permission-empty, error-empty, and true-zero states when the consequence differs.
- Keep empty states aligned with the density and tone of the surrounding product surface.

## Source inspiration

This repo adapts selected compact UI PR red flags from ibelick's `baseline-ui` skill while omitting Tailwind-only/package-specific mandates and any universal "never animate" rule: https://www.ui-skills.com/skills/ibelick/baseline-ui/

## Final role evidence

When this reference is actually loaded, include this file in final role evidence.
