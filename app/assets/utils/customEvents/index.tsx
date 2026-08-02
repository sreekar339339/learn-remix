import "./immerEnvironment.ts";
import {
  type Draft,
  enableMapSet,
  enablePatches,
  freeze,
  type Immutable,
  type Patch,
  produceWithPatches,
} from "immer";
import type { TypedEventTarget } from "remix/ui";
import { createCustomEventsDescriptor } from "./descriptor.tsx";
import { canonicalAddressSegment } from "./runtime.ts";
import type {
  CustomEventsDescriptor,
  CustomEventsDefinition,
  CustomEventsFactoryArgs,
  CustomEventsEventMap,
  CustomEventsOptions,
  EventDetails,
  NormalizeCustomEventsDefinition,
} from "./types.ts";
import {
  defaultArrayKey,
  isPropertyKey,
  samePropertyKey,
} from "./eventSources.ts";
export type { CustomEventsEventMap } from "./types.ts";

enablePatches();
enableMapSet();

const COLLECTION_STRUCTURE = Symbol("collectionStructure");

type DescriptorWithState<Events extends EventDetails> =
  & CustomEventsDescriptor<Events>
  & {
    /** Retains the supplied event-map entries as directly readable state. */
    withState<const Value extends Partial<Events>>(
      value: StateInput<Events, Value>,
      options?: StateOptions<
        Pick<Events, Extract<keyof Value, keyof Events>>
      >,
    ): StateModel<
      Events,
      Pick<Events, Extract<keyof Value, keyof Events>>
    >;
  };

/** Creates a typed native-event descriptor. */
export function customEvents<Definition extends CustomEventsDefinition>(
  ...args: CustomEventsFactoryArgs<Definition>
): DescriptorWithState<NormalizeCustomEventsDefinition<Definition>>;
export function customEvents(options?: unknown): unknown {
  let descriptorOptions = options as CustomEventsOptions | undefined;
  let descriptor = createCustomEventsDescriptor(descriptorOptions);
  return Object.assign(descriptor, {
    withState(value: EventDetails, stateOptions?: StateOptions<EventDetails>) {
      if (descriptorOptions?.host) {
        throw new TypeError(
          "customEvents withState() supplies its own EventTarget host.",
        );
      }
      return createStateModel(value, stateOptions);
    },
  });
}

type StateInput<
  Events extends EventDetails,
  Value extends Partial<Events>,
  InvalidKeys extends PropertyKey =
    | Exclude<keyof Value, keyof Events>
    | Extract<
      keyof Value,
      keyof EventTarget | "events" | "update" | "view"
    >,
> = [InvalidKeys] extends [never] ? Value : Value & {
  readonly __customEventsStateError:
    "withState() keys must be declared events and cannot overwrite its API.";
  readonly invalidKeys: InvalidKeys;
};

type StateValueKey<Value> = Exclude<Value, null | undefined> extends infer Key
  ? [Key] extends [never] ? never
  : [Key] extends [PropertyKey] ? "value"
  : never
  : never;

type StateOptions<State extends EventDetails> = {
  /** Routes identity-valued properties to their previous and next owners. */
  keyBy?: Partial<{
    [Key in keyof State]: StateValueKey<State[Key]>;
  }>;
};

type RuntimeStateOptions = {
  keyBy?: Record<string, "value" | undefined>;
};

/** An EventTarget whose supplied map entries are directly readable state. */
type StateModelEvents<Events, State> = Omit<Events, keyof State> &
  Immutable<State>;

type StateModel<
  Events extends EventDetails,
  State extends EventDetails,
> =
  & TypedEventTarget<CustomEventsEventMap<StateModelEvents<Events, State>>>
  & Immutable<State>
  & {
    readonly events: CustomEventsDescriptor<
      StateModelEvents<Events, State>,
      Immutable<State>
    >;
    readonly view: CustomEventsDescriptor<
      StateModelEvents<Events, State>,
      Immutable<State>
    >["view"];
    update(recipe: (draft: Draft<State>) => undefined): void;
  };

