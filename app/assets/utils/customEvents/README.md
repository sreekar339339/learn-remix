# Custom events

`customEvents` creates a typed, native-event descriptor for one component or
domain object.

## Define events

Declare facts, outcomes, or independently consumed UI projections. Name local
descriptors `events`; reserve a domain name for reusable classes.

```tsx
type SaveEventsMap = {
  saveStarted: null;
  saveSucceeded: { revision: number };
  saveFailed: { error: Error };
};

let events = customEvents<SaveEventsMap>();

// Signal-only events
let signals = customEvents<"listUpdated" | "editorUpdated">();

// Signal-only and detailed events in one definition
let mixed = customEvents<
  "operationStarted" | { valueProposed: string } | "operationCompleted"
>();
```

An event detail is a consumer contract. Use it when the transition itself must
transfer a value to its consumer. Omit it when producers and consumers already
share the authoritative model and the event is only a precise signal.

## Dispatch

The descriptor is callable and returns an ordinary `CustomEvent`, so native
`dispatchEvent()` remains the normal dispatch API. An already-aborted event
option signal throws its abort reason during event creation; no inert substitute
is returned.

The declared event name is also its raw DOM `event.type`, so ordinary
`addEventListener()` consumers can observe it. Known native DOM event names are
rejected at the type level. Descriptor-aware projections, effects, and
observers ignore events created by another descriptor, even when both
descriptors declare the same raw name. Native listeners follow ordinary DOM
semantics and see every event with the name they subscribed to.

```tsx
form.dispatchEvent(events("saveStarted"));
form.dispatchEvent(events("saveSucceeded", { revision }));
form.dispatchEvent(events("saveSucceeded", { revision }, { key: revision }));

// One transition refreshes two independent regions.
form.dispatchEvent(events(["listUpdated", "editorUpdated"]));
form.dispatchEvent(events({ listUpdated: null, editorUpdated: null }));

// One transaction with independently routed entries.
form.dispatchEvent(events([
  "listUpdated",
  { editorUpdated: { options: { key: editorId } } },
  {
    saveSucceeded: {
      detail: { revision },
      options: { key: revision },
    },
  },
], { composed: true }));
```

A batch is one dispatch containing several declared entries. On DOM targets,
the entries remain one atomic carrier and descriptor consumers receive
in-memory event snapshots; the descriptor does not redispatch granular DOM
events or invent an aggregate `change` event. On a configured non-DOM
`EventTarget` host, each entry is additionally mirrored as a native named event
so `addEventListener()` and `addEventListeners()` can consume batched domain
updates. These domain mirrors do not reenter descriptor processing.

Configured entry options contain only `key`, because routing may differ per
entry. Propagation and event-creation cancellation belong to the single batch
carrier. Repeated event types are preserved in declaration order, allowing one
transaction to address several keyed consumers with the same event. Effects
and observers run for every matching entry; each projection commits once with
its final matching entry.

### Await transaction completion

Use `events.dispatch(target, ...eventArgs)` when subsequent code genuinely
depends on the descriptor transaction having settled:

```tsx
await events.dispatch(form, [
  "listUpdated",
  { editorUpdated: { options: { key: editorId } } },
]);
```

It accepts the same single-event, map, and batch forms as `events()`. Native DOM
dispatch still runs synchronously. The returned promise resolves after the
source projection, remaining projections, and returned observer/effect
promises settle. Target observers are invoked synchronously; their returned
promises join completion without delaying projection commits. The dispatch
promise rejects when a projection, effect, or observer fails.

Keep using `target.dispatchEvent(events(...))` when no code needs to await the
committed DOM state.

### Cancellation

Descriptor events report completed facts and are always non-cancelable.
`cancelable` is therefore not a supported event option, and
`dispatchEvent()` returns `true` for descriptor events.

When an operation genuinely needs a preventable pre-transition phase, use a
separate native event contract before changing the model. Publish the custom
event only after the transition has completed.

## Consume

The API has three deliberately separate consumption roles:

| Role | API | Ownership and timing |
| --- | --- | --- |
| Projection | `<events.on.name.tag>` or `<events.tag>` | Declaratively updates one existing element |
| Effect | `events.on(selector, listener)` | Runs on the mixin element after matching projections commit |
| Observer | `events.observe(listener)` | Imperatively sees every descriptor event on one exact target before projections commit |

Use `events.on()` for a post-render DOM effect such as focus, selection, or
measurement on the element hosting the mixin. It participates in element host
scope and keyed routing. Keep attributes and child content declarative in JSX.

