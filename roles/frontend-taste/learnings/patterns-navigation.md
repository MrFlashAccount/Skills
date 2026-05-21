# Navigation Patterns

Use this file when the question is about how navigation should orient the user, hold hierarchy, and contribute to the surface composition without turning into gimmick chrome.

## Good navigation jobs

Good navigation should:
- make orientation obvious quickly
- reflect the product's information hierarchy instead of fighting it
- feel integrated with the page composition rather than pasted on top
- help the user understand where primary actions and secondary paths live
- stay calm enough that content remains the main read

## Navigation pattern families

### Quiet structural navigation

Use when the surface needs clarity, trust, and low drama.

Good signs:
- clear grouping of primary vs secondary actions
- spacing and alignment do most of the work
- emphasis is controlled through hierarchy, not decoration
- the bar or rail feels anchored and intentional

Common fits:
- dashboards
- admin panels
- docs surfaces
- serious product marketing pages

### Floating or edge-anchored navigation

Use when the product wants a stronger authored feel without losing orientation.

Good signs:
- navigation placement reinforces the page composition
- floating treatment increases clarity or elegance instead of visual noise
- the container has enough restraint to avoid feeling like a toy

Common fits:
- premium marketing sites
- portfolios
- more expressive editorial surfaces

### Contextual or expanding navigation

Use when the surface genuinely has layered navigation or dense optional actions.

Good signs:
- expansion reveals meaningful structure
- the user can still predict where things went
- motion supports orientation instead of spectacle

Use carefully:
- expansion patterns are easy to over-design
- if the menu becomes the most memorable thing on the page, it is probably too loud

## Navigation do / don't

Do:
- separate primary navigation from utilities and secondary actions
- use placement, spacing, and grouping to signal importance
- let the navigation participate in the page rhythm
- make active state and current location obvious

Don't:
- use navigation gimmicks that weaken orientation
- rely on hover theatrics to explain structure
- make the nav container louder than the page content by default
- add floating, gooey, magnetic, or novelty behavior unless the repo's design memory clearly justifies it

## Smells

Bad signs:
- generic top strip with weak grouping and no hierarchy
- nav effects that feel more memorable than the information architecture
- oversized pills, glow, blur, or motion used to fake polish
- menus that hide simple structure behind unnecessary reveal mechanics
- navigation that looks premium in isolation but makes the page harder to parse

## Final role evidence

When this file is loaded as role material, add it to the final role evidence loaded list as:

- `roles/frontend-taste/learnings/patterns-navigation.md`

Only list this file if it was actually loaded.
