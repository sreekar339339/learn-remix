import { addEventListeners, ref } from "remix/ui";
import { CHANGE_EVENT_NAME, CUSTOM_EVENTS_ABORTED } from "./constants.ts";
import { isElement } from "./dom.ts";
import { createProductCustomEvent } from "./events.ts";
import {
  addEventType,
  createCustomEventChangeDetail,
  getEventInit,
  getEventName,
  resolveCustomEventsDispatchEntries,
} from "./protocol.ts";
import {
  CustomEventsRuntime,
  windowBridge,
} from "./runtime.ts";
import { createCustomEventsEventComponent, customEventsOnMixin } from "./remix.tsx";
import type {
  CustomEventsConstructorOptions,
  CustomEventsCreateFunction,
  CustomEventsDescriptor,
  CustomEventsEventComponent,
  CustomEventsEventType,
  CustomEventsHostListeners,
  CustomEventsInit,
  CustomEventsOnFunction,
  CustomEventsTypes,
  EventDetails,
} from "./types.ts";

// `on.someEvent` and `types.someEvent` are proxy-backed so render components
// and low-level names remain type-shaped without duplicating runtime keys.
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
      | readonly string[]
      | ((latest: unknown) => Partial<Events>),
    init?: CustomEventsInit,
  ) {
    if (init?.signal?.aborted) {
      return createAbortedEvent();
    }

    let resolveDetail = typeof events === "function";
    let detail: unknown;
    if (typeof events === "function") {
      detail = events;
    } else {
      if (Array.isArray(events) && new Set(events).size !== events.length) {
        throw new TypeError(
          'CustomEvents change arrays cannot contain duplicate event names.',
        );
      }
      let entries = Array.isArray(events)
        ? events.map((type) => [type, null] as [string, unknown])
        : resolveCustomEventsDispatchEntries(events as Partial<Events>);
      for (let [type] of entries) addEventType(state, type);
      detail = createCustomEventChangeDetail(entries);
    }
    addEventType(state, CHANGE_EVENT_NAME);
    windowBridge.enable(state);
    return createProductCustomEvent(
      state,
      CHANGE_EVENT_NAME,
      getEventInit(init),
      detail,
      "change",
      { resolveDetail },
    );
  }

  function createGranularEvent(
    type: string,
    detail: unknown,
    init?: CustomEventsInit,
  ) {
    if (init?.signal?.aborted) return createAbortedEvent();

    addEventType(state, type);
    addEventType(state, CHANGE_EVENT_NAME);
    windowBridge.enable(state);
    return createProductCustomEvent(
      state,
      type,
      getEventInit(init),
      detail,
      "event",
      { resolveDetail: typeof detail === "function" },
    );
  }

  let renderComponents = new Map<
    string,
    CustomEventsEventComponent<Events, CustomEventsEventType<Events>>
  >();

  function registerHost(target: EventTarget, signal?: AbortSignal) {
    if (signal?.aborted) return () => {};

    let cleanupHost: () => void;
    let cleanupDispatchTarget = state.registerDispatchTarget(target, {
      hosted: isElement(target),
    });
    if (isElement(target)) {
      state.addHost(target);
      state.seedInitialMemory(target);
      cleanupHost = () => {
        state.removeHost(target);
      };
    } else {
      state.addRegisteredHost(target);
      state.seedInitialMemory(target);
      cleanupHost = () => {
        state.removeRegisteredHost(target);
        state.removeMemory(target);
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
      addEventType(state, type);
      mappedListeners[getEventName(state, type)] = (event, reentry) => {
        if (!(event instanceof CustomEvent)) return;
        if (state.getProductMetadata(event) || !state.ownsEvent(event)) return;
        listener(event as never, reentry);
      };
    }

    addEventListeners(target, signal, mappedListeners as never);
  }

  function getRenderComponent(property: string) {
    addEventType(state, property);
    let component = renderComponents.get(property);
    if (component) return component;

    component = createCustomEventsEventComponent(
      property as CustomEventsEventType<Events>,
      state,
    );
    renderComponents.set(property, component);
    return component;
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

      return getRenderComponent(property);
    },
  }) as CustomEventsOnFunction<Events>;

  let create = ((...args: Array<unknown>) => {
    let [typeOrEvents, detailOrInit, maybeInit] = args as [
      string | Partial<Events> | readonly string[] | Function,
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
        | readonly string[]
        | ((latest: unknown) => Partial<Events>),
      detailOrInit as CustomEventsInit | undefined,
    );
  }) as CustomEventsCreateFunction<Events>;

  let descriptor = {
    map: undefined,
    create,
    on,
    types,
    seed(event: Event) {
      state.initial = event;
      state.seedInitialDescriptorMemory();
      state.seedInitialRegisteredHosts();
      state.notifySoon();
    },
    host(listeners = {}) {
      return ref((target, signal) => {
        registerHost(target, signal);
        registerHostListeners(target, signal, listeners);
      });
    },
  };
  if (options?.host) {
    registerHost(options.host, options.signal);
  }

  return descriptor as unknown as CustomEventsDescriptor<Events>;
}