Use an event-aware intrinsic element such as `<events.on.name.form>` for one
event, or `<events.form>` when the projection observes every declared event:

```tsx
<input
  mix={events.on("saveFailed", ({ currentTarget }) => {
    currentTarget.focus();
  })}
/>

<events.form
  class={(event) => event?.type === "saveStarted" ? "pending" : ""}
  aria-busy={(event) => event?.type === "saveStarted"}
  child={(event) =>
    event?.type === "saveSucceeded"
      ? <p>Saved revision {event.detail.revision}</p>
      : <p>Not saved yet.</p>
  }
/>

// Observe every event for an imperative post-render effect.
<input
  mix={events.on("*", (event) => {
    // Runs once for each matching batch entry, in transaction order.
  })}
/>

// Use Remix for named native events.
addEventListeners(model, signal, {
  saveFailed(event) {
    console.error(event.detail.error);
  },
});

// Observe every descriptor-owned event on a configured host.
let modelEvents = customEvents<SaveEventsMap>({ host: model });
modelEvents.observe((event) => console.log(event.type), { signal });

// Or observe an explicit target.
events.observe(form, (event) => console.log(event.type), { signal });

// Subscribe one projection to a precise subset of the event vocabulary.
let saveOutcome = events.on(["saveSucceeded", "saveFailed"]);

<saveOutcome.output
  child={(event) => event?.type === "saveSucceeded" ? "Saved" : "Save failed"}
/>
```

For reusable domain objects, derive Remix's `TypedEventTarget` map from the
same detail definition. Native `addEventListener()` and Remix
`addEventListeners()` callbacks then receive the correct event names, details,
and `currentTarget`:

```tsx
type PlayerEvents = {
  playbackStarted: number;
  playbackStopped: number;
};

class Player extends TypedEventTarget<CustomEventsEventMap<PlayerEvents>> {
  events = customEvents<PlayerEvents>({ host: this });
}
```

On event-aware elements, ordinary attributes accept either a static value or
`(event) => value`. Read payloads from `event.detail`. `mix`, `ref`, and JSX
children retain their ordinary Remix meaning. Use Remix's `on()` inside `mix`
for native DOM handlers. `child` supplies dynamic children, so it cannot be
combined with static JSX children.

### Intrinsic elements as granular projections

An event-aware intrinsic element is an independently invalidatable projection.
It can update native properties such as `value`, `class`, `disabled`, ARIA and
`data-*` attributes, and its child content without rerendering the component
that contains it.

This is especially useful for repeated elements. A keyed event can update one
existing item without rerunning the parent's render function or `.map()`:

```tsx
{items.map((item) => (
  <events.on.itemUpdated.button
    id={String(item.id)}
    value={() => String(item.id)}
    disabled={() => item.pending}
    class={() => item.pending ? "pending" : ""}
    data-state={() => item.pending ? "saving" : "ready"}
    child={() => item.label}
  />
))}

button.dispatchEvent(events("itemUpdated", { key: item.id }));
```

Without this boundary, independent updates commonly require extracting a
function component solely to hold rendering state, register listeners, call
`handle.update()`, and clean up. Event-aware elements keep the semantic,
HTML-like structure intact: the model owns durable state, events describe
completed transitions, and attributes declare how those transitions project
onto the native element.

Granularity follows DOM ownership. Updating an existing item can target that
item; adding, removing, or reordering items must update the nearest projection
that owns the collection. Use `handle.update()` when the whole component is the
unit of change, a collection projection for structural changes, and keyed
event-aware elements for changes within existing items.

### Keyed routing

Use `key` in the event options and the matching DOM `id` on repeated event-aware
elements or elements using `events.on()`. Only the addressed projection updates
and only the addressed DOM-effect listener runs.

The routing `id` is captured when the subscription mounts and must remain stable
for that mounted element. Remount the element when its routing identity changes.
The runtime indexes subscriptions by phase, event type, and routing ID, so a
keyed dispatch does not scan unrelated keyed subscriptions.

Projections and listeners without an `id` continue to receive keyed events as
broad consumers. The DOM `id` is the explicit runtime address because JSX
reconciliation keys are not exposed to component props. Routing metadata stays
private: callback events do not expose `key` or `originTarget`.

### Groups and wildcards

Use `events.on(["eventA", "eventB"])` without a listener to create an
event-element projection group for a known subset. Pass a listener as the
second argument to create an element effect for that subset instead. In either
callback, `event.type` identifies which member triggered it.

