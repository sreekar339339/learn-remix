declare const stateEventSourceBrand: unique symbol;

export type StateEventSource<Value, Type extends string> = {
  readonly [stateEventSourceBrand]: {
    value: Value;
    type: Type;
  };
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

export type StateEventSourceMetadata = {
  owner: object;
  type: string;
  path: readonly unknown[];
  read(): unknown;
};

let metadataBySource = new WeakMap<object, StateEventSourceMetadata>();

export function getStateEventSourceMetadata(value: unknown) {
  return value !== null && typeof value === "object"
    ? metadataBySource.get(value)
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

function readProperty(
  parent: unknown,
  property: PropertyKey,
) {
  if (Array.isArray(parent)) {
    let index = parent.findIndex((item, index) =>
      samePropertyKey(defaultArrayKey(item, index), property)
    );
    return index < 0 ? undefined : parent[index];
  }

  return parent === null || parent === undefined
    ? undefined
    : Reflect.get(Object(parent), property);
}

function createEventSource(
  owner: object,
  type: string,
  path: readonly unknown[],
  read: () => unknown,
): object {
  let children = new Map<unknown, object>();
  let node = new Proxy(Object.create(null), {
    get(_, property) {
      let current = read();
      if (property === "get" && current instanceof Map) {
        return (key: unknown) => {
          let cached = children.get(key);
          if (cached) return cached;
          let child = createEventSource(
            owner,
            type,
            [...path, key],
            () => {
              let value = read();
              return value instanceof Map ? value.get(key) : undefined;
            },
          );
          children.set(key, child);
          return child;
        };
      }
      if (property === "has" && current instanceof Set) {
        return (value: unknown) => {
          let cached = children.get(value);
          if (cached) return cached;
          let child = createEventSource(
            owner,
            type,
            [...path, value],
            () => {
              let set = read();
              return set instanceof Set ? set.has(value) : false;
            },
          );
          children.set(value, child);
          return child;
        };
      }

      let cached = children.get(property);
      if (cached) return cached;
      let child = createEventSource(
        owner,
        type,
        [...path, property],
        () => readProperty(read(), property),
      );
      children.set(property, child);
      return child;
    },
  });
  metadataBySource.set(node, { owner, type, path, read });
  return node;
}

export function createStateEventSources<State extends Record<string, unknown>>(
  owner: object,
  getState: () => State,
): StateEventSources<State> {
  let stateKeys = new Set(Object.keys(getState()));
  let children = new Map<string, object>();
  return new Proxy(Object.create(null), {
    get(_, property) {
      if (typeof property !== "string") return undefined;
      if (!stateKeys.has(property)) return property;
      let cached = children.get(property);
      if (cached) return cached;
      let child = createEventSource(
        owner,
        property,
        [property],
        () => getState()[property],
      );
      children.set(property, child);
      return child;
    },
  }) as StateEventSources<State>;
}
