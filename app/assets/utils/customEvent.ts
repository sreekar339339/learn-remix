import type { EventMap as RemixEventMap } from "remix/ui";

const CHANGE_EVENT_NAME = "change" as const;

type NamespacedCustomEventName<
  EventName extends string,
  namespace extends string,
> = `${namespace}:${EventName}`;

type CustomEventMapBase = Record<string, unknown>;

type ChangeEventDetailField<
  EventName extends string,
  namespace extends string,
  NameRequired extends boolean,
  Source,
> = NameRequired extends true
  ? {
      type: EventName;
      name: NamespacedCustomEventName<EventName, namespace>;
      source?: Source;
    }
  : {
      type: EventName;
      source?: Source;
    };

type ChangeEventDetailBranchFromMap<
  EventMap extends CustomEventMapBase,
  namespace extends string,
  NameRequired extends boolean,
  Source = unknown,
> = {
  [K in keyof EventMap & string]: EventMap[K] extends null | undefined
    ? ChangeEventDetailField<K, namespace, NameRequired, Source> & {
        detail?: never;
      }
    : ChangeEventDetailField<K, namespace, NameRequired, Source> & {
        detail: EventMap[K];
      };
}[keyof EventMap & string];

type ChangeEventBatchDetailFromMap<
  EventMap extends CustomEventMapBase,
  namespace extends string,
  NameRequired extends boolean,
  Source = unknown,
> = NameRequired extends true
  ? {
      type: Array<keyof EventMap & string>;
      name: Array<NamespacedCustomEventName<keyof EventMap & string, namespace>>;
      detail: Partial<EventMap>;
      source?: Source;
    }
  : {
      type: Array<keyof EventMap & string>;
      detail: Partial<EventMap>;
      source?: Source;
    };

type ChangeEventDetailFromMap<
  EventMap extends CustomEventMapBase,
  namespace extends string,
> =
  | ChangeEventDetailBranchFromMap<EventMap, namespace, true>
  | ChangeEventBatchDetailFromMap<EventMap, namespace, true>;

type LocalChangeEventDetailFromMap<EventMap extends CustomEventMapBase> =
  | ChangeEventDetailBranchFromMap<EventMap, string, false>
  | ChangeEventBatchDetailFromMap<EventMap, string, false>;

export type DispatchCustomEventOptions<
  Target extends EventTarget = EventTarget,
  Namespace extends string | undefined = undefined,
  Source = unknown,
> = EventInit & {
  target: Target;
  signal: AbortSignal;
  namespace?: Namespace;
  source?: Source;
};

type DetailFor<EventTypes extends object, T extends keyof EventTypes & string> =
  EventTypes[T] extends CustomEvent<infer Detail> ? Detail : never;

type DispatchEventMap<
  Target extends EventTarget,
  Namespace extends string | undefined,
  EventTypes extends object = CustomEventsOfTarget<Target>,
> = Namespace extends string
  ? {
      [K in keyof EventTypes & string as K extends NamespacedCustomEventName<
        infer EventName,
        Namespace
      >
        ? EventName extends typeof CHANGE_EVENT_NAME
          ? never
          : EventName
        : never]: DetailFor<EventTypes, K>;
    }
  : {
      [K in keyof EventTypes & string as K extends typeof CHANGE_EVENT_NAME
        ? never
        : K extends `${string}:${string}`
          ? never
          : K]: DetailFor<EventTypes, K>;
    };

export type DispatchCustomEventEvents<
  Target extends EventTarget,
  Namespace extends string | undefined = undefined,
> = Partial<DispatchEventMap<Target, Namespace>>;

export type DispatchCustomEventArgs<
  Target extends EventTarget,
  Namespace extends string | undefined = undefined,
> = [events: DispatchCustomEventEvents<Target, Namespace>];

export type DispatchCustomEvent<
  Target extends EventTarget,
  Namespace extends string | undefined = undefined,
> = (
  events: DispatchCustomEventEvents<Target, Namespace>
) => boolean;

type DispatchCustomEventCallArgs<
  Target extends EventTarget,
  Namespace extends string | undefined = undefined,
