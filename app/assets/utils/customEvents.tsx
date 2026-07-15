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
  | "host"
  | "initial"
  | "eventMap"
  | "namespacedEventMap"
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
  readonly __customEventMapNamespacedKeyError: "CustomEventMap event maps cannot define namespaced event keys. Use customEvents({ namespace }) for namespaced DOM/global events.";
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
 * Options for events created by `customEvents(...)`.
 *
 * These include the standard `EventInit` flags plus product-level metadata.
 * Pass `signal` to avoid notifying stale UI after work has been aborted, and
 * `source` when listeners need to know the product object that started the
 * event.
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
type CustomEventsEventDetailBuilder<
  Events extends EventDetails,
  Detail,
> = (details: Partial<Events>) => Detail;
type CustomEventsDispatchEvents<Events extends EventDetails> = {
  [K in keyof Events]?: Events[K];
};
type CustomEventsDispatchBuilder<Events extends EventDetails> = (
  details: Partial<Events>,
) => CustomEventsDispatchEvents<Events>;
type CustomEventsDispatchInput<Events extends EventDetails> =
  | CustomEventsDispatchEvents<Events>
  | CustomEventsDispatchBuilder<Events>;

type CustomEventsRuntime = {
  namespace: string | undefined;
  owner: symbol;
  initial?: CustomEventsInitial<EventDetails>;
};

type CustomEventsInitial<Events extends EventDetails> =
  | {
      /** Initial product event used by descriptor render components. */
      event: CustomEventsDispatchInput<Events> | Event;
      /**
       * When true, the nearest `host()` boundary dispatches this event once
       * after mount. Without a host boundary, it is dispatched once on
       * `window`.
       */
      dispatch?: boolean;
    }
  | {
      event?: undefined;
      dispatch?: false | undefined;
    };

type CustomEventsOptions<Namespace extends string | undefined = undefined> = {
  /**
   * Optional DOM/global event namespace. Product code still uses local event
   * names through `events.listen(on("name", ...))` and `<events.name />`.
   */
  namespace?: Namespace;
};

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
   * By default, every event from the same `customEvents()` definition is
   * allowed. That makes sibling branches in one component easy to coordinate.
   * Return `false` when this render component should ignore an event, such as
   * when a row or form should only react to its own work.
   */
  guard?: OnCustomEventGuard;
  /**
   * Initial event object used only for the first render. It does not dispatch
   * and therefore does not run `.listen(...)` side effects.
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
   * place `events.host()` on the nearest form, row, or widget root when the
   * UI needs a local event boundary.
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
       * form.dispatchEvent(todoEvents.actionSubmitted({ signal }));
       */
      (init?: CustomEventsInit): Event;
      /**
       * Creates this event from the nearest host's latest event details.
       * Without a host, this uses the descriptor's shared latest details.
       *
       * @example
       * button.dispatchEvent(gameEvents.focus((details) => ({
       *   cellId: details.turn.nextCell,
       * })));
       */
      (
        detail: CustomEventsEventDetailBuilder<Events, Events[Type]>,
        init?: CustomEventsInit,
      ): Event;
    }
  : {}) & {
  /**
   * Creates this single product event for native `dispatchEvent(...)`.
   *
   * @example
   * form.dispatchEvent(todoEvents.actionSubmitted(null));
   *
   * @example
   * form.dispatchEvent(todoEvents.actionSubmitted({ signal }));
   */
  <Detail extends Events[Type]>(
    detail: ExactEventDetail<Events[Type], Detail>,
    init?: CustomEventsInit,
  ): Event;
  /**
   * Creates this event from the nearest host's latest event details.
   * Without a host, this uses the descriptor's shared latest details.
   *
   * @example
   * button.dispatchEvent(gameEvents.turn((details) => ({
   *   position: new Map(details.turn.position),
   *   nextPlayer: details.turn.nextPlayer === "X" ? "O" : "X",
   * })));
   */
  (
    detail: CustomEventsEventDetailBuilder<Events, Events[Type]>,
    init?: CustomEventsInit,
  ): Event;
  /**
   * Renders the latest matching product event in JSX.
   *
   * Keep this as the final overload so Remix JSX infers component props
   * from this signature, while direct calls get event-detail completions.
   *
   * @example
   * <checkoutEvents.submitted render={({ detail }) => detail.id} />
   */
  (handle: Handle<CustomEventsRenderProps<Events, Type>>): () => RemixNode;
};

