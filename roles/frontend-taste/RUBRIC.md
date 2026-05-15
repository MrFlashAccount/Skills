# Frontend Taste Rubric

Derived checklist for the Frontend Taste role.

Use this as a compact checklist when a calling skill wants frontend taste judgment or screen-level visual proposals. `ROLE.md` remains the canonical role contract.

## Checklist

- **DESIGN.md first**: If `DESIGN.md` or equivalent repo design memory exists, was it read before Frontend Taste judgment/proposal work?
- **Design-law obedience**: Did the work operate inside `DESIGN.md` instead of overriding it with portable taste defaults, references, or project-class assumptions?
- **Missing/weak design law routing**: If `DESIGN.md` is absent, weak, or contradictory, did the role stop and route to `create-design` instead of inventing product basis, audience, visual direction, palette, typography, layout, density, motion law, or constraints?
- **Process-vs-role boundary**: Is the split explicit and respected: `create-design` authors/repairs design-memory artifacts and `DESIGN.md`; Frontend Taste operates inside existing design law for concrete screens/states/components?
- **New screen workflow**: For new screen/design work, was Reference Scout run, were 3-4 visual proposals produced, and did Sergey choose, combine, or reject before detail/spec/implementation work proceeded?
- **Reference Scout quality**: Were references distilled into useful principles, rejected parts, and current-screen constraints without copying layout, imagery, motion, typography, or brand language?
- **Hierarchy and reading order**: Does the interface guide attention intentionally and support fast scanning?
- **Spacing and composition**: Are spacing, alignment, proportions, and layout relationships balanced and deliberate?
- **Typography**: Does type follow the declared type system with strong scale, weight, line length, contrast, rhythm, and readability?
- **Color and emphasis**: Does color follow the declared palette and support emphasis instead of becoming noisy or muddy?
- **Density**: Does the surface match the density declared in `DESIGN.md` instead of defaulting to sparse drama, bento-by-default, or cramped utility mush?
- **Motion**: Does motion follow declared motion rules, show cause/effect, weight, pause, and restraint, and avoid hiding hierarchy, delaying comprehension, blocking action, spectacle, or endless loops?
- **Anti-slop**: Does the work avoid purple/rainbow tech gradients, emoji-icon crutches, left-border accent cards, fake metrics, fake quotes, fake product imagery, SVG silhouettes, bento-by-default, and typography without hierarchy unless `DESIGN.md` gives a concrete reason?
- **Honest content**: Is an honest placeholder used instead of fake content when real content is unavailable?
- **Polish and finish**: Does the surface feel intentional and complete rather than sloppy, cramped, or generic?
- **Visible performance polish**: Does the rendered experience avoid jank, scroll lag, layout shift, flicker, and decorative waiting that blocks first useful comprehension?
- **Originality/cliche**: Does the surface avoid generic AI-template cliches, aesthetic-label name-dropping, and `20 philosophies` as canon/style menu?
- **Learnings**: Were relevant durable learnings from `LEARNINGS.md` applied only after local design law was checked?

## Review gate catches

Fail or bounce the work when:

- a screen design/review was done without reading existing `DESIGN.md`
- Frontend Taste invented or rewrote product basis, audience, visual direction, palette, typography, layout, density, motion law, constraints, or trust posture
- missing/weak `DESIGN.md` was handled by guessing instead of routing to `create-design`
- taste-sensitive new screen work skipped Reference Scout or skipped the 3-4 visual proposals
- detail/spec/implementation began before Sergey chose, combined, or rejected the proposals
- a proposed change edits `DESIGN.md` or other design-memory artifacts without entering the explicit `create-design` / design-memory path

## Notes

This rubric is phase-agnostic. A calling skill decides how to apply it in the current phase.

When repo design memory exists, use it as local law and use role learnings as supporting taste canon. When design memory is missing or weak, Frontend Taste routes to `create-design`; it does not author the base contract itself. This mirrors `create-architecture` vs Architect: workflow authors/repairs the contract; role operates inside the contract.
