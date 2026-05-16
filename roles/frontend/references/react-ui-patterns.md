# React UI Patterns

Load this only when the target repo uses React or a React-based framework. Keep framework-specific rules here rather than in `../ROLE.md`.

## Component extraction seams

### Bad smell: one component owns every concern

```tsx
function TaskPage() {
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const tasks = useTasks(query);

  // many handlers, mutations, table rendering, empty/error UI, dialog state,
  // row markup, and permission rules all continue here...
}
```

Better:

```tsx
function TaskPage() {
  const model = useTaskPageModel();
  return <TaskPageView {...model} />;
}
```

Extraction seam: put fetching, mutations, URL/query parsing, and cross-control orchestration in a hook or route loader; keep `TaskPageView`, `TaskToolbar`, `TaskTable`, and dialogs focused on rendering and local interaction.

## Derived state

### Bad smell: effect mirrors render-derivable state

```tsx
const [visibleTasks, setVisibleTasks] = useState<Task[]>([]);

useEffect(() => {
  setVisibleTasks(tasks.filter(matchesFilter));
}, [tasks, matchesFilter]);
```

Better:

```tsx
const visibleTasks = useMemo(
  () => tasks.filter(matchesFilter),
  [tasks, matchesFilter],
);
```

Extraction seam: if derivation becomes large, extract a pure selector function and test it. Do not add synchronized state unless the user can independently edit the derived value.

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
const [shouldSave, setShouldSave] = useState(false);

useEffect(() => {
  if (shouldSave) saveDraft(form);
}, [shouldSave, form]);
```

Better:

```tsx
async function handleSave() {
  await saveDraft(form);
}
```

Extraction seam: move event-caused side effects into event handlers or mutation helpers; reserve effects for synchronization with external systems caused by rendering.

## Server/cache state

Use the repo's established server-state tool when present. Prefer cache invalidation, optimistic updates, and request lifecycle semantics there instead of copying remote data into local or global client state.

Smells:
- local `useState` duplicates data already owned by a cache
- optimistic state has no rollback path
- refetch logic is scattered across unrelated components
- loading and error states are only visible in the happy-path container

## React accessibility reminders

- Use native `<button>`, `<a>`, `<label>`, `<input>`, `<select>`, `<textarea>`, `<dialog>`, list, table, and heading semantics before recreating them with `div` and ARIA.
- Icon-only buttons need an accessible name.
- Custom widgets need the full keyboard contract for the pattern, not just `tabIndex`.
- Avoid focus loss when conditionally rendering loading/error states; intentionally move focus only when it helps task progress.
- Keep `aria-busy`, `role="status"`, `role="alert"`, `aria-invalid`, and `aria-describedby` tied to real state.
