import {
  createMixin,
  on as remixOn,
  ref,
  type Handle,
  type RemixNode,
  type MixinDescriptor,
} from "remix/ui";

// Constants
//
// These values define the private wire format for descriptor-owned DOM events.
// Public event names are generated from a stable prefix, a per-descriptor id,
// and the product event type.
const CUSTOM_EVENTS_EVENT_PREFIX = "rmx:custom-events";
const CUSTOM_EVENTS_ABORTED = `${CUSTOM_EVENTS_EVENT_PREFIX}:aborted`;
const CHANGE_EVENT_NAME = "change";
let customEventsOwnerId = 0;

// Public and internal types
//
// The public descriptor surface is type-derived: product engineers declare an
// event-detail map once, and the proxy-backed descriptor exposes event factory
// methods, render components, event type strings, host helpers, and typed target
// maps.
// These types also reserve descriptor method names so event maps cannot collide
// with the public API.
type EventDetails = Record<string, unknown>;
type CustomEventsReservedKey =
  | typeof CHANGE_EVENT_NAME
  | "getHost"
  | "host"
  | "map"
  | "on"
  | "seed"
  | "setHost"
  | "types";
type CustomEventProductKind = "event" | "change";
type CustomEventProductMetadata = {
  kind: CustomEventProductKind;
  processed: boolean;
};
type CustomEventWithMetadata<Detail> = CustomEvent<Detail> & {
  /**
   * Original target that dispatched the product event. This is useful when an
   * event is observed from a sibling branch or through a derived `change` event.
   */
  originTarget?: EventTarget;
};

type AnyCustomEventsName =
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

type ChangeEventDetailFromMap<EventMap extends EventDetails> =
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

type CustomEventMap<EventMap extends EventDetails> =
  CustomEventMapError<EventMap> extends never
    ? LocalCustomEventTypes<EventMap>
    : CustomEventMapError<EventMap>;

/**
 * Options for events created by `CustomEvents`.
 *
 * These include standard `EventInit` flags. Pass `signal` when async work may
 * be aborted before dispatch.
 */
type CustomEventsInit = EventInit & {
  /** When already aborted, the factory returns an inert event. */
  signal?: AbortSignal;
};

type CustomEventsConstructorOptions = {
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

interface CustomEventsConstructor {
  new <Events extends EventDetails>(
    options?: CustomEventsConstructorOptions,
  ): CustomEventsDescriptor<Events>;
}

type CustomEventsEventType<Events extends EventDetails> = Extract<
  keyof CustomEventMap<Events>,
  string
>;

type CustomEventsTypeName<Type extends string> =
  `${typeof CUSTOM_EVENTS_EVENT_PREFIX}:${string}:${Type}`;

type CustomEventsTypes<Events extends EventDetails> = {
  readonly [Type in CustomEventsEventType<Events>]: CustomEventsTypeName<Type>;
};

type CustomEventsEvent<
  Events extends EventDetails,
  Type extends CustomEventsEventType<Events>,
> = Event & CustomEventMap<Events>[Type];

type CustomEventsRenderEvent<
  Events extends EventDetails,
  Type extends CustomEventsEventType<Events>,
> = CustomEventsEvent<Events, Type> | null;

type CustomEventsSeedEvent<Events extends EventDetails> = CustomEventsEvent<
  Events,
  CustomEventsEventType<Events>
>;

type CustomEventsRenderProps<
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

type CustomEventsEventComponent<
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
};

