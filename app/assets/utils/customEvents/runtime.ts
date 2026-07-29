import {
  createCustomEventsOwnerId,
  CUSTOM_EVENTS_EVENT_PREFIX,
} from "./constants.ts";
import { defineEventValue } from "./dom.ts";
import { processCustomEventsEvent } from "./events.ts";
import { addEventListeners } from "remix/ui";
import {
  getEventName,
  subscribeEventTypes,
} from "./protocol.ts";

type DispatchTargetRegistration = { count: number; cleanup: () => void };

type CustomEventsSubscription = {
  element: Element;
  eventNames: ReadonlySet<string>;
  phase: "projection" | "effect";
  notify(event: CustomEvent, committed?: () => void): boolean | void;
};

export type CustomEventsBatchRuntimeEntry = {
  type: string;
  detail: unknown;
  init: EventInit;
  key?: PropertyKey;
};

export type CustomEventsTransaction = {
  events: Map<string, CustomEvent>;
};

export function createCustomEventsTransaction(): CustomEventsTransaction {
  return { events: new Map() };
}

type CustomEventsEventMetadata = {
  product?: boolean;
  processed?: boolean;
  origin?: EventTarget;
  key?: PropertyKey;
  batchEntries?: CustomEventsBatchRuntimeEntry[];
};

// Descriptor runtime
//
// Each descriptor instance owns its host registry, event metadata,
// dispatch-target registrations, and listener notifications. Keeping
// this state local means descriptors do not need an owner key inside every data
// structure.
export class CustomEventsRuntime {
  readonly ownerId = createCustomEventsOwnerId();
  readonly eventPrefix = `${CUSTOM_EVENTS_EVENT_PREFIX}:${this.ownerId}:`;
  readonly eventTypes = new Set<string>();
  readonly eventNames = new Map<string, string>();
  readonly typeListeners = new Set<(type: string) => void>();

  #hosts = new WeakMap<Element, number>();
  #registeredHosts = new Set<WeakRef<EventTarget>>();
  #registeredHostCounts = new WeakMap<EventTarget, number>();
  #hostSubscribers = new Set<() => void>();
  #dispatchTargetRegistrations = new WeakMap<
    EventTarget,
    DispatchTargetRegistration
  >();
  #eventMetadata = new WeakMap<Event, CustomEventsEventMetadata>();
  #subscriptions = new Set<CustomEventsSubscription>();
  #notificationPending = false;

  ownsEvent(event: Event) {
    return this.#eventMetadata.has(event);
  }

  isProductEvent(event: Event) {
    return this.#eventMetadata.get(event)?.product === true;
  }

  claimProductEvent(event: Event) {
    let metadata = this.#eventMetadata.get(event);
    if (!metadata?.product || metadata.processed) return false;
    metadata.processed = true;
    return true;
  }

  getOriginTarget(event: Event) {
    return this.#eventMetadata.get(event)?.origin;
  }

  getEventKey(event: Event) {
    return this.#eventMetadata.get(event)?.key;
  }

  markProductBatchEntries(
    event: Event,
    entries: CustomEventsBatchRuntimeEntry[],
  ) {
    let metadata = this.#eventMetadata.get(event);
    if (metadata) metadata.batchEntries = entries;
  }

  getProductBatchEntries(event: Event) {
    return this.#eventMetadata.get(event)?.batchEntries;
  }

  createCustomEvent(
    type: string,
    init: EventInit,
    detail: unknown,
    metadata?: {
      product?: boolean;
      origin?: EventTarget;
      key?: PropertyKey;
    },
  ) {
    let event = new CustomEvent(type, { ...init, detail });
    let eventMetadata: CustomEventsEventMetadata = {
      ...(metadata?.product ? { product: true } : {}),
      ...(metadata?.origin ? { origin: metadata.origin } : {}),
      ...(metadata?.key === undefined ? {} : { key: metadata.key }),
    };
    this.#eventMetadata.set(event, eventMetadata);

    if (metadata?.origin) {
      defineEventValue(event, "originTarget", metadata.origin, {
        enumerable: true,
      });
    }

    if (metadata?.key !== undefined) {
      defineEventValue(event, "key", metadata.key, { enumerable: true });
    }

    return event;
  }

  registerSubscription(subscription: CustomEventsSubscription) {
    this.#subscriptions.add(subscription);
    return () => {
      this.#subscriptions.delete(subscription);
    };
  }

