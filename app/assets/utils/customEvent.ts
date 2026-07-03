import type { EventMap as RemixEventMap } from "remix/ui";

type Namespace = string;

type CustomEventMapOptions<namespace extends Namespace = Namespace> = {
  namespace: namespace;
  target: Element | EventTarget;
};

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

type ChangeEventEventDetailFromMap<
  EventMap extends CustomEventMapBase,
  namespace extends Namespace,
> = {
  [K in keyof EventMap & string]: EventMap[K] extends null | undefined
    ? {
        event: NamespacedCustomEventName<K, namespace>;
        type: K;
        changes?: never;
        detail?: never;
      }
    : {
        event: NamespacedCustomEventName<K, namespace>;
        type: K;
        detail: EventMap[K];
        changes?: never;
      };
}[keyof EventMap & string] | {
  changes: ChangeEventChangesFromMap<EventMap>;
  event?: never;
  type?: never;
  detail?: never;
};

type ChangeEventDetailFromMap<
  EventMap extends CustomEventMapBase,
  namespace extends Namespace,
> = StrictUnion<ChangeEventEventDetailFromMap<EventMap, namespace>>;

type LocalChangeEventEventDetailFromMap<
  EventMap extends CustomEventMapBase,
  namespace extends Namespace,
> = {
  [K in keyof EventMap & string]: EventMap[K] extends null | undefined
    ? {
        event?: NamespacedCustomEventName<K, namespace>;
        type: K;
        changes?: never;
        detail?: never;
      }
    : {
        event?: NamespacedCustomEventName<K, namespace>;
        type: K;
        detail: EventMap[K];
        changes?: never;
      };
}[keyof EventMap & string] | {
  changes: ChangeEventChangesFromMap<EventMap>;
  event?: never;
  type?: never;
  detail?: never;
};

type LocalChangeEventDetailFromMap<
  EventMap extends CustomEventMapBase,
  namespace extends Namespace,
> = StrictUnion<LocalChangeEventEventDetailFromMap<EventMap, namespace>>;

type NoDetailArgs = [] | [detail: null | undefined, evtInit?: EventInit];

type WithDetailArgs<Detail> = [detail: Detail, evtInit?: EventInit];

type DetailFor<EventTypes extends object, T extends keyof EventTypes & string> =
  EventTypes[T] extends CustomEvent<infer Detail> ? Detail : never;

type DispatchArgsRuntimeFor<
  EventTypes extends object,
  T extends keyof EventTypes & string,
> = NoDetailArgs | WithDetailArgs<DetailFor<EventTypes, T>>;

type DispatchCustomEventArgs<
  EventTypes extends object,
  T extends keyof EventTypes & string,
> =
  DetailFor<EventTypes, T> extends null | undefined
    ? NoDetailArgs
    : WithDetailArgs<DetailFor<EventTypes, T>>;

declare const CustomEventTypesSymbol: unique symbol;

type CustomEventTarget<
  EventTypes extends object,
  Target extends CustomEventTargetLike,
> = Target & {
  /**
   * For remix/ui addEventListeners inference.
   * This must contain native events + custom events.
   */
  __eventMap?: RemixEventMap<Target> & EventTypes;

  /**
   * For customEventDispatcher inference only.
   * This preserves the exact custom event map for this component namespace.
   */
  [CustomEventTypesSymbol]?: EventTypes;
};

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
> = {
  [K in typeof CHANGE_EVENT_NAME as NamespacedCustomEventName<K, namespace>]: CustomEvent<
    ChangeEventDetailFromMap<EventMap, namespace>
  >;
} & {
  [K in keyof EventMap & string as NamespacedCustomEventName<K, namespace>]: CustomEvent<
    EventMap[K]
  >;
};

type CustomEventTypes<
  EventMap extends CustomEventMapBase,
  namespace extends Namespace,
> = {
  [K in typeof CHANGE_EVENT_NAME]: CustomEvent<
    LocalChangeEventDetailFromMap<EventMap, namespace>
  >;
} & {
  [K in keyof EventMap & string]: CustomEvent<EventMap[K]>;
};

type CustomEventMapDescriptor<
  EventTypes extends object,
  NamespacedEventTypes extends object,
  Options extends CustomEventMapOptions,
> = {
  /**
   * Local custom event map.
   * Use for local state such as initial change event details.
   */
  events: EventTypes;

  /**
   * Namespaced custom event map.
   * Use for global HTMLElementEventMap augmentation.
   */
  namespacedEvents: NamespacedEventTypes;

  /**
   * Dispatcher type after target and signal have both been applied.
   */
  dispatcher: DispatchCustomEvent<NamespacedEventTypes>;

  /**
   * Dispatcher type after only target has been applied.
   */
  dispatcherWithoutSignal: DispatchCustomEventWithoutSignal<NamespacedEventTypes>;

  /**
   * DOM target with native and custom event inference.
   */
  target: CustomEventTarget<NamespacedEventTypes, Options["target"]>;

  namespace: Options["namespace"];
};

