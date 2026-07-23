import { createCustomEventsOwnerId } from "./constants.ts";
import { defineEventValue, isElement } from "./dom.ts";
import { processCustomEventsEvent } from "./events.ts";
import {
  createCustomEventChangeDetail,
  getEventName,
  getInitialEventEntries,
  subscribeEventTypes,
} from "./protocol.ts";
import type {
  CustomEventProductKind,
  CustomEventProductMetadata,
  CustomEventsBridgedEvent,
  CustomEventsDispatchTargetRegistration,
  CustomEventsMemory,
  CustomEventsTransaction,
  EventDetails,
} from "./types.ts";

// Descriptor runtime
//
// Each descriptor instance owns its host registry, latest-event memory, event
// metadata, dispatch-target registrations, and listener notifications. Keeping
// this state local means descriptors do not need an owner key inside every data
// structure.
export class CustomEventsRuntime {
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
      product?: {
        kind: CustomEventProductKind;
        resolveDetail?: boolean;
      };
      origin?: EventTarget;
    },
  ) {
    let event = new CustomEvent(type, { ...init, detail });
    this.#ownedEvents.add(event);

    if (metadata?.product) {
      this.#productEvents.set(event, {
        kind: metadata.product.kind,
        processed: false,
        resolveDetail: metadata.product.resolveDetail ?? false,
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

  markBridgedEvent(event: Event, bridgedEvent: CustomEventsBridgedEvent) {
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

  record(target: EventTarget | undefined, entries: Array<[string, unknown]>) {
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
