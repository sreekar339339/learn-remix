import type { Handle, MixinDescriptor, RemixNode } from "remix/ui";
import {
  CHANGE_EVENT_NAME,
  CUSTOM_EVENTS_EVENT_PREFIX,
} from "./constants.ts";
import type { CustomEventsRuntime } from "./runtime.ts";

// Public and internal types
//
// The public descriptor surface is type-derived: product engineers declare an
// event-detail map once, and the proxy-backed descriptor exposes event factory
// methods, render components, event type strings, host helpers, and typed target
// maps.
export type EventDetails = Record<string, unknown>;

type CustomEventsReservedKey =
  | typeof CHANGE_EVENT_NAME
  | "getHost"
  | "host"
  | "map"
  | "on"
  | "seed"
  | "setHost"
  | "types";

export type CustomEventProductKind = "event" | "change";

export type CustomEventProductMetadata = {
  kind: CustomEventProductKind;
  processed: boolean;
  resolveDetail: boolean;
};

export type CustomEventWithMetadata<Detail> = CustomEvent<Detail> & {
  /**
   * Original target that dispatched the product event. This is useful when an
   * event is observed from a sibling branch or through a derived `change` event.
   */
  originTarget?: EventTarget;
};

export type AnyCustomEventsName =
  `${typeof CUSTOM_EVENTS_EVENT_PREFIX}:${string}:${string}`;

declare global {
  interface HTMLElementEventMap {
    [eventName: AnyCustomEventsName]: CustomEventWithMetadata<any>;
  }

  interface SVGElementEventMap {
    [eventName: AnyCustomEventsName]: CustomEventWithMetadata<any>;
  }

  interface ElementEventMap {
    [eventName: AnyCustomEventsName]: CustomEventWithMetadata<any>;
  }
}

export type ChangeEventDetailFromMap<EventMap extends EventDetails> =
  | {
      event: {
        [K in keyof EventMap & string]: {
          type: K;
          detail: EventMap[K];
        };
      }[keyof EventMap & string];
      events: null;
    }
  | {
      event: null;
      events: Partial<EventMap>;
    };

type LocalCustomEventTypes<EventMap extends EventDetails> = {
  [K in typeof CHANGE_EVENT_NAME]: CustomEventWithMetadata<
    ChangeEventDetailFromMap<EventMap>
  >;
} & {
  [K in keyof EventMap & string]: CustomEventWithMetadata<EventMap[K]>;
};

type EventMapReservedKeys<EventMap extends EventDetails> = Extract<
  keyof EventMap,
  CustomEventsReservedKey
>;

type EventMapColonKeys<EventMap extends EventDetails> = Extract<
  keyof EventMap & string,
  `${string}:${string}`
>;

type ReservedCustomEventMapKeyError<Keys extends PropertyKey> = {
  readonly __customEventMapReservedKeyError: "CustomEventMap event maps cannot define reserved event keys.";
  readonly reservedEventKeys: Keys;
};

type ColonCustomEventMapKeyError<Keys extends PropertyKey> = {
  readonly __customEventMapColonKeyError: "CustomEventMap event names cannot contain colons.";
  readonly colonEventKeys: Keys;
};

type CustomEventMapError<EventMap extends EventDetails> =
  EventMapReservedKeys<EventMap> extends never
    ? EventMapColonKeys<EventMap> extends never
      ? never
      : ColonCustomEventMapKeyError<EventMapColonKeys<EventMap>>
    : ReservedCustomEventMapKeyError<EventMapReservedKeys<EventMap>>;

export type CustomEventMap<EventMap extends EventDetails> =
  CustomEventMapError<EventMap> extends never
    ? LocalCustomEventTypes<EventMap>
    : CustomEventMapError<EventMap>;

/**
 * Options for events created by `CustomEvents`.
 *
 * These include standard `EventInit` flags. Pass `signal` when async work may
 * be aborted before dispatch.
 */
export type CustomEventsInit = EventInit & {
  /** When already aborted, the factory returns an inert event. */
  signal?: AbortSignal;
};

export type CustomEventsResolverContext = {
  /**
   * The target that originally dispatched the product event.
   */
  readonly target: EventTarget;
};

export type CustomEventsDetailResolver<
  Events extends EventDetails,
  Detail,
> = (
  eventMap: Partial<Events>,
  change: ChangeEventDetailFromMap<Events> | undefined,
  context: CustomEventsResolverContext,
) => Detail;

export type CustomEventsConstructorOptions = {
  /**
   * Register this target as a host immediately.
   *
   * This is mainly useful for `EventTarget` and `TypedEventTarget` objects.
   * DOM components usually prefer `mix={events.host()}`.
   */
  host?: EventTarget;
  /**
   * Removes the constructor host registration when aborted.
   */
  signal?: AbortSignal;
};

