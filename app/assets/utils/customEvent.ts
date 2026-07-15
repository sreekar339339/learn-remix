import type { EventMap as RemixEventMap } from "remix/ui";
import {
  CHANGE_EVENT_NAME,
  createCustomEventChangeDetail,
} from "./customEventChange.ts";

export const CUSTOM_EVENT_OWNER = Symbol("customEvent.owner");
export const CUSTOM_EVENT_ORIGIN = Symbol("customEvent.origin");

type NamespacedCustomEventName<
  EventName extends string,
  namespace extends string,
> = `${namespace}:${EventName}`;

type CustomEventMapBase = Record<string, unknown>;

export type CustomEventWithSource<Detail, Source = unknown> =
  CustomEvent<Detail> & {
    originTarget?: EventTarget;
    source?: Source;
  };

type ChangeDetailName<
  EventName extends string,
  Namespace extends string | undefined,
> = Namespace extends string
  ? { name: NamespacedCustomEventName<EventName, Namespace> }
  : {};

type ChangeEventDetailFromMap<
  EventMap extends CustomEventMapBase,
  Namespace extends string | undefined = undefined,
> = {
  [K in keyof EventMap & string]: {
    type: K;
    detail: EventMap[K];
    details: Partial<EventMap>;
  } & ChangeDetailName<K, Namespace>;
}[keyof EventMap & string] | ({
  type: Array<keyof EventMap & string>;
  detail: Partial<EventMap>;
  details: Partial<EventMap>;
} & (
  Namespace extends string
    ? {
        name: Array<NamespacedCustomEventName<keyof EventMap & string, Namespace>>;
      }
    : {}
));

type CustomEventNamespace<EventName extends string> =
  EventName extends `${infer Head}:${infer Tail}`
    ? Tail extends `${string}:${string}`
      ? `${Head}:${CustomEventNamespace<Tail>}`
      : Head
    : never;

type CustomEventNamespaces<EventTypes extends object> = {
  [K in keyof EventTypes & string]: string extends K
    ? never
    : CustomEventNamespace<K>;
}[keyof EventTypes & string];

type DispatchCustomEventNamespace<Target extends EventTarget> =
  CustomEventNamespaces<CustomEventsOfTarget<Target>>;

type DispatchCustomEventNamespaceArg<Target extends EventTarget> =
  Target extends { __eventMap?: unknown }
    ? undefined
    : DispatchCustomEventNamespace<Target>;

export type DispatchCustomEventOptions<
  Target extends EventTarget = EventTarget,
  Namespace extends DispatchCustomEventNamespaceArg<Target> = DispatchCustomEventNamespaceArg<Target>,
  Source = unknown,
> = EventInit & {
  target: Target;
  signal: AbortSignal;
  source?: Source;
} & (
  [Namespace] extends [string]
    ? { namespace: Namespace }
    : { namespace?: never }
);

type DetailFor<EventTypes extends object, T extends keyof EventTypes & string> =
  EventTypes[T] extends CustomEvent<infer Detail> ? Detail : never;

type DispatchEventMap<
  Target extends EventTarget,
  Namespace extends DispatchCustomEventNamespaceArg<Target>,
  EventTypes extends object = CustomEventsOfTarget<Target>,
> = Namespace extends string
  ? {
      [K in keyof EventTypes & string as K extends NamespacedCustomEventName<
        infer EventName,
        Namespace
      >
        ? string extends K
          ? never
          : EventName extends typeof CHANGE_EVENT_NAME
            ? never
            : EventName
        : never]: DetailFor<EventTypes, K>;
    }
  : {
      [K in keyof EventTypes & string as string extends K
        ? never
        : K extends typeof CHANGE_EVENT_NAME
          ? never
          : K extends `${string}:${string}`
            ? never
            : K]: DetailFor<EventTypes, K>;
    };

export type DispatchCustomEventEvents<
  Target extends EventTarget,
  Namespace extends DispatchCustomEventNamespaceArg<Target> = DispatchCustomEventNamespaceArg<Target>,
> = Partial<DispatchEventMap<Target, Namespace>>;

export type DispatchCustomEventArgs<
  Target extends EventTarget,
  Namespace extends DispatchCustomEventNamespaceArg<Target> = DispatchCustomEventNamespaceArg<Target>,
> = [events: DispatchCustomEventEvents<Target, Namespace>];

export type DispatchCustomEvent<
  Target extends EventTarget,
  Namespace extends DispatchCustomEventNamespaceArg<Target> = DispatchCustomEventNamespaceArg<Target>,
