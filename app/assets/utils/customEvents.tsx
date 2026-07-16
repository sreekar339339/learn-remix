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
  | "latest"
  | "target"
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

type CustomEventsInitial<Events extends EventDetails> =
  | {
      /**
       * Initial product event used by render components and latest-event
       * memory. Use the same object shape you pass to `events.events(...)`, or an
       * event object returned by `events.someEvent(...)`.
       */
      event: CustomEventsDispatchInput<Events> | Event;
      /**
       * When true, the initial event is dispatched once after the component's
       * listeners mount, so `events.listen(on(...))` reactions run for the initial
       * UI too.
       */
      dispatch?: boolean;
    }
  | {
      event?: undefined;
      dispatch?: false | undefined;
    };

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

type CustomEventsInstanceOptions<Events extends EventDetails> = {
  /**
   * Initial product event for this descriptor instance.
   */
  initial?: CustomEventsInitial<Events>;
  /**
   * Optional target to bind immediately.
   */
  target?: EventTarget;
};

type CustomEventsConstructorOptions<
  Events extends EventDetails,
  Namespace extends string | undefined,
  Target extends EventTarget | undefined,
> = Target extends EventTarget
  ? CustomEventsInstanceOptions<Events> &
      (Namespace extends string ? { namespace: Namespace } : {}) & {
        target: Target;
      }
  :
      | (CustomEventsInstanceOptions<Events> &
          (Namespace extends string
            ? { namespace: Namespace }
            : { namespace?: undefined }))
      | undefined;

type CustomEventsConstructorArgs<
  Events extends EventDetails,
  Namespace extends string | undefined,
  Target extends EventTarget | undefined,
> = Target extends EventTarget
  ? [options: CustomEventsConstructorOptions<Events, Namespace, Target>]
  : Namespace extends string
    ? [options: CustomEventsConstructorOptions<Events, Namespace, Target>]
    : [options?: CustomEventsConstructorOptions<Events, Namespace, Target>];

interface CustomEventsConstructor {
  new <
    Events extends EventDetails,
    const Namespace extends string | undefined = undefined,
    Target extends EventTarget | undefined = undefined,
  >(
    ...args: CustomEventsConstructorArgs<Events, Namespace, Target>
  ): CustomEventsDescriptor<Events, Namespace, Target>;
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
   * Prefer `events.initial` when the same initial event should be shared across
   * all render components for this event set.
   *
   * @example
   * <searchEvents.change initial={{ queryEmpty: null }} render={...} />
   *
   * @example
   * <searchEvents.change initial={searchEvents.queryEmpty()} render={...} />
   */
  initial?: EventObject<Events> | Event;
  /**
   * Explicit event target to observe. Most DOM components do not need this;
   * put `events.setHost()` on the nearest form, row, or widget root when the UI
   * needs a local event boundary.
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
   * Sibling branches can react to each other by default. Add
   * `events.setHost()` at a form, row, or widget root when that branch should
   * keep its events local.
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
 * other's events. Put `events.setHost()` on a form, row, or widget root when a
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
   * prefer `events.setHost()` on the closest product boundary.
   */
  target?: EventTarget;
};

type CustomEventsHostReference<Events extends EventDetails> = {
  readonly target: EventTarget | undefined;
  readonly latest:
    | {
        readonly event: ChangeEventDetailFromMap<Events>;
        readonly events: Partial<Events>;
      }
    | undefined;
};

type TargetBoundCustomEventsDescriptor<
  Events extends EventDetails,
  Namespace extends string | undefined,
  Target extends EventTarget,
> = {
  /**
   * The `EventTarget` this descriptor instance is bound to.
   *
   * This is useful for generic helpers and context-style objects. Product code
   * can still call `this.dispatchEvent(...)` or `target.dispatchEvent(...)`
   * directly when that is clearer.
   */
  readonly target: Target;
  /**
   * Latest event memory for this bound target.
   *
   * `latest.event` is the most recent `"change"` detail. `latest.events` is the
   * accumulated map of latest details for each product event.
   *
   * @example
   * let latestOrder = target.events.latest?.events.submitted;
   */
  readonly latest: CustomEventsHostReference<Events>["latest"];
};

