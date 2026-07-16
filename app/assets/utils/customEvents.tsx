import {
  createMixin,
  ref,
  TypedEventTarget,
  type Handle,
  type MixinDescriptor,
  type RemixNode,
} from "remix/ui";

const CUSTOM_EVENTS_DISPATCH = "rmx:custom-events:dispatch";
const CHANGE_EVENT_NAME = "change";
const CUSTOM_EVENT_OWNER = Symbol("customEvents.owner");
const CUSTOM_EVENT_ORIGIN = Symbol("customEvents.origin");
const CUSTOM_EVENT_FORWARDED = Symbol("customEvents.forwarded");

type EventDetails = Record<string, unknown>;
type EventObject<Events extends EventDetails> = Partial<Events>;
type NamespacedEventName<EventName extends string, Namespace extends string> =
  `${Namespace}:${EventName}`;
type OwnedEvent = Event & {
  [CUSTOM_EVENT_OWNER]?: symbol;
  [CUSTOM_EVENT_ORIGIN]?: EventTarget;
  [CUSTOM_EVENT_FORWARDED]?: true;
  originTarget?: EventTarget;
  source?: unknown;
};
type OnCustomEventGuard = (
  event: Event,
  element: Element,
  signal: AbortSignal,
) => boolean | void;

type CustomEventWithMetadata<Detail, Source = unknown> =
  CustomEvent<Detail> & {
    originTarget?: EventTarget;
    source?: Source;
  };

type ChangeDetailName<
  EventName extends string,
  Namespace extends string | undefined,
> = Namespace extends string
  ? { name: NamespacedEventName<EventName, Namespace> }
  : {};

type ChangeEventDetailFromMap<
  EventMap extends EventDetails,
  Namespace extends string | undefined = undefined,
> = {
  [K in keyof EventMap & string]: {
    type: K;
    detail: EventMap[K];
    details: Partial<EventMap>;
  } & ChangeDetailName<K, Namespace>;
}[keyof EventMap & string] | ({
  type: Array<keyof EventMap & string>;
  detail: Partial<EventMap>;
  details: Partial<EventMap>;
} & (
  Namespace extends string
    ? { name: Array<NamespacedEventName<keyof EventMap & string, Namespace>> }
    : {}
));

type LocalCustomEventTypes<EventMap extends EventDetails> = {
  [K in typeof CHANGE_EVENT_NAME]: CustomEventWithMetadata<
    ChangeEventDetailFromMap<EventMap>
  >;
} & {
  [K in keyof EventMap & string]: CustomEventWithMetadata<EventMap[K]>;
};

type NamespacedCustomEventTypes<
  EventMap extends EventDetails,
  Namespace extends string,
> = {
  [K in typeof CHANGE_EVENT_NAME as NamespacedEventName<K, Namespace>]: CustomEventWithMetadata<
    ChangeEventDetailFromMap<EventMap, Namespace>
  >;
} & {
  [K in keyof EventMap & string as NamespacedEventName<K, Namespace>]: CustomEventWithMetadata<
    EventMap[K]
  >;
};

type EventMapReservedKeys<EventMap extends EventDetails> = Extract<
  keyof EventMap,
  | typeof CHANGE_EVENT_NAME
  | "listen"
  | "setHost"
  | "getHost"
  | "events"
  | "initial"
  | "__eventMap"
  | "__namespacedEventMap"
>;

type EventMapNamespacedKeys<EventMap extends EventDetails> = Extract<
  keyof EventMap & string,
  `${string}:${string}`
>;

type ReservedCustomEventMapKeyError<Keys extends PropertyKey> = {
  readonly __customEventMapReservedKeyError: "CustomEventMap event maps cannot define reserved event keys.";
  readonly reservedEventKeys: Keys;
};

type NamespacedCustomEventMapKeyError<Keys extends PropertyKey> = {
  readonly __customEventMapNamespacedKeyError: "CustomEventMap event maps cannot define namespaced event keys. Use CustomEvents with a namespace generic for namespaced DOM/global events.";
  readonly namespacedEventKeys: Keys;
};

type CustomEventMapError<EventMap extends EventDetails> =
  EventMapReservedKeys<EventMap> extends never
    ? EventMapNamespacedKeys<EventMap> extends never
      ? never
      : NamespacedCustomEventMapKeyError<EventMapNamespacedKeys<EventMap>>
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

type CustomEventsDispatchDetail<Events extends EventDetails> = {
  events: CustomEventsDispatchInput<Events>;
  init?: CustomEventsInit;
  namespace?: string;
  owner?: symbol;
};
type CustomEventsDispatchEvents<Events extends EventDetails> = {
  [K in keyof Events]?: Events[K];
};
type CustomEventsDispatchInput<Events extends EventDetails> =
  CustomEventsDispatchEvents<Events>;

