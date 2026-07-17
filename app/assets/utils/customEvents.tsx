import {
  createMixin,
  ref,
  type Handle,
  type MixinDescriptor,
  type RemixNode,
} from "remix/ui";

const CUSTOM_EVENTS_EVENT_PREFIX = "rmx:custom-events";
const CUSTOM_EVENTS_ABORTED = `${CUSTOM_EVENTS_EVENT_PREFIX}:aborted`;
const CHANGE_EVENT_NAME = "change";
const CUSTOM_EVENT_OWNER = Symbol("customEvents.owner");
const CUSTOM_EVENT_ORIGIN = Symbol("customEvents.origin");
const CUSTOM_EVENT_FORWARDED = Symbol("customEvents.forwarded");
const CUSTOM_EVENT_KIND = Symbol("customEvents.kind");
const CUSTOM_EVENT_PROCESSED = Symbol("customEvents.processed");
let customEventsOwnerId = 0;

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
  | "granular"
  | "batch-change"
  | "derived-change"
  | "expanded-granular";
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
  | "setHost"
  | "getHost"
  | "names"
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

type CustomEventsRuntime = {
  owner: symbol;
  ownerId: string;
  initial?: CustomEventsInitial<EventDetails>;
  eventTypes: Set<string>;
  eventTypeListeners: Set<() => void>;
};

type CustomEventsInitial<Events extends EventDetails> = Event;

interface CustomEventsConstructor {
  new <Events extends EventDetails>(): CustomEventsDescriptor<Events>;
}

type CustomEventsEventType<Events extends EventDetails> = Extract<
  keyof CustomEventMap<Events>,
  string
>;

type CustomEventsName<Type extends string> =
  `${typeof CUSTOM_EVENTS_EVENT_PREFIX}:${string}:${Type}`;

type CustomEventsNames<Events extends EventDetails> = {
  readonly [Type in CustomEventsEventType<Events>]: CustomEventsName<Type>;
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
  initial?: EventObject<Events> | Event;
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
   * Enables Remix `on(events.names.someEvent, ...)` on this element.
   *
   * @example
   * mix={[
   *   checkoutEvents.listen(),
   *   on(checkoutEvents.names.submitted, handleSubmitted),
   *   on(checkoutEvents.names.paid, handlePaid),
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
   *     on(todoEvents.names.change, updatePendingUi),
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
   * Enables `on(events.names.someEvent, ...)` on a DOM element.
   */
  listen: CustomEventsListenFunction<Events>;

  /**
   * Event names for Remix `on(...)`.
   *
   * @example
   * <button mix={[
   *   checkoutEvents.listen(),
   *   on(checkoutEvents.names.submitted, handleSubmitted),
   * ]} />
   */
  readonly names: CustomEventsNames<Events>;

  /**
   * Sets the initial event for render components and latest-event memory.
   *
   * This does not dispatch. Dispatch explicitly when DOM effects should run.
   *
   * @example
   * searchEvents.seedInitialEvent(searchEvents.queryEmpty());
   *
   * @example
   * appContextEvents.seedInitialEvent(
   *   appContextEvents.change({ user: null, settings }),
   * );
   */
  seedInitialEvent(event: CustomEventsInitial<Events>): void;

  /**
   * Local event map for class targets and product event details.
   */
  readonly map: CustomEventMap<Events>;
} & CustomEventsOnDescriptor<Events> &
  HostableCustomEventsDescriptor<Events>;

let enabledWindowTargetOwners = new Set<symbol>();
let customEventHosts = new WeakMap<Element, Map<symbol, number>>();
let customEventRegisteredHosts = new Map<symbol, Set<WeakRef<EventTarget>>>();
let customEventDetails = new WeakMap<
  EventTarget,
  Map<symbol, EventObject<EventDetails>>
>();
let customEventDescriptorDetails = new Map<
  symbol,
  EventObject<EventDetails>
>();
let customEventChangeDetails = new WeakMap<
  EventTarget,
  Map<symbol, ChangeEventDetailFromMap<EventDetails>>
>();
let customEventDescriptorChangeDetails = new Map<
  symbol,
  ChangeEventDetailFromMap<EventDetails>
>();
let customEventHostListeners = new Map<symbol, Set<() => void>>();

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

function shouldForwardToHost(
  event: Event,
  element: Element | undefined,
): element is Element {
  if (!element) return false;
  if (isForwardedCustomEvent(event)) return false;
  if (eventPathIncludes(event, element)) return false;
  return true;
}

function addCustomEventsRegisteredHost(target: EventTarget, owner: symbol) {
  let hosts = customEventRegisteredHosts.get(owner);
  if (!hosts) {
    hosts = new Set();
    customEventRegisteredHosts.set(owner, hosts);
  }
  hosts.add(new WeakRef(target));
  notifyCustomEventsHost(owner);
  notifyCustomEventsHostSoon(owner);
}

function removeCustomEventsRegisteredHost(target: EventTarget, owner: symbol) {
  let hosts = customEventRegisteredHosts.get(owner);
  if (!hosts) return;

  for (let host of hosts) {
    let registeredTarget = host.deref();
    if (!registeredTarget || registeredTarget === target) {
      hosts.delete(host);
      if (registeredTarget === target) break;
    }
  }
  if (!hosts.size) {
    customEventRegisteredHosts.delete(owner);
  }
  notifyCustomEventsHost(owner);
  notifyCustomEventsHostSoon(owner);
}

function forEachCustomEventsRegisteredHost(
  owner: symbol,
  callback: (target: EventTarget) => void,
) {
  let hosts = customEventRegisteredHosts.get(owner);
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
    customEventRegisteredHosts.delete(owner);
  }
}

function getSoleCustomEventsRegisteredHost(owner: symbol) {
  let hosts = customEventRegisteredHosts.get(owner);
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
    customEventRegisteredHosts.delete(owner);
  }
  return soleTarget;
}