export interface CustomEventsConstructor {
  new <Events extends EventDetails>(
    options?: CustomEventsConstructorOptions,
  ): CustomEventsDescriptor<Events>;
}

export type CustomEventsEventType<Events extends EventDetails> = Extract<
  keyof CustomEventMap<Events>,
  string
>;

export type CustomEventsTypeName<Type extends string> =
  `${typeof CUSTOM_EVENTS_EVENT_PREFIX}:${string}:${Type}`;

export type CustomEventsTypes<Events extends EventDetails> = {
  readonly [Type in CustomEventsEventType<Events>]: CustomEventsTypeName<Type>;
};

export type CustomEventsEvent<
  Events extends EventDetails,
  Type extends CustomEventsEventType<Events>,
> = Event & CustomEventMap<Events>[Type];

export type CustomEventsRenderEvent<
  Events extends EventDetails,
  Type extends CustomEventsEventType<Events>,
> = CustomEventsEvent<Events, Type> | null;

export type CustomEventsSeedEvent<Events extends EventDetails> =
  CustomEventsEvent<Events, CustomEventsEventType<Events>>;

export type CustomEventsRenderProps<
  Events extends EventDetails,
  Type extends CustomEventsEventType<Events>,
  Seed extends CustomEventsSeedEvent<Events> | undefined = undefined,
> = (undefined extends Seed
  ? {
      /**
       * Event object used to render before a matching event is received.
       *
       * `seed` is render-only; it does not dispatch or run DOM listeners. Use
       * the descriptor's `.seed(...)` method when the same starting event should
       * also initialize `getHost(...).latest`.
       *
       * @example
       * <searchEvents.on.change seed={searchEvents.queryEmpty()} render={...} />
       */
      seed?: Seed;
    }
  : {
      /**
       * Event object used to render before a matching event is received.
       *
       * `seed` is render-only; it does not dispatch or run DOM listeners. Use
       * the descriptor's `.seed(...)` method when the same starting event should
       * also initialize `getHost(...).latest`.
       *
       * @example
       * <searchEvents.on.change seed={searchEvents.queryEmpty()} render={...} />
       */
      seed: Seed;
    }) & {
  /**
   * Renders children for the matching event.
   *
   * When `seed` is provided, the render event is non-null. Without `seed`, the
   * event is `null` before a matching event exists; use that branch for empty,
   * idle, or placeholder UI without inventing a fake event.
   *
   * The seed must be created by the same descriptor and be able to initialize
   * this event component.
   *
   * Descriptor `events.on(...)` listeners inside this rendered subtree run after
   * the event render commits when the same dispatch also updates this event
   * component. This lets focus, selection, and measurement work see the updated
   * DOM. Descriptor listeners outside event components remain immediate.
   *
   * Batched dispatches are treated as one UI transaction, so sibling events can
   * be handled after render even when they appear before the render-driving
   * event in the dispatched object.
   *
   * @example
   * <gameEvents.on.turn render={(event) => event?.detail.nextPlayer ?? "X"} />
   *
   * @example
   * <todoEvents.on.change render={(event) => {
   *   let pending = event?.detail.event?.type === "actionSubmitted";
   *   return (
   *     <input
   *       disabled={pending}
   *       mix={todoEvents.on("change", ({ currentTarget }) => {
   *         currentTarget.select();
   *       })}
   *     />
   *   );
   * }} />
   */
  render: (
    event: [Seed] extends [undefined]
      ? CustomEventsRenderEvent<Events, Type>
      : CustomEventsEvent<Events, Type>,
    handle: Handle<CustomEventsRenderProps<Events, Type, Seed>>,
  ) => RemixNode;
};

export type CustomEventsEventComponent<
  Events extends EventDetails,
  Type extends CustomEventsEventType<Events>,
> = <
  Seed extends CustomEventsSeedEvent<Events> | undefined = undefined,
>(
  handle: Handle<CustomEventsRenderProps<Events, Type, Seed>>,
) => () => RemixNode;

type ExactEventDetail<Expected, Actual> = Actual extends Expected
  ? Expected extends object
    ? Actual extends object
      ? Exclude<keyof Actual, keyof Expected> extends never
        ? Actual
        : never
      : Actual
    : Actual
  : never;

