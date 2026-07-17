import {
  createMixin,
  on as remixOn,
  ref,
  type Handle,
  type MixinDescriptor,
  type RemixNode,
} from "remix/ui";

// Constants and metadata symbols
//
// These values define the private wire format for descriptor-owned DOM events.
// Public event names are generated from a stable prefix, a per-descriptor id,
// and the product event type. Symbols keep ownership and processing metadata
// off the public event shape while still allowing cloned/derived events to be
// recognized by this module.
const CUSTOM_EVENTS_EVENT_PREFIX = "rmx:custom-events";
const CUSTOM_EVENTS_ABORTED = `${CUSTOM_EVENTS_EVENT_PREFIX}:aborted`;
const CHANGE_EVENT_NAME = "change";
const CUSTOM_EVENT_OWNER = Symbol("customEvents.owner");
const CUSTOM_EVENT_ORIGIN = Symbol("customEvents.origin");
const CUSTOM_EVENT_FORWARDED = Symbol("customEvents.forwarded");
const CUSTOM_EVENT_KIND = Symbol("customEvents.kind");
const CUSTOM_EVENT_PROCESSED = Symbol("customEvents.processed");
let customEventsOwnerId = 0;

// Public and internal types
//
// The public descriptor surface is type-derived: product engineers declare an
// event-detail map once, and the proxy-backed descriptor exposes event factory
// methods, event components, event type strings, host helpers, and typed target
// maps.
// These types also reserve descriptor method names so event maps cannot collide
// with the public API.
type EventDetails = Record<string, unknown>;
type EventObject<Events extends EventDetails> = Partial<Events>;
type OwnedEvent = Event & {
  [CUSTOM_EVENT_OWNER]?: symbol;
  [CUSTOM_EVENT_ORIGIN]?: EventTarget;
  [CUSTOM_EVENT_FORWARDED]?: true;
  [CUSTOM_EVENT_KIND]?: CustomEventKind;
  [CUSTOM_EVENT_PROCESSED]?: true;
  originTarget?: EventTarget;
  source?: unknown;
};
type CustomEventKind =
  | "source-event"
  | "source-change"
  | "derived-change"
  | "derived-event";
type CustomEventWithMetadata<Detail, Source = unknown> =
  CustomEvent<Detail> & {
    originTarget?: EventTarget;
    source?: Source;
  };

type AnyCustomEventsName = `${typeof CUSTOM_EVENTS_EVENT_PREFIX}:${string}:${string}`;

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

type ChangeEventDetailFromMap<
  EventMap extends EventDetails,
> = {
  [K in keyof EventMap & string]: {
    type: K;
    detail: EventMap[K];
    details: Partial<EventMap>;
  };
}[keyof EventMap & string] | ({
  type: Array<keyof EventMap & string>;
  detail: Partial<EventMap>;
  details: Partial<EventMap>;
});

type LocalCustomEventTypes<EventMap extends EventDetails> = {
  [K in typeof CHANGE_EVENT_NAME]: CustomEventWithMetadata<
    ChangeEventDetailFromMap<EventMap>
  >;
} & {
  [K in keyof EventMap & string]: CustomEventWithMetadata<EventMap[K]>;
};

type EventMapReservedKeys<EventMap extends EventDetails> = Extract<
  keyof EventMap,
  | typeof CHANGE_EVENT_NAME
  | "listen"
  | "on"
  | "seed"
  | "setHost"
  | "getHost"
  | "types"
  | "initial"
  | "map"
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
 * These include the standard `EventInit` flags. Pass `signal` when async work
 * may be aborted. Pass `source` only when listeners need product metadata that
 * is not already represented by the DOM event target or the event detail.
 */
type CustomEventsInit<Source = unknown> = EventInit & {
  /** When already aborted, no product event listeners are notified. */
  signal?: AbortSignal;
  /** Optional product metadata available to listeners as `event.source`. */
  source?: Source;
};

type CustomEventsDispatchEvents<Events extends EventDetails> = {
  [K in keyof Events]?: Events[K];
};
type CustomEventsDispatchInput<Events extends EventDetails> =
  CustomEventsDispatchEvents<Events>;

type CustomEventsDescriptorState = {
  owner: symbol;
  ownerId: string;
  initial?: CustomEventsInitial<EventDetails>;
  eventTypes: Set<string>;
  typeListeners: Set<() => void>;
};

type CustomEventsInitial<Events extends EventDetails> = Event;