type HostableCustomEventsDescriptor<
  Events extends EventDetails,
  Namespace extends string | undefined,
> = {
  /**
   * Makes a DOM element the local boundary for this event set.
   *
   * Use `setHost()` at the root of a widget when all branches inside should share
   * one event stream. Use it at each repeated form or row when each instance
   * should stay independent.
   *
   * The host owns the latest event memory used by `events.getHost(element)` and
   * gives all branches inside that element one local event stream.
   *
   * Without a host, `listen(...)` and render components observe the window
   * fallback. That is convenient for single widgets where sibling branches
   * should react to each other without passing a target around. Use `setHost()`
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
   * <section mix={gameEvents.setHost()}>
   *   <Board />
   *   <ResetButton />
   *   <gameEvents.turn render={({ detail }) => detail.nextPlayer} />
   * </section>
   *
   * @example
   * <form mix={todoEvents.setHost()}>
   *   <button mix={todoEvents.listen(on("change", updatePendingUi))} />
   * </form>
   *
   * @example
   * form.dispatchEvent(
   *   todoEvents.actionSubmitted(null, { composed: true }),
   * );
   */
  setHost(): MixinDescriptor<Element, []>;
  /**
   * Enables this event definition on an existing `EventTarget`.
   *
   * Use this when a `TypedEventTarget` subclass or plain `EventTarget` owns its
   * own event stream. For DOM component subtrees, prefer the mixin form:
   * `mix={events.setHost()}` on the nearest DOM boundary.
   *
   * The returned descriptor is bound to `target`: event components and
   * `listen(...)` use that target automatically, `.latest` reads that target's
   * latest memory, and `setHost`/`getHost` are intentionally not exposed.
   *
   * @example
   * class Drummer extends TypedEventTarget<DrummerEventMap> {
   *   events: ReturnType<typeof drummerEvents.setHost>;
   *
   *   constructor() {
   *     super();
   *     this.events = drummerEvents.setHost(this);
   *   }
   * }
   */
  setHost<Target extends EventTarget>(
    target: Target,
  ): CustomEventsDescriptor<Events, Namespace, Target>;

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
  Target extends EventTarget | undefined = undefined,
> = {
  /**
   * Creates an aggregate event object for the native `dispatchEvent(...)` API.
   *
   * Pass one key for a single product event, or several keys when one action
   * changes several product events at once. The browser dispatches a `"change"`
   * event for the whole action, then the individual product events.
   *
   * For DOM-hosted components, use `events.getHost(target).latest` before
   * dispatching when the next event depends on the latest details. For
   * target-bound descriptors created with `new Events({ target })`, read
   * `events.latest` directly.
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
   * Initial product event for this event set.
   *
   * Assign this in component setup when the initial UI depends on props, route
   * data, or other setup-scope values. Render components use it for their first
   * render, and `events.getHost(element).latest` can read it as the current
   * latest event state.
   *
   * Set `dispatch: true` when mounted `events.listen(on(...))` effects should
   * also run for the initial event. The dispatch happens after listener mixins
   * mount. Without a `setHost()` boundary it uses the window fallback; inside a
   * host it dispatches from that host.
   */
  initial?: CustomEventsInitial<Events>;

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
  (Target extends EventTarget
    ? TargetBoundCustomEventsDescriptor<Events, Namespace, Target>
    : HostableCustomEventsDescriptor<Events, Namespace>);

let enabledTargets = new WeakSet<EventTarget>();
let didEnableWindowTarget = false;
let customEventHosts = new WeakMap<Element, Map<symbol, number>>();
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
let customEventInitialDispatches = new WeakMap<EventTarget, Set<symbol>>();

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

function addCustomEventsHost(element: Element, owner: symbol) {
  let hosts = customEventHosts.get(element);
  if (!hosts) {
    hosts = new Map();
    customEventHosts.set(element, hosts);
  }
  hosts.set(owner, (hosts.get(owner) ?? 0) + 1);
  notifyCustomEventsHost(owner);
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
    notifyCustomEventsHost(owner);
  } else {
    hosts.set(owner, count - 1);
  }
}

function removeCustomEventsHostDetails(element: Element, owner: symbol) {
  let detailsByOwner = customEventDetails.get(element);
  if (detailsByOwner) {
    detailsByOwner.delete(owner);
    if (!detailsByOwner.size) {
      customEventDetails.delete(element);
    }
  }

  let changeDetailsByOwner = customEventChangeDetails.get(element);
  if (changeDetailsByOwner) {
    changeDetailsByOwner.delete(owner);
    if (!changeDetailsByOwner.size) {
      customEventChangeDetails.delete(element);
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
  let detailsTarget = getCustomEventsDetailsTarget(target, owner);
  let event = getCustomEventsChangeDetail(target, owner);
  let events = getCustomEventsDetails(target, owner);
  return {
    target: detailsTarget,
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

function claimInitialCustomEventsDispatch(target: EventTarget, owner: symbol) {
  let dispatches = customEventInitialDispatches.get(target);
  if (dispatches?.has(owner)) return false;

  if (!dispatches) {
    dispatches = new Set();
    customEventInitialDispatches.set(target, dispatches);
  }
  dispatches.add(owner);
  return true;
}

function dispatchInitialCustomEvents(
  runtime: CustomEventsRuntime,
  target: EventTarget,
) {
  let event = createInitialDispatchEvent(runtime);
  if (!event) return;
  if (!claimInitialCustomEventsDispatch(target, runtime.owner)) return;

  enableCustomEventsDispatchTarget(target, runtime.namespace);
  target.dispatchEvent(event);
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

function getInitialCustomEventsDispatch(
  runtime: CustomEventsRuntime,
) {
  if (!runtime.initial?.event) return undefined;

  let initial = runtime.initial.event;
  if (
    !initial ||
    (typeof initial !== "object" && typeof initial !== "function")
  ) {
    return undefined;
  }

  if (initial instanceof CustomEvent) {
    if (initial.type !== CUSTOM_EVENTS_DISPATCH) return undefined;

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

  return {
    events: initial,
    namespace: runtime.namespace,
    owner: runtime.owner,
  };
}

function createInitialDispatchEvent(runtime: CustomEventsRuntime) {
  if (!runtime.initial?.dispatch) return undefined;

  let detail = getInitialCustomEventsDispatch(runtime);
  if (!detail) return undefined;

  return createCustomEventsDispatchEvent(
    detail.events,
    detail.init,
    detail.namespace,
    detail.owner,
  );
}

function getInitialEventEntries(
  target: EventTarget | undefined,
  runtime: CustomEventsRuntime,
) {
  if (!runtime.initial?.event) return undefined;

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

const initialDispatchMixin = createMixin<
  Element,
  [runtime: CustomEventsRuntime, target: EventTarget | undefined]
>((handle) => {
  let currentRuntime: CustomEventsRuntime | undefined;
  let currentTarget: EventTarget | undefined;
  let didQueue = false;
  let timeout: ReturnType<typeof setTimeout> | undefined;

  function scheduleDispatch() {
    if (didQueue) return;

    didQueue = true;
    handle.queueTask((element, signal) => {
      if (!currentRuntime || signal.aborted) return;

      if (!currentTarget && findCustomEventsHost(element, currentRuntime.owner)) {
        didQueue = false;
        return;
      }

      let runtime = currentRuntime;
      let target =
        currentTarget ??
        (typeof window === "undefined" ? undefined : window);
      if (!target) {
        didQueue = false;
        return;
      }

      // Wait one task so every mixin in the component subtree has installed
      // its event listeners before the initial event is dispatched.
      timeout = setTimeout(() => {
        didQueue = false;
        timeout = undefined;
        if (signal.aborted || currentRuntime !== runtime) return;
        dispatchInitialCustomEvents(runtime, target);
      }, 0);
    });
  }

  handle.addEventListener("insert", scheduleDispatch);
  handle.addEventListener("reclaimed", scheduleDispatch);
  handle.addEventListener("remove", () => {
    didQueue = false;
    if (timeout) {
      clearTimeout(timeout);
      timeout = undefined;
    }
  });

  return (runtime, target) => {
    currentRuntime = runtime;
    currentTarget = target;
    scheduleDispatch();
    return handle.element;
  };
});

const customEventsHostMixin = createMixin<
  Element,
  [runtime: CustomEventsRuntime]
>((handle) => {
  let currentElement: Element | undefined;
  let currentRuntime: CustomEventsRuntime | undefined;
  let isRegistered = false;
  let didQueueInitialDispatch = false;

  function scheduleInitialDispatch() {
    if (didQueueInitialDispatch) return;

    didQueueInitialDispatch = true;
    handle.queueTask((element, signal) => {
      didQueueInitialDispatch = false;
      if (!currentRuntime || currentElement !== element || signal.aborted) {
        return;
      }

      dispatchInitialCustomEvents(currentRuntime, element);
    });
  }

  function mount(
    element: Element,
    runtime: CustomEventsRuntime | undefined,
  ) {
    if (isRegistered && currentElement && currentRuntime) {
      removeCustomEventsHost(currentElement, currentRuntime.owner);
      isRegistered = false;
    }

    currentElement = element;
    currentRuntime = runtime;
    if (!runtime) return;

    addCustomEventsHost(element, runtime.owner);
    isRegistered = true;
    seedInitialCustomEventsDetails(element, runtime);
    enableCustomEventsHost(element, runtime.namespace);
    scheduleInitialDispatch();
  }

  handle.addEventListener("insert", (event) => {
    mount(event.node, currentRuntime);
  });
  handle.addEventListener("reclaimed", (event) => {
    mount(event.node, currentRuntime);
  });
  handle.addEventListener("remove", () => {
    if (isRegistered && currentElement && currentRuntime) {
      removeCustomEventsHost(currentElement, currentRuntime.owner);
    }
    isRegistered = false;
    currentElement = undefined;
    didQueueInitialDispatch = false;
  });

  return (runtime) => {
    currentRuntime = runtime;
    if (currentElement) {
      if (isRegistered) {
        seedInitialCustomEventsDetails(currentElement, runtime);
        scheduleInitialDispatch();
      } else {
        mount(currentElement, runtime);
      }
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
      handle.props.initial ?? runtime.initial?.event,
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

function getBoundInitialCustomEvents(
  target: EventTarget,
  owner: symbol,
  type: string,
) {
  let events = getCustomEventsDetails(target, owner);
  if (!Object.keys(events).length) return undefined;

  if (type === CHANGE_EVENT_NAME) return events;
  if (!Object.hasOwn(events, type)) return undefined;

  return { [type]: events[type] };
}

function createTargetBoundCustomEvents<
  Events extends EventDetails,
  Namespace extends string | undefined,
  Target extends EventTarget,
>(
  descriptor: CustomEventsDescriptor<Events, Namespace>,
  target: Target,
  runtime: CustomEventsRuntime,
) {
  return new Proxy(descriptor, {
    get(base, property, receiver) {
      if (property === "target") {
        return target;
      }

      if (property === "latest") {
        return getCustomEventsHostReference(target, runtime.owner).latest;
      }

      if (property === "setHost" || property === "getHost") {
        return undefined;
      }

      let value = Reflect.get(base, property, receiver);

      if (property === "listen" && typeof value === "function") {
        let listen = value as (...args: Array<unknown>) => unknown;
        return (...args: Array<unknown>) => {
          let last = args[args.length - 1];
          if (isListenOptions(last)) {
            return listen(
              ...args.slice(0, -1),
              { target, ...last },
            );
          }
          return listen(...args, { target });
        };
      }

      if (
        typeof property !== "string" ||
        Reflect.has(base, property) ||
        typeof value !== "function"
      ) {
        return value;
      }

      return (first: unknown, ...rest: Array<unknown>) => {
        let member = value as (...args: Array<unknown>) => unknown;
        if (!isRemixHandle(first)) return member(first, ...rest);

        let handle = Object.create(first) as Handle<any>;
        Object.defineProperty(handle, "props", {
          get() {
            return {
              ...first.props,
              target: first.props.target ?? target,
              initial:
                first.props.initial ??
                getBoundInitialCustomEvents(target, runtime.owner, property),
            };
          },
        });
        return member(handle);
      };
    },
    has(base, property) {
      if (
        property === "target" ||
        property === "latest" ||
        property === "setHost" ||
        property === "getHost"
      ) {
        return property === "target" || property === "latest";
      }
      return property in base;
    },
    ownKeys(base) {
      return [...Reflect.ownKeys(base).filter(
        (property) => property !== "setHost" && property !== "getHost",
      ), "target", "latest"];
    },
    getOwnPropertyDescriptor(base, property) {
      if (property === "target") {
        return {
          configurable: true,
          enumerable: true,
          value: target,
        };
      }
      if (property === "latest") {
        return {
          configurable: true,
          enumerable: true,
          get() {
            return getCustomEventsHostReference(target, runtime.owner).latest;
          },
        };
      }
      if (property === "setHost" || property === "getHost") {
        return undefined;
      }
      return Reflect.getOwnPropertyDescriptor(base, property);
    },
  }) as unknown as CustomEventsDescriptor<Events, Namespace, Target>;
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
 * - `events.setHost()` creates a local boundary for repeated forms, rows, and
 *   widgets
 *
 * Sibling branches can react to each other by default, which is useful for
 * cohesive widgets such as a board, reset button, and status display. Put
 * `events.setHost()` on each repeated form or row when each instance should
 * stay independent, as in a todo list.
 *
 * `initial.dispatch: true` dispatches the initial event after listener mixins
 * mount. Without a host it uses the window fallback; with a host it dispatches
 * from the host.
 *
 * @example
 * class GameEvents extends CustomEvents<{
 *   turn: { nextPlayer: "X" | "O" };
 * }> {}
 *
 * let gameEvents = new GameEvents();
 *
 * <section mix={gameEvents.setHost()}>
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
  Target extends EventTarget | undefined = undefined,
> {
  declare readonly __eventMap: CustomEventMap<Events>;
  declare readonly __namespacedEventMap: Namespace extends string
    ? NamespacedCustomEventTypes<Events, Namespace>
    : never;

  constructor(...args: CustomEventsConstructorArgs<Events, Namespace, Target>) {
    let options = args[0];
    let descriptor = createCustomEventsDescriptor<Events, Namespace>(
      options as CustomEventsOptions<Namespace> | undefined,
    );
    descriptor.initial = options?.initial;
    if (options?.target) {
      return descriptor.setHost(options.target) as unknown as this;
    }
    return descriptor as unknown as this;
  }
}

export type CustomEvents<
  Events extends EventDetails,
  Namespace extends string | undefined = undefined,
  Target extends EventTarget | undefined = undefined,
> = CustomEventsDescriptor<Events, Namespace, Target>;

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

    mixins.push(initialDispatchMixin(runtime, options.target));

    return mixins;
  }) as CustomEventsListenFunction<Events, Namespace>;

  let proxy: CustomEventsDescriptor<Events, Namespace>;
  let descriptor = {
    events: createCustomEvents,
    listen: listenToOnDescriptors,
    setHost(target?: EventTarget) {
      if (!target) {
        return customEventsHostMixin(runtime);
      }

      seedInitialCustomEventsDetails(target, runtime);
      enableCustomEventsHost(target, runtime.namespace);
      if (isElement(target)) {
        addCustomEventsHost(target, runtime.owner);
      }
      return createTargetBoundCustomEvents(proxy, target, runtime);
    },
    getHost(target: EventTarget) {
      return getCustomEventsHostReference(
        target,
        runtime.owner,
      ) as CustomEventsHostReference<Events>;
    },
  };
  Object.defineProperty(descriptor, "initial", {
    configurable: true,
    enumerable: true,
    get() {
      return runtime.initial;
    },
    set(initial: CustomEventsInitial<Events> | undefined) {
      runtime.initial = initial as CustomEventsInitial<EventDetails> | undefined;
      seedInitialCustomEventsDescriptorDetails(runtime);
    },
  });

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
