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

### Algebraic model

The definition syntax follows the useful part of algebraic data types. An
object is product-shaped state: all of its properties may coexist. A union adds
alternative event variants:

```tsx
type Flight = {
  kind: FlightKind;
  startDate: string;
  returnDate: string;
};

type FlightEvents = Flight | "bookingConfirmed";
```

`FlightEvents` is a descriptor grammar, not a value constructed at runtime.
The object contributes detailed property events; the string contributes a
detail-less occurrence. This says that confirmation is another event variant,
not another property every `Flight` value must contain.

Consumers receive a discriminated union. Narrowing `event.type` therefore also
narrows `event.detail`, including in grouped and wildcard listeners:

```tsx
events.on("*", (event) => {
  switch (event.type) {
    case "saveSucceeded":
      useRevision(event.detail.revision);
      break;
    case "saveFailed":
      report(event.detail.error);
      break;
    case "saveStarted":
      break;
    default:
      event satisfies never;
  }
});
```

Use exhaustive consumption when a listener owns the complete vocabulary. A
new event then creates a compile-time reminder instead of an implicit ignored
case.

### State-backed descriptors

Call `withState()` when some or all entries in an event map are retained model
properties. The properties supplied to `withState()` become directly readable
state; every omitted entry remains an occurrence. Each changed state key
becomes a typed event whose detail is its new value. There is no `.value`
wrapper, property-specific setter, parallel property-event map, or immutable
copying ceremony:

```tsx
type TimerEvents = {
  elapsed: number;
  duration: number;
};

let timer = customEvents<TimerEvents>().withState({
  elapsed: 0,
  duration: 10,
});

timer.update((draft) => {
  draft.elapsed = 1;
});

timer.events.observe(() => handle.update());
```

The singular and plural APIs deliberately separate production from
consumption:

```tsx
timer.update((draft) => {
  draft.elapsed = 1;
});

<timer.events.output
  on={(event) => event.elapsed}
  children={(event) => `${event.detail}s`}
/>;
```

`update()` is the mutation command. An event-aware element's `on` callback
receives a typed event-source proxy for choosing state addresses and occurrence
events. The proxy is scoped to subscription setup rather than stored on the
model. `events` and `update` are reserved top-level model properties.

`update()` is the only state mutation boundary. Its Immer draft accepts normal
mutation syntax at any depth while producing an immutable next value:

```tsx
model.update((draft) => {
  draft.editor.name = input.value;
  draft.people[index].name = input.value;
});
```

Immer reports the complete changed paths, such as `["editor", "name"]` and
`["people", index, "name"]`. The model commits the complete next state, groups
those patches by their declared root properties, and publishes one `editor`
event and one `people` event as a single transaction. Each public event detail
remains the complete resulting root value, so native listeners do not depend on
storage paths. Event-aware elements additionally receive a projection-local
event whose detail is the final value at the address selected by `on`;
these nested notifications are not separately dispatched DOM events. A recipe
that changes nothing dispatches nothing; a recipe that throws commits and
publishes nothing. Recipes must be synchronous.

Collection patches can also supply routing identities without burdening the
producer. Arrays use an item's property-key `id` when present and otherwise use
its index. `Map` entry keys and primitive `Set` values are already unambiguous,
so the model derives those directly:

```tsx
let game = customEvents<{
  position: Map<number, Player>;
  result: Result | null;
}>().withState({
  position: new Map(),
  result: null,
});

game.update((draft) => {
  draft.position.set(cellId, nextPlayer);
  draft.result = deriveResult(draft.position);
});
```

This publishes one `position` event routed to `cellId` and one unkeyed `result`
event. Routing is derived independently for each changed property; it is not a
batch-wide guess. If several map entries change, the property is still
published once with several internal routing identities. Broad consumers and
observers therefore see one coherent property transition.

Routing follows deep patch paths through nested identity-bearing collections.
For example:

```tsx
board.update((draft) => {
  draft.columns
    .get(columnId)!
    .cards
    .get(cardId)!
    .urgent = true;
});
```