type CustomEventsOnDescriptor<Events extends EventDetails> = {
  /**
   * Event-aware render component and single-event creator for this custom
   * event.
   *
   * Use it when a piece of UI should be rendered from the latest event instead
   * of mirrored component state. Sibling branches can react to each other by
   * default. Add `events.host()` at the form, row, or widget root when that
   * branch should own an isolated event stream.
   *
   * In JavaScript call sites, the same property creates the event for
   * `dispatchEvent(...)`.
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
 * Use it for imperative UI reactions: add a pending class, disable a button,
 * focus an input, reset a form, or write a data attribute. Event names are the
 * product names from your event map, such as `"submitted"` or
 * `"actionSucceeded"`.
 *
 * By default, a listener can react to events from the same event set anywhere in
 * the component. Put `events.host()` on a form, row, or widget root when that
 * branch should keep its events to itself. If a hosted branch intentionally
 * dispatches with `{ composed: true }`, ancestor listeners can react too.
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
   * @example
   * mix={checkoutEvents.listen(
   *   on("submitted", handleSubmitted),
   *   on("paid", handlePaid),
   * )}
   *
   * Use this for DOM effects. Use `<events.someEvent render={...} />` when the
   * reaction should render children.
   *
   * Sibling branches can react to each other's events by default. A nearby
   * `events.host()` turns a form, row, or widget into an event boundary, so
   * listeners outside that boundary do not react unless the event is dispatched
   * with `{ composed: true }`. Use `guard` only when you need a custom product
   * rule that is not represented by the DOM boundary.
   */
  <HostElement extends Element>(
    descriptor: CustomEventsListenDescriptorFor<
      Events,
      Namespace,
      HostElement
    >,
    ...args: Array<
      | CustomEventsListenDescriptorFor<Events, Namespace, HostElement>
      | CustomEventsHostOnOptions
    >
  ): Array<MixinDescriptor<HostElement, any>>;
};

type CustomEventsHostOnOptions = {
  /**
   * Optional predicate for deciding whether the listener should react to an
   * event. Return `false` to ignore it.
   */
  guard?: OnCustomEventGuard;
  /**
   * Explicit event target to observe. Most DOM components should prefer
   * `events.host()` on the closest product boundary instead.
   */
  target?: EventTarget;
};

type HostedCustomEventsTarget<
  Events extends EventDetails,
  Namespace extends string | undefined,
  Target extends EventTarget,
> = Target &
  TypedEventTarget<
    CustomEventMap<Events> &
      (Namespace extends string
        ? NamespacedCustomEventTypes<Events, Namespace>
        : {})
  >;

type CustomEventsDescriptor<
  Events extends EventDetails,
  Namespace extends string | undefined,