  #subscriptionScope(element: Element) {
    return this.getDefaultTarget(element);
  }

  #isInScope(
    subscription: CustomEventsSubscription,
    originScope: EventTarget,
    event: CustomEvent,
  ) {
    let subscriptionScope = this.#subscriptionScope(subscription.element);
    if (subscriptionScope === originScope) return true;
    if (!event.composed) return false;
    if (typeof window !== "undefined" && subscriptionScope === window) {
      return true;
    }
    return (
      subscriptionScope instanceof Element &&
      originScope instanceof Element &&
      subscriptionScope.contains(originScope)
    );
  }

  #matchesSubscription(
    subscription: CustomEventsSubscription,
    originScope: EventTarget,
    originTarget: EventTarget,
    event: CustomEvent,
  ) {
    if (!subscription.eventNames.has(event.type)) return false;
    if (
      !event.bubbles &&
      originTarget instanceof Element &&
      subscription.element !== originTarget
    ) {
      return false;
    }
    if (!this.#isInScope(subscription, originScope, event)) return false;

    let key = this.getEventKey(event);
    return (
      key === undefined ||
      subscription.element.id === "" ||
      subscription.element.id === String(key)
    );
  }

  notifyTransaction(
    transaction: CustomEventsTransaction,
    originScope: EventTarget,
    originTarget: EventTarget,
  ) {
    let events = [...transaction.events.values()];
    let projections = [...this.#subscriptions].filter(
      (subscription) => subscription.phase === "projection",
    );
    let pending = 0;
    let initializing = true;
    let effectsRun = false;

    let runEffects = () => {
      if (effectsRun || initializing || pending > 0) return;
      effectsRun = true;
      let effects = [...this.#subscriptions].filter(
        (subscription) => subscription.phase === "effect",
      );
      for (let event of events) {
        for (let subscription of effects) {
          if (
            this.#matchesSubscription(
              subscription,
              originScope,
              originTarget,
              event,
            )
          ) {
            subscription.notify(event);
          }
        }
      }
    };

    for (let event of events) {
      for (let subscription of projections) {
        if (
          !this.#matchesSubscription(
            subscription,
            originScope,
            originTarget,
            event,
          )
        ) {
          continue;
        }
        pending++;
        let committed = false;
        let commit = () => {
          if (committed) return;
          committed = true;
          pending--;
          runEffects();
        };
        if (subscription.notify(event, commit) !== true) commit();
      }
    }

    initializing = false;
    runEffects();
  }

  addRegisteredHost(target: EventTarget) {
    let count = this.#registeredHostCounts.get(target) ?? 0;
    this.#registeredHostCounts.set(target, count + 1);
    if (count > 0) return;

    let hosts = this.#registeredHosts;
    hosts.add(new WeakRef(target));
    this.notifyHostsSoon();
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
    this.notifyHostsSoon();
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
      this.removeRegisteredHost(element);
    } else {
      this.#hosts.set(element, count - 1);
    }
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
    let host = this.findHost(element);
    if (host) return host;

    let soleRegisteredHost = this.getSoleRegisteredHost();
    if (soleRegisteredHost && !(soleRegisteredHost instanceof Element)) {
      return soleRegisteredHost;
    }
    return typeof window === "undefined" ? undefined : window;
  }

  notifyHostsSoon() {
    if (this.#notificationPending) return;
    this.#notificationPending = true;
    queueMicrotask(() => {
      this.#notificationPending = false;
      for (let subscriber of this.#hostSubscribers) subscriber();
    });
  }

  subscribeHosts(subscriber: () => void) {
    this.#hostSubscribers.add(subscriber);
    return () => {
      this.#hostSubscribers.delete(subscriber);
    };
  }

  registerDispatchTarget(target: EventTarget, options?: { hosted?: boolean }) {
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

    let controller = new AbortController();
    let registeredTypes = new Set<string>();

    let listenType = (type: string) => {
      if (registeredTypes.has(type)) return;
      registeredTypes.add(type);
      addEventListeners(target, controller.signal, {
        [getEventName(this, type)]: (event: Event) => {
          if (!(event instanceof CustomEvent)) return;
          if (options?.hosted && event.composed !== true) {
            event.stopPropagation();
          }
          processCustomEventsEvent(
            event,
            this,
            this.getDefaultTarget(
              event.target instanceof Element ? event.target : undefined,
            ) ?? target,
          );
        },
      } as never);
    };

    let unsubscribeEventTypes = subscribeEventTypes(this, listenType);
    for (let type of this.eventTypes) listenType(type);

    registration = {
      count: 1,
      cleanup() {
        unsubscribeEventTypes();
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

// Product events often bubble to window so sibling branches can react without a
// shared EventTarget. Window listeners must not keep descriptor instances alive.
type CustomEventsWindowListener = {
  controller: AbortController;
  descriptor: WeakRef<CustomEventsRuntime>;
};

class WindowBridge {
  #windowListeners = new Map<string, CustomEventsWindowListener>();
  #finalizer =
    typeof FinalizationRegistry === "undefined"
      ? undefined
      : new FinalizationRegistry<string>((eventName) => {
          this.remove(eventName);
        });

  enable(descriptor: CustomEventsRuntime, type: string) {
    if (typeof window === "undefined") return;

    let eventName = getEventName(descriptor, type);
    if (this.#windowListeners.has(eventName)) return;

    let controller = new AbortController();
    let descriptorRef = new WeakRef(descriptor);
    this.#windowListeners.set(eventName, {
      controller,
      descriptor: descriptorRef,
    });
    this.#finalizer?.register(descriptor, eventName);

    addEventListeners(window, controller.signal, {
      [eventName]: (event: Event) => {
        if (!(event instanceof CustomEvent)) return;

        let listener = this.#windowListeners.get(eventName);
        let descriptor = listener?.descriptor.deref();
        if (!descriptor) {
          this.remove(eventName);
          return;
        }

        processCustomEventsEvent(event, descriptor, window);
      },
    } as never);
  }

  remove(eventName: string) {
    let listener = this.#windowListeners.get(eventName);
    if (!listener) return;
    listener.controller.abort();
    this.#windowListeners.delete(eventName);
  }

  has(eventName: string) {
    return this.#windowListeners.has(eventName);
  }

  expire(eventName: string) {
    let listener = this.#windowListeners.get(eventName);
    if (!listener) return false;
    listener.descriptor = {
      deref: () => undefined,
    } as WeakRef<CustomEventsRuntime>;
    return true;
  }

  count() {
    return this.#windowListeners.size;
  }
}

export const windowBridge = new WindowBridge();

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
