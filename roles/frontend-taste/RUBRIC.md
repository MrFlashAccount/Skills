# Frontend Taste Rubric

Derived checklist for the Frontend Taste role.

Use this as a compact checklist when a calling skill wants frontend taste judgment or screen-level visual proposals. `ROLE.md` remains the canonical role contract.

## Checklist

- **DESIGN.md first**: If `DESIGN.md` or equivalent repo design memory exists, was it read before Frontend Taste judgment/proposal work?
- **Design-law obedience**: Did the work operate inside `DESIGN.md` instead of overriding it with portable taste defaults, references, or project-class assumptions?
- **Missing/weak design law routing**: If `DESIGN.md` is absent, weak, contradictory, or lacks a router, did lightweight taste review stop at `shared-core.md`, state undeclared design routing, and lower class-specific confidence; and did any work needing design law/product basis/audience/visual direction/palette/typography/layout/density/motion law/constraints/high-confidence screen direction route to `create-design`?
- **Process-vs-role boundary**: Is the split explicit and respected: `create-design` authors/repairs design-memory artifacts and `DESIGN.md`; Frontend Taste operates inside existing design law for concrete screens/states/components?
- **Source stance**: Are internal OpenClaw/Sergey canon, core external accessibility requirements, and optional reference-bank material clearly separated instead of blended into one doctrine?
- **Create-design handoff**: In design-creation/repair flows, are product, audience, requirements, product type, key action, trust posture, density, emotional tone, references, and important states closed through `create-design` before Frontend Taste relies on them as law?
- **New screen workflow / Direction Router**: For Frontend Taste new screen/design work, was Reference Scout run, were 3-4 product-tied visual proposals produced and compared, and did Sergey choose, combine, or reject before detail/spec/implementation work proceeded? If this is a `create-design` reference/direction loop, were exactly 3 options/references used for the round?
- **Reference Scout quality**: Were references distilled into useful principles, rejected parts, and current-screen constraints without copying layout, imagery, motion, typography, or brand language?
- **Hierarchy and reading order**: Does the interface guide attention intentionally and support fast scanning?
- **Spacing and composition**: Are spacing, alignment, proportions, and layout relationships balanced and deliberate?
- **Typography**: Does type follow the declared type system with strong scale, weight, line length, contrast, rhythm, and readability?
- **Color and emphasis**: Does color follow the declared palette and support emphasis instead of becoming noisy or muddy?
- **Density**: Does the surface match the density declared in `DESIGN.md` instead of defaulting to sparse drama, bento-by-default, or cramped utility mush?
- **Motion**: Does motion follow declared motion rules, show cause/effect, weight, pause, and restraint, and avoid hiding hierarchy, delaying comprehension, blocking action, spectacle, or endless loops?
- **Accessibility floor**: Are contrast, non-text contrast, focus visibility, keyboard-visible path, reduced motion, reflow, and target affordance acceptable for the visual surface?
- **Anti-slop**: Does the work avoid purple/rainbow tech gradients, emoji-icon crutches, left-border accent cards, fake metrics, fake quotes, fake product imagery, SVG silhouettes, bento-by-default, and typography without hierarchy unless `DESIGN.md` gives a concrete reason?
- **Honest content**: Is an honest placeholder used instead of fake content when real content is unavailable?
- **Polish and finish**: Does the surface feel intentional and complete rather than sloppy, cramped, or generic?
- **Visible stability/latency symptoms**: Does the rendered experience avoid visible jank, scroll lag, layout jump, flicker, and decorative waiting that blocks first useful comprehension, while routing CLS/INP/Core Web Vitals ownership to Frontend / Performance roles?
- **Originality/cliche**: Does the surface avoid generic AI-template cliches, aesthetic-label name-dropping, and `20 philosophies` as canon/style menu?
- **Learnings**: Were relevant durable learnings from `LEARNINGS.md` applied only after local design law was checked?

## Review gate catches

Fail or bounce the work when:

- a screen design/review was done without reading existing `DESIGN.md`
- Frontend Taste invented or rewrote product basis, audience, visual direction, palette, typography, layout, density, motion law, constraints, or trust posture
- missing/weak `DESIGN.md` or absent design router was handled by guessing design law or project class instead of using the lightweight `shared-core.md` fallback or routing law/direction work to `create-design`
- taste-sensitive new screen work skipped Reference Scout or skipped the 3-4 visual proposals
- detail/spec/implementation began before Sergey chose, combined, or rejected the proposals; proposal critique itself may happen before that choice
- a proposed change edits `DESIGN.md` or other design-memory artifacts without entering the explicit `create-design` / design-memory path

## Notes

This rubric is phase-agnostic. A calling skill decides how to apply it in the current phase.

When repo design memory exists, use it as local law and use role learnings as supporting taste canon. When design memory is missing, weak, or lacks a router, Frontend Taste may do lightweight taste review from `shared-core.md` only with undeclared routing and lower class-specific confidence; law/direction work routes to `create-design`. It does not author the base contract itself. This mirrors `create-architecture` vs Architect: workflow authors/repairs the contract; role operates inside the contract.

## Final role evidence

When this file is loaded as role material, add this exact path to the final role evidence loaded list:

- `roles/frontend-taste/RUBRIC.md`

Only list this file if it was actually loaded.
