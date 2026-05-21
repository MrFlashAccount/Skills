# React UI Patterns

Load this only when the target repo uses React or a React-based framework. Keep framework-specific rules here rather than in `../ROLE.md`. This file is the canonical home for the React/Next.js best-practice defaults that previously lived in a separate frontend guidance package.

## Async and waterfall control

Treat waterfalls as a correctness problem, not just a speed smell.

- Start independent async work together and await it as late as possible.
- Move `await` into the branch that truly needs the value; do not block skipped or early-return paths.
- For partial dependencies, start the base promise immediately and derive dependent promises from it instead of creating a serial chain.
- In API routes, server actions, route loaders, and server components, start auth/config/data work early when they do not depend on each other.
- Use component composition or `Suspense` boundaries so wrapper UI can render while slower interior data resolves, but do not stream content that is required for layout or above-the-fold SEO decisions.

Small pattern:

```tsx
const userPromise = fetchUser()
const profilePromise = userPromise.then(user => fetchProfile(user.id))
const configPromise = fetchConfig()

const [user, profile, config] = await Promise.all([
  userPromise,
  profilePromise,
  configPromise,
])
```

## Bundle boundaries and loading

- Import directly from heavy libraries instead of broad barrel exports, unless the repo already has a reliable build-time transform such as `optimizePackageImports`.
- Lazy-load heavy, route-secondary, or rarely used UI with dynamic import boundaries instead of pulling it into the initial bundle.
- Defer non-critical third-party code such as analytics, logging, or feature-only tooling until after hydration or until the feature is actually entered.
- Preload likely-heavy modules on clear intent such as hover, focus, or flag enablement when that meaningfully reduces perceived latency.
- Keep client-only conditional imports guarded so server bundles do not pay for code that only runs in the browser.

Small pattern:

```tsx
const Editor = dynamic(() => import('./Editor').then(m => m.Editor), {
  ssr: false,
})

function OpenEditorButton() {
  const preload = () => void import('./Editor')
  return <button onMouseEnter={preload} onFocus={preload}>Open editor</button>
}
```

## Server and RSC boundary discipline

Use these only when the stack actually has Next.js-style server actions, RSC, or equivalent server/client boundaries.

- Authenticate and authorize inside every server action; treat it like a public mutation endpoint.
- Use `React.cache()` for repeated non-`fetch` async work within a request. Escalate to cross-request memory caches only when the runtime truly reuses process memory and the cache semantics are safe.
- Minimize server-to-client serialization. Pass only the fields the client uses, and do client-side transforms there when the original data must also be preserved.
- Avoid serializing the same logical data twice through freshly transformed arrays/objects when one source value would do.
- Use post-response hooks such as Next.js `after()` only for truly non-blocking follow-up work like analytics, logging, or cleanup.

Small pattern:

```tsx
const getCurrentUser = cache(async (userId: string) => {
  return db.user.findUnique({ where: { id: userId } })
})
```

## Component extraction seams

### Bad smell: one component owns every concern

```tsx
function TaskPage() {
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const tasks = useTasks(query)

  // many handlers, mutations, table rendering, empty/error UI, dialog state,
  // row markup, and permission rules all continue here...
}
```

Better:

```tsx
function TaskPage() {
  const model = useTaskPageModel()
  return <TaskPageView {...model} />
}
```

Extraction seam: put fetching, mutations, URL/query parsing, and cross-control orchestration in a hook or route loader; keep `TaskPageView`, `TaskToolbar`, `TaskTable`, and dialogs focused on rendering and local interaction.

## Derived state

### Bad smell: effect mirrors render-derivable state

```tsx
const [visibleTasks, setVisibleTasks] = useState<Task[]>([])

useEffect(() => {
  setVisibleTasks(tasks.filter(matchesFilter))
}, [tasks, matchesFilter])
```

Better:

```tsx
const visibleTasks = useMemo(
  () => tasks.filter(matchesFilter),
  [tasks, matchesFilter],
)
```

Extraction seam: if derivation becomes large, extract a pure selector function and test it. Do not add synchronized state unless the user can independently edit the derived value.

## Render and rerender mechanics