function addCustomEventsHost(element: Element, owner: symbol) {
  let hosts = customEventHosts.get(element);
  if (!hosts) {
    hosts = new Map();
    customEventHosts.set(element, hosts);
  }
  hosts.set(owner, (hosts.get(owner) ?? 0) + 1);
  addCustomEventsRegisteredHost(element, owner);
}

function removeCustomEventsHost(element: Element, owner: symbol) {
  let hosts = customEventHosts.get(element);
  if (!hosts) return;

  let count = hosts.get(owner) ?? 0;
  if (count <= 1) {
    hosts.delete(owner);
    if (!hosts.size) {
      customEventHosts.delete(element);
    }
    removeCustomEventsHostDetails(element, owner);
    removeCustomEventsRegisteredHost(element, owner);
  } else {
    hosts.set(owner, count - 1);
  }
}

function removeCustomEventsHostDetails(target: EventTarget, owner: symbol) {
  let detailsByOwner = customEventDetails.get(target);
  if (detailsByOwner) {
    detailsByOwner.delete(owner);
    if (!detailsByOwner.size) {
      customEventDetails.delete(target);
    }
  }

  let changeDetailsByOwner = customEventChangeDetails.get(target);
  if (changeDetailsByOwner) {
    changeDetailsByOwner.delete(owner);
    if (!changeDetailsByOwner.size) {
      customEventChangeDetails.delete(target);
    }
  }
}

function findCustomEventsHost(element: Element | undefined, owner: symbol) {
  for (
    let current = element;
    current;
    current = current.parentElement ?? undefined
  ) {
    if (customEventHosts.get(current)?.has(owner)) return current;
  }
  return undefined;
}

function getDefaultHostTarget(element: Element | undefined, owner: symbol) {
  return (
    findCustomEventsHost(element, owner) ??
    getSoleCustomEventsRegisteredHost(owner) ??
    (typeof window === "undefined" ? undefined : window)
  );
}

