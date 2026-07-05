import type { EventMap as RemixEventMap } from "remix/ui";

const CHANGE_EVENT_NAME = "change" as const;

type Namespace = string;

type NamespacedCustomEventName<
  EventName extends string,
  namespace extends Namespace,
> = `${namespace}:${EventName}`;

type CustomEventMapBase = Record<string, unknown | null>;

type ChangeEventChangesFromMap<EventMap extends CustomEventMapBase> =
  Partial<EventMap>;

type UnionKeys<T> = T extends T ? keyof T : never;

type StrictUnion<T, TAll = T> = T extends object
  ? T & Partial<Record<Exclude<UnionKeys<TAll>, keyof T>, never>>
  : T;

type ChangeEventEventField<
  EventName extends string,
  namespace extends Namespace,
  NamespacedTypeRequired extends boolean,
> = NamespacedTypeRequired extends true
  ? {
      type: EventName;
      namespacedType: NamespacedCustomEventName<EventName, namespace>;
    }
  : {
      type: EventName;
      namespacedType?: NamespacedCustomEventName<EventName, string>;
    };

type ChangeEventDetailBranchFromMap<
  EventMap extends CustomEventMapBase,
  namespace extends Namespace,
  NamespacedTypeRequired extends boolean,
> = {
  [K in keyof EventMap & string]: EventMap[K] extends null | undefined
    ? {
        event: ChangeEventEventField<K, namespace, NamespacedTypeRequired> & {
          detail?: never;
        };
        changes?: never;
      }
    : {
        event: ChangeEventEventField<K, namespace, NamespacedTypeRequired> & {
          detail: EventMap[K];
        };
        changes?: never;
      };
}[keyof EventMap & string] | {
  changes: ChangeEventChangesFromMap<EventMap>;
  event?: never;
};

type ChangeEventDetailFromMap<
  EventMap extends CustomEventMapBase,
  namespace extends Namespace,
> = StrictUnion<ChangeEventDetailBranchFromMap<EventMap, namespace, true>>;

type LocalChangeEventDetailFromMap<
  EventMap extends CustomEventMapBase,
  namespace extends Namespace,
> = StrictUnion<ChangeEventDetailBranchFromMap<EventMap, namespace, false>>;

type NoDetailArgs = [] | [detail: null | undefined, evtInit?: EventInit];

type WithDetailArgs<Detail> = [detail: Detail, evtInit?: EventInit];

type RuntimeDispatchArgs = NoDetailArgs | WithDetailArgs<unknown>;

type DetailFor<EventTypes extends object, T extends keyof EventTypes & string> =
  EventTypes[T] extends CustomEvent<infer Detail> ? Detail : never;

type DispatchDetailFor<
  EventTypes extends object,
  T extends keyof EventTypes & string,
> = T extends `${string}:${typeof CHANGE_EVENT_NAME}`
  ? ChangeDispatchDetail<DetailFor<EventTypes, T>, "type">
  : T extends typeof CHANGE_EVENT_NAME
    ? DetailFor<EventTypes, T>
  : DetailFor<EventTypes, T>;

type ChangeDispatchDetail<
  Detail,
  OptionalKey extends "type",
> = Detail extends {
  changes: unknown;
}
  ? Detail
  : Detail extends { event: infer Event }
    ? Omit<Detail, "event"> & {
        event: Event extends { [K in OptionalKey]?: infer Value }
          ? Omit<Event, OptionalKey> & { [K in OptionalKey]?: Value }
          : Event;
      }
    : Detail;

type DispatchCustomEventArgs<
  EventTypes extends object,
  T extends keyof EventTypes & string,
> =
  DetailFor<EventTypes, T> extends null | undefined
    ? NoDetailArgs
    : WithDetailArgs<DispatchDetailFor<EventTypes, T>>;

type DispatchCustomEvent<EventTypes extends object> = <
  T extends keyof EventTypes & string,
>(
  name: T,
  ...args: DispatchCustomEventArgs<EventTypes, T>
) => boolean;