type CustomEventsChangeMember<Events extends EventDetails> = {
  /**
   * Creates a batch event for native `dispatchEvent(...)`.
   *
   * Dispatch this when several details change together. The event system will
   * also notify listeners for each changed event type.
   *
   * @example
   * target.dispatchEvent(events.change({ user, settings }));
   */
  (events: Partial<Events>, init?: CustomEventsInit): CustomEventsEvent<
    Events,
    typeof CHANGE_EVENT_NAME & CustomEventsEventType<Events>
  >;

  /**
   * Creates a batch event from the latest descriptor-managed event memory.
   *
   * The callback runs when the product event is processed, after the browser has
   * established the dispatch target. Descriptor `events.on(...)` listeners see
   * only the resolved derived events. Raw immediate DOM listeners on the
   * product event may observe the unresolved callback detail.
   *
   * @example
   * button.dispatchEvent(events.change(({ count }) => ({
   *   count: (count ?? 0) + 1,
   * })));
   */
  (
    resolve: CustomEventsDetailResolver<Events, Partial<Events>>,
    init?: CustomEventsInit,
  ): CustomEventsEvent<
    Events,
    typeof CHANGE_EVENT_NAME & CustomEventsEventType<Events>
  >;
};

type CustomEventsEventMember<
  Events extends EventDetails,
  Type extends keyof Events & string & CustomEventsEventType<Events>,
> = (Events[Type] extends null
  ? {
      /**
       * Creates this null-detail product event for native `dispatchEvent(...)`.
       *
       * Null-detail events can omit the first argument. Pass `null` explicitly
       * when the event also needs options.
       *
       * @example
       * form.dispatchEvent(todoEvents.actionSubmitted());
       *
       * @example
       * form.dispatchEvent(todoEvents.actionSubmitted(null, { signal }));
       */
      (): CustomEventsEvent<Events, Type>;
    }
  : {}) & {
  /**
   * Creates this product event for native `dispatchEvent(...)`.
   *
   * Dispatch product events on the element or object where the change happened.
   * A corresponding `change` event is derived automatically.
   *
   * @example
   * form.dispatchEvent(todoEvents.actionSubmitted(null));
   *
   * @example
   * form.dispatchEvent(todoEvents.actionErrored({ error }, { signal }));
   */
  <Detail extends Events[Type]>(
    detail: ExactEventDetail<Events[Type], Detail>,
    init?: CustomEventsInit,
  ): CustomEventsEvent<Events, Type>;

  /**
   * Creates this product event from the latest descriptor-managed event memory.
   *
   * The callback is resolved during custom-event processing. Use this when a
   * next event detail depends on the latest event map for the nearest host.
   * Descriptor `events.on(...)` listeners receive only the resolved derived
   * event; this callback form is not intended for raw immediate
   * `addEventListener(...)` observers.
   *
   * @example
   * button.dispatchEvent(counterEvents.count(({ count, incrementOffset }) => (
   *   (count ?? 0) + (incrementOffset ?? 1)
   * )));
   */
  (
    resolve: CustomEventsDetailResolver<Events, Events[Type]>,
    init?: CustomEventsInit,
  ): CustomEventsEvent<Events, Type>;
};

export type CustomEventsEventFactories<Events extends EventDetails> = {
  /**
   * Event factory for this event type.
   *
   * Use root event members only to create events for native
   * `dispatchEvent(...)`. Use `events.on.someEvent` for event-driven rendering.
   *
   * @example
   * button.dispatchEvent(checkoutEvents.submitted({ id: "order-1" }));
   *
   * @example
   * <checkoutEvents.on.submitted
   *   render={(event) => event ? event.detail.id : "No checkout yet"}
   * />
   */
  [Type in CustomEventsEventType<Events>]: Type extends typeof CHANGE_EVENT_NAME
    ? CustomEventsChangeMember<Events>
    : Type extends keyof Events & string
      ? CustomEventsEventMember<Events, Type>
      : never;
};

export type CustomEventsRenderComponents<Events extends EventDetails> = {
  /**
   * Renders from the latest matching event.
   *
   * Event components do not take a target prop. They discover the nearest host
   * for this event set, or use the descriptor fallback when no host is present.
   *
   * @example
   * <checkoutEvents.on.submitted
   *   render={(event) => event ? event.detail.id : "No checkout yet"}
   * />
   *
   * @example
   * <checkoutEvents.on.change
   *   render={(event) => event?.detail.event?.type ?? "idle"}
   * />
   */
  [Type in CustomEventsEventType<Events>]: CustomEventsEventComponent<
    Events,
    Type
  >;
};

export type CustomEventsListenerEvent<
  Events extends EventDetails,
  Type extends CustomEventsEventType<Events>,
  HostElement extends Element,
> = CustomEventsEvent<Events, Type> & {
  readonly currentTarget: HostElement;
};