Use `<events.tag>` for a projection that observes the complete vocabulary and
`events.on("*", ...)` for an effect that observes it. `*` is a subscription
selector, not a dispatchable event name.

Use native `addEventListener()` or Remix `addEventListeners()` for named events.
Use `events.observe()` only when one callback must observe every
descriptor-owned event. It accepts an explicit target or uses the configured
host. Its options signal owns the observation.

`events.on("*", ...)` and `events.observe()` both consume every declared event,
but they are not interchangeable. The former is an element-bound,
post-projection effect that participates in host scope and keyed routing. The
latter is an exact-target monitor invoked synchronously before projection
commits; it receives keyed entries without filtering them by element ID.
`observe()` implicitly means “all,” so it does not accept a redundant `"*"`
selector.

### Callback semantics

Child callbacks receive the event. Before the first matching event, `event` is
`undefined`; a dispatched signal event has `event.detail === null`.

Projection callbacks receive a resolved event snapshot but do not synthesize
`currentTarget`. Handle the empty branch or use a local event as the default
parameter. `events.on()` remains listener-like, so its event identifies the
listener element through `currentTarget`; observer events identify the observed
target in the same way.

Custom-event effects and observers do not create per-invocation reentry
signals. Their returned promises join `events.dispatch()` completion, and
multiple async invocations may overlap. Use Remix `on()` or
`addEventListeners()` for native listeners that require Remix-managed reentry
cancellation.

### Transaction sequencing

Within one dispatch transaction, each matching event-aware projection commits
once using its final matching event.

1. Target observers retain native synchronous timing.
2. Projections on the dispatch target commit first.
3. Remaining projections commit concurrently and have no defined order.
4. After every projection settles, matching `events.on()` effects run once per
   matching entry in transaction order.

This source-first rule ensures the origin element's projected state is coherent
before downstream projections can trigger reentrant native events.

An event-aware element also processes events dispatched directly on itself, so
`{ bubbles: false }` can be used for a strictly local update.

### Hosts and propagation

An event stays local to its event-aware element unless the component declares
`mix={events.host()}` on a shared ancestor. Use that explicit host when sibling
branches coordinate; there is no implicit page or window route.

Non-composed events stay inside that host. `{ composed: true }` allows them to
leave it.

## Design guidance

Keep durable state authoritative in component setup scope or a domain object.
This includes values needed by business rules, persistence, history, later
calculations, or code that must read them independently of an event.

A user interaction should complete one model transition and then publish one
meaningful fact. Consumers normally derive their next projection from that
model.

### When event detail should carry state

Event detail may replace function-scoped model state when the value is
transition-scoped projection data rather than durable state. This is appropriate
when the value:

- exists only because one transition occurred;
- must be transferred exactly from producer to consumer;
- is used only by the addressed projection;
- is naturally replaced or ended by a later transition; and
- would otherwise require model bookkeeping solely to render that projection.

In that case, detail is the transition's immutable snapshot and the projection
owns its bounded lifetime: the event creates it, the projection consumes it,
and the next relevant transition replaces or ends it.

This is not a second authoritative store. If other logic later needs the value
without the event, promote it to the durable model.

### Naming

Native DOM events form recognizable families, but historical names such as
`submit`, `focus`, and `change` do not share one tense or reveal their full
semantics. Do not copy that ambiguity into a new event vocabulary.

An event contract includes its timing, target, detail, routing semantics,
propagation, cancelability, and default consequence. Its name should summarize
the transition, not carry the whole contract.

Name event families by intent:

- Completed facts, outcomes, and projection transitions use precise suffixes:
  `Set` for an assigned snapshot, `Changed` only when a difference exists, and
  `Succeeded` or `Failed` for known outcomes. Dispatch them only after the
  statement is true.
- `Requested` means the producer expresses an intent that another owner must
  realize. Requests are not completed facts and should remain the exception,
  not a disguise for rendering instructions.
- `Before...` followed by a completed event is appropriate only when consumers
  independently need a preventable pre-transition phase and a post-transition
  fact.
- `Started`, `Updated`, and `Ended` are appropriate only for a genuine
  multi-stage lifecycle whose phases are consumed independently.

Avoid bare imperative names such as `openEditor`, `focusItem`, or
`refreshPanel`. Do not add phases merely for symmetry: one meaningful event is
better when consumers do not need to distinguish them.

Prefer one meaningful transition over a chain such as
`fieldEdited -> draftUpdated -> buttonEnabled`. Synchronous consequences should
react independently to the original event rather than dispatching more events.

