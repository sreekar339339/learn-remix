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
  CustomEventsBatchItem,
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

const customEventsInitKeys = new Set([
  "bubbles",
  "cancelable",
  "composed",
  "key",
  "signal",
]);

function isCustomEventsInit(value: unknown): value is CustomEventsInit {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.keys(value).every((key) => customEventsInitKeys.has(key));
}

// `on.someEvent` and `types.someEvent` are proxy-backed so event elements and
// low-level names remain type-shaped without duplicating runtime keys.
export function createCustomEventsDescriptor<Events extends EventDetails>(
  options?: CustomEventsConstructorOptions,
): CustomEventsDescriptor<Events> {
  let state = new CustomEventsRuntime();

  function createAbortedEvent() {
    return new Event(CUSTOM_EVENTS_ABORTED);
  }

  function createBatchEvent(
    entries: Array<{
      type: string;
      detail: unknown;
      init: EventInit;
      key?: PropertyKey;
    }>,
    aggregateOptions?: CustomEventsInit,
  ) {
    if (aggregateOptions?.signal?.aborted) {
      return createAbortedEvent();
    }

    for (let { type } of entries) addDescriptorEventType(type);
    enableDescriptorEventType(CHANGE_EVENT_NAME);
    let event = createProductCustomEvent(
      state,
      CHANGE_EVENT_NAME,
      getEventInit(aggregateOptions),
      createCustomEventChangeDetail(
        entries.map(({ type, detail }) => [type, detail]),
      ),
      aggregateOptions?.key,
    );
    state.markProductBatchEntries(event, entries);
    return event;
  }

  function normalizeConfiguredBatch(
    configuredEvents: readonly CustomEventsBatchItem<Events>[],
  ) {
    let seen = new Set<string>();
    return configuredEvents.map((configuredEvent) => {
      if (typeof configuredEvent === "string") {
        if (seen.has(configuredEvent)) {
          throw new TypeError(
            `CustomEvents batch event "${configuredEvent}" must be unique.`,
          );
        }
        seen.add(configuredEvent);
        return {
          type: configuredEvent,
          detail: null,
          init: getEventInit(undefined),
        };
      }

      let eventEntries = Object.entries(configuredEvent);
      if (eventEntries.length !== 1) {
        throw new TypeError(
          "Each configured CustomEvents batch entry must contain one event.",
        );
      }

      let [[type, configuration]] = eventEntries;
      if (type === CHANGE_EVENT_NAME) {
        throw new TypeError('CustomEvents does not dispatch "change" directly.');
      }
      if (seen.has(type)) {
        throw new TypeError(
          `CustomEvents batch event "${type}" must be unique.`,
        );
      }
      seen.add(type);

      let config = configuration as {
        detail?: unknown;
        options?: CustomEventsInit;
      };
      if (config.options?.signal?.aborted) return null;
      return {
        type,
        detail: Object.hasOwn(config, "detail") ? config.detail : null,
        init: getEventInit(config.options),
        ...(config.options?.key === undefined
          ? {}
          : { key: config.options.key }),
      };
    });
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
      init?.key,
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
      [property as CustomEventsEventType<Events>],
      state,
    );
    eventElements.set(property, elements);
    return elements;
  }

  let eventElementGroups = new Map<
    string,
    CustomEventsEventElements<Events, CustomEventsEventType<Events>>
  >();

  function getEventElementGroup(types: readonly string[]) {
    let key = [...new Set(types)].sort().join("\u0000");
    let elements = eventElementGroups.get(key);
    if (elements) return elements;
    for (let type of types) addDescriptorEventType(type);
    elements = createCustomEventsEventElements(
      types as readonly CustomEventsEventType<Events>[],
      state,
    );
    eventElementGroups.set(key, elements);
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
    typeOrTypes:
      | CustomEventsEventType<Events>
      | readonly CustomEventsEventType<Events>[],
    listener?: (event: Event, signal: AbortSignal) => void | Promise<void>,
  ) => {
    if (Array.isArray(typeOrTypes) && listener === undefined) {
      return getEventElementGroup(typeOrTypes);
    }
    if (!listener) {
      throw new TypeError("CustomEvents on() requires an event listener.");
    }
    return customEventsOnMixin(
      state,
      typeOrTypes as string | readonly string[],
      listener,
    );
  }) as CustomEventsOnFunction<Events>;
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
      | string
      | Partial<Events>
      | readonly string[]
      | readonly CustomEventsBatchItem<Events>[],
      unknown?,
      CustomEventsInit?,
    ];
    if (typeof typeOrEvents === "string") {
      let isOptionsOnly =
        args.length === 2 && isCustomEventsInit(detailOrInit);
      return createGranularEvent(
        typeOrEvents,
        args.length === 1 || isOptionsOnly ? null : detailOrInit,
        isOptionsOnly ? (detailOrInit as CustomEventsInit) : maybeInit,
      );
    }

    if (
      Array.isArray(typeOrEvents) &&
      typeOrEvents.some((entry) => typeof entry !== "string")
    ) {
      let entries = normalizeConfiguredBatch(
        typeOrEvents as readonly CustomEventsBatchItem<Events>[],
      );
      if (entries.some((entry) => entry === null)) return createAbortedEvent();
      return createBatchEvent(entries.filter((entry) => entry !== null));
    }

    let options = detailOrInit as CustomEventsInit | undefined;
    let details = Array.isArray(typeOrEvents)
      ? [...new Set(typeOrEvents)].map((type) =>
        [type, null] as [string, unknown]
      )
      : getCustomEventsDispatchEntries(typeOrEvents as Partial<Events>);
    return createBatchEvent(
      details.map(([type, detail]) => ({
        type,
        detail,
        init: getEventInit(options),
        ...(options?.key === undefined ? {} : { key: options.key }),
      })),
      options,
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
