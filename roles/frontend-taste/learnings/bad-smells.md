# Bad Smells

Use this file for patterns that are not universally forbidden, but should trigger pressure, skepticism, and a request for a clear reason.

## Visual effects smells

- neon or outer-glow styling used as a shortcut to “premium”
- gradient text used to manufacture emphasis instead of building hierarchy
- glass or blur effects layered everywhere without stronger structure underneath

## Typography smells

- oversized hero typography doing all the work alone
- font choices that feel generic by habit or flashy by insecurity
- serif usage on dense software surfaces without a strong reason
- decorative text treatments used to manufacture hierarchy instead of building it

## Layout smells

- centered hero composition used by default instead of by intent
- repetitive section structure with no pacing change
- too many containers trying to create importance at once
- navigation chrome that becomes more expressive than the page structure it is supposed to support

## Content / state smells

- static happy-path screens with weak loading, empty, or error treatment
- placeholder data that makes the surface feel synthetic instead of believable
- decorative motion added to disguise a weak content model
- interaction-rich shell covering weak information architecture
- screenshot-first design that optimizes for one striking frame while weakening scanning, repetition, or sustained use
- media usage that feels slotted, generated, or filler-like instead of authored
- style drift between sections that makes the product feel assembled rather than directed

## Visible stability / latency smells

These are visible symptoms for Frontend-Taste pressure, not Core Web Vitals ownership.

- obvious jank, scroll lag, layout shift, or flicker during normal use
- heavy visual treatment that delays the first useful read of the surface
- loading or pending states that break the established spacing rhythm
- animation that makes the product feel slower even when it looks expensive

## How to use this file

A bad smell is not an automatic rejection.
It means:
- ask why it is there
- ask what job it is doing
- ask whether a simpler, more authored alternative would be stronger
