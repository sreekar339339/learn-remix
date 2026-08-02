import { ref } from "remix/ui";
import {
  ALL_EVENTS,
  canonicalAddressSegment,
  createCustomEventsRuntimeState,
  customEventsRuntime,
  type CustomEventsBatchRuntimeEntry,
  type CustomEventsRuntimeState,
} from "./runtime.ts";
import {
  createEventElementFactory,
  customEventsOnMixin,
} from "./remix.tsx";
import { createEventSource } from "./eventSources.ts";
import {
  type CustomEventsOptions,
  type CustomEventsBatchItem,
  type CustomEventsDispatch,
  type CustomEventsFactory,
  type CustomEventsDescriptor,
  type CustomEventsInit,
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
  getState(): EventDetails;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isCustomEventsInit(value: unknown): value is CustomEventsInit {
  return isRecord(value) &&
    Object.keys(value).every((key) => customEventsInitKeys.has(key));
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

export function createCustomEventsDescriptor<
  Events extends EventDetails,
  State extends EventDetails | never = never,
>(
  options?: CustomEventsOptions,
  state?: StateEventContext,
): CustomEventsDescriptor<Events, State> {
  let runtime: CustomEventsRuntimeState | undefined;
  let getRuntime = () => runtime ??= createCustomEventsRuntimeState();
  let sourceOwner = state?.owner ?? {};

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
    let listener = args[0] as
      | ((event: Event) => void | Promise<unknown>)
      | undefined;
    if (!listener) {
      throw new TypeError("customEvents on() requires an event listener.");
    }
    return customEventsOnMixin(
      getRuntime(),
      undefined,
      listener,
    );
  }) as CustomEventsOnFunction<Events>;

  let create = ((...args: Array<unknown>) => {
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

  let eventElements:
    | ReturnType<typeof createEventElementFactory<Events, State>>
    | undefined;
  let getEventElements = () => eventElements ??= createEventElementFactory<
    Events,
    State
  >(getRuntime(), sourceOwner);
  let view = new Proxy(Object.create(null), {
    get(_, property) {
      if (typeof property !== "string") return undefined;
      return getEventElements()(property as keyof JSX.IntrinsicElements);
    },
  });
  let dispatch = ((
    target: EventTarget,
    ...args: unknown[]
  ) => {
    let createEvent = create as (...args: unknown[]) => Event;
    let event = createEvent(...args);
    return customEventsRuntime.dispatch(getRuntime(), target, event);
  }) as CustomEventsDispatch<Events>;
  let host = ref((target, signal) => {
    customEventsRuntime.registerHost(getRuntime(), target, signal);
  });
  let descriptorTarget = Object.assign(Object.create(null), {
    create,
    dispatch,
    on,
    host,
    view,
  });
  if (options?.host) {
    customEventsRuntime.registerHost(getRuntime(), options.host);
  }

  let sources = new Map<string, object>();
  return new Proxy(descriptorTarget, {
    get(target, property, receiver) {
      if (Reflect.has(target, property)) {
        return Reflect.get(target, property, receiver);
      }
      if (typeof property !== "string") return undefined;
      let source = sources.get(property);
      if (!source) {
        let readRoot = state && Object.hasOwn(state.getState(), property)
          ? () => state.getState()[property]
          : undefined;
        source = createEventSource(
          sourceOwner,
          property,
          readRoot,
          (metadata, listener) =>
            customEventsOnMixin(getRuntime(), metadata, listener),
        );
        sources.set(property, source);
      }
      return source;
    },
  }) as unknown as CustomEventsDescriptor<Events, State>;
}