function resolvePatchPath(
  state: EventDetails,
  rootKey: string,
  segments: readonly unknown[],
): readonly unknown[] | undefined {
  let logicalPath: unknown[] = [];
  let value = state[rootKey];
  for (let segment of segments) {
    if (value instanceof Map) {
      if (!value.has(segment)) return;
      let item = value.get(segment);
      logicalPath.push(canonicalAddressSegment(segment));
      value = item;
      continue;
    }
    if (Array.isArray(value)) {
      if (typeof segment !== "number" || !Object.hasOwn(value, segment)) {
        return;
      }
      let item = value[segment];
      let identity = defaultArrayKey(item, segment);
      logicalPath.push(canonicalAddressSegment(identity));
      value = item;
      continue;
    }
    if (value !== null && typeof value === "object") {
      if (!isPropertyKey(segment) || !Object.hasOwn(value, segment)) {
        return;
      }
      logicalPath.push(segment);
      value = Reflect.get(value, segment);
      continue;
    }
    return;
  }
  return logicalPath;
}

function normalizePatches(
  previousState: EventDetails,
  nextState: EventDetails,
  patches: Patch[],
  routeByValue = false,
) {
  let rootKey = patches[0]?.path[0];
  if (typeof rootKey !== "string") {
    return [];
  }
  let previous = previousState[rootKey];
  let next = nextState[rootKey];
  let addresses: Array<readonly unknown[]> = [];

  let addAddress = (address: readonly unknown[] | undefined) => {
    if (!address) return;
    let duplicate = addresses.some((candidate) =>
      candidate.length === address.length &&
      candidate.every((segment, index) => Object.is(segment, address[index]))
    );
    if (!duplicate) addresses.push(address);
  };

  if (routeByValue) {
    if (isPropertyKey(previous)) {
      addAddress([canonicalAddressSegment(previous)]);
    }
    if (isPropertyKey(next)) addAddress([canonicalAddressSegment(next)]);
    return addresses;
  }

  for (let patch of patches) {
    let addressCount = addresses.length;
    let segments = (patch.path as unknown[]).slice(1);

    if (previous instanceof Set || next instanceof Set) {
      if (!Object.hasOwn(patch, "value")) {
        addAddress([]);
        continue;
      }
      addAddress([canonicalAddressSegment(patch.value)]);
      continue;
    }

    let previousPath = resolvePatchPath(
      previousState,
      rootKey,
      segments,
    );
    let nextPath = resolvePatchPath(
      nextState,
      rootKey,
      segments,
    );

    if (
      Array.isArray(previous) && Array.isArray(next) &&
      patch.path.length === 2 && typeof patch.path[1] === "number"
    ) {
      let index = patch.path[1];
      let candidates = [previous[index], next[index]];
      for (let item of candidates) {
        if (item === undefined) continue;
        let identity = defaultArrayKey(item, index);
        let stable = [previous, next].every((items) =>
          items.some((candidate, candidateIndex) =>
            samePropertyKey(
              defaultArrayKey(candidate, candidateIndex),
              identity,
            ) && Object.is(candidate, item)
          )
        );
        if (!stable) addAddress([canonicalAddressSegment(identity)]);
      }
      if (addresses.length === addressCount) {
        addAddress([COLLECTION_STRUCTURE]);
      }
      continue;
    }
    addAddress(previousPath);
    addAddress(nextPath);
    if (addresses.length === addressCount) addAddress([]);
  }
  return addresses;
}

function createStateModel(
  initialState: EventDetails,
  stateOptions?: RuntimeStateOptions,
) {
  let state = freeze(initialState, true) as EventDetails;
  let target = new EventTarget();
  let events = createCustomEventsDescriptor<EventDetails, EventDetails>(
    { host: target },
    { owner: target, getState: () => state },
  );
  return Object.assign(target, state, {
    events,
    view: events.view,
    update(recipe: (draft: Draft<EventDetails>) => void) {
      let [nextState, patches] = produceWithPatches(state, (draft) => {
        let result = recipe(draft);
        if (result !== undefined) {
          throw new TypeError(
            "State update recipes must be synchronous and return no value.",
          );
        }
      });
      if (patches.length === 0) return;

      let patchesByKey = Map.groupBy(
        patches,
        ({ path }) => path[0] as string,
      );

      let entries: Array<Record<string, unknown>> = [];
      for (let [key, keyPatches] of patchesByKey) {
        if (Object.hasOwn(nextState, key)) {
          Object.assign(target, { [key]: nextState[key] });
        } else {
          Reflect.deleteProperty(target, key);
        }
        let addresses = normalizePatches(
          state,
          nextState,
          keyPatches,
          stateOptions?.keyBy?.[key] === "value",
        );
        entries.push({
          [key]: {
            detail: nextState[key],
            options: { addresses },
          },
        });
      }

      state = nextState;
      target.dispatchEvent(
        (events.create as (...args: unknown[]) => Event)(entries),
      );
    },
  });
}