type CustomEventsEventFactories<Events extends EventDetails> = {
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

type CustomEventsRenderComponents<Events extends EventDetails> = {
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

type CustomEventsListenerEvent<
  Events extends EventDetails,
  Type extends CustomEventsEventType<Events>,
  HostElement extends Element,
> = CustomEventsEvent<Events, Type> & {
  readonly currentTarget: HostElement;
};

type CustomEventsOnFunction<Events extends EventDetails> = {
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

type CustomEventsHostReference<Events extends EventDetails> = {
  readonly latest:
    | {
        readonly change: ChangeEventDetailFromMap<Events>;
        readonly eventMap: Partial<Events>;
      }
    | undefined;
};

type HostableCustomEventsDescriptor<Events extends EventDetails> = {
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
   *
   * @example
   * <section mix={gameEvents.host()}>
   *   <Board />
   *   <ResetButton />
   *   <gameEvents.on.turn
   *     render={(event) => event?.detail.nextPlayer ?? "X"}
   *   />
   * </section>
   *
   * @example
   * <form mix={todoEvents.host()}>
   *   <button mix={todoEvents.on("change", updatePendingUi)} />
   * </form>
   *
   * @example
   * form.dispatchEvent(
   *   todoEvents.actionSubmitted(null, { composed: true }),
   * );
   */
  host(): MixinDescriptor<Element, any>;

  /**
   * Registers an existing `EventTarget` as a host for this event set.
   *
   * Use this for plain `EventTarget` or `TypedEventTarget` domain objects.
   * DOM elements usually prefer the `host()` mixin. Pass a signal or call the
   * returned cleanup when the target is no longer used.
   *
   * @example
   * class Drummer extends TypedEventTarget<DrummerEventMap> {
   *   events = drummerEvents;
   *
   *   constructor() {
   *     super();
   *     this.events.setHost(this);
   *   }
   *
   *   play() {
   *     this.dispatchEvent(this.events.play({ tempoBpm: 120 }));
   *   }
   * }
   */
  setHost(target: EventTarget, signal?: AbortSignal): () => void;

  /**
   * Reads the latest event memory for this event set.
   *
   * For DOM elements, this resolves the nearest host. For plain event targets,
   * it reads the target registered with `setHost(...)`. `latest.change`
   * describes the most recent dispatched event or batch. `latest.eventMap` is
   * the accumulated latest detail for each event type.
   *
   * @example
   * on("focusout", ({ currentTarget }) => {
   *   if (
   *     todoEvents.getHost(currentTarget).latest?.change.event?.type ===
   *     "actionSubmitted"
   *   ) {
   *     return;
   *   }
   *   currentTarget.reset();
   * })
   */
  getHost(target: EventTarget): CustomEventsHostReference<Events>;

};

type CustomEventsDescriptor<Events extends EventDetails> = {
  /**
   * Reacts to a product event from this descriptor.
   *
   * Use this when an element should update itself from custom events in its
   * host boundary, sibling branches, or the page-level fallback. Use
   * `events.on.someEvent` when rendering children from the latest event.
   *
   * @example
   * <button mix={todoEvents.on("actionSubmitted", updatePendingUi)} />
   *
   * @example
   * <todoEvents.on.change
   *   render={(event) => event?.detail.event?.type ?? "idle"}
   * />
   */
  on: CustomEventsOnFunction<Events>;

  /**
   * Generated event type strings for low-level event interop.
   *
   * Most code should use `events.on("submitted", callback)`. Reach for
   * `events.types.submitted` when you are integrating with raw
   * `addEventListener(...)`, another mixin, or tests that need the actual DOM
   * event name.
   *
   * @example
   * target.addEventListener(checkoutEvents.types.submitted, handleSubmitted);
   */
  readonly types: CustomEventsTypes<Events>;

  /**
   * Seeds render components and host memory with a descriptor-created event.
   *
   * This does not dispatch. It gives `<events.on.someEvent render={...} />`
   * and `getHost(...).latest` a starting point. Dispatch explicitly when
   * event listeners should run.
   *
   * @example
   * searchEvents.seed(searchEvents.queryEmpty());
   *
   * @example
   * appContextEvents.seed(
   *   appContextEvents.change({ user: null, settings }),
   * );
   */
  seed(event: CustomEventsSeedEvent<Events>): void;

  /**
   * Local event map for `TypedEventTarget` and strongly typed event details.
   */
  readonly map: CustomEventMap<Events>;
} & CustomEventsEventFactories<Events> &
  HostableCustomEventsDescriptor<Events>;

// Descriptor runtime
//
// Each descriptor instance owns its host registry, latest-event memory, event
// metadata, dispatch-target registrations, and listener notifications. Keeping
// this state local means descriptors do not need an owner key inside every data
// structure.
type CustomEventsMemory = {
  change?: ChangeEventDetailFromMap<EventDetails>;
  eventMap: Partial<EventDetails>;
};

type CustomEventsDispatchTargetRegistration = {
  count: number;
  cleanup: () => void;
};

type CustomEventsRenderScope = {
  descriptor: CustomEventsRuntime;
  eventName: string;
  transaction: CustomEventsTransaction | null;
  version: number;
};

type CustomEventsBridgedEvent = {
  source: Event;
  replay?: boolean;
};

type CustomEventsTransaction = {
  events: Map<string, CustomEvent>;
};

function createCustomEventsTransaction() {
  return {
    events: new Map<string, CustomEvent>(),
  };
}

class CustomEventsRuntime {
  readonly ownerId = createCustomEventsOwnerId();
  initial?: Event;
  readonly eventTypes = new Set<string>();
  readonly typeListeners = new Set<() => void>();

  #hosts = new WeakMap<Element, number>();
  #registeredHosts = new Set<WeakRef<EventTarget>>();
  #registeredHostCounts = new WeakMap<EventTarget, number>();
  #memory = new WeakMap<EventTarget, CustomEventsMemory>();
  #descriptorMemory: CustomEventsMemory | undefined;
  #listeners = new Set<() => void>();
  #dispatchTargetRegistrations = new WeakMap<
    EventTarget,
    CustomEventsDispatchTargetRegistration
  >();
  #ownedEvents = new WeakSet<Event>();
  #productEvents = new WeakMap<Event, CustomEventProductMetadata>();
  #bridgedEvents = new WeakMap<Event, CustomEventsBridgedEvent>();
  #originTargets = new WeakMap<Event, EventTarget>();
  #transactions = new WeakMap<Event, CustomEventsTransaction>();
  #notificationPending = false;

  ownsEvent(event: Event) {
    return this.#ownedEvents.has(event);
  }

  getProductMetadata(event: Event) {
    return this.#productEvents.get(event);
  }

  markProductEventProcessed(event: Event) {
    let metadata = this.#productEvents.get(event);
    if (metadata) metadata.processed = true;
  }

  isBridgedEvent(event: Event) {
    return this.#bridgedEvents.has(event);
  }

  getBridgedEvent(event: Event) {
    return this.#bridgedEvents.get(event);
  }

  getOriginTarget(event: Event) {
    return this.#originTargets.get(event);
  }

  createCustomEvent(
    type: string,
    init: EventInit,
    detail: unknown,
    metadata?: {
      product?: CustomEventProductKind;
      origin?: EventTarget;
    },
  ) {
    let event = new CustomEvent(type, { ...init, detail });
    this.#ownedEvents.add(event);

    if (metadata?.product) {
      this.#productEvents.set(event, {
        kind: metadata.product,
        processed: false,
      });
    }

    if (metadata?.origin) {
      this.#originTargets.set(event, metadata.origin);
      defineEventValue(event, "originTarget", metadata.origin, {
        enumerable: true,
      });
    }

    return event;
  }

  markBridgedEvent(
    event: Event,
    bridgedEvent: CustomEventsBridgedEvent,
  ) {
    this.#bridgedEvents.set(event, bridgedEvent);
  }

  getTransaction(event: Event) {
    return this.#transactions.get(event);
  }

  markTransaction(event: Event, transaction: CustomEventsTransaction) {
    this.#transactions.set(event, transaction);
  }

  addRegisteredHost(target: EventTarget) {
    let count = this.#registeredHostCounts.get(target) ?? 0;
    this.#registeredHostCounts.set(target, count + 1);
    if (count > 0) return;

    let hosts = this.#registeredHosts;
    hosts.add(new WeakRef(target));
    this.notifySoon();
  }

  removeRegisteredHost(target: EventTarget) {
    let count = this.#registeredHostCounts.get(target) ?? 0;
    if (count > 1) {
      this.#registeredHostCounts.set(target, count - 1);
      return;
    }

    this.#registeredHostCounts.delete(target);
    let hosts = this.#registeredHosts;

    for (let host of hosts) {
      let registeredTarget = host.deref();
      if (!registeredTarget || registeredTarget === target) {
        hosts.delete(host);
        if (registeredTarget === target) break;
      }
    }
    this.notifySoon();
  }

  forEachRegisteredHost(callback: (target: EventTarget) => void) {
    let hosts = this.#registeredHosts;

    for (let host of hosts) {
      let target = host.deref();
      if (!target) {
        hosts.delete(host);
        continue;
      }
      callback(target);
    }
  }

  getSoleRegisteredHost() {
    let hosts = this.#registeredHosts;

    let soleTarget: EventTarget | undefined;
    for (let host of hosts) {
      let target = host.deref();
      if (!target) {
        hosts.delete(host);
        continue;
      }
      if (!soleTarget) {
        soleTarget = target;
        continue;
      }
      if (soleTarget !== target) {
        return undefined;
      }
    }

    return soleTarget;
  }

  addHost(element: Element) {
    let count = this.#hosts.get(element) ?? 0;
    this.#hosts.set(element, count + 1);
    if (count === 0) this.addRegisteredHost(element);
  }

  removeHost(element: Element) {
    let count = this.#hosts.get(element) ?? 0;
    if (count <= 1) {
      this.#hosts.delete(element);
      this.removeMemory(element);
      this.removeRegisteredHost(element);
    } else {
      this.#hosts.set(element, count - 1);
    }
  }

  removeMemory(target: EventTarget) {
    this.#memory.delete(target);
  }

  findHost(element: Element | undefined) {
    for (
      let current = element;
      current;
      current = current.parentElement ?? undefined
    ) {
      if (this.#hosts.has(current)) return current;
    }
    return undefined;
  }

  getDefaultTarget(element: Element | undefined) {
    return (
      this.findHost(element) ??
      this.getSoleRegisteredHost() ??
      (typeof window === "undefined" ? undefined : window)
    );
  }

  getMemoryTarget(target: EventTarget | undefined) {
    if (isElement(target)) {
      return this.findHost(target);
    }
    return target;
  }

  getMemory(target: EventTarget | undefined) {
    let memoryTarget = this.getMemoryTarget(target);
    if (!memoryTarget) return this.#descriptorMemory;

    return this.#memory.get(memoryTarget);
  }

  getReference(target: EventTarget) {
    let memory = this.getMemory(target);
    return {
      latest: memory?.change
        ? { change: memory.change, eventMap: memory.eventMap }
        : undefined,
    };
  }

  setMemory(target: EventTarget | undefined, memory: CustomEventsMemory) {
    let memoryTarget = this.getMemoryTarget(target);
    if (!memoryTarget) {
      this.#descriptorMemory = memory;
      return;
    }

    this.#memory.set(memoryTarget, memory);
  }

  record(
    target: EventTarget | undefined,
    entries: Array<[string, unknown]>,
  ) {
    let changeDetail = createCustomEventChangeDetail(entries);
    let current = this.getMemory(target)?.eventMap ?? {};
    let eventMap: Partial<EventDetails> = { ...current };
    for (let [type, detail] of entries) {
      eventMap[type] = detail;
    }
    this.setMemory(target, {
      change: changeDetail,
      eventMap,
    });
    return changeDetail;
  }

  notifySoon() {
    if (this.#notificationPending) return;
    this.#notificationPending = true;
    queueMicrotask(() => {
      this.#notificationPending = false;
      for (let listener of this.#listeners) listener();
    });
  }

  subscribe(listener: () => void) {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  seedInitialMemory(target: EventTarget | undefined) {
    let entries = getInitialEventEntries(this);
    if (!entries?.length) return;
    this.record(target, entries);
  }

  seedInitialDescriptorMemory() {
    this.seedInitialMemory(undefined);
  }

  seedInitialRegisteredHosts() {
    this.forEachRegisteredHost((target) => {
      this.seedInitialMemory(target);
    });
  }

  registerDispatchTarget(
    target: EventTarget,
    options?: { hosted?: boolean },
  ) {
    let registration = this.#dispatchTargetRegistrations.get(target);
    if (registration) {
      registration.count += 1;
      let activeRegistration = registration;
      return () => {
        activeRegistration.count -= 1;
        if (activeRegistration.count > 0) return;
        activeRegistration.cleanup();
        this.#dispatchTargetRegistrations.delete(target);
      };
    }

    let controller: AbortController | undefined;

    let listen = () => {
      controller?.abort();
      controller = new AbortController();
      let signal = controller.signal;
      for (let type of this.eventTypes) {
        target.addEventListener(
          getEventName(this, type),
          (event) => {
            if (!(event instanceof CustomEvent)) return;
            if (options?.hosted && event.composed !== true) {
              event.stopPropagation();
            }
            processCustomEventsEvent(event, this);
          },
          { signal },
        );
      }
    };

    let unsubscribeEventTypes = subscribeEventTypes(this, listen);
    listen();

    registration = {
      count: 1,
      cleanup() {
        unsubscribeEventTypes?.();
        controller?.abort();
      },
    };
    this.#dispatchTargetRegistrations.set(target, registration);

    return () => {
      registration.count -= 1;
      if (registration.count > 0) return;
      registration.cleanup();
      this.#dispatchTargetRegistrations.delete(target);
    };
  }
}

// Window event processing
//
// Product events often bubble to window so sibling branches can react without a
// shared EventTarget. Window listeners must not keep descriptor instances alive:
// each listener owns only a WeakRef to the runtime and unregisters itself when
// that runtime has been collected or finalized.
type CustomEventsWindowListener = {
  controller: AbortController;
  descriptor: WeakRef<CustomEventsRuntime>;
};

class WindowBridge {
  #listeners = new Map<string, CustomEventsWindowListener>();
  #finalizer =
    typeof FinalizationRegistry === "undefined"
      ? undefined
      : new FinalizationRegistry<string>((eventName) => {
          this.remove(eventName);
        });

  enable(descriptor: CustomEventsRuntime) {
    if (typeof window === "undefined") return;

    for (let type of descriptor.eventTypes) {
      let eventName = getEventName(descriptor, type);
      if (this.#listeners.has(eventName)) continue;

      let controller = new AbortController();
      let descriptorRef = new WeakRef(descriptor);
      this.#listeners.set(eventName, {
        controller,
        descriptor: descriptorRef,
      });
      this.#finalizer?.register(descriptor, eventName);

      window.addEventListener(
        eventName,
        (event) => {
          if (!(event instanceof CustomEvent)) return;

          let listener = this.#listeners.get(eventName);
          let descriptor = listener?.descriptor.deref();
          if (!descriptor) {
            this.remove(eventName);
            return;
          }

          processCustomEventsEvent(event, descriptor);
        },
        { signal: controller.signal },
      );
    }
  }

  remove(eventName: string) {
    let listener = this.#listeners.get(eventName);
    if (!listener) return;
    listener.controller.abort();
    this.#listeners.delete(eventName);
  }

  has(eventName: string) {
    return this.#listeners.has(eventName);
  }

  expire(eventName: string) {
    let listener = this.#listeners.get(eventName);
    if (!listener) return false;
    listener.descriptor = {
      deref: () => undefined,
    } as WeakRef<CustomEventsRuntime>;
    return true;
  }

  count() {
    return this.#listeners.size;
  }
}

const windowBridge = new WindowBridge();

function createCustomEventsOwnerId() {
  customEventsOwnerId += 1;
  return customEventsOwnerId.toString(36);
}

function isElement(value: unknown): value is Element {
  return typeof Element !== "undefined" && value instanceof Element;
}

function isEventTarget(value: unknown): value is EventTarget {
  return typeof EventTarget !== "undefined" && value instanceof EventTarget;
}

function shouldBridgeEventToElement(
  event: Event,
  descriptor: CustomEventsRuntime,
  element: Element | undefined,
): element is Element {
  if (!element) return false;
  if (descriptor.isBridgedEvent(event)) return false;
  if (event.composedPath().includes(element)) return false;
  return true;
}

// Event type strings and known event types
//
// Descriptor event type strings are globally unique, so descriptor-owned events
// can be bridged or processed without colliding with browser events or
// another CustomEvents instance. Known event types are discovered lazily through
// proxy property access and event factory calls.
function getEventName(descriptor: CustomEventsRuntime, type: string) {
  return `${CUSTOM_EVENTS_EVENT_PREFIX}:${descriptor.ownerId}:${type}`;
}

function getEventType(
  descriptor: CustomEventsRuntime,
  eventName: string,
) {
  let prefix = `${CUSTOM_EVENTS_EVENT_PREFIX}:${descriptor.ownerId}:`;
  if (!eventName.startsWith(prefix)) return undefined;
  return eventName.slice(prefix.length);
}

function addEventType(descriptor: CustomEventsRuntime, type: string) {
  if (descriptor.eventTypes.has(type)) return;
  descriptor.eventTypes.add(type);
  for (let listener of descriptor.typeListeners) listener();
}

function subscribeEventTypes(
  descriptor: CustomEventsRuntime,
  listener: () => void,
) {
  descriptor.typeListeners.add(listener);
  return () => descriptor.typeListeners.delete(listener);
}

// Change detail helpers
//
// Every product event derives a change event. A product change event behaves as a
// batch: it records all provided details and expands into individual product
// events. The change detail contains only the event envelope for what happened.
function createCustomEventChangeDetail(entries: Array<[string, unknown]>) {
  if (entries.length === 1) {
    let [[type, detail]] = entries;
    return {
      event: {
        type,
        detail,
      },
      events: null,
    };
  }

  return {
    event: null,
    events: getEntriesObject(entries),
  };
}

function getChangeEventEntries(detail: ChangeEventDetailFromMap<EventDetails>) {
  if (!detail.event) return Object.entries(detail.events);

  return [[detail.event.type, detail.event.detail]] satisfies Array<
    [string, unknown]
  >;
}

function getEntriesObject(entries: Array<[string, unknown]>) {
  let object: Partial<EventDetails> = {};
  for (let [type, detail] of entries) {
    object[type] = detail;
  }
  return object;
}

function resolveCustomEventsDispatchEntries(
  events: Partial<EventDetails>,
) {
  let entries: Array<[string, unknown]> = [];

  for (let [type, detail] of Object.entries(events)) {
    if (type === CHANGE_EVENT_NAME) {
      throw new TypeError('CustomEvents does not dispatch "change" directly.');
    }
    entries.push([type, detail]);
  }

  return entries;
}

function getEventInit(init: EventInit | undefined): EventInit {
  return {
    bubbles: init?.bubbles ?? true,
    cancelable: init?.cancelable ?? true,
    ...(init?.composed === undefined ? {} : { composed: init.composed }),
  };
}

// Event construction
//
// Event factory methods return normal CustomEvent instances for native
// dispatchEvent(). The runtime stores ownership and processing metadata in weak
// collections; `originTarget` is the only public property added to derived or
// bridged events.
function createProductCustomEvent(
  descriptor: CustomEventsRuntime,
  type: string,
  init: EventInit,
  detail: unknown,
  product: CustomEventProductKind,
) {
  return descriptor.createCustomEvent(
    getEventName(descriptor, type),
    init,
    detail,
    { product },
  );
}

function createDescriptorEvent(
  descriptor: CustomEventsRuntime,
  type: string,
  init: EventInit,
  detail: unknown,
  origin: EventTarget,
  transaction?: CustomEventsTransaction,
) {
  let event = descriptor.createCustomEvent(
    getEventName(descriptor, type),
    init,
    detail,
    { origin },
  );
  transaction?.events.set(event.type, event);
  if (transaction) descriptor.markTransaction(event, transaction);
  return event;
}

// Initial event projection
//
// Initial values are descriptor-created Event objects. A single product event
// can initialize a change renderer, and a change initial event can initialize
// the matching product-event renderer. Initial projection never dispatches.
function createInitialEvent(
  type: string,
  descriptor: CustomEventsRuntime,
  initial: Event | undefined,
) {
  if (!(initial instanceof CustomEvent)) return undefined;

  let eventName = getEventName(descriptor, type);
  let initialType = getEventType(descriptor, initial.type);
  if (!initialType) return undefined;

  if (initialType === type) {
    return initial;
  }

  if (type === CHANGE_EVENT_NAME) {
    return new CustomEvent(eventName, {
      detail: createCustomEventChangeDetail([[initialType, initial.detail]]),
    });
  }

  if (initialType !== CHANGE_EVENT_NAME) return undefined;

  let detail = initial.detail as ChangeEventDetailFromMap<EventDetails>;
  if (!detail.event) {
    if (!Object.hasOwn(detail.events, type)) return undefined;
    return new CustomEvent(eventName, {
      detail: detail.events[type],
    });
  }

  if (detail.event.type !== type) return undefined;

  return new CustomEvent(eventName, {
    detail: detail.event.detail,
  });
}

function getInitialEventEntriesFromEvent(
  descriptor: CustomEventsRuntime,
  initial: CustomEvent,
) {
  let type = getEventType(descriptor, initial.type);
  if (!type) return undefined;
  if (type !== CHANGE_EVENT_NAME) {
    return [[type, initial.detail]] satisfies Array<[string, unknown]>;
  }

  let detail = initial.detail as ChangeEventDetailFromMap<EventDetails>;
  return getChangeEventEntries(detail);
}

function getInitialEventEntries(descriptor: CustomEventsRuntime) {
  let initial = descriptor.initial;
  return initial instanceof CustomEvent
    ? getInitialEventEntriesFromEvent(descriptor, initial)
    : undefined;
}

// Event processing
//
// Product events are user-dispatched events. Processing records host memory and
// emits the derived event(s) back on the original event target. Derived events
// are runtime-owned but not product events, so they never recurse.
//
// Each processing pass creates one transaction for every derived event emitted
// from that product event. Event components use that transaction to render first
// and let descriptor-scoped listeners in the rendered subtree run afterward,
// even when a batch lists a sibling event before the event that drives render.
function dispatchLocalTypedEvent(
  target: EventTarget,
  descriptor: CustomEventsRuntime,
  type: string,
  init: EventInit,
  detail: unknown,
) {
  if (isElement(target)) return;
  if (typeof window !== "undefined" && target === window) return;
  target.dispatchEvent(
    descriptor.createCustomEvent(type, init, detail, {
      origin: target,
    }),
  );
}

function emitDerivedChangeEvent(
  target: EventTarget,
  descriptor: CustomEventsRuntime,
  entries: Array<[string, unknown]>,
  init: EventInit,
  transaction: CustomEventsTransaction,
) {
  let changeDetail = descriptor.record(target, entries);
  target.dispatchEvent(
    createDescriptorEvent(
      descriptor,
      CHANGE_EVENT_NAME,
      init,
      changeDetail,
      target,
      transaction,
    ),
  );
  dispatchLocalTypedEvent(
    target,
    descriptor,
    CHANGE_EVENT_NAME,
    init,
    changeDetail,
  );
}

function emitExpandedGranularEvents(
  target: EventTarget,
  descriptor: CustomEventsRuntime,
  entries: Array<[string, unknown]>,
  init: EventInit,
  transaction: CustomEventsTransaction,
) {
  let events = entries.map(([type, detail]) =>
    createDescriptorEvent(
      descriptor,
      type,
      init,
      detail,
      target,
      transaction,
    ),
  );

  for (let event of events) {
    target.dispatchEvent(event);
  }

  for (let [type, detail] of entries) {
    dispatchLocalTypedEvent(target, descriptor, type, init, detail);
  }
}

function commitProductEvent(
  target: EventTarget,
  descriptor: CustomEventsRuntime,
  entries: Array<[string, unknown]>,
  product: CustomEventProductKind,
  init: EventInit,
) {
  let transaction = createCustomEventsTransaction();

  if (product === "event") {
    emitDerivedChangeEvent(target, descriptor, entries, init, transaction);
    return;
  }

  let changeDetail = descriptor.record(target, entries);
  dispatchLocalTypedEvent(
    target,
    descriptor,
    CHANGE_EVENT_NAME,
    init,
    changeDetail,
  );
  emitExpandedGranularEvents(target, descriptor, entries, init, transaction);
}

function processCustomEventsEvent(
  event: CustomEvent,
  descriptor: CustomEventsRuntime,
) {
  if (!descriptor.ownsEvent(event)) return;

  let metadata = descriptor.getProductMetadata(event);
  if (!metadata || metadata.processed) return;

  let origin = isEventTarget(event.target) ? event.target : undefined;
  if (!origin) return;

  descriptor.markProductEventProcessed(event);
  let init = getEventInit(event);
  let entries: Array<[string, unknown]>;

  if (metadata.kind === "event") {
    let type = getEventType(descriptor, event.type);
    if (!type || type === CHANGE_EVENT_NAME) return;
    entries = [[type, event.detail]];
  } else {
    let detail = event.detail as ChangeEventDetailFromMap<EventDetails>;
    entries = getChangeEventEntries(detail);
    if (!entries.length) return;
  }

  queueMicrotask(() => {
    commitProductEvent(origin, descriptor, entries, metadata.kind, init);
  });
}

export const __customEventsTest = {
  hasWindowListener(eventName: string) {
    return windowBridge.has(eventName);
  },
  expireWindowListener(eventName: string) {
    return windowBridge.expire(eventName);
  },
  removeWindowListener(eventName: string) {
    windowBridge.remove(eventName);
  },
  windowListenerCount() {
    return windowBridge.count();
  },
};

// Event cloning helpers
//
// Bridged events are non-bubbling clones dispatched on a mixin host so Remix
// on(...) listeners see the host as currentTarget.
function createBridgedEvent(
  event: CustomEvent,
  descriptor: CustomEventsRuntime,
  options?: { replay?: boolean },
) {
  let origin = descriptor.getOriginTarget(event);
  let bridgedEvent = descriptor.createCustomEvent(
    event.type,
    {
      bubbles: false,
      cancelable: event.cancelable,
      composed: event.composed,
    },
    event.detail,
    {
      ...(origin ? { origin } : {}),
    },
  );
  descriptor.markBridgedEvent(bridgedEvent, {
    source: event,
    ...(options?.replay ? { replay: true } : {}),
  });
  return bridgedEvent;
}

function CustomEventsRenderScopeProvider(
  handle: Handle<
    {
      scope: CustomEventsRenderScope;
      children: RemixNode;
    },
    CustomEventsRenderScope
  >,
) {
  return () => {
    handle.context.set(handle.props.scope);
    return handle.props.children;
  };
}

function getSourceEventForListener(
  descriptor: CustomEventsRuntime,
  event: Event,
) {
  return descriptor.getBridgedEvent(event)?.source ?? event;
}

function shouldDeferScopedListener(
  descriptor: CustomEventsRuntime,
  scope: CustomEventsRenderScope | undefined,
  event: Event,
) {
  if (scope?.descriptor !== descriptor) return false;
  return descriptor.getTransaction(event)?.events.has(scope.eventName) ?? false;
}

function defineEventValue(
  event: Event,
  property: PropertyKey,
  value: unknown,
  options?: { enumerable?: boolean },
) {
  Object.defineProperty(event, property, {
    configurable: true,
    enumerable: options?.enumerable,
    value,
  });
}

// Remix mixins
//
// Descriptor-owned on() bridges events from the nearest host/window to the
// element that owns the mixin. It depends on host discovery for default
// targeting and on event-type subscriptions so newly discovered product events
// are bridged without remounting user elements.
const forwardEventsMixin = createMixin<
  Element,
  [descriptor: CustomEventsRuntime]
>((handle) => {
  let currentElement: Element | undefined;
  let currentState: CustomEventsRuntime | undefined;
  let controller: AbortController | undefined;
  let unsubscribeHost: (() => void) | undefined;
  let unsubscribeEventTypes: (() => void) | undefined;

  function syncHostSubscription() {
    unsubscribeHost?.();
    unsubscribeHost = undefined;

    if (currentState) {
      unsubscribeHost = currentState.subscribe(listen);
    }
  }

  function syncEventTypeSubscription() {
    unsubscribeEventTypes?.();
    unsubscribeEventTypes = undefined;
    if (currentState) {
      unsubscribeEventTypes = subscribeEventTypes(currentState, listen);
    }
  }

  function listen() {
    controller?.abort();
    controller = undefined;
    let target = currentState
      ? currentState.getDefaultTarget(currentElement)
      : undefined;

    if (!currentElement || !target || !currentState) return;

    let descriptor = currentState;
    controller = new AbortController();
    let signal = controller.signal;
    for (let type of descriptor.eventTypes) {
      target.addEventListener(
        getEventName(descriptor, type),
        (event) => {
          if (!(event instanceof CustomEvent)) return;
          if (!descriptor.ownsEvent(event)) return;
          let element = currentElement;
          if (!shouldBridgeEventToElement(event, descriptor, element)) return;
          element.dispatchEvent(createBridgedEvent(event, descriptor));
        },
        { signal },
      );
    }
  }

  function mount(element: Element) {
    currentElement = element;
    syncHostSubscription();
    syncEventTypeSubscription();
    listen();
    queueMicrotask(() => {
      if (currentElement === element) listen();
    });
  }

  handle.addEventListener("insert", (event) => mount(event.node));
  handle.addEventListener("reclaimed", (event) => mount(event.node));
  handle.addEventListener("remove", () => {
    unsubscribeHost?.();
    unsubscribeHost = undefined;
    unsubscribeEventTypes?.();
    unsubscribeEventTypes = undefined;
    controller?.abort();
    controller = undefined;
    currentElement = undefined;
  });

  return (descriptor) => {
    let needsListen = currentState !== descriptor;

    currentState = descriptor;

    if (needsListen) {
      syncHostSubscription();
      syncEventTypeSubscription();
      listen();
    }

    return handle.element;
  };
});

const customEventsOnMixin = createMixin<
  Element,
  [
    descriptor: CustomEventsRuntime,
    type: string,
    listener: (event: Event, signal: AbortSignal) => void | Promise<void>,
  ]
>((handle) => {
  return (descriptor, type, listener) => {
    addEventType(descriptor, type);
    let eventName = getEventName(descriptor, type);
    let renderScope = handle.context.get(CustomEventsRenderScopeProvider);
    if (renderScope?.descriptor === descriptor) {
      let pendingEvent = renderScope.transaction?.events.get(eventName);
      let pendingScope = renderScope;
      let pendingVersion = renderScope.version;
      if (pendingEvent) {
        handle.queueTask((node, signal) => {
          if (signal.aborted) return;
          if (pendingScope.version !== pendingVersion) return;

          let replayEvent = createBridgedEvent(
            pendingEvent as CustomEvent,
            descriptor,
            { replay: true },
          );
          node.dispatchEvent(replayEvent);
        });
      }
    }

    let wrappedListener = (
      event: CustomEventWithMetadata<any>,
      signal: AbortSignal,
    ) => {
      let bridgedEvent = descriptor.getBridgedEvent(event);
      let sourceEvent = getSourceEventForListener(descriptor, event);
      let scope = handle.context.get(CustomEventsRenderScopeProvider);

      if (
        !bridgedEvent?.replay &&
        shouldDeferScopedListener(descriptor, scope, sourceEvent)
      ) {
        return;
      }

      return listener(event, signal);
    };

    return (
      <handle.element
        mix={[
          forwardEventsMixin(descriptor),
          remixOn(
            eventName as AnyCustomEventsName,
            wrappedListener,
          ),
        ]}
      />
    );
  };
});

// Event components
//
// Descriptor event components render from the latest matching event, or from
// `null` before any matching event exists. They depend on host discovery to
// choose a default target and on initial event projection for SSR/first-render
// output. A hidden marker discovers the parent host element; rendering itself
// remains owned by Remix.
function createCustomEventsEventComponent<
  Events extends EventDetails,
  Type extends CustomEventsEventType<Events>,
>(
  type: Type,
  descriptor: CustomEventsRuntime,
): CustomEventsEventComponent<Events, Type> {
  addEventType(descriptor, type);
  let component = function CustomEventsEventComponent(
    handle: Handle<
      CustomEventsRenderProps<
        Events,
        Type,
        CustomEventsSeedEvent<Events> | undefined
      >
    >,
  ) {
    let eventName = getEventName(descriptor, type);
    let hasSeed = handle.props.seed !== undefined;
    let initialEvent = createInitialEvent(
      type,
      descriptor,
      handle.props.seed ?? descriptor.initial,
    );
    let hostElement: HTMLElement | undefined;
    let currentEvent: Event | null = initialEvent ?? null;
    let currentTarget: EventTarget | undefined;
    let controller: AbortController | undefined;
    let unsubscribeHost: (() => void) | undefined;
    let renderScope: CustomEventsRenderScope = {
      descriptor,
      eventName,
      transaction: null,
      version: 0,
    };

    function canRender(event: Event) {
      return event === initialEvent || descriptor.ownsEvent(event);
    }

    function syncDefaultTarget() {
      syncTarget(descriptor.getDefaultTarget(hostElement));
    }

    function ensureHostSubscription() {
      if (unsubscribeHost) return;
      unsubscribeHost = descriptor.subscribe(syncDefaultTarget);
    }

    function setHostFromMarker(marker: Element) {
      let nextHost = marker.parentElement;
      if (!nextHost || hostElement === nextHost) return;

      hostElement = nextHost;
      ensureHostSubscription();
      syncDefaultTarget();
      queueMicrotask(() => {
        if (hostElement === nextHost) {
          syncDefaultTarget();
        }
      });
    }

    function syncTarget(nextTarget: EventTarget | undefined) {
      if (currentTarget === nextTarget) return;

      controller?.abort();
      controller = undefined;
      currentTarget = nextTarget;
      if (!currentTarget) return;

      controller = new AbortController();
      let signal = controller.signal;
      currentTarget.addEventListener(
        eventName,
        (event) => {
          if (descriptor.isBridgedEvent(event)) return;
          if (!canRender(event)) return;
          currentEvent = event;
          renderScope.transaction = descriptor.getTransaction(event) ?? null;
          renderScope.version += 1;
          let version = renderScope.version;
          void handle.update().then(() => {
            if (renderScope.version === version) {
              renderScope.transaction = null;
            }
          });
        },
        { signal },
      );
    }

    handle.signal.addEventListener(
      "abort",
      () => {
        unsubscribeHost?.();
        unsubscribeHost = undefined;
        controller?.abort();
        controller = undefined;
        currentTarget = undefined;
      },
      { once: true },
    );

    return () => {
      ensureHostSubscription();
      syncDefaultTarget();

      let event =
        currentEvent?.type === eventName && canRender(currentEvent)
          ? (currentEvent as CustomEventsEvent<Events, Type>)
          : null;
      let node: RemixNode;
      if (hasSeed) {
        if (!event) {
          throw new TypeError(
            `CustomEvents seed for "${type}" must initialize that event component.`,
          );
        }
        node = handle.props.render(
          event,
          handle,
        );
      } else {
        let render = handle.props.render as unknown as (
          event: CustomEventsRenderEvent<Events, Type>,
          handle: Handle<
            CustomEventsRenderProps<
              Events,
              Type,
              CustomEventsSeedEvent<Events> | undefined
            >
          >,
        ) => RemixNode;
        node = render(
          event,
          handle,
        );
      }

      return (
        <CustomEventsRenderScopeProvider scope={renderScope}>
          <span hidden aria-hidden="true" mix={ref(setHostFromMarker)} />
          {node}
        </CustomEventsRenderScopeProvider>
      );
    };
  };
  return component as CustomEventsEventComponent<Events, Type>;
}

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

// Descriptor construction
//
// CustomEvents instances are proxy-backed descriptors. Root property access
// creates event factory members lazily, while `on.someEvent` creates render
// components lazily. `types` exposes stable event-name strings for low-level
// interop. The proxy keeps the public API type-shaped without requiring users to
// duplicate event names at runtime.
function createCustomEventsDescriptor<Events extends EventDetails>(
  options?: CustomEventsConstructorOptions,
): CustomEventsDescriptor<Events> {
  let state = new CustomEventsRuntime();

  function createAbortedEvent() {
    return new Event(CUSTOM_EVENTS_ABORTED);
  }

  function createBatchChangeEvent(
    events: Partial<Events>,
    init?: CustomEventsInit,
  ) {
    if (init?.signal?.aborted) {
      return createAbortedEvent();
    }

    let entries = resolveCustomEventsDispatchEntries(events);
    for (let [type] of entries) addEventType(state, type);
    addEventType(state, CHANGE_EVENT_NAME);
    windowBridge.enable(state);
    return createProductCustomEvent(
      state,
      CHANGE_EVENT_NAME,
      getEventInit(init),
      createCustomEventChangeDetail(entries),
      "change",
    );
  }

  function createGranularEvent(
    type: string,
    detail: unknown,
    init?: CustomEventsInit,
  ) {
    if (init?.signal?.aborted) return createAbortedEvent();

    addEventType(state, type);
    addEventType(state, CHANGE_EVENT_NAME);
    windowBridge.enable(state);
    return createProductCustomEvent(
      state,
      type,
      getEventInit(init),
      detail,
      "event",
    );
  }

  let eventMembers = new Map<
    string,
    CustomEventsEventFactories<Events>[CustomEventsEventType<Events>]
  >();
  let renderComponents = new Map<
    string,
    CustomEventsEventComponent<Events, CustomEventsEventType<Events>>
  >();

  function registerHost(target: EventTarget, signal?: AbortSignal) {
    if (signal?.aborted) return () => {};

    let cleanupHost: () => void;
    let cleanupDispatchTarget = state.registerDispatchTarget(target, {
      hosted: isElement(target),
    });
    if (isElement(target)) {
      state.addHost(target);
      state.seedInitialMemory(target);
      cleanupHost = () => {
        state.removeHost(target);
      };
    } else {
      state.addRegisteredHost(target);
      state.seedInitialMemory(target);
      cleanupHost = () => {
        state.removeRegisteredHost(target);
        state.removeMemory(target);
      };
    }

    let isActive = true;
    let cleanup = () => {
      if (!isActive) return;
      isActive = false;
      signal?.removeEventListener("abort", cleanup);
      cleanupDispatchTarget();
      cleanupHost();
    };
    signal?.addEventListener("abort", cleanup, { once: true });
    return cleanup;
  }

  function getEventMember(property: string) {
    addEventType(state, property);
    let member = eventMembers.get(property);
    if (member) return member;

    member =
      property === CHANGE_EVENT_NAME
        ? (function createChangeMember(
            events?: Partial<Events>,
            init?: CustomEventsInit,
          ) {
            return createBatchChangeEvent(
              events ?? {},
              init,
            );
          } as CustomEventsEventFactories<Events>[CustomEventsEventType<Events>])
        : (function createEventMember(
            detail?: unknown,
            init?: CustomEventsInit,
          ) {
            if (arguments.length === 0) {
              return createGranularEvent(property, null, init);
            }

            return createGranularEvent(property, detail, init);
          } as CustomEventsEventFactories<Events>[CustomEventsEventType<Events>]);
    eventMembers.set(property, member);
    return member;
  }

  function getRenderComponent(property: string) {
    addEventType(state, property);
    let component = renderComponents.get(property);
    if (component) return component;

    component = createCustomEventsEventComponent(
      property as CustomEventsEventType<Events>,
      state,
    );
    renderComponents.set(property, component);
    return component;
  }

  let types = new Proxy(
    {},
    {
      get(_, property) {
        if (typeof property !== "string") return undefined;
        addEventType(state, property);
        return getEventName(state, property);
      },
    },
  ) as CustomEventsTypes<Events>;

  let onFunction = ((
    type: CustomEventsEventType<Events>,
    listener: (event: Event, signal: AbortSignal) => void | Promise<void>,
  ) =>
    customEventsOnMixin(
      state,
      type,
      listener,
    )) as CustomEventsOnFunction<Events>;
  let on = new Proxy(onFunction, {
    get(target, property, receiver) {
      if (Reflect.has(target, property)) {
        return Reflect.get(target, property, receiver);
      }

      if (typeof property !== "string") {
        return Reflect.get(target, property, receiver);
      }

      return getRenderComponent(property);
    },
  }) as CustomEventsOnFunction<Events>;

  let descriptor = {
    map: undefined,
    on,
    types,
    seed(event: Event) {
      state.initial = event;
      state.seedInitialDescriptorMemory();
      state.seedInitialRegisteredHosts();
      state.notifySoon();
    },
    setHost(target: EventTarget, signal?: AbortSignal) {
      return registerHost(target, signal);
    },
    host() {
      return ref((target, signal) => registerHost(target, signal));
    },
    getHost(target: EventTarget) {
      return state.getReference(target) as CustomEventsHostReference<Events>;
    },
  };
  let proxy = new Proxy(descriptor, {
    get(target, property, receiver) {
      if (Reflect.has(target, property)) {
        return Reflect.get(target, property, receiver);
      }

      if (typeof property !== "string") {
        return Reflect.get(target, property, receiver);
      }

      return getEventMember(property);
    },
  }) as unknown as CustomEventsDescriptor<Events>;

  if (options?.host) {
    registerHost(options.host, options.signal);
  }

  return proxy;
}
