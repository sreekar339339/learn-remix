import { ref } from "remix/ui";
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
  CustomEventsDescriptor,
  CustomEventsEventComponent,
  CustomEventsEventFactories,
  CustomEventsEventType,
  CustomEventsHostReference,
  CustomEventsInit,
  CustomEventsOnFunction,
  CustomEventsTypes,
  EventDetails,
} from "./types.ts";

// CustomEvents instances are proxy-backed descriptors. Root property access
// creates event factory members lazily, while `on.someEvent` creates render
// components lazily. `types` exposes stable event-name strings for low-level
// interop. The proxy keeps the public API type-shaped without requiring users to
// duplicate event names at runtime.
export function createCustomEventsDescriptor<Events extends EventDetails>(
  options?: CustomEventsConstructorOptions,
): CustomEventsDescriptor<Events> {
  let state = new CustomEventsRuntime();

  function createAbortedEvent() {
    return new Event(CUSTOM_EVENTS_ABORTED);
  }

  function createBatchChangeEvent(
    events: Partial<Events> | ((latest: unknown) => Partial<Events>),
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
      let entries = resolveCustomEventsDispatchEntries(events);
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

  let eventMembers = new Map<
    string,
    CustomEventsEventFactories<Events>[CustomEventsEventType<Events>]
  >();
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

  function getEventMember(property: string) {
    addEventType(state, property);
    let member = eventMembers.get(property);
    if (member) return member;

    member =
      property === CHANGE_EVENT_NAME
        ? (function createChangeMember(
            events?: Partial<Events>,
            init?: CustomEventsInit,
          ) {
            return createBatchChangeEvent(events ?? {}, init);
          } as CustomEventsEventFactories<Events>[CustomEventsEventType<Events>])
        : (function createEventMember(
            detail?: unknown,
            init?: CustomEventsInit,
          ) {
            if (arguments.length === 0) {
              return createGranularEvent(property, null, init);
            }

            return createGranularEvent(property, detail, init);
          } as CustomEventsEventFactories<Events>[CustomEventsEventType<Events>]);
    eventMembers.set(property, member);
    return member;
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

  let descriptor = {
    map: undefined,
    on,
    types,
    seed(event: Event) {
      state.initial = event;
      state.seedInitialDescriptorMemory();
      state.seedInitialRegisteredHosts();
      state.notifySoon();
    },
    setHost(target: EventTarget, signal?: AbortSignal) {
      return registerHost(target, signal);
    },
    host() {
      return ref((target, signal) => registerHost(target, signal));
    },
    getHost(target: EventTarget) {
      return state.getReference(target) as CustomEventsHostReference<Events>;
    },
  };
  let proxy = new Proxy(descriptor, {
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

  if (options?.host) {
    registerHost(options.host, options.signal);
  }

  return proxy;
}
