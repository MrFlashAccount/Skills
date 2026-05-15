# Create-Design Evidence Notes

Use this as a compact source stance when creating or reviewing design-memory artifacts. Do not turn `DESIGN.md` into a bibliography.

## 1. Internal OpenClaw / Sergey canon

These rules define the local workflow, not universal design theory:

- `DESIGN.md` is repo-local design law and the entrypoint for downstream design judgment
- supporting docs exist only when they remove real ambiguity or bloat
- approval gates, proposal mode, implementation mode, and branch handling are process canon from this skill
- product-class routing, density labels, and anti-slop heuristics are local routing aids; they are not a universal taxonomy

Use this canon to structure artifacts and precedence. Do not cite it as external evidence.

## 2. Core external accessibility floor

Design law should include concise accessibility constraints when relevant:

- readable text contrast and sufficient non-text contrast for controls, boundaries, focus, and state indicators
- visible keyboard focus and visually understandable keyboard/focus path
- reduced-motion alternatives for motion that could distract, disorient, or carry meaning
- reflow / zoom / narrow viewport behavior that preserves reading order and avoids clipped content
- visible target affordance for important controls, especially touch-heavy surfaces

Primary reference: W3C WCAG 2.2 — https://www.w3.org/TR/WCAG22/

Useful anchors: Contrast Minimum `1.4.3`, Non-text Contrast `1.4.11`, Reflow `1.4.10`, Keyboard `2.1.1`, Focus Visible `2.4.7`, Focus Not Obscured `2.4.11`, Animation from Interactions `2.3.3`, Target Size Minimum `2.5.8`.

## 3. Optional reference bank

Use these only when they materially calibrate the current project direction:

- NN/g visual-design principles — https://www.nngroup.com/articles/principles-visual-design/
- GOV.UK Design System — https://design-system.service.gov.uk/
- Apple Human Interface Guidelines — https://developer.apple.com/design/human-interface-guidelines
- Material Design — https://m3.material.io/ and https://m1.material.io/
- IBM Carbon accessibility — https://carbondesignsystem.com/guidelines/accessibility/overview/
- Atlassian foundations — https://atlassian.design/foundations/

References are evidence and calibration, not doctrine. Extract product-useful principles, name rejected parts, and write the resulting local rule into `DESIGN.md` only when it fits the product basis.

When create-design runs a reference/direction loop, use exactly 3 references/options per round. This is separate from Frontend-Taste visual proposals, which use 3-4 variants for taste-sensitive new screen/design work.

## 4. Performance boundary

Do not assign CLS, INP, Core Web Vitals, profiling, bundle cost, or root-cause performance work to Frontend-Taste. Design law may mention visible symptoms that affect first read or visual stability, then route metric ownership and fixes to Frontend / Performance roles.
