# Accessibility Floor

Use this for practical, WCAG-aligned frontend checks. It is not a pasted WCAG standard and does not replace specialist accessibility review when a product requires formal conformance.

Primary references:
- WCAG 2.2: https://www.w3.org/TR/WCAG22/
- Understanding WCAG 2.2: https://www.w3.org/WAI/WCAG22/Understanding/
- WAI-ARIA Authoring Practices: https://www.w3.org/WAI/ARIA/apg/
- Using ARIA: https://www.w3.org/TR/using-aria/

## Native HTML first

Start with semantic HTML and built-in controls. Use ARIA only when native HTML cannot express the needed semantics and behavior.

Prefer:
- `<button>` for actions
- `<a href>` for navigation
- real form controls with labels
- headings, landmarks, lists, and tables for structure
- native disabled, required, invalid, and dialog behavior where the repo/browser support is sufficient

Do not use ARIA to paper over inaccessible custom elements. Adding `role="button"` without keyboard behavior, focus handling, and state semantics is still broken.

## Semantics and structure

Check that:
- the page or region has a logical heading structure
- landmarks are present and not noisy
- lists and tables use real list/table semantics when they communicate structure
- icons or decorative elements are hidden only when they are truly decorative
- controls are grouped and described when the relationship matters

## Keyboard and focus

Every interactive path must work without a mouse.

Check that:
- controls are reachable in a logical order
- visible focus is present and not clipped or hidden
- Enter/Space behavior matches the native pattern for custom controls
- Escape, arrow keys, Home/End, or typeahead are implemented when the chosen widget pattern requires them
- focus is restored or moved intentionally after dialogs, menus, route changes, destructive actions, and async completion when needed
- focus is not trapped except inside intentional modal contexts

## Accessible names

Every control needs a useful accessible name.

Check that:
- visible labels and accessible names match closely enough for speech input and screen-reader users
- icon-only controls have a label
- links announce their destination or action without relying only on surrounding prose
- images have meaningful `alt` text or are marked decorative
- duplicate controls can be distinguished when needed

## Forms, labels, and errors

Check that:
- every input has a visible or programmatic label
- helper text and validation errors are associated with the field
- invalid state is exposed with real semantics such as `aria-invalid` when appropriate
- errors are described in text, not only by color or icon
- required fields, formats, and constraints are discoverable before submission when possible
- submission failure moves focus or announces the error summary when needed

## Dynamic, busy, and error semantics

Use announcements sparingly and accurately.

- Use `aria-busy` or disabled/pending affordances when controls or regions are temporarily unavailable.
- Use `role="status"` for non-urgent progress or success updates that should be announced politely.
- Use `role="alert"` for urgent errors that need immediate announcement.
- Avoid announcing every render or animation frame.
- Preserve content and focus stability during loading, empty, and error transitions.

## Dialogs, popovers, menus, and custom widgets

Prefer native or well-tested library implementations. If implementing a custom pattern, follow the WAI-ARIA Authoring Practices for that pattern and test with keyboard.

Minimum dialog floor:
- accessible name from title or label
- focus moves inside on open when appropriate
- focus cannot escape a modal dialog by Tab
- Escape or an obvious control closes when product behavior allows it
- focus returns to the invoking control or a sensible next target
- background content is not reachable by keyboard or assistive tech while modal

## Visual accessibility floor

Check that:
- color is not the sole signal for status, validation, or selection
- text and essential non-text UI have sufficient contrast for the product's target standard
- focus indicators remain visible in all states
- touch targets are reasonably sized and spaced for the context
- zoom, text resizing, and narrow viewport reflow do not hide content or controls
- reduced-motion preferences are respected when motion is non-essential or could distract/disorient

## Verification

A reasonable frontend accessibility verification note includes:
- keyboard walkthrough of the touched path
- focus order and visible-focus check
- accessible-name and label/error check
- screen-reader or accessibility-tree spot check for complex dynamic regions when available
- automated scan such as axe when available, with manual follow-up for issues automation cannot prove

Automated tools are useful but insufficient for keyboard logic, focus management, understandable names, and real task flow.

## Final role evidence

When this file is loaded as role material, add this exact path to the final role evidence loaded list:

- `roles/frontend/references/accessibility-floor.md`

Only list this file if it was actually loaded.