> = (
  events: DispatchCustomEventEvents<Target, Namespace>
) => boolean;

type DispatchCustomEventCallArgs<
  Target extends EventTarget,
  Namespace extends DispatchCustomEventNamespaceArg<Target> = DispatchCustomEventNamespaceArg<Target>,
> = [
  options: DispatchCustomEventOptions<Target, Namespace>,
  events: DispatchCustomEventEvents<Target, Namespace>,
];

type DispatchCustomEventFunction = {
  <
    Target extends EventTarget,
    Namespace extends DispatchCustomEventNamespaceArg<Target> = DispatchCustomEventNamespaceArg<Target>,
  >(
    ...args: DispatchCustomEventCallArgs<Target, Namespace>
  ): boolean;

  bind<
    Target extends EventTarget,
    Namespace extends DispatchCustomEventNamespaceArg<Target> = DispatchCustomEventNamespaceArg<Target>,
  >(
    this: DispatchCustomEventFunction,
    thisArg: null | undefined,
    options: DispatchCustomEventOptions<Target, Namespace>,
  ): DispatchCustomEvent<Target, Namespace>;
};

type NamespacedCustomEventTypes<
  EventMap extends CustomEventMapBase,
  namespace extends string,
> = [namespace] extends [never]
  ? {}
  : {
      [K in typeof CHANGE_EVENT_NAME as NamespacedCustomEventName<K, namespace>]: CustomEventWithSource<
        ChangeEventDetailFromMap<EventMap, namespace>
      >;
    } & {
      [K in keyof EventMap & string as NamespacedCustomEventName<K, namespace>]: CustomEventWithSource<
        EventMap[K]
      >;
    };

type LocalCustomEventTypes<EventMap extends CustomEventMapBase> = {
  [K in typeof CHANGE_EVENT_NAME]: CustomEventWithSource<
    ChangeEventDetailFromMap<EventMap>
  >;
} & {
  [K in keyof EventMap & string]: CustomEventWithSource<EventMap[K]>;
};

type EventDetailMapFromCustomEventTypes<EventTypes extends object> = {
  [K in keyof EventTypes & string as K extends typeof CHANGE_EVENT_NAME
    ? never
    : EventTypes[K] extends CustomEvent
      ? K
      : never]: EventTypes[K] extends CustomEvent<infer Detail>
    ? Detail
    : never;
};

type ReservedCustomEventMapKey = typeof CHANGE_EVENT_NAME;

type EventMapReservedKeys<EventMap extends CustomEventMapBase> = Extract<
  keyof EventMap,
  ReservedCustomEventMapKey
>;

type EventMapNamespacedKeys<EventMap extends CustomEventMapBase> = Extract<
  keyof EventMap & string,
  `${string}:${string}`
>;

type ReservedCustomEventMapKeyError<Keys extends PropertyKey> = {
  readonly __customEventMapReservedKeyError: "CustomEventMap event maps cannot define reserved event keys.";
  readonly reservedEventKeys: Keys;
};

type NamespacedCustomEventMapKeyError<Keys extends PropertyKey> = {
  readonly __customEventMapNamespacedKeyError: "CustomEventMap event maps cannot define namespaced event keys. Use Namespaced<CustomEventMap<...>, Namespace> for namespaced events.";
  readonly namespacedEventKeys: Keys;
};

type CustomEventMapError<EventMap extends CustomEventMapBase> =
  EventMapReservedKeys<EventMap> extends never
    ? EventMapNamespacedKeys<EventMap> extends never
      ? never
      : NamespacedCustomEventMapKeyError<EventMapNamespacedKeys<EventMap>>
    : ReservedCustomEventMapKeyError<EventMapReservedKeys<EventMap>>;

export type CustomEventMap<
  EventMap extends CustomEventMapBase,
> =
  CustomEventMapError<EventMap> extends never
    ? LocalCustomEventTypes<EventMap>
    : CustomEventMapError<EventMap>;

type NonCustomEventKeys<EventTypes extends object> = {
  [K in keyof EventTypes & string]: EventTypes[K] extends CustomEvent
    ? never
    : K;
}[keyof EventTypes & string];

type NamespacedCustomEventTypesError<Keys extends PropertyKey> = {
  readonly __namespacedCustomEventTypesError: "Namespaced expects a CustomEventMap. Use Namespaced<CustomEventMap<...>, Namespace>, not Namespaced<raw detail map, Namespace>.";
  readonly nonCustomEventKeys: Keys;
};

export type Namespaced<
  EventTypes extends object,
  namespace extends string,
