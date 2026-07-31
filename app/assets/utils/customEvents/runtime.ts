const ALL_EVENTS = "*";

type Phase = "projection" | "effect";

type DispatchTargetRegistration = {
  count: number;
  cleanup(): void;
};

type ElementSubscription = {
  element: Element;
  eventTypes: ReadonlySet<string> | null;
  phase: Phase;
  notify(event: CustomEvent): Promise<unknown> | void;
};

type IndexedSubscription = ElementSubscription & {
  routingId: string;
};

type RoutedSubscriptions = {
  all: Set<IndexedSubscription>;
  byId: Map<string, Set<IndexedSubscription>>;
};

type SubscriptionIndex = Record<
  Phase,
  Map<string, RoutedSubscriptions>
>;

export type CustomEventsBatchRuntimeEntry = {
  type: string;
  detail: unknown;
  init: EventInit;
  key?: PropertyKey;
};

type ProductEventMetadata = {
  entries: CustomEventsBatchRuntimeEntry[];
  completion?: Promise<void>;
};

type TransactionEvent = {
  event: CustomEvent;
  key?: PropertyKey;
};

function isElement(value: unknown): value is Element {
  return typeof Element !== "undefined" && value instanceof Element;
}

function setEventProperty(
  event: Event,
  property: PropertyKey,
  value: unknown,
) {
  Object.defineProperty(event, property, {
    configurable: true,
    value,
  });
}

function createRoutedSubscriptions(): RoutedSubscriptions {
  return {
    all: new Set(),
    byId: new Map(),
  };
}

function addToRoute(
  route: RoutedSubscriptions,
  subscription: IndexedSubscription,
) {
  route.all.add(subscription);
  let byId = route.byId.get(subscription.routingId);
  if (!byId) {
    byId = new Set();
    route.byId.set(subscription.routingId, byId);
  }
  byId.add(subscription);
}

function removeFromRoute(
  route: RoutedSubscriptions,
  subscription: IndexedSubscription,
) {
  route.all.delete(subscription);
  let byId = route.byId.get(subscription.routingId);
  byId?.delete(subscription);
  if (byId?.size === 0) route.byId.delete(subscription.routingId);
}

function* selectRoute(
  route: RoutedSubscriptions,
  key: PropertyKey | undefined,
) {
  if (key === undefined) {
    yield* route.all;
    return;
  }

  yield* route.byId.get("") ?? [];
  let routingId = String(key);
  if (routingId !== "") yield* route.byId.get(routingId) ?? [];
}

function ownCleanup(cleanup: () => void, signal?: AbortSignal) {
  let active = true;
  let dispose = () => {
    if (!active) return;
    active = false;
    signal?.removeEventListener("abort", dispose);
    cleanup();
  };
  if (signal?.aborted) dispose();
  else signal?.addEventListener("abort", dispose, { once: true });
  return dispose;
}

function createEventSnapshot(
  entry: CustomEventsBatchRuntimeEntry,
  target: EventTarget,
) {
  let event = new CustomEvent(entry.type, {
    ...entry.init,
    detail: entry.detail,
  });
  setEventProperty(event, "target", target);
  return event;
}

export function createListenerEvent(
  event: CustomEvent,
  currentTarget: EventTarget,
) {
  let listenerEvent = new CustomEvent(event.type, {
    bubbles: false,
    cancelable: event.cancelable,
    composed: event.composed,
    detail: event.detail,
  });
  setEventProperty(listenerEvent, "target", event.target);
  setEventProperty(listenerEvent, "currentTarget", currentTarget);
  return listenerEvent;
}

/**
 * Private mechanics owned by one descriptor.
 *
 * Product events are the only events dispatched through the DOM. Once one
 * reaches a local listener or explicit host, the runtime turns its entries into
 * in-memory snapshots and notifies indexed projections and effects.
 */