type DispatchCustomEventWithoutSignal<EventTypes extends object> = {
  (signal: AbortSignal): DispatchCustomEvent<EventTypes>;
  <T extends keyof EventTypes & string>(
    signal: AbortSignal,
    name: T,
    ...args: DispatchCustomEventArgs<EventTypes, T>
  ): boolean;
};

type NamespacedCustomEventTypes<
  EventMap extends CustomEventMapBase,
  namespace extends Namespace,
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

type LocalCustomEventTypes<
  EventMap extends CustomEventMapBase,
  namespace extends Namespace = never,
> = {
  [K in typeof CHANGE_EVENT_NAME]: CustomEvent<
    LocalChangeEventDetailFromMap<EventMap, namespace>
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

type ReservedCustomEventMapKeyError<Keys extends PropertyKey> = {
  readonly __customEventMapReservedKeyError: "CustomEventMap event maps cannot define reserved event keys.";
  readonly reservedEventKeys: Keys;
};

export type CustomEventMap<
  EventMap extends CustomEventMapBase,
  EventTypes extends object = LocalCustomEventTypes<
    EventMap
  >,
> =
  EventMapReservedKeys<EventMap> extends never
    ? EventTypes
    : ReservedCustomEventMapKeyError<EventMapReservedKeys<EventMap>>;

export type Namespaced<
  EventTypes extends object,
  namespace extends Namespace,
  EventMap extends CustomEventMapBase = EventDetailMapFromCustomEventTypes<EventTypes>,
  NamespacedEventTypes extends object = NamespacedCustomEventTypes<
    EventMap,
    namespace
  >,
> =
  NamespacedEventTypes;

function normalizeDispatchArgs(args: RuntimeDispatchArgs) {
  const [detail, evtInit] = args;

  if (args.length === 0 || detail == null) {
    return {
      evtInit,
      hasExplicitDetail: false,
    };
  }

  return {
    detail,
    evtInit,
    hasExplicitDetail: true,
  };
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

function getChangeEventName(name: string) {
  return name.split(":").slice(0, -1).concat(CHANGE_EVENT_NAME).join(":");
}

function getChangeEventType(name: string) {
  return name.split(":").at(-1) ?? name;
}

function getNamespacedEventName(name: string) {
  return name.includes(":") ? name : undefined;
}

function isChangeEventName(name: string) {
  const parts = name.split(":");
  return parts[parts.length - 1] === CHANGE_EVENT_NAME;
}

function getEventNameFromChangeEventName(changeEventName: string, eventKey: string) {
  return changeEventName.split(":").slice(0, -1).concat(eventKey).join(":");
}

function normalizeChangeEventDetail(detail: unknown) {
  if (
    !detail ||
    typeof detail !== "object" ||
    !("event" in detail)
  ) {
    return detail;
  }

  if (!detail.event || typeof detail.event !== "object") {
    if (typeof detail.event !== "string") return detail;

    return {
      event: {
        namespacedType: detail.event,
        type: getChangeEventType(detail.event),
        ...("detail" in detail ? { detail: detail.detail } : {}),
      },
    };
  }

  const event = detail.event;
  const namespacedType =
    "namespacedType" in event && typeof event.namespacedType === "string"
      ? event.namespacedType
      : undefined;
  const type =
    namespacedType
      ? getChangeEventType(namespacedType)
      : "type" in event && typeof event.type === "string"
        ? event.type
        : undefined;

  if (!type) return detail;

  return {
    ...detail,
    event: {
      ...event,
      type,
      ...(namespacedType ? { namespacedType } : {}),
    },
  };
}

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

function dispatchGranularEventFromChangeDetail(
  target: EventTarget,
  changeEventName: string,
  detail: unknown,
  init: EventInit,
) {
  if (!detail || typeof detail !== "object") return true;

  if ("changes" in detail) {
    let result = true;
    let changes = detail.changes;

    if (!changes || typeof changes !== "object") return true;

    for (let [eventKey, eventDetail] of Object.entries(changes)) {
      result = dispatchSingleCustomEvent(
        target,
        getEventNameFromChangeEventName(changeEventName, eventKey),
        init,
        eventDetail,
        eventDetail != null,
      ) && result;
    }

    return result;
  }

  if (
    !("event" in detail) ||
    !detail.event ||
    typeof detail.event !== "object"
  ) {
    return true;
  }

  const event = detail.event;
  const type = "type" in event && typeof event.type === "string"
    ? event.type
    : undefined;
  const eventName =
    "namespacedType" in event && typeof event.namespacedType === "string"
      ? event.namespacedType
      : type
        ? getEventNameFromChangeEventName(changeEventName, type)
        : undefined;

  if (!eventName) return true;

  return dispatchSingleCustomEvent(
    target,
    eventName,
    init,
    "detail" in event ? event.detail : undefined,
    "detail" in event,
  );
}

function dispatchCustomEventImpl(
  target: EventTarget,
  eventSignal: AbortSignal,
  name: string,
  args: RuntimeDispatchArgs,
): boolean {
  const { detail, evtInit, hasExplicitDetail } = normalizeDispatchArgs(args);

  if (eventSignal.aborted) return true;

  const init: EventInit = {
    bubbles: true,
    cancelable: true,
    ...evtInit,
  };

  if (isChangeEventName(name)) {
    const changeDetail = hasExplicitDetail
      ? normalizeChangeEventDetail(detail)
      : detail;

    const changeResult = dispatchSingleCustomEvent(
      target,
      name,
      init,
      changeDetail,
      hasExplicitDetail,
    );

    const granularResult = hasExplicitDetail
      ? dispatchGranularEventFromChangeDetail(target, name, changeDetail, init)
      : true;

    return changeResult && granularResult;
  }

  const eventResult = dispatchSingleCustomEvent(
    target,
    name,
    init,
    detail,
    hasExplicitDetail,
  );

  const changeDetail = hasExplicitDetail
    ? {
        event: {
          type: getChangeEventType(name),
          ...(getNamespacedEventName(name) ? { namespacedType: name } : {}),
          detail,
        },
      }
    : {
        event: {
          type: getChangeEventType(name),
          ...(getNamespacedEventName(name) ? { namespacedType: name } : {}),
        },
      };

  const changeResult = dispatchSingleCustomEvent(
    target,
    getChangeEventName(name),
    init,
    changeDetail,
    true,
  );

  return eventResult && changeResult;
}

function createDispatcher(
  target: EventTarget,
  signal: AbortSignal,
): DispatchCustomEvent<object> {
  return (eventName: string, ...eventArgs: RuntimeDispatchArgs) => {
    return dispatchCustomEventImpl(target, signal, eventName, eventArgs);
  };
}

export function dispatchCustomEvent<Target extends EventTarget>(
  target: Target,
): DispatchCustomEventWithoutSignal<CustomEventsOfTarget<Target>>;

export function dispatchCustomEvent<Target extends EventTarget>(
  target: Target,
  signal: AbortSignal,
): DispatchCustomEvent<CustomEventsOfTarget<Target>>;

export function dispatchCustomEvent<
  Target extends EventTarget,
  T extends keyof CustomEventsOfTarget<Target> & string,
>(
  target: Target,
  signal: AbortSignal,
  name: T,
  ...args: DispatchCustomEventArgs<CustomEventsOfTarget<Target>, T>
): boolean;

export function dispatchCustomEvent(
  target: EventTarget,
  signal?: AbortSignal,
  ...args: [] | [name: string, ...args: RuntimeDispatchArgs]
): unknown {
  if (!signal) {
    return (
      nextSignal: AbortSignal,
      eventName?: string,
      ...eventArgs: RuntimeDispatchArgs
    ) => {
      if (eventName === undefined) {
        return createDispatcher(target, nextSignal);
      }

      return dispatchCustomEventImpl(target, nextSignal, eventName, eventArgs);
    };
  }

  if (args.length === 0) {
    return createDispatcher(target, signal);
  }

  const [name, ...eventArgs] = args;

  return dispatchCustomEventImpl(target, signal, name, eventArgs);
}

export namespace dispatchCustomEvent {
  export type Dispatcher<Target extends EventTarget> =
    DispatchCustomEvent<CustomEventsOfTarget<Target>>;

  export type DispatcherWithoutSignal<Target extends EventTarget> =
    DispatchCustomEventWithoutSignal<CustomEventsOfTarget<Target>>;
}
