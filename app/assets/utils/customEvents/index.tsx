import { createCustomEventsDescriptor } from "./descriptor.tsx";
import { __customEventsTest } from "./runtime.ts";
import type {
  CustomEventMap,
  CustomEventsConstructor,
  CustomEventsConstructorOptions,
  CustomEventsDescriptor,
  CustomEventsDefinition,
  NormalizeCustomEventsDefinition,
} from "./types.ts";

/**
 * A typed, native-event descriptor for one component or domain object.
 *
 * ## Define events
 *
 * Declare facts, outcomes, or independently consumed UI projections. Name
 * local descriptors `events`; reserve a domain name for reusable classes.
 *
 * ```tsx
 * type SaveEventsMap = {
 *   saveStarted: null;
 *   saveSucceeded: { revision: number };
 *   saveFailed: { error: Error };
 * };
 *
 * let events = new CustomEvents<SaveEventsMap>();
 * // Or, for signal-only events:
 * let signals = new CustomEvents<"listUpdated" | "editorUpdated">();
 * ```
 *
 * An event detail is a consumer contract. Use a detail when a listener needs
 * the value outside local setup scope. Use `null` when producers and consumers
 * already share a private model and the event is only a precise render signal.
 *
 * ## Dispatch
 *
 * The descriptor is callable and returns an ordinary `CustomEvent`, so native
 * `dispatchEvent(...)` remains the only dispatch API:
 *
 * ```tsx
 * form.dispatchEvent(events("saveStarted"));
 * form.dispatchEvent(events("saveSucceeded", { revision }));
 *
 * // One transition refreshes two independent regions.
 * form.dispatchEvent(events(["listUpdated", "editorUpdated"]));
 * form.dispatchEvent(events({ listUpdated: null, editorUpdated: null }));
 * ```
 *
 * A granular event automatically derives `change`. A batch automatically
 * expands into its granular events. `change` is listener-facing and cannot be
 * dispatched directly.
 *
 * ## Consume
 *
 * Use `events.on(...)` for a post-render DOM effect such as focus, selection,
 * or measurement on the element hosting the mixin. Keep attributes and child
 * content declarative in JSX. Use `<events.on.name render={...} />` only for
 * a dynamic child region that the matching event owns:
 *
 * ```tsx
 * <input mix={events.on("saveFailed", ({ currentTarget }) => {
 *   currentTarget.focus();
 * })} />
 *
 * <events.on.saveSucceeded render={(event) =>
 *   event ? <p>Saved revision {event.detail.revision}</p> : <p>Not saved yet.</p>
 * } />
 * ```
 *
 * Before the first matching event, an event component receives `undefined`.
 * Handle the empty branch or use a JavaScript default parameter for a local
 * initial projection. Event-component descendants that use `events.on(...)`
 * observe the matching transaction after the rendered DOM has committed.
 *
 * Events reach sibling branches through the page fallback. Add
 * `mix={events.host(...)}` only when a widget root needs a local boundary or
 * host-level listeners that update a private model. Non-composed events stay
 * inside that host; `{ composed: true }` allows them to leave it.
 *
 * ## Design guidance
 *
 * Prefer ordinary Remix `on(...)` handlers and local component code for an
 * immediate, one-element update. Do not turn a native interaction into a chain
 * such as `fieldEdited -> draftUpdated -> buttonEnabled`; publish the useful
 * resulting fact or projection, if any.
 *
 * Do not use a descriptor as the authoritative state store. Keep calculation,
 * history, and private mutable model data in component setup scope or a domain
 * object. Dispatch a minimal event after that model changes. Split event names
 * only when their consumers can update independently; if they are always
 * dispatched together and consumed together, they are one event.
 *
 * Resolver callbacks such as `events("revision", previous => ...)` are for a
 * small transition that depends on descriptor-managed history. Prefer a local
 * model for multi-step business logic or substantial history.
 */
class CustomEventsBase<Definition extends CustomEventsDefinition> {
  declare readonly map: CustomEventMap<
    NormalizeCustomEventsDefinition<Definition>
  >;

  constructor(options?: CustomEventsConstructorOptions) {
    let descriptor = createCustomEventsDescriptor<
      NormalizeCustomEventsDefinition<Definition>
    >(options);
    return descriptor as unknown as this;
  }
}

export type CustomEvents<Definition extends CustomEventsDefinition> =
  CustomEventsDescriptor<NormalizeCustomEventsDefinition<Definition>>;

export const CustomEvents: CustomEventsConstructor =
  CustomEventsBase as unknown as CustomEventsConstructor;

export { __customEventsTest };
