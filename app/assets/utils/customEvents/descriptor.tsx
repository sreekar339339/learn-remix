import { ref } from "remix/ui";
import {
  createListenerEvent,
  type CustomEventsBatchRuntimeEntry,
  CustomEventsRuntime,
} from "./runtime.ts";
import {
  createCustomEventsEventElements,
  customEventsOnMixin,
} from "./remix.tsx";
import {
  type CustomEventsOptions,
  type CustomEventsBatchItem,
  type CustomEventsDispatch,
  type CustomEventsFactory,
  type CustomEventsDescriptor,
  type CustomEventsEventElements,
  type CustomEventsEventType,
  type CustomEventsInit,
  type CustomEventsOnFunction,
  type CustomEventsTargetListenerOptions,
  type CustomEventsTargetListeners,
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

function assertNonCancelable(init: object | undefined) {
  if (init && Object.hasOwn(init, "cancelable")) {
    throw new TypeError(
      "customEvents describe completed facts and cannot be cancelable.",
    );
  }
}

function getEventInit(init: CustomEventsInit | undefined): EventInit {
  assertNonCancelable(init);
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
    let seen = new Set<string>();
    return configuredEvents.map((configuredEvent) => {
      if (typeof configuredEvent === "string") {
        if (seen.has(configuredEvent)) {
          throw new TypeError(
            `customEvents batch event "${configuredEvent}" must be unique.`,
          );
        }
        seen.add(configuredEvent);
        return createEntry(configuredEvent, null);
      }

      let eventEntries = Object.entries(configuredEvent);
      if (eventEntries.length !== 1) {
        throw new TypeError(
          "Each configured customEvents batch entry must contain one event.",
        );
      }

      let [[type, configuration]] = eventEntries;
      if (seen.has(type)) {
        throw new TypeError(
          `customEvents batch event "${type}" must be unique.`,
        );
      }
      seen.add(type);

      let config = configuration as {
        detail?: unknown;
        options?: CustomEventsInit;
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

  type DirectTargetListener = (
    event: Event,
    signal: AbortSignal,
  ) => void | Promise<void>;

  function registerTargetListeners(
    target: EventTarget,
    listeners: ReadonlyMap<string, DirectTargetListener>,
    options?: CustomEventsTargetListenerOptions,
  ) {
    if (options?.signal?.aborted) return () => {};

    let reentries = new Set<AbortController>();
    function createInvoker(listener: DirectTargetListener) {
      let reentry: AbortController | undefined;
      return (event: CustomEvent) => {
        reentry?.abort();
        if (reentry) reentries.delete(reentry);
        reentry = new AbortController();
        reentries.add(reentry);

        return listener(createListenerEvent(event, target), reentry.signal);
      };
    }

    let invokers = new Map(
      [...listeners].map(([type, listener]) => {
        if (type !== ALL_EVENTS) runtime.addEventType(type);
        return [type, createInvoker(listener)] as const;
      }),
    );
    let unsubscribe = runtime.subscribeTarget(
      target,
      (event) => {
        let results = [
          invokers.get(event.type)?.(event),
          invokers.get(ALL_EVENTS)?.(event),
        ];
        return Promise.all(results);
      },
    );

    let active = true;
    let cleanup = () => {
      if (!active) return;
      active = false;
      options?.signal?.removeEventListener("abort", cleanup);
      unsubscribe();
      for (let reentry of reentries) reentry.abort();
      reentries.clear();
    };
    options?.signal?.addEventListener("abort", cleanup, { once: true });
    return cleanup;
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
    let explicitTarget = isEventTarget(args[0]);
    let usesDefaultHost = !explicitTarget && options?.host &&
      (isRecord(args[0]) || args.length >= 3);

    if (explicitTarget || usesDefaultHost) {
      let target = explicitTarget ? args[0] as EventTarget : options!.host!;
      let argumentOffset = explicitTarget ? 1 : 0;
      let selectorOrListeners = args[argumentOffset];
      let listeners = new Map<string, DirectTargetListener>();
      let listenerOptions: CustomEventsTargetListenerOptions | undefined;

      if (isRecord(selectorOrListeners)) {
        let listenerMap = selectorOrListeners as CustomEventsTargetListeners<
          Events,
          EventTarget
        >;
        for (let [type, listener] of Object.entries(listenerMap)) {
          if (!listener) continue;
          listeners.set(type, listener as DirectTargetListener);
        }
        listenerOptions = args[argumentOffset + 1] as
          | CustomEventsTargetListenerOptions
          | undefined;
      } else {
        let listener = args[argumentOffset + 1] as
          | DirectTargetListener
          | undefined;
        if (!listener) {
          throw new TypeError(
            "customEvents direct on() requires an event listener.",
          );
        }
        let selectedTypes = Array.isArray(selectorOrListeners)
          ? selectorOrListeners
          : [selectorOrListeners];
        for (let type of selectedTypes) {
          if (typeof type === "string") listeners.set(type, listener);
        }
        listenerOptions = args[argumentOffset + 2] as
          | CustomEventsTargetListenerOptions
          | undefined;
      }

      return registerTargetListeners(
        target,
        listeners,
        listenerOptions,
      );
    }

    let typeOrTypes = args[0] as
      | typeof ALL_EVENTS
      | CustomEventsEventType<Events>
      | readonly CustomEventsEventType<Events>[];
    let listener = args[1] as
      | ((event: Event, signal: AbortSignal) => void | Promise<void>)
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
      return createBatchEvent(entries);
    }

    let options = detailOrInit as CustomEventsInit | undefined;
    let details = Array.isArray(typeOrEvents)
      ? [...new Set(typeOrEvents)].map((type) => [type, null] as const)
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
