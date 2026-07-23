import { createCustomEventsDescriptor } from "./customEvents/descriptor.tsx";
import { __customEventsTest } from "./customEvents/runtime.ts";
import type {
  CustomEventMap,
  CustomEventsConstructor,
  CustomEventsConstructorOptions,
  CustomEventsDescriptor,
  EventDetails,
} from "./customEvents/types.ts";

/**
 * Base class for a component or object event set.
 *
 * Extend it with an event-detail map, create one descriptor instance for the
 * component/object, then use normal `dispatchEvent(...)` everywhere. Event
 * methods create product events, `on(...)` is the listener API, and
 * `<events.on.someEvent render={...} />` renders from the latest event.
 *
 * Use `host()` on a component root or repeated row/form when that part of the
 * page should own its event memory and boundary. Without a host, events fall
 * back to the page-level listener so sibling branches can still react.
 *
 * A single dispatch can include several event details with `events.change(...)`.
 * The descriptor expands that batch as one UI transaction. Event components
 * update first, then descriptor listeners rendered inside those event components
 * run on the committed DOM. This keeps common flows like “render an enabled
 * input, then select it” or “render a cell, then focus it” in event order
 * without extra component state.
 *
 * Event factory methods can also accept a callback detail when the next detail
 * depends on the latest descriptor memory. The callback runs during descriptor
 * processing, after the browser has established the real dispatch target and
 * nearest host. Descriptor `events.on(...)` listeners and event components see
 * only the resolved derived event. Use this callback form for
 * descriptor-managed events; raw immediate `addEventListener(...)` observers on
 * the product event itself may see the unresolved callback.
 *
 * @example
 * class GameEvents extends CustomEvents<{
 *   turn: { nextPlayer: "X" | "O"; result: "Pending" | "Done" };
 * }> {}
 *
 * let gameEvents = new GameEvents();
 * gameEvents.seed(gameEvents.turn({ nextPlayer: "X", result: "Pending" }));
 *
 * <section mix={gameEvents.host()}>
 *   <button mix={gameEvents.on("turn", ({ detail, currentTarget }) => {
 *     currentTarget.disabled = detail.result !== "Pending";
 *   })}>
 *     Play
 *   </button>
 *   <gameEvents.on.turn render={(event) => event?.detail.nextPlayer ?? "X"} />
 * </section>
 *
 * @example
 * button.dispatchEvent(counterEvents.count(({ count, incrementOffset }) => (
 *   (count ?? 0) + (incrementOffset ?? 1)
 * )));
 */
class CustomEventsBase<Events extends EventDetails> {
  declare readonly map: CustomEventMap<Events>;

  constructor(options?: CustomEventsConstructorOptions) {
    let descriptor = createCustomEventsDescriptor<Events>(options);
    return descriptor as unknown as this;
  }
}

export type CustomEvents<Events extends EventDetails> =
  CustomEventsDescriptor<Events>;

export const CustomEvents: CustomEventsConstructor =
  CustomEventsBase as unknown as CustomEventsConstructor;

export { __customEventsTest };