type CustomEventsRuntime = {
  namespace: string | undefined;
  owner: symbol;
  initial?: CustomEventsInitial<EventDetails>;
};

type CustomEventsInitial<Events extends EventDetails> = Event;

type CustomEventsOptions<Namespace extends string | undefined = undefined> = {
  /**
   * Optional DOM event namespace.
   *
   * Product code still uses local names such as
   * `events.listen(on("submitted", ...))`, `<events.submitted render={...} />`, and
   * `events.submitted(detail)`. The namespace is only for DOM event-map
   * augmentation and raw DOM listeners that need namespaced event names.
   */
  namespace?: Namespace;
};

type CustomEventsConstructorOptions<
  Namespace extends string | undefined,
> = Namespace extends string ? { namespace: Namespace } : { namespace?: undefined };

type CustomEventsConstructorArgs<
  Namespace extends string | undefined,
> = Namespace extends string
  ? [options: CustomEventsConstructorOptions<Namespace>]
  : [options?: CustomEventsConstructorOptions<Namespace>];

interface CustomEventsConstructor {
  new <
    Events extends EventDetails,
    const Namespace extends string | undefined = undefined,
  >(
    ...args: CustomEventsConstructorArgs<Namespace>
  ): CustomEventsDescriptor<Events, Namespace>;
}

type CustomEventsEventType<Events extends EventDetails> = Extract<
  keyof CustomEventMap<Events>,
  string
>;

type CustomEventsEvent<
  Events extends EventDetails,
  Type extends CustomEventsEventType<Events>,
> = CustomEventMap<Events>[Type];

type CustomEventsRenderProps<
  Events extends EventDetails,
  Type extends CustomEventsEventType<Events>,
