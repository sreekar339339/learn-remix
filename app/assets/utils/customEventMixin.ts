import { ref } from "remix/ui";

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

type NoDetailArgs = [signal: AbortSignal, evtInit?: EventInit];

type WithDetailArgs<Detail> = [
  detail: Detail,
  signal: AbortSignal,
  evtInit?: EventInit,
];

type DetailFor<
  EventMap extends CustomEventMap<EventMapBase, string>,
  T extends keyof EventMap & string,
> = EventMap[T] extends CustomEvent<infer Detail> ? Detail : never;

type DispatchArgsRuntimeFor<
  EventMap extends CustomEventMap<EventMapBase, string>,
  T extends keyof EventMap & string,
> = NoDetailArgs | WithDetailArgs<DetailFor<EventMap, T>>;

type DispatchCustomEventArgs<
  EventMap extends CustomEventMap<EventMapBase, string>,
  T extends keyof EventMap & string,
> =
  DetailFor<EventMap, T> extends null | undefined
    ? NoDetailArgs
    : WithDetailArgs<DetailFor<EventMap, T>>;

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
  signal: AbortSignal;
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

function isNoDetailArgs<
  EventMap extends CustomEventMap<EventMapBase, string>,
  T extends keyof EventMap & string,
>(args: DispatchArgsRuntimeFor<EventMap, T>): args is NoDetailArgs {
  return args[0] instanceof AbortSignal;
}

function normalizeDispatchArgs<
  EventMap extends CustomEventMap<EventMapBase, string>,
  T extends keyof EventMap & string,
>(args: DispatchArgsRuntimeFor<EventMap, T>) {
  if (isNoDetailArgs(args)) {
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

const invokeCallback = <
  Target extends Element,
  EventMap extends CustomEventMap<EventMapBase, string>,
>(
  node: Target,
  callback: Callback<EventMap, Target>,
  signal: AbortSignal,
) => {
  callback({
    target: node,
    dispatchCustomEvent: (name, ...args) => {
      const { detail, signal, evtInit, hasExplicitDetail } =
        normalizeDispatchArgs(args);

      if (signal.aborted) return;

      const eventNameParts = name.split(":");
      const isChangeEvent = eventNameParts.at(-1) === "change";

      const detailWithType = detail
        ? { type: name, ...detail }
        : { type: name };

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

      return node.dispatchEvent(
        new CustomEvent(changeEventName, {
          detail: detailWithType,
          ...init,
        }),
      );
    },
    signal,
  });
};

export function customEvents<
  EventMap extends CustomEventMap<EventMapBase, string>,
  Target extends Element = HTMLElement,
>(callback: Callback<EventMap, Target>) {
  return ref<Target>((node, signal) => invokeCallback(node, callback, signal));
}
