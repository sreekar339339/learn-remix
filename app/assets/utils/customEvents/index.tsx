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
 * // Signal-only and detailed events may share one definition:
 * let mixed = new CustomEvents<
 *   "operationStarted" | { valueProposed: string } | "operationCompleted"
 * >();
 * ```
 *
 * An event detail is a consumer contract. Use it when the transition itself
 * must transfer a value to its consumer. Omit it when producers and consumers
 * already share the authoritative model and the event is only a precise
 * signal.
 *
 * ## Dispatch
 *
 * The descriptor is callable and returns an ordinary `CustomEvent`, so native
 * `dispatchEvent(...)` remains the only dispatch API:
 *
 * ```tsx
 * form.dispatchEvent(events("saveStarted"));
 * form.dispatchEvent(events("saveSucceeded", { revision }));
 * form.dispatchEvent(events("saveSucceeded", { revision }, { key: revision }));
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
 * content declarative in JSX. Use an event-aware intrinsic element such as
 * `<events.on.name.form>` or `<events.on.name.output>` for dynamic regions:
 *
 * ```tsx
 * <input mix={events.on("saveFailed", ({ currentTarget }) => {
 *   currentTarget.focus();
 * })} />
 *
 * <events.on.change.form
 *   class={(detail) => detail?.event?.type === "saveStarted" ? "pending" : ""}
 *   aria-busy={(detail) => detail?.event?.type === "saveStarted"}
 *   child={(detail) => detail?.event?.type === "saveSucceeded"
 *     ? <p>Saved revision {detail.event.detail.revision}</p>
 *     : <p>Not saved yet.</p>
 *   }
 * />
 * ```

 * On event-aware elements, ordinary attributes accept either a static value or
 * `(detail, event) => value`. `mix`, `ref`, and JSX children retain their
 * ordinary Remix meaning. Use Remix's `on(...)` inside `mix` for native DOM
 * handlers. `child` supplies dynamic children, so it cannot be combined with
 * static JSX children.
 * Use `key` in the event options and the matching DOM `id` on repeated
 * event-aware elements to update only the addressed projection. Unkeyed
 * projections continue to receive keyed events for aggregate views. This
 * bridges keyed event routing until the renderer exposes JSX reconciliation
 * keys to component props.
 *
 * Child callbacks receive `(detail, event, handle)`. Before the first matching
 * event, `detail` and `event` are `undefined`; a dispatched null-detail event
 * passes `null`. Use `detail === undefined` when that distinction matters. The
 * native event is available only when metadata is useful. Projection callbacks
 * receive a snapshot whose `currentTarget` is the event-aware element; the
 * original event remains untouched during DOM propagation. Handle the empty
 * branch or use a JavaScript default parameter for a local initial projection.
 * Use `when={(detail, event) => boolean}` to decide whether an incoming event
 * should update that event-aware element. A false result skips the projection
 * update before the event is stored or rendered.
 * Event-aware element descendants that use `events.on(...)` observe the matching
 * transaction after the rendered DOM has committed.
 * An event-aware element also processes product events dispatched directly on
 * itself, so `{ bubbles: false }` can be used for a strictly local update.
 *
 * Events reach sibling branches through the page fallback. Add
 * `mix={events.host(...)}` only when a widget root needs a local boundary or
 * host-level listeners that update a private model. Non-composed events stay
 * inside that host; `{ composed: true }` allows them to leave it.
 *
 * ## Design guidance
 *
 * Keep durable state authoritative in component setup scope or a domain object.
 * This includes values needed by business rules, persistence, history, later
 * calculations, or code that must read them independently of an event. A user
 * interaction should complete one model transition and then publish one
 * meaningful fact. Consumers normally derive their next projection from that
 * model.
 *
 * Event detail may replace function-scoped model state when the value is
 * transition-scoped projection data rather than durable state. This is
 * appropriate when the value:
 *
 * - exists only because one transition occurred,
 * - must be transferred exactly from producer to consumer,
 * - is used only by the addressed projection,
 * - is naturally replaced or ended by a later transition, and
 * - would otherwise require model bookkeeping solely to render that projection.
 *
 * In that case, detail is the transition's immutable snapshot and the
 * projection owns its bounded lifetime: the event creates it, the projection
 * consumes it, and the next relevant transition replaces or ends it. This is
 * not a second authoritative store. If other logic later needs the value
 * without the event, promote it to the durable model.
 *
 * Native DOM events form recognizable families, but historical names such as
 * `submit`, `focus`, and `change` do not share one tense or reveal their full
 * semantics. Do not copy that ambiguity into a new event vocabulary. An event
 * contract includes its timing, target, detail, routing key, propagation,
 * cancelability, and default consequence; its name should summarize the
 * transition, not carry the whole contract.
 *
 * Name event families by intent:
 *
 * - Completed facts, outcomes, and projection transitions use precise suffixes:
 *   `Set` for an assigned snapshot, `Changed` only when a difference exists,
 *   and `Succeeded` or `Failed` for known outcomes. Dispatch them only after
 *   the statement is true.
 * - `Requested` means the producer expresses an intent that another owner must
 *   realize. Requests are not completed facts and should remain the exception,
 *   not a disguise for rendering instructions.
 * - `Before...` followed by a completed event is appropriate only when
 *   consumers independently need a preventable pre-transition phase and a
 *   post-transition fact.
 * - `Started`, `Updated`, and `Ended` are appropriate only for a genuine
 *   multi-stage lifecycle whose phases are consumed independently.
 *
 * Avoid bare imperative names such as `openEditor`, `focusItem`, or
 * `refreshPanel`. Do not add phases merely for symmetry: one meaningful event
 * is better when consumers do not need to distinguish them.
 *
 * Prefer one meaningful transition over a chain such as
 * `fieldEdited -> draftUpdated -> buttonEnabled`. Synchronous consequences
 * should react independently to the original event rather than dispatching
 * more events.
 *
 * Choose the render boundary before adding event names:
 *
 * - Use local code for an immediate, one-element effect.
 * - Use `handle.update()` when a structural transition affects most of the
 *   component.
 * - Use one custom event when one stable projection changes.
 * - Use a keyed event when one repeated entity changes. The key addresses the
 *   consumer; detail carries only additional transition data it needs.
 *
 * If many instances need `when` predicates, or one handler dispatches several
 * UI-oriented events, reconsider ownership. A smaller projection, keyed
 * routing, or a different representation (for example, one selection overlay
 * instead of updating every item) usually expresses the transition more
 * clearly. Split events only when their consumers truly update independently;
 * if events are always dispatched and consumed together, they describe one
 * transition.
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
