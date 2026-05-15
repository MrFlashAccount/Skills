# Frontend Taste Evidence Notes

Use this as a lightweight source stance. Do not paste this file into every role output.

## 1. Internal OpenClaw / Sergey canon

These are local process and taste rules, not universal design law:

- repo-local `DESIGN.md` / equivalent design memory has precedence for product-specific direction
- proposal gates, branch/mode routing, and approval boundaries come from the calling OpenClaw workflow
- project-class routing, density labels, and anti-slop checks are local heuristics for faster judgment
- the anti-slop/cliche detector is a Frontend-Taste pressure tool; it can be overridden by concrete `DESIGN.md` product reasons

Use this canon to decide how this role works. Do not present it as external authority.

## 2. Core external accessibility floor

Treat WCAG-style accessibility basics as mandatory visual-design constraints when applicable:

- text contrast must support readable hierarchy, not only brand mood
- non-text contrast must keep controls, boundaries, focus indicators, and meaningful graphics perceivable
- keyboard focus must be visible, not hidden by chrome, overlays, or low-contrast styling
- keyboard path and focus order must remain visually understandable for interactive surfaces
- reduced-motion alternatives must preserve meaning when motion is decorative, disorienting, or interaction-triggered
- reflow / zoom / narrow viewport behavior must avoid clipped content and broken reading order
- target affordance should make interactive elements visibly reachable and tappable, especially on touch surfaces

Primary reference: W3C WCAG 2.2 — https://www.w3.org/TR/WCAG22/

Useful anchors: Contrast Minimum `1.4.3`, Non-text Contrast `1.4.11`, Reflow `1.4.10`, Keyboard `2.1.1`, Focus Visible `2.4.7`, Focus Not Obscured `2.4.11`, Animation from Interactions `2.3.3`, Target Size Minimum `2.5.8`.

If a project, jurisdiction, or organization requires a stricter accessibility standard, that stricter local requirement wins.

## 3. Optional reference bank

These sources are optional calibration material, not mandatory doctrine:

- NN/g visual-design and usability articles — hierarchy, scanning, evidence-backed usability framing: https://www.nngroup.com/articles/principles-visual-design/
- GOV.UK Design System — public-service clarity and accessibility posture: https://design-system.service.gov.uk/
- Apple Human Interface Guidelines — platform convention, hierarchy, harmony, system-fit: https://developer.apple.com/design/human-interface-guidelines
- Material Design — color roles, motion meaning, accessibility reminders: https://m3.material.io/ and https://m1.material.io/
- IBM Carbon — accessible enterprise UI, color/token discipline: https://carbondesignsystem.com/guidelines/accessibility/overview/
- Atlassian Design System — spacing, density, foundations, tokenized product UI: https://atlassian.design/foundations/

Use the bank only when it materially improves direction, accessibility, density, motion, color, or craft. Extract principles; do not copy component language, layouts, brand style, or full system rules.

## 4. Performance boundary

Frontend Taste does not own CLS, INP, Core Web Vitals, profiling, bundle cost, or root-cause performance diagnosis.

It may flag visible symptoms that damage presentation quality: layout jump, flicker, scroll lag, animation that delays comprehension, or a blocked first useful read. Route metric ownership and fixes to Frontend / Performance roles.