> = {
  /**
   * Creates an event object for the native `dispatchEvent(...)` API.
   *
   * Pass one event for a single action, or several keys for one product change.
   * Listeners can react to the named events and to `"change"`.
   *
   * @example
   * button.dispatchEvent(checkoutEvents({ submitted: { id: "order-1" } }));
   *
   * @example
   * form.dispatchEvent(todoEvents({ actionSubmitted: null }));
   */
  <Source = unknown>(
    events: CustomEventsDispatchInput<Events>,
    init?: CustomEventsInit<Source>,
  ): Event;

  /**
   * Lets a DOM element react to this event set using Remix `on(...)`.
   *
   * This is for DOM effects such as toggling classes, disabling controls,
   * focusing elements, resetting forms, or writing attributes. Use the product
   * event names from your event map even when the event set is namespaced for
   * DOM typing.
   *
   * Sibling branches can react by default. Put `events.host()` on each repeated
   * form, row, or widget when each instance should handle only its own events.
   * If a parent should also react to a hosted event, dispatch that event with
   * `{ composed: true }`.
   *
   * @example
   * <button
   *   mix={checkoutEvents.listen(
   *     on("submitted", ({ detail, currentTarget }) => {
   *       currentTarget.dataset.orderId = detail.id;
   *     }),
   *   )}
   * />
   */
  listen: CustomEventsListenFunction<Events, Namespace>;

  /**
   * Descriptor-level initial event for event-render components and, when
   * explicitly requested, `.listen(...)` hosts.
   *
   * Assign this in component setup when the initial UI depends on props, route
   * data, or other values only available there. By default the event seeds
   * render components and the descriptor's shared event details memory. Set
   * `dispatch: true` when the component is intentionally event-modeled and the
   * initial event should run the same DOM effects as later product events.
   * A nearby `events.host()` dispatches it once for that boundary; without a
   * host, the descriptor dispatches it once on `window` so sibling branches can
   * react without each listener becoming its own producer.
   *
   * `dispatch: true` is only valid when `event` is defined. Component-level
   * `<events.change initial={...} />` props remain render-only and do not run
   * `.listen(...)` effects.
   *
   * @example
   * searchEvents.initial = {
   *   event: props.query
   *     ? searchEvents.querySubmitted({ query: props.query })
   *     : searchEvents.queryEmpty(),
   *   dispatch: true,
   * };
   */
  initial?: CustomEventsInitial<Events>;

  /**
   * Makes a DOM element the boundary for this event definition.
   *
   * Use `host()` at the root of a widget when all branches inside should share
   * one event stream. Use it at each repeated form or row when each instance
   * should stay independent.
   *
   * The host also owns the "latest details" used by event-detail builders like
   * `gameEvents.turn((details) => ...)`. Without a host, those builders use
   * descriptor-level shared details, which is convenient for singleton widgets
   * but is not isolated between repeated component instances.
   *
   * A host contains its events by default: listeners and render components
   * inside the host can react, while ancestors outside the host do not. This is
   * usually what product code wants for pending, success, error, and optimistic
   * UI owned by one form or row.
   *
   * When a parent should also observe the event, dispatch with
   * `{ composed: true }`. That keeps the local hosted UI working and also lets
   * the product event reach ancestors for page-level status, logging, analytics,
   * or coordination.
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
   *   todoEvents({ actionSubmitted: null }, { composed: true }),
   * );
   */
  host(): MixinDescriptor<Element, []>;
  /**
   * Enables this event definition on an existing `EventTarget`.
   *
   * Use this in `TypedEventTarget` subclasses when a class owns its own event
   * stream.
   *
   * @example
   * class Drummer extends TypedEventTarget<DrummerEventMap> {
   *   constructor() {
   *     super();
   *     drummerEvents.host(this);
   *   }
   * }
   */
  host<Target extends EventTarget>(
    target: Target,
  ): HostedCustomEventsTarget<Events, Namespace, Target>;

  /**
   * Local event map for class targets and product event details.
   *
   * @example
   * type GameEventMap = (typeof gameEvents)["eventMap"];
   */
  readonly eventMap: CustomEventMap<Events>;
  /**
   * Namespaced DOM event map for TypeScript DOM event-map augmentation.
   *
   * Only available when `customEvents({ namespace })` is used.
   *
   * @example
   * declare global {
   *   interface HTMLElementEventMap
   *     extends (typeof checkoutEvents)["namespacedEventMap"] {}
   * }
   */
  readonly namespacedEventMap: Namespace extends string
    ? NamespacedCustomEventTypes<Events, Namespace>
    : never;
} & CustomEventsOnDescriptor<Events>;

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
  } else {
    hosts.set(owner, count - 1);
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

function updateCustomEventsDetails(
  target: EventTarget | undefined,
  owner: symbol | undefined,
  entries: Array<[string, unknown]>,
) {
  if (!owner) return;

  let current = getCustomEventsDetails(target, owner);
  setCustomEventsDetails(target, owner, {
    ...current,
    ...Object.fromEntries(entries),
  });
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
  return () => listeners.delete(listener);
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
  let details = Object.fromEntries(entries);

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

function isCustomEventsBuilder(
  value: unknown,
): value is CustomEventsEventDetailBuilder<EventDetails, unknown> {
  return typeof value === "function";
}

function resolveCustomEventsDispatchEvents(
  target: EventTarget | undefined,
  owner: symbol | undefined,
  events: CustomEventsDispatchInput<EventDetails>,
) {
  if (!isCustomEventsBuilder(events)) return events;

  let details = owner ? getCustomEventsDetails(target, owner) : {};
  return events(details);
}

function resolveCustomEventsDispatchEntries(
  target: EventTarget | undefined,
  owner: symbol | undefined,
  events: CustomEventsDispatchInput<EventDetails>,
) {
  let resolvedEvents = resolveCustomEventsDispatchEvents(
    target,
    owner,
    events,
  );
  return Object.entries(resolvedEvents).map(([type, detail]) => [
    type,
    detail,
  ] satisfies [string, unknown]);
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

  let entries = resolveCustomEventsDispatchEntries(
    target,
    metadata.owner,
    events,
  );
  if (!entries.length) return true;

  if (entries.some(([type]) => type === CHANGE_EVENT_NAME)) {
    throw new TypeError('customEvents() does not dispatch "change" directly.');
  }

  updateCustomEventsDetails(target, metadata.owner, entries);

  let eventInit = getEventInit(init);
  let changeResult = dispatchSingleCustomEvent(
    target,
    getEventName(CHANGE_EVENT_NAME, namespace),
    eventInit,
    createCustomEventChangeDetail(entries, namespace),
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
  return resolveCustomEventsDispatchEntries(
    target,
    detail.owner,
    detail.events,
  );
}

function seedInitialCustomEventsDetails(
  target: EventTarget | undefined,
  runtime: CustomEventsRuntime,
) {
  let entries = getInitialEventEntries(target, runtime);
  if (!entries?.length) return;
  updateCustomEventsDetails(target, runtime.owner, entries);
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
    throw new TypeError("customEvents.listen() expects a Remix on() descriptor.");
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

function isListenOptions(value: unknown): value is CustomEventsHostOnOptions {
  return Boolean(value) && !isMixinDescriptor(value);
}

function getListenOptions(
  args: Array<MixinDescriptor<Element, OnMixinArgs<string>> | CustomEventsHostOnOptions>,
) {
  let options: CustomEventsHostOnOptions = {};
  let descriptors: Array<MixinDescriptor<Element, OnMixinArgs<string>>> = [];
  let last = args.at(-1);

  if (isListenOptions(last)) {
    options = last;
    descriptors = args.slice(0, -1).filter(isMixinDescriptor);
  } else {
    descriptors = args.filter(isMixinDescriptor);
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

const initialWindowDispatchMixin = createMixin<
  Element,
  [runtime: CustomEventsRuntime, target: EventTarget | undefined]
>((handle) => {
  let currentRuntime: CustomEventsRuntime | undefined;
  let currentTarget: EventTarget | undefined;
  let didQueue = false;

  function scheduleDispatch() {
    if (didQueue) return;

    didQueue = true;
    handle.queueTask((element, signal) => {
      didQueue = false;
      if (!currentRuntime || signal.aborted) return;

      if (!currentTarget && findCustomEventsHost(element, currentRuntime.owner)) {
        return;
      }

      let target =
        currentTarget ??
        (typeof window === "undefined" ? undefined : window);
      if (!target) return;

      dispatchInitialCustomEvents(currentRuntime, target);
    });
  }

  handle.addEventListener("insert", scheduleDispatch);
  handle.addEventListener("reclaimed", scheduleDispatch);
  handle.addEventListener("remove", () => {
    didQueue = false;
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

/**
 * Defines a product event set for a component, widget, or class.
 *
 * The returned function creates events for native `target.dispatchEvent(...)`.
 * It also gives you:
 *
 * - `events.listen(on(...))` for DOM side effects
 * - `<events.someEvent render={...} />` for event-driven rendering
 * - `events.host()` for form, row, or widget boundaries
 * - typed event maps for class targets and DOM augmentation
 *
 * Sibling branches can react to each other by default, which is useful for
 * cohesive widgets such as a game board with separate board, reset, and status
 * branches. Put `events.host()` on each repeated form or row when each instance
 * should stay independent, as in a todo list.
 *
 * @example
 * const gameEvents = customEvents<{
 *   turn: { nextPlayer: "X" | "O" };
 * }>();
 *
 * <section mix={gameEvents.host()}>
 *   <gameEvents.turn render={({ detail }) => detail.nextPlayer} />
 * </section>
 */
export function customEvents<Events extends EventDetails>(): CustomEventsDescriptor<
  Events,
  undefined
>;
export function customEvents<Events extends EventDetails>(
  options: CustomEventsOptions<undefined> & { namespace?: undefined },
): CustomEventsDescriptor<Events, undefined>;
export function customEvents<
  Events extends EventDetails,
  const Namespace extends string,
>(
  options: CustomEventsOptions<Namespace> & { namespace: Namespace },
): CustomEventsDescriptor<Events, Namespace>;
/**
 * Defines a namespaced product event set for DOM typing.
 *
 * Product code still uses local event names through
 * `events.listen(on("name", ...))` and `<events.name />`. The namespace is for
 * TypeScript DOM event-map augmentation and for places that listen to the raw
 * DOM event names directly.
 *
 * @example
 * const checkoutEvents = customEvents<{
 *   submitted: { id: string };
 * }, "checkout">({ namespace: "checkout" });
 *
 * declare global {
 *   interface HTMLElementEventMap
 *     extends (typeof checkoutEvents)["namespacedEventMap"] {}
 * }
 */
export function customEvents<
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

            if (isCustomEventsBuilder(detailOrHandle)) {
              return createCustomEvents(
                (details) =>
                  ({
                    [property]: detailOrHandle(details),
                  }) as CustomEventsDispatchEvents<Events>,
                init,
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
      MixinDescriptor<Element, OnMixinArgs<string>> | CustomEventsHostOnOptions
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

    mixins.push(initialWindowDispatchMixin(runtime, options.target));

    return mixins;
  }) as CustomEventsListenFunction<Events, Namespace>;

  let descriptor = Object.assign(createCustomEvents, {
    listen: listenToOnDescriptors,
    host(target?: EventTarget) {
      if (!target) {
        return customEventsHostMixin(runtime);
      }

      seedInitialCustomEventsDetails(target, runtime);
      enableCustomEventsHost(target, runtime.namespace);
      if (isElement(target)) {
        addCustomEventsHost(target, runtime.owner);
      }
      return target;
    },
  });
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

  return new Proxy(descriptor, {
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
}

export namespace customEvents {
  /**
   * Local custom-event map for a raw event detail map.
   *
   * Prefer `(typeof events)["eventMap"]` when you already have an event set.
   * Use this helper when only the detail-map type is available, such as when
   * typing a reusable class before creating an event set value.
   *
   * @example
   * type DrummerEventMap = customEvents.EventMap<{
   *   tempo: { tempoBpm: number };
   * }>;
   */
  export type EventMap<Events extends Record<string, unknown>> =
    CustomEventMap<Events>;
}