function getCustomEventsDetailsTarget(
  target: EventTarget | undefined,
  owner: symbol,
) {
  if (isElement(target)) {
    return findCustomEventsHost(target, owner);
  }
  return target;
}

function getCustomEventsDetails(
  target: EventTarget | undefined,
  owner: symbol,
) {
  let detailsTarget = getCustomEventsDetailsTarget(target, owner);
  if (!detailsTarget) return customEventDescriptorDetails.get(owner) ?? {};

  return customEventDetails.get(detailsTarget)?.get(owner) ?? {};
}

function getCustomEventsHostReference(
  target: EventTarget,
  owner: symbol,
) {
  let event = getCustomEventsChangeDetail(target, owner);
  let events = getCustomEventsDetails(target, owner);
  return {
    latest: event ? { event, events } : undefined,
  };
}

function getCustomEventsChangeDetail(
  target: EventTarget | undefined,
  owner: symbol,
) {
  let detailsTarget = getCustomEventsDetailsTarget(target, owner);
  if (!detailsTarget) return customEventDescriptorChangeDetails.get(owner);

  return customEventChangeDetails.get(detailsTarget)?.get(owner);
}

function setCustomEventsDetails(
  target: EventTarget | undefined,
  owner: symbol,
  details: EventObject<EventDetails>,
) {
  let detailsTarget = getCustomEventsDetailsTarget(target, owner);
  if (!detailsTarget) {
    customEventDescriptorDetails.set(owner, details);
    return;
  }

  let detailsByOwner = customEventDetails.get(detailsTarget);
  if (!detailsByOwner) {
    detailsByOwner = new Map();
    customEventDetails.set(detailsTarget, detailsByOwner);
  }
  detailsByOwner.set(owner, details);
}

function setCustomEventsChangeDetail(
  target: EventTarget | undefined,
  owner: symbol,
  detail: ChangeEventDetailFromMap<EventDetails>,
) {
  let detailsTarget = getCustomEventsDetailsTarget(target, owner);
  if (!detailsTarget) {
    customEventDescriptorChangeDetails.set(owner, detail);
    return;
  }

  let detailsByOwner = customEventChangeDetails.get(detailsTarget);
  if (!detailsByOwner) {
    detailsByOwner = new Map();
    customEventChangeDetails.set(detailsTarget, detailsByOwner);
  }
  detailsByOwner.set(owner, detail);
}

function updateCustomEventsDetails(
  target: EventTarget | undefined,
  owner: symbol | undefined,
  entries: Array<[string, unknown]>,
) {
  let patchDetail = createCustomEventChangeDetail(entries);
  if (!owner) return patchDetail;

  let current = getCustomEventsDetails(target, owner);
  let details: EventObject<EventDetails> = { ...current };
  for (let [type, detail] of entries) {
    details[type] = detail;
  }
  let changeDetail = createCustomEventChangeDetail(entries, details);
  setCustomEventsDetails(target, owner, details);
  setCustomEventsChangeDetail(target, owner, changeDetail);
  return changeDetail;
}

function notifyCustomEventsHost(owner: symbol) {
  for (let listener of customEventHostListeners.get(owner) ?? []) {
    listener();
  }
}

function notifyCustomEventsHostSoon(owner: symbol) {
  queueMicrotask(() => notifyCustomEventsHost(owner));
}

function subscribeCustomEventsHost(owner: symbol, listener: () => void) {
  let listeners = customEventHostListeners.get(owner);
  if (!listeners) {
    listeners = new Set();
    customEventHostListeners.set(owner, listeners);
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (!listeners.size) {
      customEventHostListeners.delete(owner);
    }
  };
}

function getRuntimeEventName(runtime: CustomEventsRuntime, type: string) {
  return `${CUSTOM_EVENTS_EVENT_PREFIX}:${runtime.ownerId}:${type}`;
}

