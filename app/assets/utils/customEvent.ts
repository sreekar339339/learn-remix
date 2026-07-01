import type { EventMap as RemixEventMap } from "remix/ui";

type Domain = string;

type CustomEventName<
  EventName extends string,
  domain extends string,
> = `${domain}:${EventName}`;

type CustomEventMapBase = Record<string, unknown | null>;

type ChangeManyEventDetailFromMap<EventMap extends CustomEventMapBase> =
  Partial<EventMap>;

type ChangeEventDetailFromMap<
  EventMap extends CustomEventMapBase,
  domain extends Domain,
> = {
  [K in keyof EventMap & string]: EventMap[K] extends null | undefined
    ? {
        event: CustomEventName<K, domain>;
        detail?: never;
      }
    : {
        event: CustomEventName<K, domain>;
        detail: EventMap[K];
      };
}[keyof EventMap & string];

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

declare const customEventMapSymbol: unique symbol;

type EventNameFromOnProperty<Key extends PropertyKey> =
  Key extends `on${infer EventName}` ? EventName : never;

type NativeEventNamesFromElement<Target> = {
  [K in keyof Target]: K extends `on${string}`
    ? Target[K] extends ((...args: any[]) => any) | null | undefined
      ? EventNameFromOnProperty<K>
      : never
    : never;
}[keyof Target];

type NativeHTMLElementEventNames = {
  [TagName in keyof HTMLElementTagNameMap]: NativeEventNamesFromElement<
    HTMLElementTagNameMap[TagName]
  >;
}[keyof HTMLElementTagNameMap];

type EventNameCollisions<EventTypes extends object> = Extract<
  keyof EventTypes,
  NativeHTMLElementEventNames
>;

type CustomEventNameCollisionError<Collisions> = {
  readonly __customEventNameCollisionError: "Custom event names collide with native DOM event names. Use a domain argument or rename the local custom event.";
  readonly collidingEventNames: Collisions;
  readonly types?: never;
  readonly dispatcher?: never;
  readonly dispatcherWithoutSignal?: never;
  readonly target?: never;
};

type GenericCustomEventTargetMap<EventTypes extends object> = {
  element: CustomEventTarget<EventTypes, Element>;
  htmlElement: CustomEventTarget<EventTypes, HTMLElement>;
  mathElement: CustomEventTarget<EventTypes, MathMLElement>;
  svgElement: CustomEventTarget<EventTypes, SVGElement>;
  math: {
    [TagName in keyof MathMLElementTagNameMap]: CustomEventTarget<
      EventTypes,
      MathMLElementTagNameMap[TagName]
    >;
  };
  svg: {
    [TagName in keyof SVGElementTagNameMap]: CustomEventTarget<
      EventTypes,
      SVGElementTagNameMap[TagName]
    >;
  };
};

type HTMLElementToCustomEventTargetMap<EventTypes extends object> =
  GenericCustomEventTargetMap<EventTypes> & {
  [TagName in keyof HTMLElementTagNameMap]: CustomEventTarget<
    EventTypes,
    HTMLElementTagNameMap[TagName]
  > 
};

type CustomEventTarget<
  EventTypes extends object,
  Target extends Element,
> = Target & {
  /**
   * For remix/ui addEventListeners inference.
   * This must contain native events + custom events.
   */
  __eventMap?: RemixEventMap<Target> & EventTypes;

  /**
   * For customEventDispatcher inference only.
   * This preserves the exact custom event map for this component/domain.
   */
  [customEventMapSymbol]?: EventTypes;
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

type CustomEventTypes<
  EventMap extends CustomEventMapBase,
  domain extends Domain,
> = {
  [K in typeof CHANGE_EVENT_NAME as CustomEventName<K, domain>]: CustomEvent<
    ChangeEventDetailFromMap<EventMap, domain>
  >;
} & {
  [K in typeof CHANGE_MANY_EVENT_NAME as CustomEventName<
    K,
    domain
  >]: CustomEvent<ChangeManyEventDetailFromMap<EventMap>>;
} & {
  [K in keyof EventMap & string as CustomEventName<K, domain>]: CustomEvent<
    EventMap[K]
  >;
};

type CustomEventMapDescriptor<EventTypes extends object> = {
  /**
   * Raw custom event map.
   * Use for global HTMLElementEventMap augmentation.
   */
  types: EventTypes;

  /**
   * Dispatcher type after target and signal have both been applied.
   */
  dispatcher: DispatchCustomEvent<EventTypes>;

  /**
   * Dispatcher type after only target has been applied.
   */
  dispatcherWithoutSignal: DispatchCustomEventWithoutSignal<EventTypes>;

  /**
   * DOM target helpers.
   */
  target: HTMLElementToCustomEventTargetMap<EventTypes>;
};

export type CustomEventMap<
  EventMap extends CustomEventMapBase,
  domain extends Domain,
  EventTypes extends object = CustomEventTypes<EventMap, domain>,
> =
  EventNameCollisions<EventTypes> extends never
    ? CustomEventMapDescriptor<EventTypes>
    : CustomEventNameCollisionError<EventNameCollisions<EventTypes>>;

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
  [customEventMapSymbol]?: infer EventTypes;
}
  ? EventTypes extends object
    ? EventTypes
    : never
  : never;

const CHANGE_EVENT_NAME = "change" as const;
const CHANGE_MANY_EVENT_NAME = "changeMany" as const;

function getChangeEventName(name: string) {
  return name.split(":").slice(0, -1).concat(CHANGE_EVENT_NAME).join(":");
}

function getChangeManyEventName(name: string) {
  return name.split(":").slice(0, -1).concat(CHANGE_MANY_EVENT_NAME).join(":");
}

function isChangeEventName(name: string) {
  const parts = name.split(":");
  return parts[parts.length - 1] === CHANGE_EVENT_NAME;
}

function isChangeManyEventName(name: string) {
  const parts = name.split(":");
  return parts[parts.length - 1] === CHANGE_MANY_EVENT_NAME;
}

function getLocalEventName(name: string) {
  const parts = name.split(":");
  return parts[parts.length - 1];
}

type RuntimeDispatchArgs = NoDetailArgs | WithDetailArgs<unknown>;

type CustomEventTargetLike = Element & {
  [customEventMapSymbol]?: object;
};

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

  if (isChangeEventName(name) || isChangeManyEventName(name)) {
    return target.dispatchEvent(
      new CustomEvent(name, {
        ...(hasExplicitDetail ? { detail } : {}),
        ...init,
      }),
    );
  }

  const eventResult = target.dispatchEvent(
    new CustomEvent(name, {
      ...(hasExplicitDetail ? { detail } : {}),
      ...init,
    }),
  );

  const changeDetail = hasExplicitDetail
    ? {
        event: name,
        detail,
      }
    : {
        event: name,
      };

  const changeResult = target.dispatchEvent(
    new CustomEvent(getChangeEventName(name), {
      detail: changeDetail,
      ...init,
    }),
  );

  const changeManyDetail = hasExplicitDetail
    ? {
        [getLocalEventName(name)]: detail,
      }
    : {};

  const changeManyResult = target.dispatchEvent(
    new CustomEvent(getChangeManyEventName(name), {
      detail: changeManyDetail,
      ...init,
    }),
  );

  return eventResult && changeResult && changeManyResult;
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
