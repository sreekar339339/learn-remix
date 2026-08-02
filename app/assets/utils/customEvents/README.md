# Custom events

`customEvents` combines native `CustomEvent`/`EventTarget`, Immer-backed model
updates, addressable event sources, and Remix element lifecycles. It exists to
update an existing DOM projection at the narrowest affected model address
without splitting every repeated element into a component with its own state
and `handle.update()` ceremony.

The API has four distinct nouns and verbs:

- `model.update(recipe)` changes retained state.
- `model.events.<address>` identifies a state update or occurrence.
- `model.view.<tag>` creates an intrinsic element projected by those events.
- `source.on(listener)` attaches an element-owned post-projection effect.

`events` is only an event-source graph. `view` is only an intrinsic-element
factory. Keeping these namespaces separate means domain events may safely be
named `output`, `form`, `name`, `length`, or any other intrinsic/function name.

## Event maps

A payload map declares detailed events. A string union declares detail-less
events. Intersect an event map with state, or union a detail-less occurrence
with it:

```ts
type Flight = {
  kind: "one-way flight" | "return flight";
  startDate: string;
  returnDate: string;
};

type FlightEvents = Flight | "bookingConfirmed";

const flightEvents = customEvents<FlightEvents>();
```

This is an algebraic domain vocabulary:

- object properties form a product of simultaneously readable state;
- a string union adds alternative occurrences;
- `withState()` chooses which declared entries are retained state;
- declared entries omitted from `withState()` remain occurrences.

Native DOM event names are rejected. Custom events describe completed facts,
so they are deliberately non-cancelable.

## Evented state

`withState()` creates an independent `EventTarget`. Its initial properties are
read directly from the model:

```ts
let flight = flightEvents.withState({
  kind: "one-way flight",
  startDate: "2026-08-02",
  returnDate: "2026-08-02",
});

flight.kind; // "one-way flight"
```

Use `update()` with normal mutable JavaScript expressions:

```ts
flight.update((draft) => {
  draft.kind = "return flight";
});
```

Immer preserves the published model as immutable data and produces patches for
deep mutations. No object spreading, array copying, or replacement `Map` is
needed:

```ts
board.update((draft) => {
  draft.columns.get(columnId)!.cards.get(cardId)!.urgent = true;
});
```

An update recipe must be synchronous and return no value. A no-op recipe emits
nothing. Every changed top-level state property is also dispatched as a native
custom event on the model, so ordinary `addEventListener()` and Remix
`addEventListeners()` consumers remain available.

### Context typing

Keep one descriptor as the type anchor and derive the model type from
`withState`:

```ts
export const appContextEvents = customEvents<AppContextValue>();

export type AppContext = ReturnType<
  typeof appContextEvents.withState<AppContextValue>
>;
```

The same descriptor can create each provider's independent state model.

## Event sources

Every declared event is exposed as a typed source:

```ts
flight.events.kind;
flight.events.bookingConfirmed;
```

State sources continue through objects and collections:

```ts
model.events.profile.name;
board.events.columns.get(columnId).cards.get(cardId).urgent;
sheet.events.values.A0;
selection.events.selected.has("red");
circles.events.items[circleId].diameter;
```

Property access records an address; it does not read or recompute a selected
value. The source tells the runtime exactly which Immer patch paths can affect
the consumer. The event delivered to callbacks contains the current value at
that address as `event.detail`.

Maps retain their real key identity. Arrays use an item's `id` when it is a
property key, otherwise its index. Stable `id` values are the right default for
lists that can be inserted, deleted, or reordered; index identity is suitable
for fixed positional collections such as a tic-tac-toe board.

## Event-aware elements

Use `model.view.<intrinsic>` and pass a source to `on`:

```tsx
<flight.view.output on={flight.events.kind}>
  {(event) => event.detail}
</flight.view.output>
```

Children and native properties may be functions of the matched event:

```tsx
<selection.view.button
  on={selection.events.selectedId}
  aria-pressed={(event) => event.detail === item.id}
  class={(event) => event.detail === item.id ? "selected" : ""}
>
  {item.label}
</selection.view.button>
```

This is especially useful inside lists. The component remains one readable,
HTML-shaped tree while each existing row, card, circle, or cell updates only
its affected native attributes and children.

Listen to several explicit sources with an array:

```tsx
<game.view.button
  on={[game.events.position.get(index), game.events.result]}
  disabled={() => game.result !== null}
>
  {() => game.position.get(index)}
</game.view.button>
```

Omitting `on` projects every event owned by the descriptor. This is useful for
small mutually exclusive occurrence vocabularies:

```tsx
<searchEvents.view.div initial={initialEvent}>
  {(event) => {
    switch (event.type) {
      case "queryEmpty":
        return "Enter a title";
      case "querySubmitted":
        return `Searching for ${event.detail.query}`;
      case "booksFound":
        return `${event.detail.length} books`;
    }
  }}
</searchEvents.view.div>
```

