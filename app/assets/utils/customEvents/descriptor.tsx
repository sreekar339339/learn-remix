import { ref } from "remix/ui";
import {
  ALL_EVENTS,
  canonicalAddressSegment,
  createCustomEventsRuntimeState,
  createCurrentTargetEvent,
  customEventsRuntime,
  type CustomEventsBatchRuntimeEntry,
  type CustomEventsRuntimeState,
} from "./runtime.ts";
import {
  createEventElementFactory,
  customEventsOnMixin,
} from "./remix.tsx";
import {
  type CustomEventsOptions,
  type CustomEventsBatchItem,
  type CustomEventsDispatch,
  type CustomEventsFactory,
  type CustomEventsDescriptor,
  type CustomEventsEventType,
  type CustomEventsInit,
  type CustomEventsObserveFunction,
  type CustomEventsObserverOptions,
  type CustomEventsOnFunction,
  type EventDetails,
} from "./types.ts";

const CUSTOM_EVENTS_TRANSACTION = "$transaction";
const customEventsInitKeys = new Set([
  "bubbles",
  "composed",
  "key",
  "signal",
]);

type InternalEntryOptions = CustomEventsInit & {
  addresses?: readonly (readonly unknown[])[];
};

type StateEventContext = {
  owner: object;
  sources: object;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isCustomEventsInit(value: unknown): value is CustomEventsInit {
  return isRecord(value) &&
    Object.keys(value).every((key) => customEventsInitKeys.has(key));
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
export function createCustomEventsDescriptor<
  Events extends EventDetails,
  State extends EventDetails | never = never,
>(
  options?: CustomEventsOptions,
  state?: StateEventContext,
): CustomEventsDescriptor<Events, State> {
  let runtime: CustomEventsRuntimeState | undefined;
  let getRuntime = () => runtime ??= createCustomEventsRuntimeState();

  function createEntry(
    type: string,
    detail: unknown,
    options?: InternalEntryOptions,
  ): CustomEventsBatchRuntimeEntry {
    options?.signal?.throwIfAborted();
    if (type === ALL_EVENTS) {
      throw new TypeError('customEvents reserves "*" for subscriptions.');
    }
    let addresses = options?.addresses ??
      (options?.key === undefined
        ? undefined
        : [[canonicalAddressSegment(options.key)]]);
    return {
      type,
      detail,
      ...(addresses === undefined ? {} : { addresses }),
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
        options?: InternalEntryOptions;
      };
      return createEntry(
        type,
        Object.hasOwn(config, "detail") ? config.detail : null,
        config.options,
      );
    });
  }

  let on = ((...args: unknown[]) => {
    let typeOrTypes = args[0] as
      | typeof ALL_EVENTS
      | CustomEventsEventType<Events>
      | readonly CustomEventsEventType<Events>[];
    let listener = args[1] as
      | ((event: Event) => void | Promise<unknown>)
      | undefined;
    if (!listener) {
      throw new TypeError("customEvents on() requires an event listener.");
    }
    return customEventsOnMixin(
      getRuntime(),
      typeOrTypes as string | readonly string[],
      listener,
    );
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
    return customEventsRuntime.observe(
      getRuntime(),
      target,
      (event) => observer(createCurrentTargetEvent(event, target)),
      observerOptions?.signal,
    );
  }) as CustomEventsObserveFunction<Events>;

  let events = ((...args: Array<unknown>) => {
    let [typeOrEvents, detailOrInit, maybeInit] = args as [
      | string
      | readonly CustomEventsBatchItem<Events>[],
      unknown?,
      CustomEventsInit?,
    ];
    if (typeof typeOrEvents === "string") {
      let isOptionsOnly =
        args.length === 2 && isCustomEventsInit(detailOrInit);
      let detail = args.length === 1 || isOptionsOnly ? null : detailOrInit;
      let init = isOptionsOnly
        ? detailOrInit as CustomEventsInit
        : maybeInit;
      let entry = createEntry(typeOrEvents, detail, init);
      return customEventsRuntime.createProductEvent(
        getRuntime(),
        typeOrEvents,
        detail,
        getEventInit(init),
        [entry],
      );
    }

    if (Array.isArray(typeOrEvents)) {
      let entries = normalizeConfiguredBatch(
        typeOrEvents as readonly CustomEventsBatchItem<Events>[],
      );
      let init = detailOrInit as CustomEventsInit | undefined;
      init?.signal?.throwIfAborted();
      return customEventsRuntime.createProductEvent(
        getRuntime(),
        CUSTOM_EVENTS_TRANSACTION,
        undefined,
        getEventInit(init),
        entries,
      );
    }

    throw new TypeError("customEvents expects an event name or event array.");
  }) as CustomEventsFactory<Events>;

  let eventElement:
    | ReturnType<typeof createEventElementFactory<Events, State>>
    | undefined;
  let getEventElement = () => eventElement ??= createEventElementFactory<
    Events,
    State
  >(getRuntime(), state?.owner, state?.sources);
  let dispatch = ((
    target: EventTarget,
    ...args: unknown[]
  ) => {
    let createEvent = events as (...args: unknown[]) => Event;
    let event = createEvent(...args);
    return customEventsRuntime.dispatch(getRuntime(), target, event);
  }) as CustomEventsDispatch<Events>;
  let host = ref((target, signal) => {
    customEventsRuntime.registerHost(getRuntime(), target, signal);
  });
  let descriptorTarget = Object.assign(events, {
    dispatch,
    on,
    observe,
    host,
  });
  if (options?.host) {
    customEventsRuntime.registerHost(getRuntime(), options.host);
  }

  return new Proxy(descriptorTarget, {
    get(target, property, receiver) {
      if (Reflect.has(target, property)) {
        return Reflect.get(target, property, receiver);
      }
      if (typeof property !== "string") return undefined;
      return getEventElement()(property as keyof JSX.IntrinsicElements);
    },
  }) as unknown as CustomEventsDescriptor<Events, State>;
}