The single public `columns` event routes privately to both `columnId` and
`cardId`. The card can update its own projection while the owning column updates
an aggregate such as its urgent-card count; unrelated columns and cards receive
nothing. Nested `Map` keys and nested array item IDs are identity boundaries.
Plain object field names such as `cards` and `urgent` remain storage structure,
not routing identities or generated event names. Use globally distinct IDs—or
prefix them by entity kind—when several identity levels consume the same event.

For conventional entity arrays, use the same `id` for JSX reconciliation and
update addressing. No configuration is needed:

```tsx
let drawing = customEvents<{
  circles: Array<Circle>;
}>().withState({
  circles: initialCircles,
});

drawing.update((draft) => {
  let circle = draft.circles[index];
  if (circle) circle.diameter = diameter;
});

drawing.circles.map((circle) => (
  <drawing.events.circle
    on={(event) => event.circles[circle.id]}
    key={circle.id}
    id={String(circle.id)}
    r={(event) => (event.detail?.diameter ?? 0) / 2}
  />
));
```

Arrays without a usable `id` fall back to positional routing and match elements
whose DOM `id` is the array index. Records use their property names as path
segments, `Map` entries use their map keys, and primitive `Set` members use
their values. If an array needs non-positional identity, give its items an `id`
or model the collection as a `Map`; identity is data rather than a hidden
selector policy.

The model examines both the previous and next collection, so removal, splice,
and reorder patches retain the identities affected on either side. Replacing a
whole collection produces a broad event because the patch contains no item
address. Use `keyBy: "value"` for identity-valued state such as a selected or
focus-target ID:

```tsx
let selection = customEvents<{
  selectedId: number | null;
}>().withState({ selectedId: null }, {
  keyBy: { selectedId: "value" },
});
```

Changing `selectedId` from `7` to `8` routes the property event to both
identities: `7` removes its previous projection and `8` applies the new one.
Changing it to `null` still routes to the previous identity. `null` and
`undefined` are never routing keys.

The complete generic contextually types the initial values and defines the
entire vocabulary. `withState()` infers only the supplied keys, so the returned
model exposes those exact properties through `update()`. In the example every
entry is state, so there are no separately dispatchable occurrences.

When the same model owns detail-less occurrences, union their names with the
state shape. Object members describe state-capable detailed events; string
members describe signal-only occurrences. `withState()` retains only the
properties supplied in its argument:

```tsx
type Flight = {
  kind: FlightKind;
  startDate: string;
  returnDate: string;
};

type FlightEvents = Flight | "bookingConfirmed";

let confirmedFlight: Flight | null = null;
let flight = customEvents<FlightEvents>().withState({
  kind: "one-way flight",
  startDate: today,
  returnDate: today,
});

flight.update((draft) => {
  draft.startDate = value;
});
confirmedFlight = {
  kind: flight.kind,
  startDate: flight.startDate,
  returnDate: flight.returnDate,
};
flight.dispatchEvent(flight.events("bookingConfirmed"));

<flight.events.output
  on="bookingConfirmed"
  children={() => "Booking confirmed"}
/>;
```

Here `update()` exposes `kind`, `startDate`, and `returnDate` through its draft,
while the callable `flight.events()` surface creates only `bookingConfirmed`.
Both families share one host, routing index, and consumption API. Occurrences
do not become readable properties. The component-scoped `confirmedFlight`
preserves the result of the occurrence; the detail-less event only announces
it. This lets one event-aware element consume durable property events and
transition-scoped occurrences without manufacturing event detail or
coordinating two descriptors.

The call to `update()` is both the mutation boundary and the publication
boundary. One call may update several related properties as one transaction, so
consumers never need to coordinate separately dispatched “changed” events or
observe an intentionally half-applied transition. Top-level properties are
readonly to consumers so assignments cannot silently bypass publication.
`withState()` supplies the returned model as the descriptor host and therefore
must not be combined with the `{ host }` factory option.

#### Reusable context and model types

