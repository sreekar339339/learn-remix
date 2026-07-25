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
 * Base class for a component or object event set.
 *
 * ## Designing an event map
 *
 * Start with normal Remix `on(...)` handlers for local input, click, and DOM
 * work. Add a descriptor event only when it names a useful boundary:
 *
 * - an observable fact or committed action, such as `documentSaved` or
 *   `uploadFailed`;
 * - a render projection consumed by independent regions, such as
 *   `navigationUpdated` and `editorUpdated`; or
 * - an asynchronous lifecycle with distinct outcomes, such as `saveRequested`,
 *   `saveSucceeded`, and `saveFailed`.
 *
 * Use past-tense names for facts and outcomes. For a component-local render
 * projection, name the region or model transition that changed, such as
 * `navigationUpdated` or `itineraryChanged`. Do not publish a derived display
 * consequence as an event: `validationPresented` and `buttonEnabled` are
 * calculations a projection performs after `itineraryChanged`.
 *
 * Partition projections only when their consuming regions can update
 * independently. If every producer always dispatches two projection events
 * together, they are one transition and should usually become one event.
 *
 * ## Local model with event signals
 *
 * For a component-local event system, keep the authoritative model in setup
 * scope or a small domain object. It answers “how do we calculate the next
 * transition?” Sequence counters, undo stacks, retry bookkeeping, and
 * temporary calculation inputs belong there.
 *
 * When every producer and event-component consumer shares that model, use a
 * `null` detail. The event names the completed transition and acts as a
 * precise render signal; the event component reads the model it closes over:
 *
 * ```tsx
 * type Events = { progressAdvanced: null };
 *
 * model.progress += delta;
 * target.dispatchEvent(events("progressAdvanced"));
 *
 * <events.on.progressAdvanced render={() => <output>{model.progress}</output>} />
 * ```
 *
 * This avoids keeping duplicate state in event details. A transition can batch
 * several null-detail signals when it refreshes independent regions together:
 *
 * ```tsx
 * target.dispatchEvent(events([
 *   "contentRefreshed",
 *   "historyRefreshed",
 * ]));
 * ```
 *
 * A private model may mutate directly when it has no external observers. Event
 * signals schedule the dependent regions to read the model after that mutation.
 * Keep arrays or objects stable when the model has history, but do not create
 * immutable copies merely to carry redundant event details.
 *
 * ## Self-contained event details
 *
 * Use a detail when a listener outside the shared setup model must understand
 * the event: an async result, a cross-component fact, an error, or a reusable
 * event target. The detail is then the consumer contract and should be a stable
 * snapshot containing only the information that listener needs:
 *
 * ```tsx
 * target.dispatchEvent(events("documentSaved", { revision, savedAt }));
 * ```
 *
 * Use null-detail signals for tightly local coordination and self-contained
 * details for events that cross a model boundary.
 *
 * Do not copy private mechanics into an `*Updated` payload merely because
 * they helped calculate it. Do not split a projection merely because it has
 * several fields either. Keep fields together when the same rendered region
 * always consumes and updates them as one coherent value. Split only when
 * regions can render or update independently; that keeps event components
 * narrow without turning internal synchronization into a chain of artificial
 * events.
 *
 * Do not create events solely to relay a native interaction to an immediate
 * local update. Names such as `fieldEdited -> draftUpdated -> editorUpdated`
 * usually hide ordinary control flow. Keep the native handler and publish the
 * next useful projection directly. Use an array or detail map with
 * `events(...)` only when one transition genuinely changes several
 * projections atomically.
 *
 * When no useful fact, outcome, or independently consumed projection exists,
 * use ordinary component logic instead. A descriptor delivers events and
 * render projections; it is not the default authoritative state store.
 *
 * ## Null-detail event names
 *
 * When every event is a local `null`-detail signal, use a string union instead
 * of an object map:
 *
 * ```tsx
 * let events = new CustomEvents<"listUpdated" | "editorUpdated">();
 * ```
 *
 * Use an object map as soon as any event needs a payload:
 *
 * ```tsx
 * let events = new CustomEvents<{
 *   documentSaved: { revision: number };
 *   editorUpdated: null;
 * }>();
 * ```
 *
 * ## Choosing event components
 *
 * Use `<events.on.someEvent render={...} />` when an event projection owns the
 * children of a dynamic UI region. It is most useful when separate regions
 * render from separate projections, or when one batched transition must update
 * several regions together. Place the event component at the smallest element
 * boundary whose structure, text, or controlled properties actually depend on
 * that projection.
 *
 * Do not wrap a stable control merely because it can observe an event. Native
 * controls already retain user-entered values and selection. Use a normal
 * `on(...)` handler for a local DOM reaction, or `events.on("someEvent", ... )`
 * for an event-driven side effect. Reserve an event component for output that
 * must be rendered or replaced from the event detail.
 *
 * Before the first matching event, `render` receives `undefined`. Handle that
 * empty state directly, or use a JavaScript default parameter when the region
 * has a meaningful initial projection.
 *
 * @example
 * type EditorEventsMap = {
 *   navigationUpdated: NavigationProjection;
 *   editorUpdated: EditorProjection;
 *   documentSaved: { revision: number };
 * };
 *
 * // One transition updates two independently rendered regions.
 * target.dispatchEvent(events({
 *   navigationUpdated: nextNavigation,
 *   editorUpdated: nextEditor,
 * }));
 *
 * Extend it with an event-detail map, create one descriptor instance for the
 * component/object, then use normal `dispatchEvent(...)` everywhere. Event
 * Calling `events(...)` creates product events, `on(...)` is the listener API, and
 * `<events.on.someEvent render={...} />` renders from the latest event.
 * Name that local descriptor `events`. A domain-specific name belongs on a
 * reusable descriptor class, such as `class DrummerEvents extends
 * CustomEvents<...> {}`, while each class instance can expose `events`.
 *
 * No setup is needed for ordinary component events: dispatch from the element
 * involved in the interaction and use `on(...)` or an event component where
 * the UI reacts. Events fall back to the page-level listener, so sibling
 * branches can react naturally. Use `host()` only when a subtree deliberately
 * needs its own event boundary or host-level event listeners. Those listeners
 * can update a component-local model, but the descriptor does not expose a
 * state-store API.
 *
 * A single dispatch can include several event details with `events(...)`.
 * The descriptor expands that batch as one UI transaction. Event components
 * update first, then descriptor listeners rendered inside those event components
 * run on the committed DOM. This keeps common flows like “render an enabled
 * input, then select it” or “render a cell, then focus it” in event order
 * without extra component state.
 *
 * Calling `events(...)` can also accept a callback detail when a small
 * transition depends on the previous published detail. The callback runs during
 * descriptor processing, after the browser has established the real dispatch
 * target and nearest host. Descriptor `events.on(...)` listeners and event
 * components see only the resolved derived event. Use this for compact
 * descriptor-managed transitions, not as a replacement for a component model
 * with meaningful private mechanics. Raw immediate `addEventListener(...)`
 * observers on the product event itself may see the unresolved callback.
 *
 * @example
 * class DocumentEvents extends CustomEvents<{
 *   documentSaved: { revision: number; savedAt: Date };
 * }> {}
 *
 * let events = new DocumentEvents();
 * let initialDocument = events("documentSaved", {
 *   revision: 0,
 *   savedAt: new Date(),
 * });
 *
 * <section>
 *   <button mix={events.on("documentSaved", ({ detail, currentTarget }) => {
 *     currentTarget.textContent = `Saved revision ${detail.revision}`;
 *   })}>
 *     Save
 *   </button>
 *   <events.on.documentSaved render={(event = initialDocument) =>
 *     `Saved revision ${event.detail.revision}`
 *   } />
 * </section>
 *
 * @example
 * button.dispatchEvent(events("revision", ({ revision }) => (
 *   (revision ?? 0) + 1
 * )));
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