function getRuntimeEventType(runtime: CustomEventsRuntime, eventName: string) {
  let prefix = `${CUSTOM_EVENTS_EVENT_PREFIX}:${runtime.ownerId}:`;
  if (!eventName.startsWith(prefix)) return undefined;
  return eventName.slice(prefix.length);
}

function addRuntimeEventType(runtime: CustomEventsRuntime, type: string) {
  if (runtime.eventTypes.has(type)) return;
  runtime.eventTypes.add(type);
  for (let listener of runtime.eventTypeListeners) listener();
}

function subscribeRuntimeEventTypes(
  runtime: CustomEventsRuntime,
  listener: () => void,
) {
  runtime.eventTypeListeners.add(listener);
  return () => runtime.eventTypeListeners.delete(listener);
}

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

function createInitialEvent(
  type: string,
  runtime: CustomEventsRuntime,
  initial: unknown,
) {
  let eventName = getRuntimeEventName(runtime, type);
  if (initial instanceof CustomEvent) {
    if (initial.type === eventName) {
      return initial;
    }
  }

  if (!initial || typeof initial !== "object") return undefined;

  let initialMap = initial as Record<string, unknown>;
  if (Object.hasOwn(initialMap, type)) {
    return new CustomEvent(eventName, {
      detail: initialMap[type],
    });
  }

  if (type !== CHANGE_EVENT_NAME) return undefined;

  let entries = Object.entries(initialMap).filter(
    ([eventType]) => eventType !== CHANGE_EVENT_NAME,
  );
  if (!entries.length) return undefined;

  return new CustomEvent(eventName, {
    detail: createCustomEventChangeDetail(entries),
  });
}

function getInitialEventEntriesFromEvent(
  runtime: CustomEventsRuntime,
  initial: CustomEvent,
) {
  let type = getRuntimeEventType(runtime, initial.type);
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

function getInitialEventEntriesFromValue(runtime: CustomEventsRuntime) {
  let initial = runtime.initial;
  if (!initial) return undefined;

  if (initial instanceof CustomEvent) {
    return getInitialEventEntriesFromEvent(runtime, initial);
  }

  if (initial instanceof Event) return undefined;
  if (!initial || typeof initial !== "object") return undefined;
  return resolveCustomEventsDispatchEntries(initial as EventDetails);
}

function getInitialEventEntries(
  target: EventTarget | undefined,
  runtime: CustomEventsRuntime,
) {
  return getInitialEventEntriesFromValue(runtime);
}

function seedInitialCustomEventsDetails(
  target: EventTarget | undefined,
  runtime: CustomEventsRuntime,
) {
  let entries = getInitialEventEntries(target, runtime);
  if (!entries?.length) return;
  updateCustomEventsDetails(
    target,
    runtime.owner,
    entries,
  );
}

function seedInitialCustomEventsDescriptorDetails(runtime: CustomEventsRuntime) {
  seedInitialCustomEventsDetails(undefined, runtime);
}

function seedInitialCustomEventsRegisteredHosts(runtime: CustomEventsRuntime) {
  forEachCustomEventsRegisteredHost(runtime.owner, (target) => {
    seedInitialCustomEventsDetails(target, runtime);
  });
}

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
    kind: ownedEvent[CUSTOM_EVENT_KIND] ?? "granular",
    owner: ownedEvent[CUSTOM_EVENT_OWNER],
    origin: ownedEvent[CUSTOM_EVENT_ORIGIN],
    source: ownedEvent.source,
  };
}

function dispatchOwnedCustomEvent(
  target: EventTarget,
  runtime: CustomEventsRuntime,
  type: string,
  init: EventInit,
  detail: unknown,
  metadata: Omit<CustomEventMetadata, "owner">,
) {
  return dispatchSingleCustomEvent(
    target,
    getRuntimeEventName(runtime, type),
    init,
    detail,
    {
      ...metadata,
      owner: runtime.owner,
    },
  );
}