For a reusable application context or domain model, export the descriptor as an
`...Events` value and derive the instance type directly from its instantiated
`withState<State>()` method:

```tsx
export type AppContextValue = {
  user: { name: string; age: number } | null;
  settings: {
    theme: "dark" | "light" | "system";
    layout: "zen" | "normal";
  };
};

export const appContextEvents = customEvents<AppContextValue>();

export type AppContext = ReturnType<
  typeof appContextEvents.withState<AppContextValue>
>;

function AppProvider(
  handle: Handle<{ children?: RemixNode }, AppContext>,
) {
  let appContext = appContextEvents.withState({
    user: null,
    settings: { theme: "system", layout: "normal" },
  });

  handle.context.set(appContext);
  // ...
}
```

The lower-camel-case value names the reusable event descriptor;
the PascalCase type names an instance created from it. The instantiated method
type fixes which part of the complete map is state, so no helper function,
wrapper class, or manually repeated structural model type is needed.

The same pattern works for a hybrid definition. Pass only its retained object
shape to the type-level method application; string members remain occurrences:

```tsx
const flightEvents = customEvents<Flight | "bookingConfirmed">();

type FlightModel = ReturnType<
  typeof flightEvents.withState<Flight>
>;
```

#### Practical DX wins

State producers always call `update()`; occurrence producers use the same
model's `events()` descriptor. Each consumer independently chooses the smallest
rendering policy appropriate to what it owns:

| Consumer need | API | DX benefit |
| --- | --- | --- |
| A cohesive component derives most of its UI from the model | `model.events.observe(() => handle.update())` | Centralizes invalidation once; event handlers only mutate state |
| One native element depends on nested state | `<model.events.input on={(event) => event.property}>` | Infers `event.detail` and matches the exact Immer update address without recomputing a selector |
| One element reacts to occurrences | `<model.events.output on={["saved", "failed"]}>` | Narrows the callback event union without a second element API |
| A context consumer needs one domain value | `addEventListeners(model, signal, { property() {} })` | Uses normal typed `EventTarget` subscriptions without a store adapter |
| An array item, `Map` entry, or primitive `Set` member changes | `model.update(recipe)` | Derives `id`, index, key, or value routing from the Immer patch |
| A property value is itself a routing identity | `withState(value, { keyBy: { selectedId: "value" } })` | Routes old and new owners declaratively without annotating mutations |
| An occurrence intrinsically addresses one entity | `events("itemFocusRequested", { key: itemId })` | Expresses the occurrence's natural destination without putting routing metadata in its detail |

This lets a model begin with the low-ceremony component-wide strategy and move
only proven hot or independent regions to granular projections. Producers do
not change when that rendering policy changes.

Multi-property recipes are particularly useful for derived and selection state:

```tsx
model.update((draft) => {
  draft.selectedId = selected.id;
  draft.draft.name = selected.name;
  draft.draft.surname = selected.surname;
});
```

The model transition stays cohesive, while a selection view and an editor view
may subscribe to different property groups. The event vocabulary is derived
from the state shape instead of being maintained as a second domain model.

For high-frequency editing, keep the working value as explicit draft state and
commit durable collection state at the interaction boundary:

```tsx
model.update((draft) => {
  draft.items[index]!.size = size;
});

// On form submission:
model.update((draft) => {
  recordHistorySnapshot(draft.items, draft.history);
});
```

The nested array patch automatically routes the live update using the item's
`id`; no producer supplies a key. The closing transaction commits history once.
This avoids rebuilding the collection or creating one state object per item
merely to gain granular rendering.

A state-backed descriptor may also hold retained intent when its current value
remains meaningful. For example, `focusTargetId` means “the element the UI
should focus next”; it does not claim to mirror `document.activeElement`:

```tsx
let model = customEvents<{
  focusTargetId: string | null;
}>().withState({ focusTargetId: null }, {
  keyBy: { focusTargetId: "value" },
});

model.update((draft) => {
  draft.focusTargetId = nextId;
});

model.events.on("focusTargetId", ({ currentTarget }) => {
  currentTarget.focus();
});
```