> =
  NonCustomEventKeys<EventTypes> extends never
    ? NamespacedCustomEventTypes<
        EventDetailMapFromCustomEventTypes<EventTypes>,
        namespace
      >
    : NamespacedCustomEventTypesError<NonCustomEventKeys<EventTypes>>;

function hasDispatchSource(options: { source?: unknown }) {
  return Object.hasOwn(options, "source");
}

type CustomEventsOfTarget<Target> = Target extends {
  __eventMap?: infer EventTypes;
}
  ? OnlyCustomEvents<EventTypes>
  : Target extends EventTarget
    ? OnlyCustomEvents<RemixEventMap<Target>>
    : never;

type OnlyCustomEvents<EventTypes> = EventTypes extends object
  ? {
      [K in keyof EventTypes as EventTypes[K] extends CustomEvent
        ? K
        : never]: EventTypes[K];
    }
  : never;

function dispatchSingleCustomEvent(
  target: EventTarget,
  name: string,
  init: EventInit,
  detail?: unknown,
  hasExplicitDetail = false,
  source?: unknown,
  hasExplicitSource = false,
  owner?: symbol,
  origin?: EventTarget,
) {
  let event = new CustomEvent(name, {
    ...(hasExplicitDetail ? { detail } : {}),
    ...init,
  });

  if (hasExplicitSource) {
    Object.defineProperty(event, "source", {
      configurable: true,
      enumerable: true,
      value: source,
    });
  }

  if (owner) {
    Object.defineProperty(event, CUSTOM_EVENT_OWNER, {
      configurable: true,
      value: owner,
    });
  }

  if (origin) {
    Object.defineProperty(event, CUSTOM_EVENT_ORIGIN, {
      configurable: true,
      value: origin,
    });
    Object.defineProperty(event, "originTarget", {
      configurable: true,
      enumerable: true,
      value: origin,
    });
  }

  return target.dispatchEvent(event);
}

function getEventInit(options: EventInit): EventInit {
  return {
    bubbles: options.bubbles ?? true,
    cancelable: options.cancelable ?? true,
    ...(options.composed === undefined ? {} : { composed: options.composed }),
  };
}

type DispatchCustomEventRuntimeOptions = EventInit & {
  target: EventTarget;
  signal: AbortSignal;
  namespace?: string;
  source?: unknown;
  [CUSTOM_EVENT_OWNER]?: symbol;
  [CUSTOM_EVENT_ORIGIN]?: EventTarget;
};

function getNamespacedEventName(
  options: DispatchCustomEventRuntimeOptions,
  type: string,
) {
  return options.namespace ? `${options.namespace}:${type}` : type;
}

function dispatchEventObject(
  options: DispatchCustomEventRuntimeOptions,
  events: object,
): boolean {
  if (options.signal.aborted) return true;

  const entries = Object.entries(events);
  if (!entries.length) return true;
  if (entries.some(([type]) => type === CHANGE_EVENT_NAME)) {
    throw new TypeError('dispatchCustomEvent does not dispatch "change" directly.');
  }

  const init = getEventInit(options);
  const eventNames = entries.map(([type]) => getNamespacedEventName(options, type));
  const changeEventName = getNamespacedEventName(options, CHANGE_EVENT_NAME);
  const hasSource = hasDispatchSource(options);
  const changeResult = dispatchSingleCustomEvent(
    options.target,
    changeEventName,
    init,
    createCustomEventChangeDetail(entries, options.namespace),
    true,
    options.source,
    hasSource,
    options[CUSTOM_EVENT_OWNER],
    options[CUSTOM_EVENT_ORIGIN],
  );

  let eventsResult = true;
  for (let index = 0; index < entries.length; index++) {
    if (options.signal.aborted) break;

    const [, detail] = entries[index];
    eventsResult = dispatchSingleCustomEvent(
      options.target,
      eventNames[index],
      init,
      detail,
      true,
      options.source,
      hasSource,
      options[CUSTOM_EVENT_OWNER],
      options[CUSTOM_EVENT_ORIGIN],
    ) && eventsResult;
  }

  return changeResult && eventsResult;
}

export const dispatchCustomEvent = function <
  Target extends EventTarget,
  Namespace extends DispatchCustomEventNamespaceArg<Target> = DispatchCustomEventNamespaceArg<Target>,
>(
  ...args: DispatchCustomEventCallArgs<Target, Namespace>
): boolean {
  const options = args[0] as DispatchCustomEventOptions<Target, Namespace>;
  const events = args[1] as object;

  return dispatchEventObject(options, events);
} as DispatchCustomEventFunction;
