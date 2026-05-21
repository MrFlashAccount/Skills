# Interaction Motion Craft

Use this when touched UI behavior includes animation, transitions, popovers, drawers, toasts, drag/gesture handling, or press feedback.

This is a frontend implementation reference. It checks whether interaction behavior is purposeful, interruptible, accessible, and performant. It does not create visual direction or a motion brand language; if motion changes hierarchy, tone, or product feel, route the visible-taste decision to Frontend-Taste / `DESIGN.md` first.

## Should it animate at all?

Before adding motion, answer:

- **Frequency**: Will the user see this hundreds of times per day, tens of times, occasionally, or rarely?
- **Trigger**: Is it keyboard-driven, pointer-driven, system-driven, or explanatory/marketing motion?
- **Cost**: Does it delay the next useful read or action?

Defaults:

- High-frequency and keyboard-driven actions should usually be instant or nearly instant.
- Repeated navigation, command palettes, list movement, and dense workflow controls need restraint more than delight.
- Occasional modals, drawers, menus, toasts, confirmations, and state changes may animate when the motion helps orientation.
- Rare onboarding, explanation, celebration, or educational moments can afford more character when `DESIGN.md` allows it.

Do not add animation whose only job is "looks cool" on a repeated work surface.

## Valid purposes

Motion should have at least one concrete job:

- **Feedback**: the control visibly acknowledges hover, press, submit, save, failure, or completion.
- **State**: the user can track loading, pending, selected, expanded, collapsed, or dismissed states.
- **Spatial consistency**: an object enters and exits from a place that matches its trigger or dismissal path.
- **Explanation**: a low-frequency sequence teaches how a feature or relationship works.
- **Jarring-change prevention**: appearance, disappearance, or replacement preserves orientation instead of popping abruptly.

If the purpose is unclear, remove or reduce the animation before tuning duration/easing.

## Duration bands

Use these as pressure ranges, then follow local product/design law when it is more specific:

- Button/press feedback: **100-160ms**.
- Tooltip or small anchored popover: **125-200ms**.
- Dropdown, select, menu, toast: **150-250ms**.
- Modal, drawer, sheet, larger overlay: **200-500ms**, biased shorter for frequent workflow UI.
- Explanation/onboarding/marketing motion: may be longer only when it does not block use.

Most interaction motion should stay under about **300ms** unless it is large, explanatory, or intentionally rare.

## Anchored surfaces and press feedback

Check these details on interactive surfaces:

- Popovers, menus, tooltips, and anchored overlays should animate from the trigger side/origin when the component system exposes that origin.
- Centered modals can stay center-origin because they are not spatially tied to one trigger.
- Avoid entrances from `scale(0)`; start from a visible-but-reduced scale plus opacity when scaling is appropriate.
- Pressable controls should usually have immediate press feedback such as a subtle transform, state color, or inset treatment.
- Keep press feedback small enough not to disturb layout, text readability, or adjacent controls.

## Interruptibility

Prefer transitions for dynamic UI that can be reversed, repeated, or retargeted quickly:

- toggles, hover/press states, toasts, disclosure, dropdowns, and rapidly changing UI should not restart from a rigid keyframe timeline
- keyframes are better for predetermined, non-interactive sequences that do not need mid-flight retargeting
- JS-driven animation is justified for gestures, physics, measured layout, or runtime-dependent motion; otherwise prefer CSS-native paths

Do not use `transition: all`; name the properties being animated.

## Gesture and drag basics

For drawers, sheets, swipes, sliders, reorder handles, and drag-to-dismiss UI:

- Include **velocity** in dismissal decisions so a deliberate flick can dismiss even without crossing a large distance threshold.
- Apply **damping/friction** beyond natural boundaries instead of hard invisible walls.
- Use **pointer capture** once dragging begins so movement remains stable when the pointer leaves the element.
- Protect against **multi-touch jumps** by ignoring additional touch points or explicitly owning the active pointer.
- Keep drag state local, reset it on cancel/end, and avoid leaving the UI in a half-dragged state.
- Preserve keyboard and non-pointer alternatives for important actions.

## Reduced motion and accessibility

Reduced motion is not "no state change." It means the same meaning must be available with less movement.

- Respect `prefers-reduced-motion` for movement, parallax, large transforms, auto-playing sequences, and motion that carries meaning.
- Replace large positional motion with opacity, color, instant state, or shorter fades when that preserves comprehension.
- Do not make animation the only indicator of success, error, selection, or progress.
- Gate hover-only effects to pointer/hover-capable devices so touch taps do not trigger misleading hover states.
- Ensure focus remains visible and is not hidden by animated overlays, fixed chrome, or clipping.

## Performance defaults

- Animate `transform` and `opacity` first.
- Avoid animating layout properties such as width, height, top, left, margin, padding, or grid placement on hot paths.
- Avoid large blur/backdrop-filter animation, especially across full-screen surfaces.
- Do not leave `will-change` on permanently; apply it only near active animation when needed.
- Avoid updating inheritable CSS variables every frame on large containers; update the animated element directly when possible.
- Pause or remove looping/offscreen animation unless it has a current product job.

## Review questions

- What task does this motion help?
- How often will this user see it?
- Does it preserve orientation or slow the work down?
- Is it interruptible where the interaction is interruptible?
- Does reduced motion preserve the same meaning?
- Are only cheap properties animated on performance-sensitive paths?

## Source inspiration

This repo adapts selected interaction and motion craft ideas from Emil Kowalski's `emil-design-eng` skill while omitting its manifesto, framework snippets, review-table mandate, and universal custom-easing stance: https://www.ui-skills.com/skills/emilkowalski/emil-design-eng/

## Final role evidence

When this file is loaded as role material, add this exact path to the final role evidence loaded list:

- `roles/frontend/references/interaction-motion-craft.md`

Only list this file if it was actually loaded.