The routing policy is declared once because the retained value itself names a
DOM destination. When the target changes, listeners for the previous and next
IDs run in that order. For synchronous effects such as `focus()`, the next
target therefore wins without a value guard. The same ordering lets the old
projection clear its state before the new projection applies its state.
Ordinary visual state should remain broad when it does not carry a natural
routing identity.

Name intent state after the desired target or outcome, not the effect that may
eventually occur. A scalar target has latest-value-wins semantics. A property
named `pendingFocusTargetId` implies acknowledgement and clearing, while a
`focusQueue` must actually preserve multiple ordered requests. Use a separately
named custom event when an occurrence has no meaningful retained value or
lifecycle; do not manufacture state merely to avoid declaring an event.

`update()` deliberately has no routing options. Do not annotate ordinary state
mutations merely because one current projection could be updated more narrowly.
That couples domain writes to the present notification topology and is easy to
get wrong when both old and new entities are affected. For an identity-valued
property, declare `keyBy: "value"`; otherwise begin with broad property delivery.
Unkeyed projections still receive keyed transitions as broad consumers.

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

The array is the sole batch grammar. It represents ordering, repeated event
types, detailed entries, and independently keyed entries without a parallel
object-map form.

### Await transaction completion

Use `events.dispatch(target, ...eventArgs)` when subsequent code genuinely
depends on the descriptor transaction having settled:

```tsx
await events.dispatch(form, [
  "listUpdated",
  { editorUpdated: { options: { key: editorId } } },
]);
```

It accepts the same single-event and array-transaction forms as `events()`.
Native DOM dispatch still runs synchronously. The returned promise resolves after the
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
| Projection | `<events.tag on={source}>` | Declaratively updates one existing element from model updates or occurrences; omitting `on` observes every occurrence |
| Effect | `events.on(event, listener)` | Runs on the mixin element after matching projections commit |
| Observer | `events.observe(listener)` | Imperatively sees every descriptor event on one exact target before projections commit |

Use `events.on()` for a post-render DOM effect such as focus, selection, or
measurement on the element hosting the mixin. It participates in element host
scope and keyed routing. Keep attributes and child content declarative in JSX.

Every event-aware intrinsic observes all occurrences by default. Add `on` to
choose model updates or narrow the occurrence vocabulary:

```tsx
<input
  mix={events.on("saveFailed", ({ currentTarget }) => {
    currentTarget.focus();
  })}
/>

<events.form
  on={["saveStarted", "saveSucceeded"]}
  class={(event) => event.type === "saveStarted" ? "pending" : ""}
  aria-busy={(event) => event.type === "saveStarted"}
  children={(event) =>
    event.type === "saveSucceeded"
      ? <p>Saved revision {event.detail.revision}</p>
      : <p>Not saved yet.</p>
  }
/>

<model.events.input
  on={(event) => event.profile.name}
  value={(event) => event.detail}
  disabled={(event) => event.detail.length === 0}
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
let event = customEvents<SaveEventsMap>({ host: model });
event.observe((event) => console.log(event.type), { signal });

// Or observe an explicit target.
events.observe(form, (event) => console.log(event.type), { signal });

<events.output
  on={["saveSucceeded", "saveFailed"]}
  children={(event) => event.type === "saveSucceeded" ? "Saved" : "Save failed"}
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

On event-aware elements, ordinary attributes accept either a static value or a
callback receiving the matched event. Model-update callbacks infer their detail
from the address returned by `on`. Occurrence callbacks receive the narrowed
event union. Both read their value from `event.detail`. `mix` and `ref` retain
their ordinary Remix meaning. Use Remix's `on()` inside `mix` for native DOM
handlers. `children` accepts either ordinary static JSX content or a callback
that derives dynamic content from the matched event.

### Intrinsic elements as granular projections

An event-aware intrinsic element is an independently invalidatable projection.
It can update native properties such as `value`, `class`, `disabled`, ARIA and
`data-*` attributes, and its child content without rerendering the component
that contains it.

This is especially useful for repeated elements. A keyed event can update one
existing item without rerunning the parent's render function or `.map()`:

```tsx
{items.map((item) => (
  <model.events.button
    on={(event) => event.items[item.id]}
    id={String(item.id)}
    value={(event) => String(event.detail?.id ?? "")}
    disabled={(event) => event.detail?.pending ?? true}
    class={(event) => event.detail?.pending ? "pending" : ""}
    data-state={(event) => event.detail?.pending ? "saving" : "ready"}
    children={(event) => event.detail?.label}
  />
))}

