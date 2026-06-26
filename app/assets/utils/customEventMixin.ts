import {
  createMixin,
  type ElementProps,
  type MixinDescriptor,
  type MixinType,
} from "remix/ui";

type SafeEventName<
  EventName extends string,
  Domain extends string,
> = `${AppName}:${Domain}:${EventName}`;

type EventMapBase = Record<string, Record<string, unknown> | null>;

type EventUnionFromMap<EventMap extends EventMapBase, Domain extends string> = {
  [K in keyof EventMap & string]: EventMap[K] extends undefined | null
    ? { type: SafeEventName<K, Domain> }
    : { type: SafeEventName<K, Domain> } & EventMap[K];
}[keyof EventMap & string];

type CustomEventDetail<E> =
  E extends CustomEvent<infer Detail> ? Detail : never;

type DispatchCustomEventArgs<
  EventMap extends CustomEventMap<EventMapBase, string>,
  T extends keyof EventMap & string,
> =
  CustomEventDetail<EventMap[T]> extends null | undefined
    ? [signal: AbortSignal, evtInit?: EventInit]
    : [
        detail: CustomEventDetail<EventMap[T]>,
        signal: AbortSignal,
        evtInit?: EventInit,
      ];

export type DispatchCustomEvent<
  EventMap extends CustomEventMap<EventMapBase, string>,
> = <T extends keyof EventMap & string>(
  name: T,
  ...args: DispatchCustomEventArgs<EventMap, T>
) => void;

type Callback<
  EventMap extends CustomEventMap<EventMapBase, string>,
  Target extends Element,
> = (arg: {
  target: Target;
  dispatchCustomEvent: DispatchCustomEvent<EventMap>;
}) => void;

export type CustomEventMap<
  EventMap extends EventMapBase,
  Domain extends string,
> = {
  [K in "change" as SafeEventName<K, Domain>]: CustomEvent<
    EventUnionFromMap<EventMap, Domain>
  >;
} & {
  [K in keyof EventMap & string as SafeEventName<K, Domain>]: CustomEvent<
    EventMap[K]
  >;
};

type EventDetail = EventMapBase[string];

type NormalizedDispatchArgs = {
  detail?: EventDetail;
  signal: AbortSignal;
  evtInit?: EventInit;
  hasExplicitDetail: boolean;
};

function hasNoDetail(
  args:
    | [signal: AbortSignal, evtInit?: EventInit]
    | [detail: unknown, signal: AbortSignal, evtInit?: EventInit],
): args is [signal: AbortSignal, evtInit?: EventInit] {
  return args[0] instanceof AbortSignal;
}

function normalizeDispatchArgs(
  args:
    | [signal: AbortSignal, evtInit?: EventInit]
    | [detail: EventDetail, signal: AbortSignal, evtInit?: EventInit],
): NormalizedDispatchArgs {
  if (hasNoDetail(args)) {
    const [signal, evtInit] = args;

    return {
      signal,
      evtInit,
      hasExplicitDetail: false,
    };
  }

  const [detail, signal, evtInit] = args;

  return {
    detail,
    signal,
    evtInit,
    hasExplicitDetail: true,
  };
}

const mixinType: MixinType<
  Element,
  [Callback<CustomEventMap<EventMapBase, string>, Element>],
  ElementProps
> = (handle) => {
  let _callback: Callback<CustomEventMap<EventMapBase, string>, Element>;
  handle.addEventListener(
    "insert",
    ({ node }) => {
      _callback({
        target: node,
        dispatchCustomEvent: (name, ...args) => {
          const { detail, signal, evtInit, hasExplicitDetail } =
            normalizeDispatchArgs(args);

          if (signal.aborted) return;

          const eventNameParts = name.split(":");
          const isChangeEvent = eventNameParts.at(-1) === "change";

          const detailWithType =
            detail == null || typeof detail !== "object"
              ? { type: name }
              : { type: name, ...detail };

          const init: EventInit = {
            bubbles: true,
            cancelable: true,
            ...evtInit,
          };

          if (isChangeEvent) {
            return node.dispatchEvent(
              new CustomEvent(name, {
                detail: detailWithType,
                ...init,
              }),
            );
          }

          node.dispatchEvent(
            new CustomEvent(name, {
              ...(hasExplicitDetail ? { detail } : {}),
              ...init,
            }),
          );

          const changeEventName = eventNameParts
            .slice(0, -1)
            .concat("change")
            .join(":");

          node.dispatchEvent(
            new CustomEvent(changeEventName, {
              detail: detailWithType,
              ...init,
            }),
          );
        },
      });
    },
    // { signal: handle.signal },
  );

  return (callback) => {
    _callback = callback;
    return handle.element;
  };
};

const mixin = createMixin(mixinType);

export function customEvents<
  EventMap extends CustomEventMap<EventMapBase, string>,
  Target extends Element = Element,
>(callback: Callback<EventMap, Target>) {
  return mixin(
    callback as Callback<CustomEventMap<EventMapBase, string>, Element>,
  ) as MixinDescriptor<Target, [Callback<EventMap, Target>], ElementProps>;
}