> = {
  /**
   * Optional predicate for deciding whether this render component should react
   * to an event.
   *
   * By default, every event from the same `CustomEvents` definition is
   * allowed. That makes sibling branches in one component easy to coordinate.
   * Return `false` when this render component should ignore an event, such as
   * when a row or form should only react to its own work.
   */
  guard?: OnCustomEventGuard;
  /**
   * Initial event object used only for the first render. It does not dispatch
   * and therefore does not run `.listen(...)` side effects.
   *
   * Prefer `events.seedInitialEvent(...)` when the same initial event should be
   * shared across all render components for this event set.
   *
   * @example
   * <searchEvents.change initial={searchEvents.queryEmpty()} render={...} />
   *
   * @example
   * <searchEvents.change initial={searchEvents.events({ queryEmpty: null })} render={...} />
   */
  initial?: EventObject<Events> | Event;
  /**
   * Explicit event target to observe. Most DOM components do not need this;
   * use `events.host()` on the nearest form, row, or widget root when the UI
   * needs a local DOM event boundary.
   */
  target?: EventTarget;
  /**
   * Renders children for the matching custom event.
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
> = Type extends keyof Events & string
  ? CustomEventsEventMember<Events, Type>
  : CustomEventsOnElement<Events, Type>;

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
   * Event-aware render component and single-event creator for this product
   * event.
   *
   * In JSX, use it to render from the latest matching event without mirrored
   * component state. In event handlers, call it to create an event for native
   * `dispatchEvent(...)`.
   *
   * Sibling branches can react to each other by default. Add `events.host()`
   * to a form, row, or widget root when that branch should keep its events
   * local.
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

type OnMixinArgs<Type extends string> = [
  type: Type,
  listener: (...args: Array<any>) => void | Promise<void>,
  captureBoolean?: boolean,
];

type CustomEventsElementTarget<
  Events extends EventDetails,
  Namespace extends string | undefined,
  HostElement extends Element,
> = TypedEventTarget<
  CustomEventMap<Events> &
    (Namespace extends string
      ? NamespacedCustomEventTypes<Events, Namespace>
      : {})
> &
  HostElement;

type CustomEventsListenEventType<
  Events extends EventDetails,
  Namespace extends string | undefined,
> =
  | CustomEventsEventType<Events>
  | (Namespace extends string
    ? Extract<keyof NamespacedCustomEventTypes<Events, Namespace>, string>
    : never);

type CustomEventsListenDescriptor<
  Events extends EventDetails,
  Namespace extends string | undefined,
  HostElement extends Element,
  Type extends CustomEventsListenEventType<Events, Namespace>,
> = MixinDescriptor<
  CustomEventsElementTarget<Events, Namespace, HostElement>,
  OnMixinArgs<Type>
>;

type CustomEventsListenDescriptorFor<
  Events extends EventDetails,
  Namespace extends string | undefined,
  HostElement extends Element,
> = CustomEventsListenDescriptor<
  Events,
  Namespace,
  HostElement,
  any
>;

/**
 * Builds mixins that let DOM elements react to this event set.
 *
 * Use it for DOM reactions: add a pending class, disable a button, focus an
 * input, reset a form, or write a data attribute. Event names are the product
 * names from your event map, such as `"submitted"` or `"actionSucceeded"`.
 *
 * By default, sibling branches using the same event set can react to each
 * other's events. Put `events.host()` on a form, row, or widget root when a
 * branch should keep its events local. A hosted branch keeps events inside that
 * boundary unless the event is created with `{ composed: true }`.
 *
 * @example
 * checkoutEvents.listen(
 *   on("submitted", ({ detail, currentTarget }) => {
 *     currentTarget.dataset.orderId = detail.id;
 *   }),
 * )
 */
type CustomEventsListenFunction<
  Events extends EventDetails,
  Namespace extends string | undefined,
> = {
  /**
   * Lets the host element react to one or more product events.
   *
   * Pass Remix `on(...)` mixins and place the result in an element's `mix`
   * prop. The event object has the usual DOM shape, so `currentTarget` is the
   * element that owns this mixin.
   *
   * @example
   * mix={checkoutEvents.listen(
   *   on("submitted", handleSubmitted),
   *   on("paid", handlePaid),
   * )}
   *
   * Use this for DOM effects. Use `<events.someEvent render={...} />` when the
   * reaction should render children.
   *
   * Use `guard` only when host boundaries are not enough to express the product
   * rule for whether this element should react.
   */
  <HostElement extends Element>(
    descriptor: CustomEventsListenDescriptorFor<
      Events,
      Namespace,
      HostElement
    >,
    ...args: Array<
      | CustomEventsListenDescriptorFor<Events, Namespace, HostElement>
      | CustomEventsListenOptions
    >
  ): Array<MixinDescriptor<HostElement, any>>;
};

type CustomEventsListenOptions = {
  /**
   * Optional predicate for deciding whether this element should react to an
   * event. Return `false` to ignore the event.
   */
  guard?: OnCustomEventGuard;
  /**
   * Explicit event target to observe. Most DOM components do not need this;
   * prefer `events.host()` on the closest DOM product boundary.
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
  Namespace extends string | undefined,
> = {
  /**
   * DOM mixin that makes an element the local boundary for this event set.
   *
   * Use `host()` in a DOM element's `mix` prop at the root of a widget when all
   * branches inside should share one event stream. Use it at each repeated form
   * or row when each instance should stay independent.
   *
   * The host owns the latest event memory used by `events.getHost(element)` and
   * gives all branches inside that element one local event stream.
   *
   * Without a host, `listen(...)` and render components observe the window
   * fallback. That is convenient for single widgets where sibling branches
   * should react to each other without passing a target around. Use `host()`
   * when repeated rows/forms need isolation or when a component wants to keep
   * event traffic local.
   *
   * A host keeps events local by default: listeners and render components inside
   * the host can react, while ancestors outside the host do not. This is usually
   * what product code wants for pending, success, error, and optimistic UI owned
   * by one form or row.
   *
   * When an ancestor outside the host should also observe the event, dispatch
   * with `{ composed: true }`. That keeps local UI working and also lets the
   * product event escape for page-level status, logging, analytics, or
   * coordination.
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
   *   <button mix={todoEvents.listen(on("change", updatePendingUi))} />
   * </form>
   *
   * @example
   * form.dispatchEvent(
   *   todoEvents.actionSubmitted(null, { composed: true }),
   * );
   */
  host(): MixinDescriptor<Element, any>;

  /**
   * Enables this event definition on an existing non-JSX `EventTarget`.
   *
   * Use this when a `TypedEventTarget` subclass or plain `EventTarget` owns its
   * own event stream. For DOM component subtrees, prefer `events.host()` in the
   * host element's `mix` prop because it handles insert/remove cleanup for you.
   *
   * `setHost(...)` returns a cleanup function. Pass an `AbortSignal` when one is
   * available, or call the cleanup yourself when the target is no longer in use.
   * The descriptor stays target-agnostic; dispatch on the target itself and read
   * its latest event memory with `events.getHost(target).latest`.
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
   * Finds the event boundary for a target and reads its latest product events.
   *
   * Use this from a normal DOM event when it needs to react to the latest
   * custom-event activity without mirroring that state into `dataset` or
   * component state.
   *
   * `latest.event` is the latest `"change"` detail for the boundary:
   * `{ type, detail, details }`. `latest.events` is the accumulated detail map
   * for the same boundary. Use `latest.event` when you care what just happened;
   * use `latest.events` when the next action depends on previously dispatched
   * details.
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
   * Local event map for class targets and product event details.
   *
   * @example
   * type GameEventMap = (typeof gameEvents)["__eventMap"];
   */
  readonly __eventMap: CustomEventMap<Events>;
  /**
   * Namespaced DOM event map for TypeScript DOM event-map augmentation.
   *
   * Only available when `CustomEvents` is used with a namespace generic.
   *
   * @example
   * declare global {
   *   interface HTMLElementEventMap
   *     extends (typeof checkoutEvents)["__namespacedEventMap"] {}
   * }
   */
  readonly __namespacedEventMap: Namespace extends string
    ? NamespacedCustomEventTypes<Events, Namespace>
    : never;
};

type CustomEventsDescriptor<
  Events extends EventDetails,
  Namespace extends string | undefined = undefined,
> = {
  /**
   * Creates an aggregate event object for the native `dispatchEvent(...)` API.
   *
   * Pass one key for a single product event, or several keys when one action
   * changes several product events at once. The browser dispatches a `"change"`
   * event for the whole action, then the individual product events.
   *
   * Use `events.getHost(target).latest` before dispatching when the next event
   * depends on the latest details.
   *
   * @example
   * button.dispatchEvent(checkoutEvents.events({ submitted: { id: "order-1" } }));
   */
  events<Source = unknown>(
    events: CustomEventsDispatchInput<Events>,
    init?: CustomEventsInit<Source>,
  ): Event;

  /**
   * Lets a DOM element react to this event set using Remix `on(...)`.
   *
   * This is for DOM effects such as toggling classes, disabling controls,
   * focusing elements, resetting forms, or writing attributes. Use product event
   * names from your event map even when this event set has a DOM namespace.
   */
  listen: CustomEventsListenFunction<Events, Namespace>;

  /**
   * Seeds the first product event for render components and latest-event memory.
   *
   * Pass an event object created by this descriptor, such as
   * `events.ready()` or `events.events({ user, settings })`. This records the
   * initial value without dispatching a DOM event, so
   * `events.listen(on(...))` effects do not run. If an effect should run too,
   * dispatch an event explicitly with native `target.dispatchEvent(...)`.
   *
   * @example
   * searchEvents.seedInitialEvent(searchEvents.queryEmpty());
   *
   * @example
   * appContextEvents.seedInitialEvent(
   *   appContextEvents.events({ user: null, settings }),
   * );
   */
  seedInitialEvent(event: CustomEventsInitial<Events>): void;

  /**
   * Local event map for class targets and product event details.
   */
  readonly __eventMap: CustomEventMap<Events>;
  /**
   * Namespaced DOM event map for TypeScript DOM event-map augmentation.
   */
  readonly __namespacedEventMap: Namespace extends string
    ? NamespacedCustomEventTypes<Events, Namespace>
    : never;
} & CustomEventsOnDescriptor<Events> &
  HostableCustomEventsDescriptor<Events, Namespace>;

let enabledTargets = new WeakSet<EventTarget>();
let didEnableWindowTarget = false;
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
  guard: OnCustomEventGuard | undefined,
  signal: AbortSignal,
): element is Element {
  if (!element) return false;
  if (isForwardedCustomEvent(event)) return false;
  if (eventPathIncludes(event, element)) return false;
  return guard?.(event, element, signal) !== false;
}