export type CustomEventsOnFunction<Events extends EventDetails> = {
  /**
   * Reacts to one custom event on the element that owns this mixin.
   *
   * Events are observed from the nearest `host()` boundary when one exists, or
   * from the page fallback otherwise. The callback receives the same
   * `currentTarget` shape as Remix `on(...)`, so DOM effects can stay local to
   * the element.
   *
   * When this mixin is rendered inside `<events.on.someEvent render={...} />`,
   * matching events from the same dispatch transaction run after that event
   * component commits. Elsewhere, callbacks run immediately like normal DOM
   * listeners.
   *
   * @example
   * <button mix={checkoutEvents.on("submitted", ({ detail, currentTarget }) => {
   *   currentTarget.disabled = detail.pending;
   * })} />
   *
   * @example
   * <input mix={searchEvents.on("change", ({ detail, currentTarget }) => {
   *   if (!detail.event) return;
   *   currentTarget.classList.toggle(
   *     "pending",
   *     detail.event.type === "querySubmitted",
   *   );
   * })} />
   */
  <
    HostElement extends Element = Element,
    Type extends CustomEventsEventType<Events> = CustomEventsEventType<Events>,
  >(
    type: Type,
    listener: (
      event: CustomEventsListenerEvent<Events, Type, HostElement>,
      signal: AbortSignal,
    ) => void | Promise<void>,
  ): MixinDescriptor<HostElement, any>;
} & CustomEventsRenderComponents<Events>;

export type CustomEventsHostReference<Events extends EventDetails> = {
  readonly latest:
    | {
        readonly change: ChangeEventDetailFromMap<Events>;
        readonly eventMap: Partial<Events>;
      }
    | undefined;
};

export type HostableCustomEventsDescriptor<Events extends EventDetails> = {
  /**
   * Makes an element the local event boundary for this event set.
   *
   * Use it on a widget root when sibling branches should share events through
   * that root. Use it on repeated rows or forms when each instance should keep
   * its latest-event memory and non-composed events independent. Events stay
   * inside the host unless they are created with `{ composed: true }`.
   *
   * You do not need a host for every component. Add one when you want a local
   * boundary, local latest-event memory, or less page-level event traffic.
   */
  host(): MixinDescriptor<Element, any>;

  /**
   * Registers an existing `EventTarget` as a host for this event set.
   *
   * Use this for plain `EventTarget` or `TypedEventTarget` domain objects.
   * DOM elements usually prefer the `host()` mixin. Pass a signal or call the
   * returned cleanup when the target is no longer used.
   */
  setHost(target: EventTarget, signal?: AbortSignal): () => void;

  /**
   * Reads the latest event memory for this event set.
   *
   * For DOM elements, this resolves the nearest host. For plain event targets,
   * it reads the target registered with `setHost(...)`. `latest.change`
   * describes the most recent dispatched event or batch. `latest.eventMap` is
   * the accumulated latest detail for each event type.
   */
  getHost(target: EventTarget): CustomEventsHostReference<Events>;
};

export type CustomEventsDescriptor<Events extends EventDetails> = {
  /**
   * Reacts to a product event from this descriptor.
   *
   * Use this when an element should update itself from custom events in its
   * host boundary, sibling branches, or the page-level fallback. Use
   * `events.on.someEvent` when rendering children from the latest event.
   */
  on: CustomEventsOnFunction<Events>;

  /**
   * Generated event type strings for low-level event interop.
   */
  readonly types: CustomEventsTypes<Events>;

  /**
   * Seeds render components and host memory with a descriptor-created event.
   *
   * This does not dispatch. It gives `<events.on.someEvent render={...} />`
   * and `getHost(...).latest` a starting point. Dispatch explicitly when
   * event listeners should run.
   */
  seed(event: CustomEventsSeedEvent<Events>): void;

  /**
   * Local event map for `TypedEventTarget` and strongly typed event details.
   */
  readonly map: CustomEventMap<Events>;
} & CustomEventsEventFactories<Events> &
  HostableCustomEventsDescriptor<Events>;

export type CustomEventsMemory = {
  change?: ChangeEventDetailFromMap<EventDetails>;
  eventMap: Partial<EventDetails>;
};

export type CustomEventsDispatchTargetRegistration = {
  count: number;
  cleanup: () => void;
};

export type CustomEventsRenderScope = {
  descriptor: CustomEventsRuntime;
  eventName: string;
  transaction: CustomEventsTransaction | null;
  version: number;
};

export type CustomEventsBridgedEvent = {
  source: Event;
  replay?: boolean;
};

export type CustomEventsTransaction = {
  events: Map<string, CustomEvent>;
};

export function createCustomEventsTransaction() {
  return {
    events: new Map<string, CustomEvent>(),
  };
}