> = [
  options: DispatchCustomEventOptions<Target, Namespace>,
  events: DispatchCustomEventEvents<Target, Namespace>,
];

type DispatchCustomEventFunction = {
  <
    Target extends EventTarget,
    Namespace extends string | undefined = undefined,
  >(
    ...args: DispatchCustomEventCallArgs<Target, Namespace>
  ): boolean;

  bind<
    Target extends EventTarget,
    Namespace extends string | undefined = undefined,
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
      [K in typeof CHANGE_EVENT_NAME as NamespacedCustomEventName<K, namespace>]: CustomEvent<
        ChangeEventDetailFromMap<EventMap, namespace>
      >;
    } & {
      [K in keyof EventMap & string as NamespacedCustomEventName<K, namespace>]: CustomEvent<
        EventMap[K]
      >;
    };

type LocalCustomEventTypes<EventMap extends CustomEventMapBase> = {
  [K in typeof CHANGE_EVENT_NAME]: CustomEvent<
    LocalChangeEventDetailFromMap<EventMap>
  >;
} & {
  [K in keyof EventMap & string]: CustomEvent<EventMap[K]>;
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
  EventTypes extends object = LocalCustomEventTypes<
    EventMap
  >,
> =
  CustomEventMapError<EventMap> extends never
    ? EventTypes
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
  EventMap extends CustomEventMapBase = EventDetailMapFromCustomEventTypes<EventTypes>,
  NamespacedEventTypes extends object = NamespacedCustomEventTypes<
    EventMap,
    namespace
  >,
> =
  NonCustomEventKeys<EventTypes> extends never
    ? NamespacedEventTypes
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
) {
  return target.dispatchEvent(
    new CustomEvent(name, {
      ...(hasExplicitDetail ? { detail } : {}),
      ...init,
    }),
  );
}

function getEventInit(options: EventInit): EventInit {
  return {
    bubbles: options.bubbles ?? true,
    cancelable: options.cancelable ?? true,
    ...(options.composed === undefined ? {} : { composed: options.composed }),
  };
}

function createChangeDetail(
  type: string,
  name: string,
  detail: unknown,
  hasExplicitDetail: boolean,
  options: DispatchCustomEventOptions<EventTarget, string | undefined>,
) {
  return {
    type,
    ...(options.namespace ? { name } : {}),
    ...(hasExplicitDetail ? { detail } : {}),
    ...(hasDispatchSource(options) ? { source: options.source } : {}),
  };
}

function getNamespacedEventName(
  options: DispatchCustomEventOptions<EventTarget, string | undefined>,
  type: string,
) {
  return options.namespace ? `${options.namespace}:${type}` : type;
}

function getChangeDetail(
  entries: Array<[string, unknown]>,
  eventNames: string[],
  options: DispatchCustomEventOptions<EventTarget, string | undefined>,
) {
  if (entries.length === 1) {
    const [[type, detail]] = entries;
    return createChangeDetail(
      type,
      eventNames[0],
      detail,
      detail != null,
      options,
    );
  }

  return {
    type: entries.map(([type]) => type),
    ...(options.namespace ? { name: eventNames } : {}),
    detail: Object.fromEntries(entries),
    ...(hasDispatchSource(options) ? { source: options.source } : {}),
  };
}

function dispatchEventObject(
  options: DispatchCustomEventOptions<EventTarget, string | undefined>,
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
  const changeResult = dispatchSingleCustomEvent(
    options.target,
    changeEventName,
    init,
    getChangeDetail(entries, eventNames, options),
    true,
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
      detail != null,
    ) && eventsResult;
  }

  return changeResult && eventsResult;
}

export const dispatchCustomEvent = function <
  Target extends EventTarget,
  Namespace extends string | undefined = undefined,
>(
  ...args: DispatchCustomEventCallArgs<Target, Namespace>
): boolean {
  const options = args[0] as DispatchCustomEventOptions<Target, Namespace>;
  const events = args[1] as object;

  return dispatchEventObject(options, events);
} as DispatchCustomEventFunction;