function createCustomEventsGuard(
  runtime: CustomEventsRuntime,
  guard: OnCustomEventGuard | undefined,
): OnCustomEventGuard {
  return (event, element, signal) => {
    if (!ownsEvent(event, runtime.owner)) return false;
    return guard?.(event, element, signal) !== false;
  };
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
  changeDetail: ChangeEventDetailFromMap<EventDetails>,
) {
  if (!owner) return;

  let current = getCustomEventsDetails(target, owner);
  let details: EventObject<EventDetails> = { ...current };
  for (let [type, detail] of entries) {
    details[type] = detail;
  }
  setCustomEventsDetails(target, owner, details);
  setCustomEventsChangeDetail(target, owner, changeDetail);
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

function getEventName(type: string, namespace: string | undefined) {
  return namespace ? `${namespace}:${type}` : type;
}

function getRuntimeEventName(runtime: CustomEventsRuntime, type: string) {
  return getEventName(type, runtime.namespace);
}

function getListenEventName(runtime: CustomEventsRuntime, type: string) {
  if (!runtime.namespace) return type;
  if (type.startsWith(`${runtime.namespace}:`)) return type;
  return getRuntimeEventName(runtime, type);
}

function getLocalEventType(
  eventName: string,
  namespace: string | undefined,
) {
  if (!namespace) return eventName;
  let prefix = `${namespace}:`;
  if (!eventName.startsWith(prefix)) return undefined;
  return eventName.slice(prefix.length);
}

function createCustomEventChangeDetail(
  entries: Array<[string, unknown]>,
  namespace?: string,
) {
  let details = getEntriesObject(entries);

  if (entries.length === 1) {
    let [[type, detail]] = entries;
    let name = namespace ? `${namespace}:${type}` : undefined;
    return {
      type,
      ...(name ? { name } : {}),
      detail,
      details,
    };
  }

  let type = entries.map(([type]) => type);
  return {
    type,
    ...(namespace
      ? { name: type.map((eventType) => `${namespace}:${eventType}`) }
      : {}),
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

function createCustomEventsDispatchEvent<Events extends EventDetails>(
  events: CustomEventsDispatchInput<Events>,
  init: CustomEventsInit | undefined,
  namespace: string | undefined,
  owner: symbol,
) {
  return new CustomEvent<CustomEventsDispatchDetail<Events>>(
    CUSTOM_EVENTS_DISPATCH,
    {
      bubbles: init?.bubbles ?? true,
      cancelable: true,
      ...(init?.composed === undefined ? {} : { composed: init.composed }),
      detail: {
        events,
        init,
        namespace,
        owner,
      },
    },
  );
}

function dispatchEventObject(
  target: EventTarget,
  namespace: string | undefined,
  events: object,
  init: CustomEventsInit | undefined,
  metadata: CustomEventMetadata,
) {
  if (init?.signal?.aborted) return true;

  let entries = resolveCustomEventsDispatchEntries(events);
  if (!entries.length) return true;

  let changeDetail = createCustomEventChangeDetail(entries, namespace);
  updateCustomEventsDetails(target, metadata.owner, entries, changeDetail);

  let eventInit = getEventInit(init);
  let changeResult = dispatchSingleCustomEvent(
    target,
    getEventName(CHANGE_EVENT_NAME, namespace),
    eventInit,
    changeDetail,
    metadata,
  );

  let eventsResult = true;
  for (let [type, detail] of entries) {
    if (init?.signal?.aborted) break;

    eventsResult =
      dispatchSingleCustomEvent(
        target,
        getEventName(type, namespace),
        eventInit,
        detail,
        metadata,
      ) && eventsResult;
  }

  return changeResult && eventsResult;
}

function getHostEventInit(init: CustomEventsInit | undefined) {
  if (init?.composed === true) return init;
  return {
    ...init,
    bubbles: false,
  };
}

function createInitialEvent(
  type: string,
  namespace: string | undefined,
  initial: unknown,
) {
  if (initial instanceof CustomEvent) {
    if (initial.type === CUSTOM_EVENTS_DISPATCH) {
      let detail = initial.detail as Partial<CustomEventsDispatchDetail<EventDetails>>;
      return createInitialEvent(type, detail.namespace ?? namespace, detail.events);
    }

    if (initial.type === getEventName(type, namespace)) {
      return initial;
    }
  }

  if (!initial || typeof initial !== "object") return undefined;

  let initialMap = initial as Record<string, unknown>;
  if (Object.hasOwn(initialMap, type)) {
    return new CustomEvent(getEventName(type, namespace), {
      detail: initialMap[type],
    });
  }

  if (type !== CHANGE_EVENT_NAME) return undefined;

  let entries = Object.entries(initialMap).filter(
    ([eventType]) => eventType !== CHANGE_EVENT_NAME,
  );
  if (!entries.length) return undefined;

  return new CustomEvent(getEventName(type, namespace), {
    detail: createCustomEventChangeDetail(entries, namespace),
  });
}

function getInitialCustomEventsDispatch(runtime: CustomEventsRuntime) {
  let initial = runtime.initial;
  if (!initial) return undefined;

  if (initial instanceof CustomEvent) {
    if (initial.type !== CUSTOM_EVENTS_DISPATCH) {
      let type = getLocalEventType(initial.type, runtime.namespace);
      if (!type || type === CHANGE_EVENT_NAME) return undefined;

      return {
        events: { [type]: initial.detail },
        namespace: runtime.namespace,
        owner: runtime.owner,
      };
    }

    let detail =
      initial.detail as Partial<CustomEventsDispatchDetail<EventDetails>>;
    if (!detail.events) return undefined;

    return {
      events: detail.events,
      init: detail.init,
      namespace: detail.namespace ?? runtime.namespace,
      owner: detail.owner ?? runtime.owner,
    };
  }

  if (initial instanceof Event) return undefined;
}

function getInitialEventEntries(
  target: EventTarget | undefined,
  runtime: CustomEventsRuntime,
) {
  let detail = getInitialCustomEventsDispatch(runtime);
  if (!detail) return undefined;
  return resolveCustomEventsDispatchEntries(detail.events);
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
    createCustomEventChangeDetail(entries, runtime.namespace),
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

function expandCustomEventsDispatch(
  target: EventTarget,
  namespace: string | undefined,
  event: CustomEvent<CustomEventsDispatchDetail<EventDetails>>,
  options?: { hosted?: boolean },
) {
  let detail = event.detail;
  let origin = event.target instanceof EventTarget ? event.target : target;
  let init = detail.init;
  let eventInit = options?.hosted ? getHostEventInit(init) : init;
  let eventNamespace = detail.namespace ?? namespace;
  let result = dispatchEventObject(
    target,
    eventNamespace,
    detail.events,
    eventInit,
    {
      hasSource: Boolean(init && hasDispatchSource(init)),
      owner: detail.owner,
      origin,
      source: init?.source,
    },
  );
  if (!result) event.preventDefault();
  return result;
}

function enableWindowTarget() {
  if (didEnableWindowTarget || typeof window === "undefined") return;
  didEnableWindowTarget = true;

  window.addEventListener(CUSTOM_EVENTS_DISPATCH, (event) => {
    if (!(event instanceof CustomEvent)) return;
    if (!(event.target instanceof EventTarget)) return;
    expandCustomEventsDispatch(event.target, undefined, event);
  });
}

function enableCustomEventsDispatchTarget(
  target: EventTarget,
  namespace: string | undefined,
) {
  if (typeof window !== "undefined" && target === window) {
    enableWindowTarget();
    return;
  }
  enableCustomEventsHost(target, namespace);
}

function enableCustomEventsHost(
  target: EventTarget,
  namespace: string | undefined,
) {
  if (enabledTargets.has(target)) return;
  enabledTargets.add(target);

  target.addEventListener(
    CUSTOM_EVENTS_DISPATCH,
    (event) => {
      if (!(event instanceof CustomEvent)) return;
      event.stopPropagation();
      expandCustomEventsDispatch(
        target,
        namespace,
        event as CustomEvent<CustomEventsDispatchDetail<EventDetails>>,
        { hosted: true },
      );
    },
  );
}

function getOnDescriptorType(descriptor: MixinDescriptor<any, any>) {
  let [type] = descriptor.args;
  if (typeof type !== "string") {
    throw new TypeError("CustomEvents.listen() expects a Remix on() descriptor.");
  }
  return type;
}

function adaptOnDescriptor<
  HostElement extends Element,
  Args extends OnMixinArgs<string>,
>(
  descriptor: MixinDescriptor<HostElement, Args>,
  type: string,
  owner: symbol,
) {
  let [, listener, captureBoolean] = descriptor.args;
  let adaptedListener = (event: Event, signal: AbortSignal) => {
    if (!ownsEvent(event, owner)) return;
    return listener(event, signal);
  };

  return {
    ...descriptor,
    args: [type, adaptedListener, captureBoolean],
  } as unknown as MixinDescriptor<HostElement, Args>;
}

function isMixinDescriptor(value: unknown): value is MixinDescriptor<any, any> {
  return (
    value !== null &&
    typeof value === "object" &&
    "type" in value &&
    "args" in value &&
    Array.isArray((value as MixinDescriptor<any, any>).args)
  );
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

function isListenOptions(value: unknown): value is CustomEventsListenOptions {
  return Boolean(value) && !isMixinDescriptor(value);
}

function getListenOptions(
  args: Array<MixinDescriptor<Element, OnMixinArgs<string>> | CustomEventsListenOptions>,
) {
  let options: CustomEventsListenOptions = {};
  let descriptors: Array<MixinDescriptor<Element, OnMixinArgs<string>>> = [];
  let last = args[args.length - 1];
  let end = args.length;

  if (isListenOptions(last)) {
    options = last;
    end -= 1;
  }

  for (let index = 0; index < end; index++) {
    let arg = args[index];
    if (isMixinDescriptor(arg)) descriptors.push(arg);
  }

  return { descriptors, options };
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

const forwardTargetEventsMixin = createMixin<
  Element,
  [
    target: EventTarget | undefined,
    owner: symbol,
    eventName: string,
    guard: OnCustomEventGuard,
  ]
>((handle) => {
  let currentElement: Element | undefined;
  let currentExplicitTarget: EventTarget | undefined;
  let currentOwner: symbol | undefined;
  let currentEventName = "";
  let currentGuard: OnCustomEventGuard | undefined;
  let controller: AbortController | undefined;
  let unsubscribeHost: (() => void) | undefined;

  function syncHostSubscription() {
    unsubscribeHost?.();
    unsubscribeHost = undefined;

    if (!currentExplicitTarget && currentOwner) {
      unsubscribeHost = subscribeCustomEventsHost(currentOwner, listen);
    }
  }

  function listen() {
    controller?.abort();
    controller = undefined;
    let target =
      currentExplicitTarget ??
      (currentOwner
        ? getDefaultHostTarget(currentElement, currentOwner)
        : undefined);

    if (!currentElement || !target || !currentEventName) return;

    controller = new AbortController();
    let signal = controller.signal;
    target.addEventListener(
      currentEventName,
      (event) => {
        let element = currentElement;
        if (!shouldForwardToHost(event, element, currentGuard, signal)) return;
        element.dispatchEvent(cloneCustomEvent(event));
      },
      { signal },
    );
  }

  function mount(element: Element) {
    currentElement = element;
    syncHostSubscription();
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
    controller?.abort();
    controller = undefined;
    currentElement = undefined;
  });

  return (target, owner, eventName, guard) => {
    let needsListen =
      currentExplicitTarget !== target ||
      currentOwner !== owner ||
      currentEventName !== eventName ||
      currentGuard !== guard;

    currentExplicitTarget = target;
    currentOwner = owner;
    currentEventName = eventName;
    currentGuard = guard;

    if (needsListen) {
      syncHostSubscription();
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
  return function CustomEventsOnElement(
    handle: Handle<{
      guard?: OnCustomEventGuard;
      initial?: EventObject<Events> | Event;
      target?: EventTarget;
      render: (event: CustomEventsEvent<Events, Type>) => RemixNode;
    }>,
  ) {
    let eventName = getRuntimeEventName(runtime, type);
    let initialEvent = createInitialEvent(
      type,
      runtime.namespace,
      handle.props.initial ?? runtime.initial,
    );
    let currentGuardProp = handle.props.guard;
    let guard = createCustomEventsGuard(runtime, handle.props.guard);
    let hostElement: HTMLElement | undefined;
    let currentEvent: Event | undefined = initialEvent;
    let currentTarget: EventTarget | undefined;
    let controller: AbortController | undefined;
    let unsubscribeHost: (() => void) | undefined;

    function canRender(event: Event) {
      return event === initialEvent || ownsEvent(event, runtime.owner);
    }

    function isAllowedByHost(event: Event, signal: AbortSignal) {
      return !hostElement || guard(event, hostElement, signal) !== false;
    }

    function syncGuard() {
      if (currentGuardProp === handle.props.guard) return;
      currentGuardProp = handle.props.guard;
      guard = createCustomEventsGuard(runtime, handle.props.guard);
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
      if (
        currentEvent &&
        currentEvent !== initialEvent &&
        !isAllowedByHost(currentEvent, handle.signal)
      ) {
        currentEvent = undefined;
        void handle.update();
      }
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
          if (!isAllowedByHost(event, signal)) return;
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
      syncGuard();
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
 * Base class for a product event set used by a component, widget, or class.
 *
 * Extend it with your event-detail map, then create an instance wherever a
 * component or object owns an event stream. Instances work with native
 * `target.dispatchEvent(...)`, Remix `on(...)` mixins, and JSX render
 * components:
 *
 * - `events.submitted(detail)` creates one event
 * - `events.events({ submitted, paid })` creates several events from one action
 * - `events.listen(on(...))` lets elements react with DOM effects
 * - `<events.submitted render={...} />` renders from the latest event
 * - `events.host()` creates a local DOM boundary for repeated forms, rows, and
 *   widgets
 *
 * Sibling branches can react to each other by default, which is useful for
 * cohesive widgets such as a board, reset button, and status display. Put
 * `events.host()` on each repeated form or row when each instance should
 * stay independent, as in a todo list.
 *
 * `events.seedInitialEvent(...)` gives render components and latest-event memory
 * an initial value without firing listeners. Dispatch explicitly when a DOM
 * effect should run.
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
 *
 * @example
 * class CheckoutEvents extends CustomEvents<
 *   { submitted: { id: string } },
 *   "checkout"
 * > {}
 *
 * let checkoutEvents = new CheckoutEvents({ namespace: "checkout" });
 *
 * declare global {
 *   interface HTMLElementEventMap
 *     extends CheckoutEvents["__namespacedEventMap"] {}
 * }
 */
class CustomEventsBase<
  Events extends EventDetails,
  const Namespace extends string | undefined = undefined,
> {
  declare readonly __eventMap: CustomEventMap<Events>;
  declare readonly __namespacedEventMap: Namespace extends string
    ? NamespacedCustomEventTypes<Events, Namespace>
    : never;

  constructor(...args: CustomEventsConstructorArgs<Namespace>) {
    let options = args[0];
    let descriptor = createCustomEventsDescriptor<Events, Namespace>(
      options as CustomEventsOptions<Namespace> | undefined,
    );
    return descriptor as unknown as this;
  }
}

export type CustomEvents<
  Events extends EventDetails,
  Namespace extends string | undefined = undefined,
> = CustomEventsDescriptor<Events, Namespace>;

export const CustomEvents: CustomEventsConstructor =
  CustomEventsBase as unknown as CustomEventsConstructor;

function createCustomEventsDescriptor<
  Events extends EventDetails,
  const Namespace extends string | undefined = undefined,
>(
  options?: CustomEventsOptions<Namespace>,
): CustomEventsDescriptor<Events, Namespace> {
  let runtime: CustomEventsRuntime = {
    namespace: options?.namespace,
    owner: Symbol("customEvents.descriptor"),
  };

  function createCustomEvents<Source = unknown>(
    events: CustomEventsDispatchInput<Events>,
    init?: CustomEventsInit<Source>,
  ) {
    if (init?.signal?.aborted) {
      return new Event(CUSTOM_EVENTS_DISPATCH);
    }

    enableWindowTarget();
    return createCustomEventsDispatchEvent(
      events,
      init,
      runtime.namespace,
      runtime.owner,
    );
  }

  let eventMembers = new Map<
    string,
    CustomEventsOnMember<Events, CustomEventsEventType<Events>>
  >();

  function registerHost(target: EventTarget, signal?: AbortSignal) {
    if (signal?.aborted) return () => {};

    let cleanupHost: () => void;
    enableCustomEventsHost(target, runtime.namespace);
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
      cleanupHost();
    };
    signal?.addEventListener("abort", cleanup, { once: true });
    return cleanup;
  }

  function getEventMember(property: string) {
    let member = eventMembers.get(property);
    if (member) return member;

    let element = createCustomEventsOnElement(
      property as CustomEventsEventType<Events>,
      runtime,
    );
    member =
      property === CHANGE_EVENT_NAME
        ? (element as CustomEventsOnMember<
            Events,
            CustomEventsEventType<Events>
          >)
        : (function createEventMember(
            detailOrHandle?: unknown,
            init?: CustomEventsInit,
          ) {
            if (isRemixHandle(detailOrHandle)) {
              return element(detailOrHandle);
            }

            if (arguments.length === 0) {
              return createCustomEvents(
                { [property]: null } as EventObject<Events>,
                init,
              );
            }

            if (init === undefined && isCustomEventsInit(detailOrHandle)) {
              return createCustomEvents(
                { [property]: null } as EventObject<Events>,
                detailOrHandle,
              );
            }

            return createCustomEvents(
              { [property]: detailOrHandle } as CustomEventsDispatchEvents<Events>,
              init,
            );
          } as CustomEventsOnMember<Events, CustomEventsEventType<Events>>);
    eventMembers.set(property, member);
    return member;
  }

  let listenToOnDescriptors = ((
    ...args: Array<
      MixinDescriptor<Element, OnMixinArgs<string>> | CustomEventsListenOptions
    >
  ) => {
    let { descriptors, options } = getListenOptions(args);
    let guard = createCustomEventsGuard(runtime, options.guard);
    let mixins: Array<MixinDescriptor<Element, any>> = [];

    for (let descriptor of descriptors) {
      let type = getOnDescriptorType(descriptor);
      let eventName = getListenEventName(runtime, type);
      mixins.push(
        forwardTargetEventsMixin(
          options.target,
          runtime.owner,
          eventName,
          guard,
        ),
        adaptOnDescriptor(descriptor, eventName, runtime.owner),
      );
    }

    return mixins;
  }) as CustomEventsListenFunction<Events, Namespace>;

  let proxy: CustomEventsDescriptor<Events, Namespace>;
  let descriptor = {
    events: createCustomEvents,
    listen: listenToOnDescriptors,
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
  }) as unknown as CustomEventsDescriptor<Events, Namespace>;
  return proxy;
}
