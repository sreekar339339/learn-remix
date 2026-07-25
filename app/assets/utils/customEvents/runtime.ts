import {
  createCustomEventsOwnerId,
  CUSTOM_EVENTS_EVENT_PREFIX,
} from "./constants.ts";
import { defineEventValue, isElement } from "./dom.ts";
import { processCustomEventsEvent } from "./events.ts";
import { addEventListeners } from "remix/ui";
import {
  createCustomEventChangeDetail,
  getEventName,
  subscribeEventTypes,
} from "./protocol.ts";
import type {
  ChangeEventDetailFromMap,
  EventDetails,
} from "./types.ts";

type BridgedEvent = { source: Event; replay?: boolean };

type DispatchTargetRegistration = { count: number; cleanup: () => void };

type CustomEventsMemory = {
  change?: ChangeEventDetailFromMap<EventDetails>;
  eventMap: Partial<EventDetails>;
};

export type CustomEventsTransaction = {
  events: Map<string, CustomEvent>;
};

export function createCustomEventsTransaction(): CustomEventsTransaction {
  return { events: new Map() };
}

// Descriptor runtime
//
// Each descriptor instance owns its host registry, latest-event memory, event
// metadata, dispatch-target registrations, and listener notifications. Keeping
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
  #memory = new WeakMap<EventTarget, CustomEventsMemory>();
  #descriptorMemory: CustomEventsMemory | undefined;
  #listeners = new Set<() => void>();
  #dispatchTargetRegistrations = new WeakMap<
    EventTarget,
    DispatchTargetRegistration
  >();
  #ownedEvents = new WeakSet<Event>();
  #productEvents = new WeakSet<Event>();
  #processedProductEvents = new WeakSet<Event>();
  #bridgedEvents = new WeakMap<Event, BridgedEvent>();
  #originTargets = new WeakMap<Event, EventTarget>();
  #transactions = new WeakMap<Event, CustomEventsTransaction>();
  #notificationPending = false;

  ownsEvent(event: Event) {
    return this.#ownedEvents.has(event);
  }

  isProductEvent(event: Event) {
    return this.#productEvents.has(event);
  }

  claimProductEvent(event: Event) {
    if (!this.#productEvents.has(event)) return false;
    if (this.#processedProductEvents.has(event)) return false;
    this.#processedProductEvents.add(event);
    return true;
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
      product?: boolean;
      origin?: EventTarget;
    },
  ) {
    let event = new CustomEvent(type, { ...init, detail });
    this.#ownedEvents.add(event);

    if (metadata?.product) this.#productEvents.add(event);

    if (metadata?.origin) {
      this.#originTargets.set(event, metadata.origin);
      defineEventValue(event, "originTarget", metadata.origin, {
        enumerable: true,
      });
    }

    return event;
  }

  markBridgedEvent(event: Event, bridgedEvent: BridgedEvent) {
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

  setMemory(target: EventTarget | undefined, memory: CustomEventsMemory) {
    let memoryTarget = this.getMemoryTarget(target);
    if (!memoryTarget) {
      this.#descriptorMemory = memory;
      return;
    }

    this.#memory.set(memoryTarget, memory);
  }

  record(target: EventTarget | undefined, entries: Array<[string, unknown]>) {
    let changeDetail = createCustomEventChangeDetail(entries);
    let current = this.getMemory(target);
    let eventMap = current?.eventMap ?? {};
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
          processCustomEventsEvent(event, this);
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
  #listeners = new Map<string, CustomEventsWindowListener>();
  #finalizer =
    typeof FinalizationRegistry === "undefined"
      ? undefined
      : new FinalizationRegistry<string>((eventName) => {
          this.remove(eventName);
        });

  enable(descriptor: CustomEventsRuntime, type: string) {
    if (typeof window === "undefined") return;

    let eventName = getEventName(descriptor, type);
    if (this.#listeners.has(eventName)) return;

    let controller = new AbortController();
    let descriptorRef = new WeakRef(descriptor);
    this.#listeners.set(eventName, {
      controller,
      descriptor: descriptorRef,
    });
    this.#finalizer?.register(descriptor, eventName);

    addEventListeners(window, controller.signal, {
      [eventName]: (event: Event) => {
        if (!(event instanceof CustomEvent)) return;

        let listener = this.#listeners.get(eventName);
        let descriptor = listener?.descriptor.deref();
        if (!descriptor) {
          this.remove(eventName);
          return;
        }

        processCustomEventsEvent(event, descriptor);
      },
    } as never);
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