### Choosing the update boundary

Choose the render boundary before adding event names:

- Use local code for an immediate, one-element effect.
- Use `handle.update()` when a structural transition affects most of the
  component.
- Use one custom event when one stable projection changes.
- Use a keyed event when one repeated entity changes. The key addresses the
  consumer; detail carries only additional transition data it needs.

When event state belongs to one rendered element, derive it directly on that
element:

```tsx
<events.form data-action={(event) => event?.type} />
```

Introduce keyed external state only when the information must outlive,
coordinate, or be shared beyond that element.

If one handler dispatches several UI-oriented events, reconsider ownership. A
smaller projection, keyed routing, or a different representation usually
expresses the transition more clearly.

Split events only when their consumers truly update independently. If events
are always dispatched and consumed together, they describe one transition.

### Centralized component invalidation and projection

When several producers affect the same component render, one element effect
can own both its latest projection snapshot and its update policy. This is
especially effective when one event family represents mutually exclusive
states of the whole component:

```tsx
type Book = { title: string };

type SearchEvents = {
  queryEmpty: null;
  querySubmitted: { query: string };
  booksFound: Array<Book>;
  booksNotFound: { reason: "emptyList" | { other: string } };
  errorOccurred: Error;
};

type SearchEvent = CustomEventsEventMap<SearchEvents>[keyof SearchEvents];

let events = customEvents<SearchEvents>();

function renderSearch(event: SearchEvent) {
  switch (event.type) {
    case "queryEmpty":
      return <p>Enter the title of any book.</p>;
    case "querySubmitted":
      return <p>Fetching books containing “{event.detail.query}”…</p>;
    case "booksFound":
      return <ul>{event.detail.map((book) => <li>{book.title}</li>)}</ul>;
    case "booksNotFound":
      return event.detail.reason === "emptyList"
        ? <p>No books were found.</p>
        : <p>Could not fetch books: {event.detail.reason.other}</p>;
    case "errorOccurred":
      return <p>Unexpected error: {event.detail.message}</p>;
  }
}

function SearchBooks(handle: Handle<{ initialQuery: string }>) {
  let initialQuery = handle.props.initialQuery.trim();
  let currentEvent: SearchEvent = initialQuery
    ? events("querySubmitted", { query: initialQuery })
    : events("queryEmpty");

  return () => (
    <section>
      <input
        defaultValue={initialQuery}
        class={currentEvent.type === "querySubmitted" ? "pending" : ""}
        mix={[
          events.on("*", (event) => {
            currentEvent = event;
            return handle.update();
          }),
          on("input", ({ currentTarget }) => {
            let query = currentTarget.value.trim();
            currentTarget.dispatchEvent(
              query
                ? events("querySubmitted", { query })
                : events("queryEmpty"),
            );
          }),
        ]}
      />
      <div>{renderSearch(currentEvent)}</div>
    </section>
  );
}

// The asynchronous search publishes its outcome through the same input:
input.dispatchEvent(events("booksFound", books));
input.dispatchEvent(events("booksNotFound", { reason: "emptyList" }));
input.dispatchEvent(events("errorOccurred", error));
```

This makes the component itself an event-aware projection while retaining only
ordinary intrinsic elements. It removes repeated `handle.update()` calls from
producers, the initial event defines the UI without an `undefined` branch, and
subsequent event type and detail form the immutable render snapshot. Returning
the update promise makes it part of `events.dispatch()` completion, while Remix
coalesces multiple requests for the same component into one scheduled render.

Place the effect on the narrowest natural event owner. A shared root is useful
when transitions originate across a subtree; an input, form, or other source
element is better when every relevant event originates there. Its
`currentTarget` can then perform source-local work after the update without a
stored element reference.

Within a batch, the final matching entry becomes the current component
projection because the assignments occur in transaction order and Remix
coalesces the update requests. Use wildcard invalidation only when every event
defines the component projection. A component mixing structural and granular
events should subscribe only to its structural invalidators:

```tsx
events.on(
  ["itemAdded", "itemRemoved", "itemsReordered"],
  () => handle.update(),
);
```

A broad listener also receives keyed events and would defeat their granular
rendering benefit. Independent regions that must retain different event states
belong in separate event-aware intrinsic elements, and sparse repeated updates
belong in keyed projections. Durable business state remains in the model;
`currentEvent` should contain only transition-scoped projection state. Do not
introduce an event solely to replace one direct local `handle.update()` call.
