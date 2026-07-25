import { addEventListeners, ref } from "remix/ui";
import { CHANGE_EVENT_NAME, CUSTOM_EVENTS_ABORTED } from "./constants.ts";
import { isElement } from "./dom.ts";
import { createProductCustomEvent } from "./events.ts";
import {
  addEventType,
  createCustomEventChangeDetail,
  getEventInit,
  getEventName,
  getCustomEventsDispatchEntries,
} from "./protocol.ts";
import {
  CustomEventsRuntime,
  windowBridge,
} from "./runtime.ts";
import { createCustomEventsEventElements, customEventsOnMixin } from "./remix.tsx";
import type {
  CustomEventsConstructorOptions,
  CustomEventsFactory,
  CustomEventsDescriptor,
  CustomEventsEventElements,
  CustomEventsEventType,
  CustomEventsHostListeners,
  CustomEventsInit,
  CustomEventsOnFunction,
  CustomEventsTypes,
  EventDetails,
} from "./types.ts";

// `on.someEvent` and `types.someEvent` are proxy-backed so event elements and
// low-level names remain type-shaped without duplicating runtime keys.
export function createCustomEventsDescriptor<Events extends EventDetails>(
  options?: CustomEventsConstructorOptions,
): CustomEventsDescriptor<Events> {
  let state = new CustomEventsRuntime();

  function createAbortedEvent() {
    return new Event(CUSTOM_EVENTS_ABORTED);
  }

  function createBatchChangeEvent(
    events:
      | Partial<Events>
      | readonly string[],
    init?: CustomEventsInit,
  ) {
    if (init?.signal?.aborted) {
      return createAbortedEvent();
    }

    if (Array.isArray(events) && new Set(events).size !== events.length) {
      throw new TypeError(
        'CustomEvents change arrays cannot contain duplicate event names.',
      );
    }
    let entries = Array.isArray(events)
      ? events.map((type) => [type, null] as [string, unknown])
      : getCustomEventsDispatchEntries(events as Partial<Events>);
    for (let [type] of entries) addDescriptorEventType(type);
    let detail = createCustomEventChangeDetail(entries);
    enableDescriptorEventType(CHANGE_EVENT_NAME);
    return createProductCustomEvent(
      state,
      CHANGE_EVENT_NAME,
      getEventInit(init),
      detail,
    );
  }

  function createGranularEvent(
    type: string,
    detail: unknown,
    init?: CustomEventsInit,
  ) {
    if (init?.signal?.aborted) return createAbortedEvent();

    enableDescriptorEventType(type);
    enableDescriptorEventType(CHANGE_EVENT_NAME);
    return createProductCustomEvent(
      state,
      type,
      getEventInit(init),
      detail,
    );
  }

  function addDescriptorEventType(type: string) {
    if (!state.eventTypes.has(type)) addEventType(state, type);
  }

  function enableDescriptorEventType(type: string) {
    addDescriptorEventType(type);
    windowBridge.enable(state, type);
  }

  let eventElements = new Map<
    string,
    CustomEventsEventElements<Events, CustomEventsEventType<Events>>
  >();

  function registerHost(target: EventTarget, signal?: AbortSignal) {
    if (signal?.aborted) return () => {};

    let cleanupHost: () => void;
    let cleanupDispatchTarget = state.registerDispatchTarget(target, {
      hosted: isElement(target),
    });
    if (isElement(target)) {
      state.addHost(target);
      cleanupHost = () => {
        state.removeHost(target);
      };
    } else {
      state.addRegisteredHost(target);
      cleanupHost = () => {
        state.removeRegisteredHost(target);
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

  function registerHostListeners(
    target: Element,
    signal: AbortSignal,
    listeners: CustomEventsHostListeners<Events>,
  ) {
    let mappedListeners: Record<
      string,
      (event: Event, reentry: AbortSignal) => void
    > = {};
    for (let [type, listener] of Object.entries(
      listeners as unknown as Record<
        string,
        (event: Event, signal: AbortSignal) => void | Promise<void>
      >,
    )) {
      if (!listener) continue;
      addDescriptorEventType(type);
      mappedListeners[getEventName(state, type)] = (event, reentry) => {
        if (!(event instanceof CustomEvent)) return;
        if (state.isProductEvent(event) || !state.ownsEvent(event)) return;
        listener(event as never, reentry);
      };
    }

    addEventListeners(target, signal, mappedListeners as never);
  }

  function getEventElements(property: string) {
    addDescriptorEventType(property);
    let elements = eventElements.get(property);
    if (elements) return elements;

    elements = createCustomEventsEventElements(
      property as CustomEventsEventType<Events>,
      state,
    );
    eventElements.set(property, elements);
    return elements;
  }

  let types = new Proxy(
    {},
    {
      get(_, property) {
        if (typeof property !== "string") return undefined;
        addDescriptorEventType(property);
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

      return getEventElements(property);
    },
  }) as CustomEventsOnFunction<Events>;

  let events = ((...args: Array<unknown>) => {
    let [typeOrEvents, detailOrInit, maybeInit] = args as [
      string | Partial<Events> | readonly string[],
      unknown?,
      CustomEventsInit?,
    ];
    if (typeof typeOrEvents === "string") {
      return createGranularEvent(
        typeOrEvents,
        args.length === 1 ? null : detailOrInit,
        maybeInit,
      );
    }

    return createBatchChangeEvent(
      typeOrEvents as
        | Partial<Events>
        | readonly string[],
      detailOrInit as CustomEventsInit | undefined,
    );
  }) as CustomEventsFactory<Events>;

  let descriptor = Object.assign(events, {
    map: undefined,
    on,
    types,
    host(listeners = {}) {
      return ref((target, signal) => {
        registerHost(target, signal);
        registerHostListeners(target, signal, listeners);
      });
    },
  });
  if (options?.host) {
    registerHost(options.host, options.signal);
  }

  return descriptor as unknown as CustomEventsDescriptor<Events>;
}