model.update((draft) => {
  draft.items[index]!.pending = true;
});
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

The state path selected by an event-aware element's `on` prop is its primary
address. Do not add a DOM `id` when that path already distinguishes the
projection; nested object properties and `Map.get(key)` paths work without one.

Keys are an optional delivery prefilter, not domain data. Match a routing
identity to the DOM `id` when several elements select the same state path and
the identity chooses its previous or next owner, or when an `events.on()`
effect or keyed occurrence has no state path to match. JSX `key` remains the
reconciliation identity and is independent of event routing.

State updates derive routing automatically where the changed structure exposes
an identity:

- an array item uses its property-key `id` by default;
- an array item without a usable `id` falls back to its numeric index;
- a `Map` entry uses its map key;
- a primitive `Set` member uses its value;
- a record uses its property key as its nested event address; and
- identity-valued state can declare `keyBy: { property: "value" }`.

This derivation uses Immer's nested patches and considers both the previous and
next collection values. A removal or reorder can therefore address the entities
on both sides of the transition. Replacing an entire collection is structural
and remains broad because the patch does not identify one member.

Use an explicit `{ key }` only for an occurrence whose meaning already
addresses one entity. State routing is always derived from structure or the
model's declarative value-routing policy; `update()` cannot override it. This
keeps delivery policy out of mutation sites and ensures identity transitions
can address both their previous and next owners.

Only matching routing IDs pass the keyed prefilter. Subscriptions without an
`id` pass that prefilter broadly; event-aware elements then apply their exact
state-path match, while pathless occurrence projections and `events.on()`
effects remain broad consumers.

One state property event may address several identities when a recipe changes
several collection members. This remains one observable event and one
transaction; the routing set is private runtime metadata rather than event
detail.

When supplied, the routing `id` is captured as the subscription mounts and must
remain stable for that mounted element. Remount the element when its routing
identity changes. Arrays with an item `id` preserve logical paths across
movement; arrays without one use positional paths. Use JSX `key` for stable DOM
reconciliation, adding a DOM `id` only when routing or ordinary DOM behavior
actually needs it.
The runtime indexes subscriptions by phase, event type, and routing ID, so a
keyed dispatch does not scan unrelated keyed subscriptions.

Routing metadata stays private: callback events do not expose `key` or
`originTarget`.

### Model updates and occurrence matching

The `on` prop establishes what invalidates an event-aware element:

- an omitted `on` observes the complete occurrence vocabulary;
- `on="eventA"` observes one occurrence;
- `on={["eventA", "eventB"]}` observes a narrowed occurrence union;
- explicit `on="*"` has the same meaning as omitting it; and
- `on={(event) => event.property.nested}` observes one logical model address.

The callback receives a typed event-source proxy. It runs once during element
setup: ordinary property access records object and record keys, array brackets
record an item ID or positional index, `Map.get()` records a map key, and
`Set.has()` records membership. It does not read state or recompute a selector:
Examples name this contextual parameter `event`; the surrounding model
descriptor already communicates its domain.

```tsx
<model.events.output on={(event) => event.profile.name} />
<model.events.output on={(event) => event.items[item.id].status} />
<model.events.output on={(event) => event.columns.get(columnId).title} />
<model.events.output on={(event) => event.selected.has(itemId)} />
```

Immer patches are normalized into the same logical addresses. A changed path
matches its exact subscription, its ancestors, and its descendants when an
ancestor was replaced. Unrelated paths are rejected before an element callback
runs. Model-update projections therefore need neither selector recomputation
nor previous-value comparison. Each matching element runs once per transaction
and receives the final value at its subscribed address in `event.detail`.