export class CustomEventsRuntime {
  #eventTypes = new Set<string>();
  #eventTypeListeners = new Set<(type: string) => void>();
  #eventMetadata = new WeakMap<Event, ProductEventMetadata>();
  #subscriptions: SubscriptionIndex = {
    projection: new Map(),
    effect: new Map(),
  };
  #targetSubscriptions = new WeakMap<
    EventTarget,
    Set<(event: CustomEvent) => unknown>
  >();
  #dispatchTargets = new WeakMap<EventTarget, DispatchTargetRegistration>();
  #hosts = new WeakMap<Element, number>();
  #defaultHost: EventTarget | undefined;

  addEventType(type: string) {
    if (this.#eventTypes.has(type)) return;
    this.#eventTypes.add(type);
    for (let listener of this.#eventTypeListeners) listener(type);
  }

  createProductEvent(
    carrierType: string,
    detail: unknown,
    init: EventInit,
    entries: CustomEventsBatchRuntimeEntry[],
  ) {
    this.addEventType(carrierType);
    let event = new CustomEvent(carrierType, { ...init, detail });
    if (detail === undefined) setEventProperty(event, "detail", undefined);
    this.#eventMetadata.set(event, { entries });
    return event;
  }

  dispatch(target: EventTarget, event: Event) {
    let metadata = this.#eventMetadata.get(event);
    target.dispatchEvent(event);
    return metadata?.completion ?? Promise.resolve();
  }

  subscribeElement(
    subscription: ElementSubscription,
    signal?: AbortSignal,
  ) {
    let indexed: IndexedSubscription = {
      ...subscription,
      routingId: subscription.element.id,
    };
    let phase = this.#subscriptions[subscription.phase];
    let selectors = subscription.eventTypes ?? [ALL_EVENTS];
    let routes: Array<[string, RoutedSubscriptions]> = [];

    for (let selector of selectors) {
      if (selector !== ALL_EVENTS) this.addEventType(selector);
      let route = phase.get(selector);
      if (!route) {
        route = createRoutedSubscriptions();
        phase.set(selector, route);
      }
      addToRoute(route, indexed);
      routes.push([selector, route]);
    }

    let unregisterTarget = this.#registerDispatchTarget(subscription.element);
    return ownCleanup(() => {
      unregisterTarget();
      for (let [selector, route] of routes) {
        removeFromRoute(route, indexed);
        if (route.all.size === 0) phase.delete(selector);
      }
    }, signal);
  }

  subscribeTarget(
    target: EventTarget,
    notify: (event: CustomEvent) => unknown,
    signal?: AbortSignal,
  ) {
    let subscriptions = this.#targetSubscriptions.get(target);
    if (!subscriptions) {
      subscriptions = new Set();
      this.#targetSubscriptions.set(target, subscriptions);
    }
    subscriptions.add(notify);
    let unregisterTarget = this.#registerDispatchTarget(target);

    return ownCleanup(() => {
      unregisterTarget();
      subscriptions.delete(notify);
      if (subscriptions.size === 0) this.#targetSubscriptions.delete(target);
    }, signal);
  }

  registerHost(target: EventTarget, signal?: AbortSignal) {
    let unregisterTarget = this.#registerDispatchTarget(target);

    if (isElement(target)) {
      this.#hosts.set(target, (this.#hosts.get(target) ?? 0) + 1);
      return ownCleanup(() => {
        unregisterTarget();
        let count = this.#hosts.get(target) ?? 0;
        if (count <= 1) this.#hosts.delete(target);
        else this.#hosts.set(target, count - 1);
      }, signal);
    }

    this.#defaultHost = target;
    return ownCleanup(() => {
      unregisterTarget();
      if (this.#defaultHost === target) this.#defaultHost = undefined;
    }, signal);
  }

  #findHost(element: Element | undefined) {
    for (
      let current = element;
      current;
      current = current.parentElement ?? undefined
    ) {
      if (this.#hosts.has(current)) return current;
    }
  }

  #scopeFor(element: Element | undefined) {
    return this.#findHost(element) ??
      (!isElement(this.#defaultHost) ? this.#defaultHost : undefined);
  }

  #matchesScope(
    subscription: IndexedSubscription,
    event: CustomEvent,
    originScope: EventTarget,
    originTarget: EventTarget,
  ) {
    if (
      !event.bubbles &&
      isElement(originTarget) &&
      subscription.element !== originTarget
    ) {
      return false;
    }

    let subscriptionScope =
      this.#scopeFor(subscription.element) ?? subscription.element;
    return subscriptionScope === originScope ||
      (
        event.composed &&
        isElement(subscriptionScope) &&
        isElement(originScope) &&
        subscriptionScope.contains(originScope)
      );
  }

  *#matchingSubscriptions(
    phase: Phase,
    transactionEvent: TransactionEvent,
  ) {
    let index = this.#subscriptions[phase];
    let wildcard = index.get(ALL_EVENTS);
    if (wildcard) yield* selectRoute(wildcard, transactionEvent.key);
    let typed = index.get(transactionEvent.event.type);
    if (typed) yield* selectRoute(typed, transactionEvent.key);
  }

  #notify(
    entries: CustomEventsBatchRuntimeEntry[],
    originScope: EventTarget,
    originTarget: EventTarget,
  ) {
    let events: TransactionEvent[] = entries.map((entry) => ({
      event: createEventSnapshot(entry, originTarget),
      ...(entry.key === undefined ? {} : { key: entry.key }),
    }));

    // Direct EventTarget subscriptions retain native synchronous invocation
    // timing. Their returned promises join transaction completion.
    let directResults: unknown[] = [];
    for (let notify of this.#targetSubscriptions.get(originTarget) ?? []) {
      for (let { event } of events) {
        try {
          directResults.push(notify(event));
        } catch (error) {
          directResults.push(Promise.reject(error));
        }
      }
    }

    // A transaction commits each projection once using its final match.
    let matches = new Map<IndexedSubscription, TransactionEvent>();
    for (let transactionEvent of events) {
      for (
        let subscription of this.#matchingSubscriptions(
          "projection",
          transactionEvent,
        )
      ) {
        if (
          this.#matchesScope(
            subscription,
            transactionEvent.event,
            originScope,
            originTarget,
          )
        ) {
          matches.set(subscription, transactionEvent);
        }
      }
    }

    let source: Array<[IndexedSubscription, TransactionEvent]> = [];
    let remaining: Array<[IndexedSubscription, TransactionEvent]> = [];
    for (let match of matches) {
      (match[0].element === originTarget ? source : remaining).push(match);
    }
    let commit = (selected: typeof source) =>
      Promise.all(
        selected.map(([subscription, match]) =>
          subscription.notify(match.event)
        ),
      );
    let projectionsCommitted = source.length
      ? commit(source).then(() => commit(remaining))
      : commit(remaining);

    let projectionsAndEffectsSettled = projectionsCommitted.then(() => {
      let effectResults: unknown[] = [];
      for (let transactionEvent of events) {
        for (
          let subscription of this.#matchingSubscriptions(
            "effect",
            transactionEvent,
          )
        ) {
          if (
            this.#matchesScope(
              subscription,
              transactionEvent.event,
              originScope,
              originTarget,
            )
          ) {
            try {
              effectResults.push(
                subscription.notify(transactionEvent.event),
              );
            } catch (error) {
              effectResults.push(Promise.reject(error));
            }
          }
        }
      }
      return Promise.all(effectResults);
    });

    return Promise.all([
      Promise.all(directResults),
      projectionsAndEffectsSettled,
    ]).then(() => {});
  }

  #process(event: Event, fallbackScope: EventTarget) {
    if (!(event instanceof CustomEvent)) return;
    let metadata = this.#eventMetadata.get(event);
    if (!metadata) return;
    this.#eventMetadata.delete(event);

    let originTarget = event.target;
    if (!originTarget) return;
    if (
      isElement(fallbackScope) &&
      this.#hosts.has(fallbackScope) &&
      event.composed !== true
    ) {
      event.stopPropagation();
    }

    let originScope = this.#scopeFor(
      isElement(originTarget) ? originTarget : undefined,
    ) ?? fallbackScope;
    try {
      metadata.completion = this.#notify(
        metadata.entries,
        originScope,
        originTarget,
      );
    } catch (error) {
      metadata.completion = Promise.reject(error);
    }
  }

  #registerDispatchTarget(target: EventTarget) {
    let existing = this.#dispatchTargets.get(target);
    if (existing) {
      existing.count += 1;
      return ownCleanup(() => this.#releaseDispatchTarget(target, existing));
    }

    let controller = new AbortController();
    let listenedTypes = new Set<string>();
    let listen = (type: string) => {
      if (listenedTypes.has(type)) return;
      listenedTypes.add(type);
      target.addEventListener(
        type,
        (event) => this.#process(event, target),
        { signal: controller.signal },
      );
    };
    this.#eventTypeListeners.add(listen);
    for (let type of this.#eventTypes) listen(type);

    let registration: DispatchTargetRegistration = {
      count: 1,
      cleanup: () => {
        this.#eventTypeListeners.delete(listen);
        controller.abort();
      },
    };
    this.#dispatchTargets.set(target, registration);

    return ownCleanup(() => this.#releaseDispatchTarget(target, registration));
  }

  #releaseDispatchTarget(
    target: EventTarget,
    registration: DispatchTargetRegistration,
  ) {
    registration.count -= 1;
    if (registration.count > 0) return;
    registration.cleanup();
    this.#dispatchTargets.delete(target);
  }
}
