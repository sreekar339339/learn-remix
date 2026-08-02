import type { MixinDescriptor } from "remix/ui";
import { canonicalAddressSegment } from "./runtime.ts";

const eventSourceMetadata: unique symbol = Symbol("eventSource");
const currentEventSource: unique symbol = Symbol("currentEventSource");

export type EventSourceMetadata<
  Value = unknown,
  Type extends string = string,
> = {
  owner: object;
  type: Type;
  path: readonly unknown[];
  read?: () => Value;
};

type EventSourceListener<Value, Type extends string, Host extends Element> = (
  event: CustomEvent<Value> & {
    readonly type: Type;
    readonly currentTarget: Host;
  },
) => void | Promise<unknown>;

export type EventSource<
  Value,
  Type extends string,
  Current extends boolean = false,
> = {
  readonly [eventSourceMetadata]: EventSourceMetadata<Value, Type>;
  readonly [currentEventSource]: Current;
  on<Host extends Element = Element>(
    listener: EventSourceListener<Value, Type, Host>,
  ): MixinDescriptor<Host, any>;
};

export type EventSourceHasCurrent<Source> =
  Source extends { readonly [currentEventSource]: true } ? true : false;

type Defined<Value> = Exclude<Value, null | undefined>;
type PreserveMissing<Parent, Value> = Extract<Parent, null | undefined> extends never
  ? Value
  : Value | undefined;

type ArrayIdentity<Item> = Item extends { readonly id: infer Id }
  ? Id extends PropertyKey ? Id : number
  : number;

export type StateEventSource<Value, Type extends string> =
  & EventSource<Value, Type, true>
  & (Defined<Value> extends ReadonlyMap<infer Key, infer Item>
    ? { get(key: Key): StateEventSource<Item | undefined, Type> }
    : Defined<Value> extends ReadonlySet<infer Item>
      ? { has(value: Item): StateEventSource<boolean, Type> }
    : Defined<Value> extends readonly (infer Item)[]
      ? {
          readonly [Key in ArrayIdentity<Item> & PropertyKey]: StateEventSource<
            Item | undefined,
            Type
          >;
        }
    : Defined<Value> extends object
      ? {
          readonly [Key in keyof Defined<Value>]: StateEventSource<
            PreserveMissing<Value, Defined<Value>[Key]>,
            Type
          >;
        }
    : unknown);

export type EventSources<
  Events extends Record<string, unknown>,
  State extends Record<string, unknown> | never = never,
> = [State] extends [never]
  ? {
      readonly [Type in keyof Events & string]: EventSource<Events[Type], Type>;
    }
  : {
      readonly [Type in keyof Events & string]: Type extends keyof State & string
        ? StateEventSource<State[Type], Type>
        : EventSource<Events[Type], Type>;
    };

export function getEventSourceMetadata(value: unknown) {
  return value !== null && (typeof value === "object" || typeof value === "function")
    ? Reflect.get(value, eventSourceMetadata) as EventSourceMetadata | undefined
    : undefined;
}

export function isPropertyKey(value: unknown): value is PropertyKey {
  return typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "symbol";
}

export function defaultArrayKey(item: unknown, index: number): PropertyKey {
  if (
    item !== null && typeof item === "object" && Object.hasOwn(item, "id")
  ) {
    let id = Reflect.get(item, "id");
    if (isPropertyKey(id)) return id;
  }
  return index;
}

export function samePropertyKey(left: unknown, right: unknown) {
  return Object.is(left, right) ||
    (isPropertyKey(left) && isPropertyKey(right) &&
      typeof left !== "symbol" && typeof right !== "symbol" &&
      String(left) === String(right));
}

function readPath(value: unknown, path: readonly unknown[]) {
  for (let segment of path) {
    if (value instanceof Map) {
      if (value.has(segment)) {
        value = value.get(segment);
      } else {
        value = value.entries().find(([key]) =>
          samePropertyKey(key, segment)
        )?.[1];
      }
    } else if (value instanceof Set) {
      value = value.values().some((item) => samePropertyKey(item, segment));
    } else if (Array.isArray(value)) {
      value = value.find((item, index) =>
        samePropertyKey(defaultArrayKey(item, index), segment)
      );
    } else {
      value = value == null
        ? undefined
        : Reflect.get(Object(value), segment as PropertyKey);
    }
  }
  return value;
}

export function readEventSource({ read }: EventSourceMetadata) {
  return read?.();
}

type EffectFactory = (
  metadata: EventSourceMetadata,
  listener: (event: Event) => void | Promise<unknown>,
) => MixinDescriptor<Element, any>;

export function createEventSource(
  owner: object,
  type: string,
  readRoot: (() => unknown) | undefined,
  createEffect: EffectFactory,
  path: readonly unknown[] = [],
): object {
  let metadata: EventSourceMetadata = {
    owner,
    type,
    path,
    ...(readRoot ? { read: () => readPath(readRoot(), path) } : {}),
  };
  return new Proxy(Object.create(null), {
    get(_, property) {
      if (property === eventSourceMetadata) return metadata;
      if (property === currentEventSource) return readRoot !== undefined;
      if (property === "on") {
        return (listener: (event: Event) => void | Promise<unknown>) =>
          createEffect(metadata, listener);
      }

      let current = readEventSource(metadata);
      if (property === "get" && current instanceof Map) {
        return (key: unknown) =>
          createEventSource(
            owner,
            type,
            readRoot,
            createEffect,
            [...path, canonicalAddressSegment(key)],
          );
      }
      if (property === "has" && current instanceof Set) {
        return (value: unknown) =>
          createEventSource(
            owner,
            type,
            readRoot,
            createEffect,
            [...path, canonicalAddressSegment(value)],
          );
      }
      return createEventSource(
        owner,
        type,
        readRoot,
        createEffect,
        [...path, property],
      );
    },
  });
}