interface CustomEventsConstructor {
  new <Events extends EventDetails>(): CustomEventsDescriptor<Events>;
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
> = CustomEventMap<Events>[Type];

type CustomEventsRenderProps<
  Events extends EventDetails,
  Type extends CustomEventsEventType<Events>,
> = {
  /**
   * Event object used for the first render only. It does not dispatch.
   *
   * @example
   * <searchEvents.change initial={searchEvents.queryEmpty()} render={...} />
   */
  initial?: Event;
  /**
   * Explicit target to observe. Most DOM components can omit this.
   */
  target?: EventTarget;
  /**
   * Renders children for the matching event.
   *
   * @example
   * <gameEvents.turn render={({ detail }) => detail.nextPlayer} />
   */
  render: (event: CustomEventsEvent<Events, Type>) => RemixNode;
};

type CustomEventsOnElement<
  Events extends EventDetails,
  Type extends CustomEventsEventType<Events>,
> = (handle: Handle<CustomEventsRenderProps<Events, Type>>) => () => RemixNode;

type ExactEventDetail<Expected, Actual> =
  Actual extends Expected
    ? Expected extends object
      ? Actual extends object
        ? Exclude<keyof Actual, keyof Expected> extends never
          ? Actual
          : never
        : Actual
      : Actual
    : never;

type CustomEventsOnMember<
  Events extends EventDetails,
  Type extends CustomEventsEventType<Events>,
> = Type extends typeof CHANGE_EVENT_NAME
  ? CustomEventsChangeMember<Events>
  : Type extends keyof Events & string
  ? CustomEventsEventMember<Events, Type>
  : CustomEventsOnElement<Events, Type>;

type CustomEventsChangeMember<Events extends EventDetails> = {
  /**
   * Creates a batch change event for native `dispatchEvent(...)`.
   *
   * @example
   * target.dispatchEvent(events.change({ user, settings }));
   */
  (
    events: CustomEventsDispatchInput<Events>,
    init?: CustomEventsInit,
  ): Event;
  /**
   * Renders the latest change event in JSX.
   */
  (
    handle: Handle<
      CustomEventsRenderProps<
        Events,
        Extract<CustomEventsEventType<Events>, typeof CHANGE_EVENT_NAME>
      >
    >,
  ): () => RemixNode;
};

type CustomEventsEventMember<
  Events extends EventDetails,
  Type extends keyof Events & string & CustomEventsEventType<Events>,
> = (Events[Type] extends null
  ? {
      /**
       * Creates this null-detail product event for native `dispatchEvent(...)`.
       *
       * @example
       * form.dispatchEvent(todoEvents.actionSubmitted());
       */
      (init?: CustomEventsInit): Event;
    }
  : {}) & {
  /**
   * Creates this single product event for native `dispatchEvent(...)`.
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
  ): Event;
  /**
   * Renders the latest matching product event in JSX.
   *
   * @example
   * <checkoutEvents.submitted render={({ detail }) => detail.id} />
   */
  (handle: Handle<CustomEventsRenderProps<Events, Type>>): () => RemixNode;
};

type CustomEventsOnDescriptor<Events extends EventDetails> = {
  /**
   * Creates this event for `dispatchEvent(...)`, or renders from it in JSX.
   *
   * @example
   * <checkoutEvents.submitted render={({ detail }) => detail.id} />
   *
   * @example
   * button.dispatchEvent(checkoutEvents.submitted({ id: "order-1" }));
   */
  [Type in CustomEventsEventType<Events>]: CustomEventsOnMember<
    Events,
    Type
  >;
};

/**
 * DOM effect mixin for this event set.
 */
type CustomEventsListenFunction<
  Events extends EventDetails,
> = {
  /**
   * Enables Remix `on(events.types.someEvent, ...)` on this element.
   *
   * @example
   * mix={[
   *   checkoutEvents.listen(),
   *   on(checkoutEvents.types.submitted, handleSubmitted),
   *   on(checkoutEvents.types.paid, handlePaid),
   * ]}
   */
  <HostElement extends Element>(
    options?: CustomEventsListenOptions,
  ): MixinDescriptor<HostElement, any>;
};

type CustomEventsListenOptions = {
  /**
   * Explicit target to observe. Most DOM components can omit this.
   */
  target?: EventTarget;
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
   * Listens to one event from this event set on the element that owns the mixin.
   *
   * This is the descriptor-owned shortcut for:
   *
   * @example
   * mix={[
   *   checkoutEvents.listen(),
   *   on(checkoutEvents.types.submitted, handleSubmitted),
   * ]}
   *
   * Prefer it when you do not need the generated event name directly.
   *
   * @example
   * <button mix={checkoutEvents.on("submitted", ({ detail, currentTarget }) => {
   *   currentTarget.disabled = detail.pending;
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
    options?: CustomEventsListenOptions,
  ): MixinDescriptor<HostElement, any>;
};

type CustomEventsHostReference<Events extends EventDetails> = {
  readonly latest:
    | {
        readonly event: ChangeEventDetailFromMap<Events>;
        readonly events: Partial<Events>;
      }
    | undefined;
};

type HostableCustomEventsDescriptor<
  Events extends EventDetails,
> = {
  /**
   * Makes an element the local event boundary for this event set.
   *
   * Use it on a widget root to share events inside the widget, or on each
   * repeated row/form to keep instances independent. Events stay inside the
   * host unless created with `{ composed: true }`.
   *
   * @example
   * <section mix={gameEvents.host()}>
   *   <Board />
   *   <ResetButton />
   *   <gameEvents.turn render={({ detail }) => detail.nextPlayer} />
   * </section>
   *
   * @example
   * <form mix={todoEvents.host()}>
   *   <button mix={[
   *     todoEvents.listen(),
   *     on(todoEvents.types.change, updatePendingUi),
   *   ]} />
   * </form>
   *
   * @example
   * form.dispatchEvent(
   *   todoEvents.actionSubmitted(null, { composed: true }),
   * );
   */
  host(): MixinDescriptor<Element, any>;

  /**
   * Enables this event set on an existing `EventTarget`.
   *
   * Use this for plain `EventTarget` or `TypedEventTarget` owners. Pass a
   * signal or call the returned cleanup when the target is no longer used.
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
   * Reads the latest event memory for the nearest host.
   *
   * `latest.event` is what just happened. `latest.events` is the accumulated
   * detail map.
   *
   * @example
   * on("focusout", ({ currentTarget }) => {
   *   if (
   *     todoEvents.getHost(currentTarget).latest?.event.type ===
   *     "actionSubmitted"
   *   ) {
   *     return;
   *   }
   *   currentTarget.reset();
   * })
   */
  getHost(target: EventTarget): CustomEventsHostReference<Events>;

  /**
   * Event map for `TypedEventTarget`.
   *
   * @example
   * type GameEventMap = (typeof gameEvents)["map"];
   */
  readonly map: CustomEventMap<Events>;
};

type CustomEventsDescriptor<
  Events extends EventDetails,
> = {
  /**
   * Enables `on(events.types.someEvent, ...)` on a DOM element.
   */
  listen: CustomEventsListenFunction<Events>;

  /**
   * Listens to a product event from this descriptor.
   *
   * This composes `listen()` and Remix `on(...)` for the common case where the
   * product engineer only cares about the local event name.
   *
   * @example
   * <button mix={todoEvents.on("actionSubmitted", updatePendingUi)} />
   */
  on: CustomEventsOnFunction<Events>;

  /**
   * Event types for Remix `on(...)`.
   *
   * @example
   * <button mix={[
   *   checkoutEvents.listen(),
   *   on(checkoutEvents.types.submitted, handleSubmitted),
   * ]} />
   */
  readonly types: CustomEventsTypes<Events>;

  /**
   * Sets the initial event for render components and latest-event memory.
   *
   * This does not dispatch. Dispatch explicitly when DOM effects should run.
   *
   * @example
   * searchEvents.seed(searchEvents.queryEmpty());
   *
   * @example
   * appContextEvents.seed(
   *   appContextEvents.change({ user: null, settings }),
   * );
   */
  seed(event: CustomEventsInitial<Events>): void;

  /**
   * Local event map for class targets and product event details.
   */
  readonly map: CustomEventMap<Events>;
} & CustomEventsOnDescriptor<Events> &
  HostableCustomEventsDescriptor<Events>;

// Host registry and latest event memory
//
// DOM hosts define local event boundaries and memory scopes. Non-DOM targets
// registered with setHost() are tracked separately so event components and
// listen() can discover the sole active target when there is no DOM parent.
// Latest memory stores both the last change detail and the accumulated event
// detail map in one record.
type CustomEventsMemory = {
  event?: ChangeEventDetailFromMap<EventDetails>;
  events: EventObject<EventDetails>;
};

class HostRegistry {
  #hosts = new WeakMap<Element, Map<symbol, number>>();
  #registeredHosts = new Map<symbol, Set<WeakRef<EventTarget>>>();
  #memory = new WeakMap<EventTarget, Map<symbol, CustomEventsMemory>>();
  #descriptorMemory = new Map<symbol, CustomEventsMemory>();
  #listeners = new Map<symbol, Set<() => void>>();

  addRegisteredHost(target: EventTarget, owner: symbol) {
    let hosts = this.#registeredHosts.get(owner);
    if (!hosts) {
      hosts = new Set();
      this.#registeredHosts.set(owner, hosts);
    }
    hosts.add(new WeakRef(target));
    this.notify(owner);
    this.notifySoon(owner);
  }

  removeRegisteredHost(target: EventTarget, owner: symbol) {
    let hosts = this.#registeredHosts.get(owner);
    if (!hosts) return;

    for (let host of hosts) {
      let registeredTarget = host.deref();
      if (!registeredTarget || registeredTarget === target) {
        hosts.delete(host);
        if (registeredTarget === target) break;
      }
    }
    if (!hosts.size) {
      this.#registeredHosts.delete(owner);
    }
    this.notify(owner);
    this.notifySoon(owner);
  }

  forEachRegisteredHost(
    owner: symbol,
    callback: (target: EventTarget) => void,
  ) {
    let hosts = this.#registeredHosts.get(owner);
    if (!hosts) return;

    for (let host of hosts) {
      let target = host.deref();
      if (!target) {
        hosts.delete(host);
        continue;
      }
      callback(target);
    }

    if (!hosts.size) {
      this.#registeredHosts.delete(owner);
    }
  }

  getSoleRegisteredHost(owner: symbol) {
    let hosts = this.#registeredHosts.get(owner);
    if (!hosts) return undefined;

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

    if (!hosts.size) {
      this.#registeredHosts.delete(owner);
    }
    return soleTarget;
  }

  addHost(element: Element, owner: symbol) {
    let hosts = this.#hosts.get(element);
    if (!hosts) {
      hosts = new Map();
      this.#hosts.set(element, hosts);
    }
    hosts.set(owner, (hosts.get(owner) ?? 0) + 1);
    this.addRegisteredHost(element, owner);
  }

  removeHost(element: Element, owner: symbol) {
    let hosts = this.#hosts.get(element);
    if (!hosts) return;

    let count = hosts.get(owner) ?? 0;
    if (count <= 1) {
      hosts.delete(owner);
      if (!hosts.size) {
        this.#hosts.delete(element);
      }
      this.removeMemory(element, owner);
      this.removeRegisteredHost(element, owner);
    } else {
      hosts.set(owner, count - 1);
    }
  }

  removeMemory(target: EventTarget, owner: symbol) {
    let memoryByOwner = this.#memory.get(target);
    if (memoryByOwner) {
      memoryByOwner.delete(owner);
      if (!memoryByOwner.size) {
        this.#memory.delete(target);
      }
    }
  }

  findHost(element: Element | undefined, owner: symbol) {
    for (
      let current = element;
      current;
      current = current.parentElement ?? undefined
    ) {
      if (this.#hosts.get(current)?.has(owner)) return current;
    }
    return undefined;
  }

  getDefaultTarget(element: Element | undefined, owner: symbol) {
    return (
      this.findHost(element, owner) ??
      this.getSoleRegisteredHost(owner) ??
      (typeof window === "undefined" ? undefined : window)
    );
  }

  getMemoryTarget(target: EventTarget | undefined, owner: symbol) {
    if (isElement(target)) {
      return this.findHost(target, owner);
    }
    return target;
  }

  getMemory(target: EventTarget | undefined, owner: symbol) {
    let memoryTarget = this.getMemoryTarget(target, owner);
    if (!memoryTarget) return this.#descriptorMemory.get(owner);

    return this.#memory.get(memoryTarget)?.get(owner);
  }

  getReference(target: EventTarget, owner: symbol) {
    let memory = this.getMemory(target, owner);
    return {
      latest: memory?.event
        ? { event: memory.event, events: memory.events }
        : undefined,
    };
  }

  setMemory(
    target: EventTarget | undefined,
    owner: symbol,
    memory: CustomEventsMemory,
  ) {
    let memoryTarget = this.getMemoryTarget(target, owner);
    if (!memoryTarget) {
      this.#descriptorMemory.set(owner, memory);
      return;
    }

    let memoryByOwner = this.#memory.get(memoryTarget);
    if (!memoryByOwner) {
      memoryByOwner = new Map();
      this.#memory.set(memoryTarget, memoryByOwner);
    }
    memoryByOwner.set(owner, memory);
  }

  record(
    target: EventTarget | undefined,
    owner: symbol | undefined,
    entries: Array<[string, unknown]>,
  ) {
    let patchDetail = createCustomEventChangeDetail(entries);
    if (!owner) return patchDetail;

    let current = this.getMemory(target, owner)?.events ?? {};
    let details: EventObject<EventDetails> = { ...current };
    for (let [type, detail] of entries) {
      details[type] = detail;
    }
    let changeDetail = createCustomEventChangeDetail(entries, details);
    this.setMemory(target, owner, {
      event: changeDetail,
      events: details,
    });
    return changeDetail;
  }

  notify(owner: symbol) {
    for (let listener of this.#listeners.get(owner) ?? []) {
      listener();
    }
  }

  notifySoon(owner: symbol) {
    queueMicrotask(() => this.notify(owner));
  }

  subscribe(owner: symbol, listener: () => void) {
    let listeners = this.#listeners.get(owner);
    if (!listeners) {
      listeners = new Set();
      this.#listeners.set(owner, listeners);
    }
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
      if (!listeners.size) {
        this.#listeners.delete(owner);
      }
    };
  }

  seedInitialMemory(
    target: EventTarget | undefined,
    descriptor: CustomEventsDescriptorState,
  ) {
    let entries = getInitialEventEntries(descriptor);
    if (!entries?.length) return;
    this.record(target, descriptor.owner, entries);
  }

  seedInitialDescriptorMemory(descriptor: CustomEventsDescriptorState) {
    this.seedInitialMemory(undefined, descriptor);
  }

  seedInitialRegisteredHosts(descriptor: CustomEventsDescriptorState) {
    this.forEachRegisteredHost(descriptor.owner, (target) => {
      this.seedInitialMemory(target, descriptor);
    });
  }
}

const hostRegistry = new HostRegistry();

// Window event processing
//
// Source events often bubble to window so sibling branches can react without a
// shared EventTarget. Window listeners must not keep descriptor instances alive:
// each listener owns only a WeakRef to descriptor state and unregisters itself
// when that state has been collected or finalized.
type CustomEventsWindowListener = {
  controller: AbortController;
  descriptor: WeakRef<CustomEventsDescriptorState>;
};

class WindowBridge {
  #listeners = new Map<string, CustomEventsWindowListener>();
  #finalizer =
    typeof FinalizationRegistry === "undefined"
      ? undefined
      : new FinalizationRegistry<string>((eventName) => {
          this.remove(eventName);
        });

  enable(descriptor: CustomEventsDescriptorState) {
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
    } as WeakRef<CustomEventsDescriptorState>;
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

function hasDispatchSource(options: { source?: unknown }) {
  return Object.hasOwn(options, "source");
}

function isCustomEvent(event: Event) {
  return event instanceof CustomEvent;
}

function ownsEvent(event: Event, owner: symbol) {
  return (
    isCustomEvent(event) &&
    (event as OwnedEvent)[CUSTOM_EVENT_OWNER] === owner
  );
}

function isForwardedCustomEvent(event: Event) {
  return (event as OwnedEvent)[CUSTOM_EVENT_FORWARDED] === true;
}

function isElement(value: unknown): value is Element {
  return typeof Element !== "undefined" && value instanceof Element;
}

function eventPathIncludes(event: Event, target: EventTarget) {
  return event.composedPath().includes(target);
}

function shouldBridgeEventToElement(
  event: Event,
  element: Element | undefined,
): element is Element {
  if (!element) return false;
  if (isForwardedCustomEvent(event)) return false;
  if (eventPathIncludes(event, element)) return false;
  return true;
}

// Event type strings and known event types
//
// Descriptor event type strings are globally unique, so descriptor-owned events
// can be forwarded or processed without colliding with browser events or
// another CustomEvents instance. Known event types are discovered lazily through
// proxy property access and event factory calls.
function getEventName(descriptor: CustomEventsDescriptorState, type: string) {
  return `${CUSTOM_EVENTS_EVENT_PREFIX}:${descriptor.ownerId}:${type}`;
}

function getEventType(descriptor: CustomEventsDescriptorState, eventName: string) {
  let prefix = `${CUSTOM_EVENTS_EVENT_PREFIX}:${descriptor.ownerId}:`;
  if (!eventName.startsWith(prefix)) return undefined;
  return eventName.slice(prefix.length);
}

function addEventType(descriptor: CustomEventsDescriptorState, type: string) {
  if (descriptor.eventTypes.has(type)) return;
  descriptor.eventTypes.add(type);
  for (let listener of descriptor.typeListeners) listener();
}

function subscribeEventTypes(
  descriptor: CustomEventsDescriptorState,
  listener: () => void,
) {
  descriptor.typeListeners.add(listener);
  return () => descriptor.typeListeners.delete(listener);
}

// Change detail helpers
//
// Every source event derives a change event. A source change event behaves as a
// batch: it records all provided details and expands into individual product
// events. The change detail always contains the current patch in detail and the
// accumulated memory in details.
function createCustomEventChangeDetail(
  entries: Array<[string, unknown]>,
  details = getEntriesObject(entries),
) {

  if (entries.length === 1) {
    let [[type, detail]] = entries;
    return {
      type,
      detail,
      details,
    };
  }

  let type = entries.map(([type]) => type);
  return {
    type,
    detail: details,
    details,
  };
}

function getEntriesObject(entries: Array<[string, unknown]>) {
  let object: EventObject<EventDetails> = {};
  for (let [type, detail] of entries) {
    object[type] = detail;
  }
  return object;
}

function resolveCustomEventsDispatchEntries(
  events: CustomEventsDispatchInput<EventDetails>,
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

// Event construction and metadata
//
// Event factory methods return normal CustomEvent instances for native
// dispatchEvent(). Metadata is attached with symbols so product code sees a
// normal event object plus optional public source/originTarget properties.
type CustomEventMetadata = {
  hasSource: boolean;
  kind: CustomEventKind;
  owner?: symbol;
  origin?: EventTarget;
  source?: unknown;
};

function createOwnedCustomEvent(
  type: string,
  init: EventInit,
  detail: unknown,
  metadata: CustomEventMetadata,
) {
  let event = new CustomEvent(type, { ...init, detail });
  attachCustomEventMetadata(event, metadata);
  return event;
}

function attachCustomEventMetadata(
  event: CustomEvent,
  metadata: CustomEventMetadata,
) {
  if (metadata.hasSource) {
    defineEventValue(event, "source", metadata.source, { enumerable: true });
  }

  if (metadata.owner) {
    defineEventValue(event, CUSTOM_EVENT_OWNER, metadata.owner);
  }

  defineEventValue(event, CUSTOM_EVENT_KIND, metadata.kind);

  if (metadata.origin) {
    defineEventValue(event, CUSTOM_EVENT_ORIGIN, metadata.origin);
    defineEventValue(event, "originTarget", metadata.origin, {
      enumerable: true,
    });
  }
}

function dispatchSingleCustomEvent(
  target: EventTarget,
  type: string,
  init: EventInit,
  detail: unknown,
  metadata: CustomEventMetadata,
) {
  return target.dispatchEvent(
    createOwnedCustomEvent(type, init, detail, metadata),
  );
}

// Initial event projection
//
// Initial values are descriptor-created Event objects. A single product event
// can initialize a change renderer, and a change initial event can initialize
// the matching product-event renderer. Initial projection never dispatches.
function createInitialEvent(
  type: string,
  descriptor: CustomEventsDescriptorState,
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
      detail: createCustomEventChangeDetail([
        [initialType, initial.detail],
      ]),
    });
  }

  if (initialType !== CHANGE_EVENT_NAME) return undefined;

  let detail = initial.detail as ChangeEventDetailFromMap<EventDetails>;
  if (Array.isArray(detail.type)) {
    if (!Object.hasOwn(detail.details, type)) return undefined;
    return new CustomEvent(eventName, {
      detail: detail.details[type],
    });
  }

  if (detail.type !== type) return undefined;

  return new CustomEvent(eventName, {
    detail: detail.detail,
  });
}

function getInitialEventEntriesFromEvent(
  descriptor: CustomEventsDescriptorState,
  initial: CustomEvent,
) {
  let type = getEventType(descriptor, initial.type);
  if (!type) return undefined;
  if (type !== CHANGE_EVENT_NAME) {
    return [[type, initial.detail]] satisfies Array<[string, unknown]>;
  }

  let detail = initial.detail as ChangeEventDetailFromMap<EventDetails>;
  if (Array.isArray(detail.type)) {
    return Object.entries(
      detail.detail as EventObject<EventDetails>,
    );
  }
  return [[detail.type, detail.detail]] satisfies Array<[string, unknown]>;
}

function getInitialEventEntries(descriptor: CustomEventsDescriptorState) {
  let initial = descriptor.initial;
  if (initial instanceof CustomEvent) {
    return getInitialEventEntriesFromEvent(descriptor, initial);
  }
  return undefined;
}

// Event processing
//
// Source events are user-dispatched events. Processing a source event records
// memory and dispatches the derived event(s) back on the original event target.
// Derived events are marked by kind so they never recursively derive more
// events.
type CustomEventsDispatchTargetRegistration = {
  count: number;
  cleanup: () => void;
};

function getCustomEventKind(event: Event) {
  return (event as OwnedEvent)[CUSTOM_EVENT_KIND];
}

function hasProcessedCustomEvent(event: Event) {
  return (event as OwnedEvent)[CUSTOM_EVENT_PROCESSED] === true;
}

function markCustomEventProcessed(event: Event) {
  defineEventValue(event, CUSTOM_EVENT_PROCESSED, true);
}

function getCustomEventMetadata(event: Event): CustomEventMetadata {
  let ownedEvent = event as OwnedEvent;
  return {
    hasSource: Object.hasOwn(event, "source"),
    kind: ownedEvent[CUSTOM_EVENT_KIND] ?? "source-event",
    owner: ownedEvent[CUSTOM_EVENT_OWNER],
    origin: ownedEvent[CUSTOM_EVENT_ORIGIN],
    source: ownedEvent.source,
  };
}

function dispatchOwnedCustomEvent(
  target: EventTarget,
  descriptor: CustomEventsDescriptorState,
  type: string,
  init: EventInit,
  detail: unknown,
  metadata: Omit<CustomEventMetadata, "owner">,
) {
  return dispatchSingleCustomEvent(
    target,
    getEventName(descriptor, type),
    init,
    detail,
    {
      ...metadata,
      owner: descriptor.owner,
    },
  );
}

function dispatchLocalTypedEvent(
  target: EventTarget,
  type: string,
  init: EventInit,
  detail: unknown,
  metadata: CustomEventMetadata,
) {
  if (isElement(target)) return true;
  if (typeof window !== "undefined" && target === window) return true;
  return dispatchSingleCustomEvent(target, type, init, detail, metadata);
}

function dispatchDerivedChangeEvent(
  target: EventTarget,
  descriptor: CustomEventsDescriptorState,
  entries: Array<[string, unknown]>,
  init: EventInit,
  metadata: CustomEventMetadata,
) {
  let changeDetail = hostRegistry.record(
    target,
    descriptor.owner,
    entries,
  );
  let result = dispatchOwnedCustomEvent(
    target,
    descriptor,
    CHANGE_EVENT_NAME,
    init,
    changeDetail,
    {
      ...metadata,
      kind: "derived-change",
      origin: target,
    },
  );
  return dispatchLocalTypedEvent(
    target,
    CHANGE_EVENT_NAME,
    init,
    changeDetail,
    {
      ...metadata,
      kind: "derived-change",
      owner: descriptor.owner,
      origin: target,
    },
  ) && result;
}

function dispatchExpandedGranularEvents(
  target: EventTarget,
  descriptor: CustomEventsDescriptorState,
  entries: Array<[string, unknown]>,
  init: EventInit,
  metadata: CustomEventMetadata,
) {
  let result = true;
  for (let [type, detail] of entries) {
    result =
      dispatchOwnedCustomEvent(target, descriptor, type, init, detail, {
        ...metadata,
        kind: "derived-event",
        origin: target,
      }) && result;
    result =
      dispatchLocalTypedEvent(target, type, init, detail, {
        ...metadata,
        kind: "derived-event",
        owner: descriptor.owner,
        origin: target,
      }) && result;
  }
  return result;
}

function processCustomEventsEvent(
  event: CustomEvent,
  descriptor: CustomEventsDescriptorState,
) {
  if (!ownsEvent(event, descriptor.owner)) return true;
  if (hasProcessedCustomEvent(event)) return true;

  let kind = getCustomEventKind(event);
  if (kind !== "source-event" && kind !== "source-change") return true;

  let origin = event.target instanceof EventTarget ? event.target : undefined;
  if (!origin) return true;

  markCustomEventProcessed(event);
  let metadata = getCustomEventMetadata(event);
  let init = getEventInit(event);

  if (kind === "source-event") {
    let type = getEventType(descriptor, event.type);
    if (!type || type === CHANGE_EVENT_NAME) return true;
    let result = dispatchDerivedChangeEvent(
      origin,
      descriptor,
      [[type, event.detail]],
      init,
      metadata,
    );
    if (!result) event.preventDefault();
    return result;
  }

  let detail = event.detail as ChangeEventDetailFromMap<EventDetails>;
  let entries = Array.isArray(detail.type)
    ? Object.entries(detail.detail as EventObject<EventDetails>)
    : ([[detail.type, detail.detail]] satisfies Array<[string, unknown]>);
  if (!entries.length) return true;

  let changeDetail = hostRegistry.record(origin, descriptor.owner, entries);
  let localChangeResult = dispatchLocalTypedEvent(
    origin,
    CHANGE_EVENT_NAME,
    init,
    changeDetail,
    {
      ...metadata,
      kind: "derived-change",
      owner: descriptor.owner,
      origin,
    },
  );
  let result = dispatchExpandedGranularEvents(
    origin,
    descriptor,
    entries,
    init,
    metadata,
  );
  result = localChangeResult && result;
  if (!result) event.preventDefault();
  return result;
}

let customEventsDispatchTargetRegistrations = new WeakMap<
  EventTarget,
  Map<symbol, CustomEventsDispatchTargetRegistration>
>();

// Dispatch-target registration
//
// A host target, non-DOM target, or window can process source events for one
// descriptor. Registrations are reference-counted per target/descriptor pair;
// individual event listeners are refreshed when the descriptor learns new event
// types.
function registerCustomEventsDispatchTarget(
  target: EventTarget,
  descriptor: CustomEventsDescriptorState,
  options?: { hosted?: boolean },
) {
  let registrations = customEventsDispatchTargetRegistrations.get(target);
  if (!registrations) {
    registrations = new Map();
    customEventsDispatchTargetRegistrations.set(target, registrations);
  }

  let registration = registrations.get(descriptor.owner);
  if (registration) {
    registration.count += 1;
    let activeRegistration = registration;
    return () => {
      activeRegistration.count -= 1;
      if (activeRegistration.count > 0) return;
      activeRegistration.cleanup();
      registrations.delete(descriptor.owner);
    };
  }

  let controller: AbortController | undefined;
  let unsubscribeEventTypes: (() => void) | undefined;

  function listen() {
    controller?.abort();
    controller = new AbortController();
    let signal = controller.signal;
    for (let type of descriptor.eventTypes) {
      target.addEventListener(
        getEventName(descriptor, type),
        (event) => {
          if (!(event instanceof CustomEvent)) return;
          if (options?.hosted && event.composed !== true) {
            event.stopPropagation();
          }
          processCustomEventsEvent(event, descriptor);
        },
        { signal },
      );
    }
  }

  unsubscribeEventTypes = subscribeEventTypes(descriptor, listen);
  listen();

  registration = {
    count: 1,
    cleanup() {
      unsubscribeEventTypes?.();
      controller?.abort();
    },
  };
  registrations.set(descriptor.owner, registration);

  return () => {
    registration.count -= 1;
    if (registration.count > 0) return;
    registration.cleanup();
    registrations.delete(descriptor.owner);
  };
}

function enableWindowTarget(descriptor: CustomEventsDescriptorState) {
  windowBridge.enable(descriptor);
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

// Type guards and cloning helpers
//
// These helpers keep Remix handle detection, CustomEvents init detection, and
// bridged event creation local to the implementation. Bridged events are
// non-bubbling clones dispatched on a mixin host so Remix on(...) listeners see
// the host as currentTarget.
function isRemixHandle(value: unknown): value is Handle<any> {
  return (
    value !== null &&
    typeof value === "object" &&
    "props" in value &&
    "signal" in value &&
    typeof (value as Handle).update === "function" &&
    typeof (value as Handle).queueTask === "function"
  );
}

function isCustomEventsInit(value: unknown): value is CustomEventsInit {
  return (
    value !== null &&
    typeof value === "object" &&
    ("signal" in value ||
      "source" in value ||
      "bubbles" in value ||
      "cancelable" in value ||
      "composed" in value)
  );
}

function createBridgedEvent(event: Event) {
  let clone = new CustomEvent(event.type, {
    bubbles: false,
    cancelable: event.cancelable,
    composed: event.composed,
    detail: event instanceof CustomEvent ? event.detail : undefined,
  });
  let ownedEvent = event as OwnedEvent;
  attachCustomEventMetadata(clone, {
    hasSource: Object.hasOwn(event, "source"),
    kind: ownedEvent[CUSTOM_EVENT_KIND] ?? "source-event",
    owner: ownedEvent[CUSTOM_EVENT_OWNER],
    origin: ownedEvent[CUSTOM_EVENT_ORIGIN],
    source: ownedEvent.source,
  });
  defineEventValue(clone, CUSTOM_EVENT_FORWARDED, true);
  return clone;
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
// listen() bridges descriptor events from the nearest host/window to the element
// that owns the mixin. It depends on host discovery for default targeting and
// on event-type subscriptions so newly discovered product events are bridged
// without remounting user elements.
const forwardEventsMixin = createMixin<
  Element,
  [
    target: EventTarget | undefined,
    descriptor: CustomEventsDescriptorState,
  ]
>((handle) => {
  let currentElement: Element | undefined;
  let currentExplicitTarget: EventTarget | undefined;
  let currentState: CustomEventsDescriptorState | undefined;
  let controller: AbortController | undefined;
  let unsubscribeHost: (() => void) | undefined;
  let unsubscribeEventTypes: (() => void) | undefined;

  function syncHostSubscription() {
    unsubscribeHost?.();
    unsubscribeHost = undefined;

    if (!currentExplicitTarget && currentState) {
      unsubscribeHost = hostRegistry.subscribe(currentState.owner, listen);
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
    let target =
      currentExplicitTarget ??
      (currentState
        ? hostRegistry.getDefaultTarget(currentElement, currentState.owner)
        : undefined);

    if (!currentElement || !target || !currentState) return;

    let descriptor = currentState;
    controller = new AbortController();
    let signal = controller.signal;
    for (let type of descriptor.eventTypes) {
      target.addEventListener(
        getEventName(descriptor, type),
        (event) => {
          if (!ownsEvent(event, descriptor.owner)) return;
          let element = currentElement;
          if (!shouldBridgeEventToElement(event, element)) return;
          element.dispatchEvent(createBridgedEvent(event));
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

  return (target, descriptor) => {
    let needsListen =
      currentExplicitTarget !== target ||
      currentState !== descriptor;

    currentExplicitTarget = target;
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
    target: EventTarget | undefined,
    descriptor: CustomEventsDescriptorState,
    type: string,
    listener: (event: Event, signal: AbortSignal) => void | Promise<void>,
  ]
>((handle) => {
  return (target, descriptor, type, listener) => {
    addEventType(descriptor, type);
    return (
      <handle.element
        mix={[
          forwardEventsMixin(target, descriptor),
          remixOn(
            getEventName(descriptor, type) as AnyCustomEventsName,
            listener as (event: CustomEventWithMetadata<any>, signal: AbortSignal) => void,
          ),
        ]}
      />
    );
  };
});

// Event components
//
// Descriptor event components render from the latest matching event. They depend
// on host discovery to choose a default target and on initial event projection
// for SSR/first-render output. A hidden marker discovers the parent host element;
// rendering itself remains owned by Remix.
function createCustomEventsOnElement<
  Events extends EventDetails,
  Type extends CustomEventsEventType<Events>,
>(
  type: Type,
  descriptor: CustomEventsDescriptorState,
): CustomEventsOnElement<Events, Type> {
  addEventType(descriptor, type);
  return function CustomEventsOnElement(
    handle: Handle<{
      initial?: Event;
      target?: EventTarget;
      render: (event: CustomEventsEvent<Events, Type>) => RemixNode;
    }>,
  ) {
    let eventName = getEventName(descriptor, type);
    let initialEvent = createInitialEvent(
      type,
      descriptor,
      handle.props.initial ?? descriptor.initial,
    );
    let hostElement: HTMLElement | undefined;
    let currentEvent: Event | undefined = initialEvent;
    let currentTarget: EventTarget | undefined;
    let controller: AbortController | undefined;
    let unsubscribeHost: (() => void) | undefined;

    function canRender(event: Event) {
      return event === initialEvent || ownsEvent(event, descriptor.owner);
    }

    function syncDefaultTarget() {
      syncTarget(
        handle.props.target ??
          hostRegistry.getDefaultTarget(hostElement, descriptor.owner),
      );
    }

    function syncHostSubscription() {
      unsubscribeHost?.();
      unsubscribeHost = undefined;

      if (!handle.props.target) {
        unsubscribeHost = hostRegistry.subscribe(
          descriptor.owner,
          syncDefaultTarget,
        );
      }
    }

    function setHostFromMarker(marker: Element) {
      let nextHost = marker.parentElement;
      if (!nextHost || hostElement === nextHost) return;

      hostElement = nextHost;
      syncHostSubscription();
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
          if (isForwardedCustomEvent(event)) return;
          if (!canRender(event)) return;
          currentEvent = event;
          void handle.update();
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
      syncHostSubscription();
      syncDefaultTarget();

      let node =
        currentEvent?.type === eventName && canRender(currentEvent)
          ? handle.props.render(
              currentEvent as CustomEventsEvent<Events, Type>,
            )
          : undefined;

      return (
        <>
          <span hidden aria-hidden="true" mix={ref(setHostFromMarker)} />
          {node}
        </>
      );
    };
  };
}

/**
 * Base class for a component or object event set.
 *
 * Use event methods with native `dispatchEvent(...)`, `listen()` with Remix
 * `on(...)` for DOM effects, and `<events.someEvent render={...} />` for local
 * rendering.
 *
 * @example
 * class GameEvents extends CustomEvents<{
 *   turn: { nextPlayer: "X" | "O" };
 * }> {}
 *
 * let gameEvents = new GameEvents();
 *
 * <section mix={gameEvents.host()}>
 *   <gameEvents.turn render={({ detail }) => detail.nextPlayer} />
 * </section>
 */
class CustomEventsBase<
  Events extends EventDetails,
> {
  declare readonly map: CustomEventMap<Events>;

  constructor() {
    let descriptor = createCustomEventsDescriptor<Events>();
    return descriptor as unknown as this;
  }
}

export type CustomEvents<Events extends EventDetails> =
  CustomEventsDescriptor<Events>;

export const CustomEvents: CustomEventsConstructor =
  CustomEventsBase as unknown as CustomEventsConstructor;

// Descriptor construction
//
// CustomEvents instances are proxy-backed descriptors. Property access creates
// event factory/render members lazily, while types exposes stable event-name
// strings for Remix on(...). The proxy keeps the public API type-shaped without
// requiring users to duplicate event names at runtime.
function createCustomEventsDescriptor<
  Events extends EventDetails,
>(): CustomEventsDescriptor<Events> {
  let state: CustomEventsDescriptorState = {
    owner: Symbol("customEvents.descriptor"),
    ownerId: createCustomEventsOwnerId(),
    eventTypes: new Set(),
    typeListeners: new Set(),
  };

  function createAbortedEvent() {
    return new Event(CUSTOM_EVENTS_ABORTED);
  }

  function createBatchChangeEvent<Source = unknown>(
    events: CustomEventsDispatchInput<Events>,
    init?: CustomEventsInit<Source>,
  ) {
    if (init?.signal?.aborted) {
      return createAbortedEvent();
    }

    let entries = resolveCustomEventsDispatchEntries(events);
    for (let [type] of entries) addEventType(state, type);
    addEventType(state, CHANGE_EVENT_NAME);
    enableWindowTarget(state);
    return createOwnedCustomEvent(
      getEventName(state, CHANGE_EVENT_NAME),
      getEventInit(init),
      createCustomEventChangeDetail(entries),
      {
        hasSource: Boolean(init && hasDispatchSource(init)),
        kind: "source-change",
        owner: state.owner,
        source: init?.source,
      },
    );
  }

  function createGranularEvent<Source = unknown>(
    type: string,
    detail: unknown,
    init?: CustomEventsInit<Source>,
  ) {
    if (init?.signal?.aborted) return createAbortedEvent();

    addEventType(state, type);
    addEventType(state, CHANGE_EVENT_NAME);
    enableWindowTarget(state);
    return createOwnedCustomEvent(
      getEventName(state, type),
      getEventInit(init),
      detail,
      {
        hasSource: Boolean(init && hasDispatchSource(init)),
        kind: "source-event",
        owner: state.owner,
        source: init?.source,
      },
    );
  }

  let eventMembers = new Map<
    string,
    CustomEventsOnMember<Events, CustomEventsEventType<Events>>
  >();

  function registerHost(target: EventTarget, signal?: AbortSignal) {
    if (signal?.aborted) return () => {};

    let cleanupHost: () => void;
    let cleanupDispatchTarget = registerCustomEventsDispatchTarget(
      target,
      state,
      { hosted: isElement(target) },
    );
    if (isElement(target)) {
      hostRegistry.addHost(target, state.owner);
      hostRegistry.seedInitialMemory(target, state);
      cleanupHost = () => {
        hostRegistry.removeHost(target, state.owner);
      };
    } else {
      hostRegistry.addRegisteredHost(target, state.owner);
      hostRegistry.seedInitialMemory(target, state);
      cleanupHost = () => {
        hostRegistry.removeRegisteredHost(target, state.owner);
        hostRegistry.removeMemory(target, state.owner);
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

    let element = createCustomEventsOnElement(
      property as CustomEventsEventType<Events>,
      state,
    );
    member =
      property === CHANGE_EVENT_NAME
        ? (function createChangeMember(
            eventsOrHandle?: unknown,
            init?: CustomEventsInit,
          ) {
            if (isRemixHandle(eventsOrHandle)) {
              return element(eventsOrHandle);
            }

            return createBatchChangeEvent(
              (eventsOrHandle ?? {}) as CustomEventsDispatchInput<Events>,
              init,
            );
          } as CustomEventsOnMember<Events, CustomEventsEventType<Events>>)
        : (function createEventMember(
            detailOrHandle?: unknown,
            init?: CustomEventsInit,
          ) {
            if (isRemixHandle(detailOrHandle)) {
              return element(detailOrHandle);
            }

            if (arguments.length === 0) {
              return createGranularEvent(property, null, init);
            }

            if (init === undefined && isCustomEventsInit(detailOrHandle)) {
              return createGranularEvent(property, null, detailOrHandle);
            }

            return createGranularEvent(property, detailOrHandle, init);
          } as CustomEventsOnMember<Events, CustomEventsEventType<Events>>);
    eventMembers.set(property, member);
    return member;
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

  let listen = ((options?: CustomEventsListenOptions) =>
    forwardEventsMixin(
      options?.target,
      state,
    )) as CustomEventsListenFunction<Events>;

  let on = ((
    type: CustomEventsEventType<Events>,
    listener: (event: Event, signal: AbortSignal) => void | Promise<void>,
    options?: CustomEventsListenOptions,
  ) =>
    customEventsOnMixin(
      options?.target,
      state,
      type,
      listener,
    )) as CustomEventsOnFunction<Events>;

  let proxy: CustomEventsDescriptor<Events>;
  let descriptor = {
    map: undefined,
    listen,
    on,
    types,
    seed(event: CustomEventsInitial<Events>) {
      state.initial = event as CustomEventsInitial<EventDetails>;
      hostRegistry.seedInitialDescriptorMemory(state);
      hostRegistry.seedInitialRegisteredHosts(state);
      hostRegistry.notifySoon(state.owner);
    },
    setHost(target: EventTarget, signal?: AbortSignal) {
      return registerHost(target, signal);
    },
    host() {
      return ref((target, signal) => registerHost(target, signal));
    },
    getHost(target: EventTarget) {
      return hostRegistry.getReference(
        target,
        state.owner,
      ) as CustomEventsHostReference<Events>;
    },
  };
  proxy = new Proxy(descriptor, {
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
  return proxy;
}