- Derive values during render instead of mirroring them through `useEffect` + state.
- Move interaction-caused side effects into event handlers or mutation helpers instead of encoding them as state flags plus effects.
- When state updates depend on current state, use functional `setState` so callbacks stay stable and avoid stale closures.
- Prefer primitive or already-derived effect dependencies over whole objects.
- Use lazy `useState(() => expensiveInit())` for heavy initializers such as parsed storage, indexes, or large transforms.
- Keep transient, high-frequency values in refs when the UI does not need to rerender on every change.
- Subscribe to derived booleans or media queries rather than continuously changing raw values when only the threshold matters.
- Use `useTransition` or `startTransition` for non-urgent updates that should not block interaction.
- Avoid `useMemo` for cheap primitive expressions, and do not rely on `memo` if you keep passing freshly created default arrays, objects, or callbacks.
- For long-lived subscriptions that must not resubscribe on every render, prefer stable callback refs or `useEffectEvent` when the React version supports it.

## Boolean-prop matrices

### Bad smell: component API encodes many modes

```tsx
<Card compact selectable highlighted destructive loading empty admin />
```

Better:

```tsx
<TaskCard density="compact" state="loading" tone="danger" />
```

Or split by concept:

```tsx
<TaskCard task={task} />
<TaskCardSkeleton />
<TaskCardEmpty onCreate={onCreate} />
```

Extraction seam: when combinations require separate markup, separate components are clearer than booleans that hide incompatible states.

## Event-caused effects

### Bad smell: effect reacts to a flag set by an event

```tsx
const [shouldSave, setShouldSave] = useState(false)

useEffect(() => {
  if (shouldSave) saveDraft(form)
}, [shouldSave, form])
```

Better:

```tsx
async function handleSave() {
  await saveDraft(form)
}
```

Extraction seam: move event-caused side effects into event handlers or mutation helpers; reserve effects for synchronization with external systems caused by rendering.

## Hydration and client-only values

- Do not read browser-only APIs like `localStorage` during server render.
- If a client-only preference must appear before hydration without flicker, use the framework's pre-hydration script/document path rather than rendering the wrong default and fixing it later.
- Use `suppressHydrationWarning` only for genuinely expected one-node mismatches such as timestamps or locale-specific text, not to hide real boundary bugs.

## Server/cache state

Use the repo's established server-state tool when present. Prefer cache invalidation, optimistic updates, and request lifecycle semantics there instead of copying remote data into local or global client state.

Smells:
- local `useState` duplicates data already owned by a cache
- optimistic state has no rollback path
- refetch logic is scattered across unrelated components
- loading and error states are only visible in the happy-path container

## Browser and JS hot paths

- Deduplicate global listeners and repeated client requests when many component instances subscribe to the same source.
- Mark scroll/touch/wheel listeners as passive when they never call `preventDefault()`.
- Batch DOM reads and writes to avoid layout thrash; prefer CSS classes or a single style write over many interleaved mutations.
- Use `content-visibility` for large off-screen lists when the layout model supports it.
- For repeated membership or lookup work, build `Set`/`Map` indexes once instead of repeated `includes()`/`find()` scans.
- Combine repeated loops, return early when the answer is known, and hoist loop-invariant work such as RegExp construction.
- Cache repeated synchronous storage reads or pure function results when the same hot-path inputs recur often enough to matter.
- Prefer immutable array helpers such as `toSorted()` over mutating `sort()` when the value participates in React state/props flow.

## React accessibility reminders

- Use native `<button>`, `<a>`, `<label>`, `<input>`, `<select>`, `<textarea>`, `<dialog>`, list, table, and heading semantics before recreating them with `div` and ARIA.
- Icon-only buttons need an accessible name.
- Custom widgets need the full keyboard contract for the pattern, not just `tabIndex`.
- Avoid focus loss when conditionally rendering loading/error states; intentionally move focus only when it helps task progress.
- Keep `aria-busy`, `role="status"`, `role="alert"`, `aria-invalid`, and `aria-describedby` tied to real state.

## Final role evidence

When this file is loaded as role material, add this exact path to the final role evidence loaded list:

- `roles/frontend/references/react-ui-patterns.md`

Only list this file if it was actually loaded.