function dispatchDerivedChangeEvent(
  target: EventTarget,
  runtime: CustomEventsRuntime,
  entries: Array<[string, unknown]>,
  init: EventInit,
  metadata: CustomEventMetadata,
) {
  let changeDetail = updateCustomEventsDetails(
    target,
    runtime.owner,
    entries,
  );
  return dispatchOwnedCustomEvent(
    target,
    runtime,
    CHANGE_EVENT_NAME,
    init,
    changeDetail,
    {
      ...metadata,
      kind: "derived-change",
      origin: target,
    },
  );
}

function dispatchExpandedGranularEvents(
  target: EventTarget,
  runtime: CustomEventsRuntime,
  entries: Array<[string, unknown]>,
  init: EventInit,
  metadata: CustomEventMetadata,
) {
  let result = true;
  for (let [type, detail] of entries) {
    result =
      dispatchOwnedCustomEvent(target, runtime, type, init, detail, {
        ...metadata,
        kind: "expanded-granular",
        origin: target,
      }) && result;
  }
  return result;
}

function processCustomEventsEvent(
  event: CustomEvent,
  runtime: CustomEventsRuntime,
) {
  if (!ownsEvent(event, runtime.owner)) return true;
  if (hasProcessedCustomEvent(event)) return true;

  let kind = getCustomEventKind(event);
  if (kind !== "granular" && kind !== "batch-change") return true;

  let origin = event.target instanceof EventTarget ? event.target : undefined;
  if (!origin) return true;

  markCustomEventProcessed(event);
  let metadata = getCustomEventMetadata(event);
  let init = getEventInit(event);

  if (kind === "granular") {
    let type = getRuntimeEventType(runtime, event.type);
    if (!type || type === CHANGE_EVENT_NAME) return true;
    let result = dispatchDerivedChangeEvent(
      origin,
      runtime,
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

  updateCustomEventsDetails(origin, runtime.owner, entries);
  let result = dispatchExpandedGranularEvents(
    origin,
    runtime,
    entries,
    init,
    metadata,
  );
  if (!result) event.preventDefault();
  return result;
}

let customEventsDispatchTargetRegistrations = new WeakMap<
  EventTarget,
  Map<symbol, CustomEventsDispatchTargetRegistration>
>();

function registerCustomEventsDispatchTarget(
  target: EventTarget,
  runtime: CustomEventsRuntime,
  options?: { hosted?: boolean },
) {
  let registrations = customEventsDispatchTargetRegistrations.get(target);
  if (!registrations) {
    registrations = new Map();
    customEventsDispatchTargetRegistrations.set(target, registrations);
  }

  let registration = registrations.get(runtime.owner);
  if (registration) {
    registration.count += 1;
    let activeRegistration = registration;
    return () => {
      activeRegistration.count -= 1;
      if (activeRegistration.count > 0) return;
      activeRegistration.cleanup();
      registrations.delete(runtime.owner);
    };
  }

  let controller: AbortController | undefined;
  let unsubscribeEventTypes: (() => void) | undefined;

  function listen() {
    controller?.abort();
    controller = new AbortController();
    let signal = controller.signal;
    for (let type of runtime.eventTypes) {
      target.addEventListener(
        getRuntimeEventName(runtime, type),
        (event) => {
          if (!(event instanceof CustomEvent)) return;
          if (options?.hosted && event.composed !== true) {
            event.stopPropagation();
          }
          processCustomEventsEvent(event, runtime);
        },
        { signal },
      );
    }
  }

  unsubscribeEventTypes = subscribeRuntimeEventTypes(runtime, listen);
  listen();

  registration = {
    count: 1,
    cleanup() {
      unsubscribeEventTypes?.();
      controller?.abort();
    },
  };
  registrations.set(runtime.owner, registration);

  return () => {
    registration.count -= 1;
    if (registration.count > 0) return;
    registration.cleanup();
    registrations.delete(runtime.owner);
  };
}

function enableWindowTarget(runtime: CustomEventsRuntime) {
  if (typeof window === "undefined") return () => {};
  if (enabledWindowTargetOwners.has(runtime.owner)) return () => {};
  enabledWindowTargetOwners.add(runtime.owner);
  return registerCustomEventsDispatchTarget(window, runtime);
}

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

function cloneCustomEvent(event: Event) {
  let clone = new CustomEvent(event.type, {
    bubbles: false,
    cancelable: event.cancelable,
    composed: event.composed,
    detail: event instanceof CustomEvent ? event.detail : undefined,
  });
  let ownedEvent = event as OwnedEvent;
  attachCustomEventMetadata(clone, {
    hasSource: Object.hasOwn(event, "source"),
    kind: ownedEvent[CUSTOM_EVENT_KIND] ?? "granular",
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

const forwardRuntimeEventsMixin = createMixin<
  Element,
  [
    target: EventTarget | undefined,
    runtime: CustomEventsRuntime,
  ]
>((handle) => {
  let currentElement: Element | undefined;
  let currentExplicitTarget: EventTarget | undefined;
  let currentRuntime: CustomEventsRuntime | undefined;
  let controller: AbortController | undefined;
  let unsubscribeHost: (() => void) | undefined;
  let unsubscribeEventTypes: (() => void) | undefined;

  function syncHostSubscription() {
    unsubscribeHost?.();
    unsubscribeHost = undefined;

    if (!currentExplicitTarget && currentRuntime) {
      unsubscribeHost = subscribeCustomEventsHost(currentRuntime.owner, listen);
    }
  }

  function syncEventTypeSubscription() {
    unsubscribeEventTypes?.();
    unsubscribeEventTypes = undefined;
    if (currentRuntime) {
      unsubscribeEventTypes = subscribeRuntimeEventTypes(currentRuntime, listen);
    }
  }

  function listen() {
    controller?.abort();
    controller = undefined;
    let target =
      currentExplicitTarget ??
      (currentRuntime
        ? getDefaultHostTarget(currentElement, currentRuntime.owner)
        : undefined);

    if (!currentElement || !target || !currentRuntime) return;

    let runtime = currentRuntime;
    controller = new AbortController();
    let signal = controller.signal;
    for (let type of runtime.eventTypes) {
      target.addEventListener(
        getRuntimeEventName(runtime, type),
        (event) => {
          if (!ownsEvent(event, runtime.owner)) return;
          let element = currentElement;
          if (!shouldForwardToHost(event, element)) return;
          element.dispatchEvent(cloneCustomEvent(event));
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

  return (target, runtime) => {
    let needsListen =
      currentExplicitTarget !== target ||
      currentRuntime !== runtime;

    currentExplicitTarget = target;
    currentRuntime = runtime;

    if (needsListen) {
      syncHostSubscription();
      syncEventTypeSubscription();
      listen();
    }

    return handle.element;
  };
});

function createCustomEventsOnElement<
  Events extends EventDetails,
  Type extends CustomEventsEventType<Events>,
>(
  type: Type,
  runtime: CustomEventsRuntime,
): CustomEventsOnElement<Events, Type> {
  addRuntimeEventType(runtime, type);
  return function CustomEventsOnElement(
    handle: Handle<{
      initial?: EventObject<Events> | Event;
      target?: EventTarget;
      render: (event: CustomEventsEvent<Events, Type>) => RemixNode;
    }>,
  ) {
    let eventName = getRuntimeEventName(runtime, type);
    let initialEvent = createInitialEvent(
      type,
      runtime,
      handle.props.initial ?? runtime.initial,
    );
    let hostElement: HTMLElement | undefined;
    let currentEvent: Event | undefined = initialEvent;
    let currentTarget: EventTarget | undefined;
    let controller: AbortController | undefined;
    let unsubscribeHost: (() => void) | undefined;

    function canRender(event: Event) {
      return event === initialEvent || ownsEvent(event, runtime.owner);
    }

    function syncDefaultTarget() {
      syncTarget(
        handle.props.target ??
          getDefaultHostTarget(hostElement, runtime.owner),
      );
    }

    function syncHostSubscription() {
      unsubscribeHost?.();
      unsubscribeHost = undefined;

      if (!handle.props.target) {
        unsubscribeHost = subscribeCustomEventsHost(
          runtime.owner,
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

function createCustomEventsDescriptor<
  Events extends EventDetails,
>(): CustomEventsDescriptor<Events> {
  let runtime: CustomEventsRuntime = {
    owner: Symbol("customEvents.descriptor"),
    ownerId: createCustomEventsOwnerId(),
    eventTypes: new Set(),
    eventTypeListeners: new Set(),
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
    for (let [type] of entries) addRuntimeEventType(runtime, type);
    addRuntimeEventType(runtime, CHANGE_EVENT_NAME);
    enableWindowTarget(runtime);
    return createOwnedCustomEvent(
      getRuntimeEventName(runtime, CHANGE_EVENT_NAME),
      getEventInit(init),
      createCustomEventChangeDetail(entries),
      {
        hasSource: Boolean(init && hasDispatchSource(init)),
        kind: "batch-change",
        owner: runtime.owner,
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

    addRuntimeEventType(runtime, type);
    addRuntimeEventType(runtime, CHANGE_EVENT_NAME);
    enableWindowTarget(runtime);
    return createOwnedCustomEvent(
      getRuntimeEventName(runtime, type),
      getEventInit(init),
      detail,
      {
        hasSource: Boolean(init && hasDispatchSource(init)),
        kind: "granular",
        owner: runtime.owner,
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
      runtime,
      { hosted: isElement(target) },
    );
    if (isElement(target)) {
      addCustomEventsHost(target, runtime.owner);
      seedInitialCustomEventsDetails(target, runtime);
      cleanupHost = () => {
        removeCustomEventsHost(target, runtime.owner);
      };
    } else {
      addCustomEventsRegisteredHost(target, runtime.owner);
      seedInitialCustomEventsDetails(target, runtime);
      cleanupHost = () => {
        removeCustomEventsRegisteredHost(target, runtime.owner);
        removeCustomEventsHostDetails(target, runtime.owner);
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
    addRuntimeEventType(runtime, property);
    let member = eventMembers.get(property);
    if (member) return member;

    let element = createCustomEventsOnElement(
      property as CustomEventsEventType<Events>,
      runtime,
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

  let names = new Proxy(
    {},
    {
      get(_, property) {
        if (typeof property !== "string") return undefined;
        addRuntimeEventType(runtime, property);
        return getRuntimeEventName(runtime, property);
      },
    },
  ) as CustomEventsNames<Events>;

  let listen = ((options?: CustomEventsListenOptions) =>
    forwardRuntimeEventsMixin(
      options?.target,
      runtime,
    )) as CustomEventsListenFunction<Events>;

  let proxy: CustomEventsDescriptor<Events>;
  let descriptor = {
    map: undefined,
    listen,
    names,
    seedInitialEvent(event: CustomEventsInitial<Events>) {
      runtime.initial = event as CustomEventsInitial<EventDetails>;
      seedInitialCustomEventsDescriptorDetails(runtime);
      seedInitialCustomEventsRegisteredHosts(runtime);
      notifyCustomEventsHostSoon(runtime.owner);
    },
    setHost(target: EventTarget, signal?: AbortSignal) {
      return registerHost(target, signal);
    },
    host() {
      return ref((target, signal) => registerHost(target, signal));
    },
    getHost(target: EventTarget) {
      return getCustomEventsHostReference(
        target,
        runtime.owner,
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
