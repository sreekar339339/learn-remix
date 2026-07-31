import { ref } from "remix/ui";
import {
  createCurrentTargetEvent,
  type CustomEventsBatchRuntimeEntry,
  CustomEventsRuntime,
} from "./runtime.ts";
import {
  createCustomEventsEventElements,
  customEventsOnMixin,
} from "./remix.tsx";
import {
  type CustomEventsOptions,
  type CustomEventsBatchEntryOptions,
  type CustomEventsBatchItem,
  type CustomEventsDispatch,
  type CustomEventsFactory,
  type CustomEventsDescriptor,
  type CustomEventsEventElements,
  type CustomEventsEventType,
  type CustomEventsInit,
  type CustomEventsObserveFunction,
  type CustomEventsObserverOptions,
  type CustomEventsOnFunction,
  type EventDetails,
} from "./types.ts";

const ALL_EVENTS = "*";
const CUSTOM_EVENTS_TRANSACTION = "$transaction";
const customEventsInitKeys = new Set([
  "bubbles",
  "composed",
  "key",
  "signal",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isCustomEventsInit(value: unknown): value is CustomEventsInit {
  if (!isRecord(value)) return false;
  if (!Object.keys(value).every((key) => customEventsInitKeys.has(key))) {
    return false;
  }
  return true;
}

function isEventTarget(value: unknown): value is EventTarget {
  return typeof EventTarget !== "undefined" && value instanceof EventTarget;
}

function getEventInit(init: CustomEventsInit | undefined): EventInit {
  if (init && Object.hasOwn(init, "cancelable")) {
    throw new TypeError(
      "customEvents describe completed facts and cannot be cancelable.",
    );
  }
  return {
    bubbles: init?.bubbles ?? true,
    cancelable: false,
    ...(init?.composed === undefined ? {} : { composed: init.composed }),
  };
}

// Event elements are proxy-backed so their type-shaped API does not require
// duplicating runtime keys.
export function createCustomEventsDescriptor<Events extends EventDetails>(
  options?: CustomEventsOptions,
): CustomEventsDescriptor<Events> {
  let runtime = new CustomEventsRuntime();

  function createBatchEvent(
    entries: CustomEventsBatchRuntimeEntry[],
    transactionOptions?: CustomEventsInit,
  ) {
    transactionOptions?.signal?.throwIfAborted();
    return runtime.createProductEvent(
      CUSTOM_EVENTS_TRANSACTION,
      undefined,
      getEventInit(transactionOptions),
      entries,
    );
  }

  function createEntry(
    type: string,
    detail: unknown,
    options?: CustomEventsInit,
  ): CustomEventsBatchRuntimeEntry {
    options?.signal?.throwIfAborted();
    if (type === ALL_EVENTS) {
      throw new TypeError('customEvents reserves "*" for subscriptions.');
    }
    runtime.addEventType(type);
    return {
      type,
      detail,
      init: getEventInit(options),
      ...(options?.key === undefined ? {} : { key: options.key }),
    };
  }

  function normalizeConfiguredBatch(
    configuredEvents: readonly CustomEventsBatchItem<Events>[],
  ) {
    return configuredEvents.map((configuredEvent) => {
      if (typeof configuredEvent === "string") {
        return createEntry(configuredEvent, null);
      }

      let eventEntries = Object.entries(configuredEvent);
      if (eventEntries.length !== 1) {
        throw new TypeError(
          "Each configured customEvents batch entry must contain one event.",
        );
      }

      let [[type, configuration]] = eventEntries;
      let config = configuration as {
        detail?: unknown;
        options?: CustomEventsBatchEntryOptions;
      };
      return createEntry(
        type,
        Object.hasOwn(config, "detail") ? config.detail : null,
        config.options,
      );
    });
  }

  function createGranularEvent(
    type: string,
    detail: unknown,
    init?: CustomEventsInit,
  ) {
    let entry = createEntry(type, detail, init);
    return runtime.createProductEvent(
      type,
      detail,
      entry.init,
      [entry],
    );
  }

  let eventElementGroups = new Map<
    string,
    CustomEventsEventElements<Events, CustomEventsEventType<Events>>
  >();

  function getEventElementGroup(types: readonly string[]) {
    let key = [...new Set(types)].sort().join("\u0000");
    let elements = eventElementGroups.get(key);
    if (elements) return elements;
    elements = createCustomEventsEventElements(
      types as readonly CustomEventsEventType<Events>[],
      runtime,
    );
    eventElementGroups.set(key, elements);
    return elements;
  }

  function getEventElements(type: string) {
    return getEventElementGroup([type]);
  }

  let onFunction = ((...args: unknown[]) => {
    let typeOrTypes = args[0] as
      | typeof ALL_EVENTS
      | CustomEventsEventType<Events>
      | readonly CustomEventsEventType<Events>[];
    let listener = args[1] as
      | ((event: Event) => void | Promise<unknown>)
      | undefined;
    if (Array.isArray(typeOrTypes) && listener === undefined) {
      return getEventElementGroup(typeOrTypes);
    }
    if (!listener) {
      throw new TypeError("customEvents on() requires an event listener.");
    }
    return customEventsOnMixin(
      runtime,
      typeOrTypes as string | readonly string[],
      listener,
    );
  }) as CustomEventsOnFunction<Events>;
  let on = new Proxy(onFunction, {
    get(target, property, receiver) {
      return typeof property === "string"
        ? getEventElements(property)
        : Reflect.get(target, property, receiver);
    },
  }) as CustomEventsOnFunction<Events>;

  let observe = ((...args: unknown[]) => {
    let explicitTarget = isEventTarget(args[0]);
    let target = explicitTarget ? args[0] as EventTarget : options?.host;
    if (!target) {
      throw new TypeError(
        "customEvents observe() requires a target or configured host.",
      );
    }
    let offset = explicitTarget ? 1 : 0;
    let observer = args[offset] as (event: Event) => void | Promise<unknown>;
    let observerOptions = args[offset + 1] as
      | CustomEventsObserverOptions
      | undefined;
    return runtime.observe(
      target,
      (event) => observer(createCurrentTargetEvent(event, target)),
      observerOptions?.signal,
    );
  }) as CustomEventsObserveFunction<Events>;

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
      return createBatchEvent(
        entries,
        detailOrInit as CustomEventsInit | undefined,
      );
    }

    let options = detailOrInit as CustomEventsInit | undefined;
    let details = Array.isArray(typeOrEvents)
      ? typeOrEvents.map((type) => [type, null] as const)
      : Object.entries(typeOrEvents as Partial<Events>);
    return createBatchEvent(
      details.map(([type, detail]) => createEntry(type, detail, options)),
      options,
    );
  }) as CustomEventsFactory<Events>;

  let allEventElements = createCustomEventsEventElements<
    Events,
    CustomEventsEventType<Events>
  >(ALL_EVENTS, runtime);
  let dispatch = ((
    target: EventTarget,
    ...args: unknown[]
  ) => {
    let createEvent = events as (...args: unknown[]) => Event;
    let event = createEvent(...args);
    return runtime.dispatch(target, event);
  }) as CustomEventsDispatch<Events>;
  let descriptorTarget = Object.assign(events, {
    dispatch,
    on,
    observe,
    host() {
      return ref((target, signal) => {
        runtime.registerHost(target, signal);
      });
    },
  });
  if (options?.host) {
    runtime.registerHost(options.host);
  }

  return new Proxy(descriptorTarget, {
    get(target, property, receiver) {
      if (Reflect.has(target, property)) {
        return Reflect.get(target, property, receiver);
      }
      if (typeof property !== "string") return undefined;
      return allEventElements[property as keyof JSX.IntrinsicElements];
    },
  }) as unknown as CustomEventsDescriptor<Events>;
}