Before an occurrence first matches, its callback input is `undefined`. Supply
`initial={events.create(...)}` when a defined initial occurrence is part of the
UI model. State sources always have a current value and need no `initial`.

## Element-owned effects

An event source's `.on(listener)` creates a Remix mixin. The listener exists
only while its host element is mounted:

```tsx
<input
  mix={sheet.events.focusTargetId.on(({ currentTarget }) => {
    currentTarget.focus();
  })}
/>
```

The source address participates in the same keyed/deep routing as a projection.
`currentTarget` is the mounted element owning the mixin.

Use the descriptor's root `.on(listener)` for every descriptor event:

```tsx
<section
  mix={model.events.on(() => handle.update())}
>
  {/* component-wide projection */}
</section>
```

This centralizes component invalidation: DOM handlers only mutate the model,
and one mounted effect calls `handle.update()`. Place it on the element that
naturally owns the projection; it does not need to be the component root.

There is intentionally no detached `observe()` or `subscribe()` API:

- UI effects should have a mounted element lifecycle and use a mixin.
- Detached domain consumers should use native `addEventListener()` or Remix
  `addEventListeners(target, signal, listeners)`.

This avoids a second registration, cleanup, target, wildcard, and sequencing
model.

## Occurrences and creation

Create occurrences explicitly:

```ts
form.dispatchEvent(events.create("bookingConfirmed"));
form.dispatchEvent(events.create("searchSucceeded", results));
```

`create()` always returns a fresh native `CustomEvent`. Detail-less events have
`detail === null`; `null` is an intentional DOM-compatible value rather than an
absent JavaScript argument.

An already-aborted signal throws before event creation:

```ts
events.create("saved", detail, { signal });
```

Use `dispatch()` when completion must be awaited:

```ts
await events.dispatch(form, "saved", detail);
```

It resolves after matching element projections and their post-projection
effects settle.

## Transactions

An ordered array creates one logical event transaction:

```ts
await events.dispatch(target, [
  "gameStateChanged",
  {
    cellFocusRequested: {
      options: { key: 0 },
    },
  },
]);
```

Entries share one carrier event and commit matching projections once. Effects
then receive each matching logical entry in order. On a configured non-element
`EventTarget` host, batch entries are also mirrored as native named events so
normal EventTarget listeners can consume them.

Per-entry options contain only `key`; propagation options belong to the shared
transaction.

## Hosts and routing

`events.host` makes an element the local routing boundary:

```tsx
<section mix={events.host}>...</section>
```

Events created by one descriptor are ignored by another descriptor even when
their raw names match. Non-bubbling events remain on their origin element.
Composed events may cross nested descriptor hosts; non-composed events do not.

For a descriptor configured with a domain host:

```ts
class Drummer extends TypedEventTarget<CustomEventsEventMap<DrummerEvents>> {
  events = customEvents<DrummerEvents>({ host: this });
}
```

mounted mixins naturally consume the hosted events:

```tsx
<output mix={drummer.events.tempoSet.on((event) => {
  console.log(event.detail);
})} />
```

Detached code uses `addEventListeners(drummer, signal, { tempoSet() {} })`.

### Address routing

An Immer patch notifies subscriptions whose address is an ancestor or
descendant of the changed path. A leaf mutation therefore updates its leaf,
owning item, collection, and top-level-property projections—but no sibling
items.

Identity-valued state can route to both the previous and next owner:

```ts
let selection = customEvents<{ selectedId: string | null }>().withState(
  { selectedId: null },
  { keyBy: { selectedId: "value" } },
);
```

This is useful when one item must remove a previous selection projection and
another must apply the new one. Do not add explicit keys to unrelated state
updates merely to force local rendering; model the state at the identity
boundary that actually owns the projection.

## Sequencing

One processed event transaction follows this order:

1. Commit matching projections on the event's origin element.
2. Commit remaining matching projections.
3. Run matching `.on(...)` effects.
4. Resolve `events.dispatch(...)` after returned promises settle.

The origin-first rule follows DOM causality: an element that dispatches an
event observes its own projected attributes before descendant side effects
such as `disabled`-induced `focusout` occur. Effects always see committed DOM.

## Design guidance

- Name events as facts that have already happened, usually past-tense domain
  language: `querySubmitted`, `booksFound`, `actionErrored`.
- Use retained state when consumers need a current readable value.
- Use an occurrence when repetition matters and there is no meaningful current
  value.
- Put payload in occurrence detail when it is the fact's durable data.
- Prefer a deep state source over broad component invalidation when one existing
  DOM projection owns that address.
- Prefer one wildcard mounted effect when the component genuinely renders as a
  cohesive unit.
- Structural creation, deletion, and reordering still belong to the owning
  component projection; fine-grained event-aware elements update existing DOM.