Several independent state properties or occurrences may invalidate one derived
projection. Subscribe to them together and read the committed model:

```tsx
<timer.events.progress
  on={(event) => [event.elapsed, event.duration]}
  value={() => Math.min(1, timer.elapsed / timer.duration)}
/>
```

When several dependencies belong to the same root property, subscribe to their
nearest shared update address instead of listing sibling addresses:

```tsx
<model.events.output
  on={(event) => event.profile}
  children={() => `${model.profile.firstName} ${model.profile.lastName}`}
/>
```

One event-aware element accepts at most one update address per root state
property. The shared ancestor expresses the invalidation boundary without
manufacturing several variants of the same root event.

A state-update source may also be combined with an occurrence when both project
through one element:

```tsx
<sheet.events.input
  on={(event) => [
    event.values[cellId],
    event.cellDrafted,
  ]}
/>
```

State and occurrence sources share the same callback namespace. State entries
produce update-address tokens; occurrence-only entries produce their typed
event-name tokens. Name the callback parameter for its domain—such as
`event` or `event`—because it describes the model's event sources,
not an event being delivered.

Occurrence callbacks begin with the first matching event. Supply `initial`
when server or component input already defines a meaningful initial event. The
initial event is type-checked against the observed occurrence vocabulary and
removes defensive optional-event branches from callbacks.

`events.on(event, listener)` remains the element-effect API. `*` is a
subscription wildcard, not a dispatchable event name.

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
argument.

### Callback semantics

Model-update callbacks receive a typed event whose detail is the final value at
the subscribed update address. Occurrence callbacks receive a resolved,
narrowed event snapshot. Projection events do not synthesize `currentTarget`.
A signal event has `event.detail === null`.

`events.on()` remains listener-like, so its event identifies the listener
element through `currentTarget`; observer events identify the observed target
in the same way.

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
`mix={events.host}` on a shared ancestor. Use that explicit host when sibling
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

### State and occurrence are different contracts

Use `customEvents<EventMap>().withState(initialState)` for **what is true now**.
Its returned object is product state: several durable properties coexist,
remain readable between transitions, and can be published together with
`update()`. Consumers may observe one property, a known subset, or the whole
model.

Use entries omitted from `withState()`, or a descriptor without state, for
**what happened** or **what another owner should do next**. Those entries
declare an occurrence vocabulary, not an object whose members are
simultaneously true. Occurrences fall into several useful families:

- phase or outcome events select the latest view, such as empty, submitted,
  succeeded, or failed;
- lifecycle facts report independently useful stages such as started, updated,
  and ended;
- invalidation events announce that function-scoped or external model data
  should be read again;
- transition-scoped payload events carry a snapshot needed only by that
  transition; and
- request events ask another owner to perform an effect.

Keep these domain roles distinct even though they share one API:

| Role | Meaning | Typical shape |
| --- | --- | --- |
| State | What is true now | Readable property updated by `update()` |
| Fact | What happened | Past-tense occurrence such as `saveSucceeded` |
| Intent | What another owner should do | Request occurrence or latest-target state |

The lifecycle decides whether intent is state or an occurrence. A focus target
is state when only its latest value matters; a request is an occurrence when
every publication must be handled.

Model mutually constrained states as one discriminated-union property instead
of several booleans and nullable fields. This makes invalid combinations
unrepresentable and publishes the transition atomically:

```tsx
type SaveStatus =
  | { type: "idle" }
  | { type: "pending" }
  | { type: "failed"; error: Error }
  | { type: "succeeded"; revision: number };

let model = customEvents<{ status: SaveStatus }>().withState({
  status: { type: "idle" } as SaveStatus,
});

model.update((draft) => {
  draft.status = { type: "pending" };
});
```

`update()` is the transition boundary: related product-state fields change
together, while a discriminated-union property changes from one valid variant
to another. Consumers should never need to reconstruct a transition from a
sequence of partially applied property events.

