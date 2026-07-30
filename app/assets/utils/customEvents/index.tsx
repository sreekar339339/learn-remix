import { createCustomEventsDescriptor } from "./descriptor.tsx";
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
 *
 * // One transaction with independently routed entries.
 * form.dispatchEvent(events([
 *   "listUpdated",
 *   { editorUpdated: { options: { key: editorId } } },
 *   { saveSucceeded: {
 *     detail: { revision },
 *     options: { key: revision },
 *   } },
 * ]));
 * ```
 *
 * A batch is one internal transaction that expands into its listed granular
 * events. Consumers always receive those declared events; the descriptor does
 * not invent an aggregate `change` event or an envelope detail.
 *
 * ## Consume
 *
 * Use `events.on(...)` for a post-render DOM effect such as focus, selection,
 * or measurement on the element hosting the mixin. Keep attributes and child
 * content declarative in JSX. Use an event-aware intrinsic element such as
 * `<events.on.name.form>` for one event, or `<events.form>` when the projection
 * observes every declared event:
 *
 * ```tsx
 * <input mix={events.on("saveFailed", ({ currentTarget }) => {
 *   currentTarget.focus();
 * })} />
 *
 * <events.form
 *   class={(event) => event?.type === "saveStarted" ? "pending" : ""}
 *   aria-busy={(event) => event?.type === "saveStarted"}
 *   child={(event) => event?.type === "saveSucceeded"
 *     ? <p>Saved revision {event.detail.revision}</p>
 *     : <p>Not saved yet.</p>
 *   }
 * />
 *
 * // Observe every event for an imperative post-render effect.
 * <input mix={events.on("*", (_, signal) => {
 *   // Runs once for each matching granular event, in transaction order.
 * })} />
 *
 * // Subscribe directly to a domain EventTarget.
 * events.on(model, {
 *   saveFailed(event) {
 *     console.error(event.detail.error);
 *   },
 *   "*"(event) {
 *     console.log(event.type);
 *   },
 * }, { signal });
 *
 * // A constructor host is the default direct-listener target.
 * let modelEvents = new CustomEvents<SaveEventsMap>({ host: model });
 * modelEvents.on("saveSucceeded", listener, { signal });
 * modelEvents.on({ saveFailed: reportFailure }, { signal });
 *
 * // Subscribe one projection to a precise subset of the event vocabulary.
 * let saveOutcome = events.on(["saveSucceeded", "saveFailed"]);
 * <saveOutcome.output
 *   child={(event) => event?.type === "saveSucceeded"
 *     ? "Saved"
 *     : "Save failed"}
 * />
 * ```

 * On event-aware elements, ordinary attributes accept either a static value or
 * `(event) => value`. Read payloads from `event.detail`. `mix`, `ref`, and JSX
 * children retain their ordinary Remix meaning. Use Remix's `on(...)` inside
 * `mix` for native DOM handlers. `child` supplies dynamic children, so it
 * cannot be combined with static JSX children.
 * Use `key` in the event options and the matching DOM `id` on repeated
 * event-aware elements or elements using `events.on(...)`. Only the addressed
 * projection updates and only the addressed DOM-effect listener runs.
 * Projections and listeners without an `id` continue to receive keyed events
 * as broad consumers. The DOM `id` is the explicit runtime address because
 * JSX reconciliation keys are not exposed to component props. Routing metadata
 * stays private: callback events do not expose `key` or `originTarget`.
 *
 * Use `events.on(["eventA", "eventB"])` when a projection or effect depends on
 * a known subset of events. Its callback receives the matching granular detail,
 * and `event.type` identifies which member triggered it. Use `<events.tag>` for
 * a projection that observes the complete vocabulary and `events.on("*", ...)`
 * for an effect that observes it. `*` is a subscription selector, not a
 * dispatchable event name.
 * Direct `EventTarget` subscriptions also accept one name, a name group, `*`,
 * or an `addEventListeners()`-style object. Named object callbacks receive
 * their narrowed event; `"*"` receives the full discriminated event union. If
 * both match, the named callback runs before the wildcard callback. The
 * options signal owns the subscription, while each callback receives a reentry
 * signal as its second argument.
 *
 * Child callbacks receive `(event, handle)`. Before the first matching event,
 * `event` is `undefined`; a dispatched signal event has `event.detail === null`.
 * Projection callbacks receive a resolved event snapshot but do not synthesize
 * `currentTarget`; handle the empty branch or use a local event as the default
 * parameter. `events.on(...)` remains listener-like, so its event identifies
 * the listener element through `currentTarget`.
 * Within one dispatch transaction, each matching event-aware projection
 * commits once using its final matching event. After all projection updates
 * settle, matching `events.on(...)` effects run once per granular event in
 * transaction order.
 * An event-aware element also processes product events dispatched directly on
 * itself, so `{ bubbles: false }` can be used for a strictly local update.
 *
 * An event stays local to its event-aware element unless the component declares
 * `mix={events.host()}` on a shared ancestor. Use that explicit host when
 * sibling branches coordinate; there is no implicit page or window route.
 * Non-composed events stay inside that host; `{ composed: true }` allows them
 * to leave it.
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
 * contract includes its timing, target, detail, routing semantics, propagation,
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
 * If one handler dispatches several UI-oriented events, reconsider ownership.
 * A smaller projection, keyed routing, or a different representation (for
 * example, one selection overlay instead of updating every item) usually
 * expresses the transition more clearly. Split events only when their
 * consumers truly update independently; if events are always dispatched and
 * consumed together, they describe one transition.
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
