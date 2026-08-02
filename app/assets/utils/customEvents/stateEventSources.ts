import { canonicalAddressSegment } from "./runtime.ts";

const stateEventSourceMetadata: unique symbol = Symbol("stateEventSource");

export type StateEventSourceMetadata<
  Value = unknown,
  Type extends string = string,
> = {
  owner: object;
  type: Type;
  path: readonly unknown[];
};

export type StateEventSource<Value, Type extends string> = {
  readonly [stateEventSourceMetadata]: StateEventSourceMetadata<Value, Type>;
};

type Defined<Value> = Exclude<Value, null | undefined>;
type PreserveMissing<Parent, Value> = Extract<Parent, null | undefined> extends never
  ? Value
  : Value | undefined;

type ArrayIdentity<Item> = Item extends { readonly id: infer Id }
  ? Id extends PropertyKey ? Id : number
  : number;

type StateEventSourceNode<Value, Type extends string> =
  & StateEventSource<Value, Type>
  & (Defined<Value> extends ReadonlyMap<infer Key, infer Item>
    ? { get(key: Key): StateEventSourceNode<Item | undefined, Type> }
    : Defined<Value> extends ReadonlySet<infer Item>
      ? { has(value: Item): StateEventSourceNode<boolean, Type> }
    : Defined<Value> extends readonly (infer Item)[]
      ? {
          readonly [Key in ArrayIdentity<Item> & PropertyKey]:
            StateEventSourceNode<Item | undefined, Type>;
        }
    : Defined<Value> extends object
      ? {
          readonly [Key in keyof Defined<Value>]: StateEventSourceNode<
            PreserveMissing<Value, Defined<Value>[Key]>,
            Type
          >;
        }
    : unknown);

export type StateEventSources<State extends Record<string, unknown>> = {
  readonly [Type in keyof State & string]: StateEventSourceNode<
    State[Type],
    Type
  >;
};

export function getStateEventSourceMetadata(value: unknown) {
  return value !== null && typeof value === "object"
    ? Reflect.get(value, stateEventSourceMetadata) as
      | StateEventSourceMetadata
      | undefined
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

export function readStateEventSource({
  owner,
  type,
  path,
}: StateEventSourceMetadata) {
  let value = Reflect.get(owner, type);
  for (let segment of path) {
    if (value instanceof Map) {
      let entry = value.entries().find(([key]) =>
        samePropertyKey(key, segment)
      );
      value = entry?.[1];
    } else if (value instanceof Set) {
      value = value.values().some((item) => samePropertyKey(item, segment));
    } else if (Array.isArray(value)) {
      value = value.find((item, index) =>
        samePropertyKey(defaultArrayKey(item, index), segment)
      );
    } else {
      value = value === null || value === undefined
        ? undefined
        : Reflect.get(Object(value), segment as PropertyKey);
    }
  }
  return value;
}

function createEventSource(
  owner: object,
  type: string,
  path: readonly unknown[],
): object {
  let metadata: StateEventSourceMetadata = { owner, type, path };
  let node = new Proxy(Object.create(null), {
    get(_, property) {
      if (property === stateEventSourceMetadata) return metadata;
      let current = readStateEventSource(metadata);
      if (property === "get" && current instanceof Map) {
        return (key: unknown) =>
          createEventSource(
            owner,
            type,
            [...path, canonicalAddressSegment(key)],
          );
      }
      if (property === "has" && current instanceof Set) {
        return (value: unknown) =>
          createEventSource(
            owner,
            type,
            [...path, canonicalAddressSegment(value)],
          );
      }

      return createEventSource(
        owner,
        type,
        [...path, property],
      );
    },
  });
  return node;
}

export function createStateEventSources<State extends Record<string, unknown>>(
  owner: object,
  getState: () => State,
): StateEventSources<State> {
  let stateKeys = new Set(Object.keys(getState()));
  return new Proxy(Object.create(null), {
    get(_, property) {
      if (typeof property !== "string") return undefined;
      if (!stateKeys.has(property)) return property;
      return createEventSource(
        owner,
        property,
        [],
      );
    },
  }) as StateEventSources<State>;
}