export type CustomEventMap<
  EventMap extends CustomEventMapBase,
  Options extends CustomEventMapOptions,
  EventTypes extends object = CustomEventTypes<EventMap, Options["namespace"]>,
  NamespacedEventTypes extends object = NamespacedCustomEventTypes<
    EventMap,
    Options["namespace"]
  >,
> = CustomEventMapDescriptor<EventTypes, NamespacedEventTypes, Options>;

function isNoDetailArgs<
  EventTypes extends object,
  T extends keyof EventTypes & string,
>(args: DispatchArgsRuntimeFor<EventTypes, T>): args is NoDetailArgs {
  return args.length === 0 || args[0] == null;
}

function normalizeDispatchArgs<
  EventTypes extends object,
  T extends keyof EventTypes & string,
>(args: DispatchArgsRuntimeFor<EventTypes, T>) {
  if (isNoDetailArgs(args)) {
    const [, evtInit] = args;

    return {
      evtInit,
      hasExplicitDetail: false,
    };
  }

  const [detail, evtInit] = args;

  return {
    detail,
    evtInit,
    hasExplicitDetail: true,
  };
}

type CustomEventsOfTarget<Target> = Target extends {
  [CustomEventTypesSymbol]?: infer EventTypes;
}
  ? EventTypes extends object
    ? EventTypes
    : never
  : never;

const CHANGE_EVENT_NAME = "change" as const;

function getChangeEventName(name: string) {
  return name.split(":").slice(0, -1).concat(CHANGE_EVENT_NAME).join(":");
}

function getChangeEventType(name: string) {
  return name.split(":").at(-1) ?? name;
}

function isChangeEventName(name: string) {
  const parts = name.split(":");
  return parts[parts.length - 1] === CHANGE_EVENT_NAME;
}

function getEventNameFromChangeEventName(changeEventName: string, eventKey: string) {
  return changeEventName.split(":").slice(0, -1).concat(eventKey).join(":");
}

type RuntimeDispatchArgs = NoDetailArgs | WithDetailArgs<unknown>;

type CustomEventTargetLike = Element | EventTarget & {
  [CustomEventTypesSymbol]?: object;
};

function dispatchSingleCustomEvent(
  target: CustomEventTargetLike,
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
  target: CustomEventTargetLike,
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

  if (!("event" in detail) || typeof detail.event !== "string") {
    return true;
  }

  return dispatchSingleCustomEvent(
    target,
    detail.event,
    init,
    "detail" in detail ? detail.detail : undefined,
    "detail" in detail,
  );
}

function dispatchCustomEventImpl(
  target: CustomEventTargetLike,
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
    const changeResult = dispatchSingleCustomEvent(
      target,
      name,
      init,
      detail,
      hasExplicitDetail,
    );

    const granularResult = hasExplicitDetail
      ? dispatchGranularEventFromChangeDetail(target, name, detail, init)
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
        event: name,
        type: getChangeEventType(name),
        detail,
      }
    : {
        event: name,
        type: getChangeEventType(name),
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
  target: CustomEventTargetLike,
  signal: AbortSignal,
): DispatchCustomEvent<object> {
  return (eventName: string, ...eventArgs: RuntimeDispatchArgs) => {
    return dispatchCustomEventImpl(target, signal, eventName, eventArgs);
  };
}

export function dispatchCustomEvent<Target extends CustomEventTargetLike>(
  target: Target,
): DispatchCustomEventWithoutSignal<CustomEventsOfTarget<Target>>;

export function dispatchCustomEvent<Target extends CustomEventTargetLike>(
  target: Target,
  signal: AbortSignal,
): DispatchCustomEvent<CustomEventsOfTarget<Target>>;

export function dispatchCustomEvent<
  Target extends CustomEventTargetLike,
  T extends keyof CustomEventsOfTarget<Target> & string,
>(
  target: Target,
  signal: AbortSignal,
  name: T,
  ...args: DispatchCustomEventArgs<CustomEventsOfTarget<Target>, T>
): boolean;

export function dispatchCustomEvent(
  target: CustomEventTargetLike,
  signal?: AbortSignal,
  ...args: [] | [name: string, ...args: RuntimeDispatchArgs]
): unknown {
  if (!signal) {
    return (
      nextSignal: AbortSignal,
      eventName?: string,
      ...eventArgs: RuntimeDispatchArgs
    ) => {
      if (!eventName) {
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
