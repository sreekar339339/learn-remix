import { ref } from "remix/ui";
import {
  CUSTOM_EVENTS_ALL,
  CUSTOM_EVENTS_TRANSACTION,
} from "./constants.ts";
import { isElement, isEventTarget } from "./dom.ts";
import {
  createListenerEvent,
  CustomEventsRuntime,
} from "./runtime.ts";
import {
  createCustomEventsEventElements,
  customEventsOnMixin,
} from "./remix.tsx";
import type {
  CustomEventsOptions,
  CustomEventsBatchItem,
  CustomEventsFactory,
  CustomEventsDescriptor,
  CustomEventsEventElements,
  CustomEventsEventType,
  CustomEventsInit,
  CustomEventsOnFunction,
  CustomEventsTargetListenerOptions,
  CustomEventsTargetListeners,
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

function getEventInit(init: EventInit | undefined): EventInit {
  return {
    bubbles: init?.bubbles ?? true,
    cancelable: init?.cancelable ?? true,
    ...(init?.composed === undefined ? {} : { composed: init.composed }),
  };
}

function getDispatchEntries(events: Partial<EventDetails>) {
  return Object.entries(events).map(([type, detail]) => {
    if (type === CUSTOM_EVENTS_ALL) {
      throw new TypeError('customEvents reserves "*" for subscriptions.');
    }
    return [type, detail] as [string, unknown];
  });
}

// Event elements are proxy-backed so their type-shaped API does not require
// duplicating runtime keys.
export function createCustomEventsDescriptor<Events extends EventDetails>(
  options?: CustomEventsOptions,
): CustomEventsDescriptor<Events> {
  let state = new CustomEventsRuntime();

  function createBatchEvent(
    entries: Array<{
      type: string;
      detail: unknown;
      init: EventInit;
      key?: PropertyKey;
    }>,
    transactionOptions?: CustomEventsInit,
  ) {
    transactionOptions?.signal?.throwIfAborted();

    for (let { type } of entries) state.addEventType(type);
    return state.createProductEvent(
      CUSTOM_EVENTS_TRANSACTION,
      undefined,
      getEventInit(transactionOptions),
      entries,
    );
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
        return {
          type: configuredEvent,
          detail: null,
          init: getEventInit(undefined),
        };
      }

      let eventEntries = Object.entries(configuredEvent);
      if (eventEntries.length !== 1) {
        throw new TypeError(
          "Each configured customEvents batch entry must contain one event.",
        );
      }

      let [[type, configuration]] = eventEntries;
      if (type === CUSTOM_EVENTS_ALL) {
        throw new TypeError('customEvents reserves "*" for subscriptions.');
      }
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
      config.options?.signal?.throwIfAborted();
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
    init?.signal?.throwIfAborted();
    if (type === CUSTOM_EVENTS_ALL) {
      throw new TypeError('customEvents reserves "*" for subscriptions.');
    }

    let eventInit = getEventInit(init);
    return state.createProductEvent(
      type,
      detail,
      eventInit,
      [{
        type,
        detail,
        init: eventInit,
        ...(init?.key === undefined ? {} : { key: init.key }),
      }],
    );
  }

  let eventElements = new Map<
    string,
    CustomEventsEventElements<Events, CustomEventsEventType<Events>>
  >();

  function registerHost(target: EventTarget, signal?: AbortSignal) {
    if (signal?.aborted) return () => {};

    let cleanupHost: () => void;
    let cleanupDispatchTarget = state.registerDispatchTarget(
      target,
      isElement(target),
    );
    if (isElement(target)) {
      state.addHost(target);
      cleanupHost = () => {
        state.removeHost(target);
      };
    } else {
      state.setDefaultHost(target);
      cleanupHost = () => {
        state.setDefaultHost(undefined);
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

  type DirectTargetListener = (
    event: Event,
    signal: AbortSignal,
  ) => void | Promise<void>;

  function registerTargetListeners(
    target: EventTarget,
    namedListeners: ReadonlyMap<string, DirectTargetListener>,
    wildcardListener: DirectTargetListener | undefined,
    options?: CustomEventsTargetListenerOptions,
  ) {
    if (options?.signal?.aborted) return () => {};

    let reentries = new Set<AbortController>();
    let cleanupDispatchTarget = state.registerDispatchTarget(target);

    function createInvoker(listener: DirectTargetListener) {
      let reentry: AbortController | undefined;
      return (event: Event) => {
        if (!(event instanceof CustomEvent)) return;

        reentry?.abort();
        if (reentry) reentries.delete(reentry);
        reentry = new AbortController();
        reentries.add(reentry);

        void listener(createListenerEvent(event, target), reentry.signal);
      };
    }

    let invokers = new Map(
      [...namedListeners].map(([type, listener]) => {
        state.addEventType(type);
        return [type, createInvoker(listener)] as const;
      }),
    );
    let invokeWildcard = wildcardListener
      ? createInvoker(wildcardListener)
      : undefined;
    let unregisterSubscription = state.registerTargetSubscription({
      target,
      notify(event) {
        invokers.get(event.type)?.(event);
        invokeWildcard?.(event);
      },
    });

    let active = true;
    let cleanup = () => {
      if (!active) return;
      active = false;
      options?.signal?.removeEventListener("abort", cleanup);
      unregisterSubscription();
      for (let reentry of reentries) reentry.abort();
      reentries.clear();
      cleanupDispatchTarget();
    };
    options?.signal?.addEventListener("abort", cleanup, { once: true });
    return cleanup;
  }

  function getEventElements(property: string) {
    state.addEventType(property);
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
    for (let type of types) state.addEventType(type);
    elements = createCustomEventsEventElements(
      types as readonly CustomEventsEventType<Events>[],
      state,
    );
    eventElementGroups.set(key, elements);
    return elements;
  }

  let onFunction = ((...args: unknown[]) => {
    let explicitTarget = isEventTarget(args[0]);
    let usesDefaultHost = !explicitTarget && options?.host &&
      (
        (
          args[0] !== null &&
          typeof args[0] === "object" &&
          !Array.isArray(args[0])
        ) ||
        args.length >= 3
      );

    if (explicitTarget || usesDefaultHost) {
      let target = explicitTarget ? args[0] as EventTarget : options!.host!;
      let argumentOffset = explicitTarget ? 1 : 0;
      let selectorOrListeners = args[argumentOffset];
      let namedListeners = new Map<string, DirectTargetListener>();
      let wildcardListener: DirectTargetListener | undefined;
      let listenerOptions: CustomEventsTargetListenerOptions | undefined;

      if (
        selectorOrListeners &&
        typeof selectorOrListeners === "object" &&
        !Array.isArray(selectorOrListeners)
      ) {
        let listeners = selectorOrListeners as CustomEventsTargetListeners<
          Events,
          EventTarget
        >;
        for (let [type, listener] of Object.entries(listeners)) {
          if (!listener) continue;
          if (type === CUSTOM_EVENTS_ALL) {
            wildcardListener = listener as DirectTargetListener;
          } else {
            namedListeners.set(type, listener as DirectTargetListener);
          }
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
        if (selectorOrListeners === CUSTOM_EVENTS_ALL) {
          wildcardListener = listener;
        } else {
          let selectedTypes = Array.isArray(selectorOrListeners)
            ? selectorOrListeners
            : [selectorOrListeners];
          for (let type of selectedTypes) {
            if (typeof type === "string") namedListeners.set(type, listener);
          }
        }
        listenerOptions = args[argumentOffset + 2] as
          | CustomEventsTargetListenerOptions
          | undefined;
      }

      return registerTargetListeners(
        target,
        namedListeners,
        wildcardListener,
        listenerOptions,
      );
    }

    let typeOrTypes = args[0] as
      | typeof CUSTOM_EVENTS_ALL
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
      return createBatchEvent(entries);
    }

    let options = detailOrInit as CustomEventsInit | undefined;
    let details = Array.isArray(typeOrEvents)
      ? [...new Set(typeOrEvents)].map((type) =>
        [type, null] as [string, unknown]
      )
      : getDispatchEntries(typeOrEvents as Partial<Events>);
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

  let allEventElements = createCustomEventsEventElements<
    Events,
    CustomEventsEventType<Events>
  >(CUSTOM_EVENTS_ALL, state);
  let descriptorTarget = Object.assign(events, {
    on,
    host() {
      return ref((target, signal) => {
        registerHost(target, signal);
      });
    },
  });
  if (options?.host) {
    registerHost(options.host);
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