Mutual exclusivity belongs to a consumer and its scope, not to the descriptor.
One result element may treat a search vocabulary as mutually exclusive phases:

```ts
type SearchEvents =
  | "queryEmpty"
  | { querySubmitted: { query: string } }
  | { booksFound: Array<Book> }
  | { booksNotFound: { reason: string } }
  | { errorOccurred: Error };
```

An event-aware element remembers its latest matching event, so it can present
this as small, view-local sum state. The same descriptor may still serve
independent consumers, and separate hosts may occupy different phases at the
same time. The API therefore must not impose global exclusivity.

If business logic must ask for the current phase without receiving an event,
make the phase durable: include one discriminated-union property in
`withState()` or use an explicit component variable. Do not treat an event-aware
element's retained event as an application store.

A useful choice test is repetition: if publishing the same value twice should
be indistinguishable, it is probably state; if both publications must be
observed, it is an occurrence. A scalar request-like property is appropriate
only when latest-value-wins semantics are intended. Use an occurrence event
when every request matters, and a queue when several pending requests must be
preserved.

Use this decision table at the producer boundary:

| Question | Model it as |
| --- | --- |
| Must code read the value before or after the transition that produced it? | State |
| Does the value participate in validation, history, later calculations, or a multi-property atomic transition? | State |
| Is only the latest target or intent meaningful? | State |
| Must two identical publications still be observed as two separate happenings? | Occurrence |
| Is the payload an immutable snapshot used only because this transition happened? | Occurrence detail |
| Must several pending requests survive instead of replacing one another? | Durable queue state |
| Does a durable transition also produce an independently meaningful outcome or lifecycle fact? | State plus occurrence |

#### When the split is useful

Hybrid components are normal, but the split should represent two real domain
contracts rather than two ways of announcing the same mutation:

```tsx
type DocumentState = {
  draft: string;
  revision: number;
};

type DocumentEvents = DocumentState & {
  saveSucceeded: { revision: number };
  saveFailed: Error;
};

let document = customEvents<DocumentEvents>().withState({
  draft: "",
  revision: 0,
});

// Retained, directly readable model transition.
document.update((draft) => {
  draft.draft = input.value;
});

// Independently meaningful result of an operation.
form.dispatchEvent(document.events("saveSucceeded", {
  revision: document.revision,
}));
```

The supplied and omitted portions of the map share one descriptor, so
projections and effects can subscribe to either family or to a deliberate
subset. Their write APIs remain intentionally different:

- `model.update(recipe)` mutates retained state, derives collection routing
  and declared value routing, and publishes its property events as one
  transaction;
- `target.dispatchEvent(model.events("eventName", detail, { key }))` publishes
  a fire-once occurrence; and
- `model.events.dispatch(target, ...)` is the awaitable occurrence form when
  later code depends on projection and effect completion.

Do not split when an occurrence would merely repeat a property event already
published by `update()`. A property such as an active draft remains state when
later handlers read it, repeated input updates replace its current value, and
closing the interaction clears it. Adding an `editRequested` occurrence solely
to assign that property creates dispatch choreography without adding a
consumer contract.

Conversely, do not manufacture a boolean or “latest event” property for a
confirmation, notification, operation outcome, or local draft snapshot that
has no useful value outside its transition. Declare an occurrence and place the
snapshot in `detail`.

Sometimes a state transition and an occurrence are causally related but need
different timing. Patch the state at its actual mutation boundary, then publish
the occurrence only when its statement becomes true—for example, after an
asynchronous save succeeds. Do not publish a success occurrence merely because
editing state changed. If consumers must atomically observe state and a
one-time fact, preserve that invariant in one durable state transition rather
than coordinating separate dispatches.

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
- Use keyed routing when one repeated entity changes and its identity is
  structurally derivable, or when an occurrence intrinsically addresses that
  entity. The key addresses the consumer; detail carries only additional
  transition data it needs.

When event state belongs to one rendered element, derive it directly on that
element:

```tsx
<events.form
  data-action={(event) => event.type}
/>
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
