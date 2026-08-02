import "./immerEnvironment.ts";
import {
  type Draft,
  enableMapSet,
  enablePatches,
  type Patch,
  produceWithPatches,
} from "immer";
import type { TypedEventTarget } from "remix/ui";
import { createCustomEventsDescriptor } from "./descriptor.tsx";
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
  createStateEventSources,
  defaultArrayKey,
  isPropertyKey,
  samePropertyKey,
} from "./stateEventSources.ts";
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
      keyof EventTarget | "events" | "update"
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
type StateModel<
  Events extends EventDetails,
  State extends EventDetails,
> =
  & TypedEventTarget<CustomEventsEventMap<Events>>
  & Readonly<State>
  & {
    readonly events: CustomEventsDescriptor<Events, State>;
    update(recipe: (draft: Draft<State>) => void): void;
  };

function canonicalPropertyKey(key: PropertyKey) {
  return typeof key === "symbol" ? key : String(key);
}

function resolvePatchPath(
  state: EventDetails,
  rootKey: string,
  segments: readonly unknown[],
  routingKeys?: Set<PropertyKey>,
): readonly unknown[] | undefined {
  let logicalPath: unknown[] = [rootKey];
  let route = routingKeys;
  let value = state[rootKey];
  for (let segment of segments) {
    if (value instanceof Map) {
      if (!value.has(segment)) return;
      let item = value.get(segment);
      logicalPath.push(segment);
      if (route) {
        if (!isPropertyKey(segment)) route = undefined;
        else route.add(segment);
      }
      value = item;
      continue;
    }
    if (Array.isArray(value)) {
      if (typeof segment !== "number" || !Object.hasOwn(value, segment)) {
        return;
      }
      let item = value[segment];
      let identity = defaultArrayKey(item, segment);
      logicalPath.push(canonicalPropertyKey(identity));
      route?.add(identity);
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
    return { changedPaths: [], routingKeys: undefined };
  }
  let previous = previousState[rootKey];
  let next = nextState[rootKey];
  let paths: Array<readonly unknown[]> = [];
  let keys = new Set<PropertyKey>();
  let routingValid = routeByValue ||
    (previous !== null && typeof previous === "object" &&
      patches.every(({ path }) => path.length >= 2));
  if (routeByValue) {
    if (isPropertyKey(previous)) keys.add(previous);
    if (isPropertyKey(next)) keys.add(next);
  }

  let addPath = (path: readonly unknown[] | undefined) => {
    if (!path) return;
    let duplicate = paths.some((candidate) =>
      candidate.length === path.length &&
      candidate.every((segment, index) => Object.is(segment, path[index]))
    );
    if (!duplicate) paths.push(path);
  };
  for (let patch of patches) {
    let pathCount = paths.length;
    let segments = (patch.path as unknown[]).slice(1);

    if (previous instanceof Set || next instanceof Set) {
      if (!Object.hasOwn(patch, "value")) {
        routingValid = false;
        addPath([rootKey]);
        continue;
      }
      let item = patch.value;
      if (routingValid && !routeByValue) {
        if (isPropertyKey(item)) keys.add(item);
        else routingValid = false;
      }
      addPath([rootKey, item]);
      continue;
    }

    let collectedKeys = routingValid && !routeByValue ? keys : undefined;
    let previousPath = resolvePatchPath(
      previousState,
      rootKey,
      segments,
      collectedKeys,
    );
    let nextPath = resolvePatchPath(
      nextState,
      rootKey,
      segments,
      collectedKeys,
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
        if (!stable) addPath([rootKey, canonicalPropertyKey(identity)]);
      }
      if (paths.length === pathCount) {
        addPath([rootKey, COLLECTION_STRUCTURE]);
      }
      continue;
    }
    addPath(previousPath);
    addPath(nextPath);
    if (paths.length === pathCount) addPath([rootKey]);
  }
  return {
    changedPaths: paths,
    routingKeys: routingValid && keys.size
      ? keys.values().toArray()
      : undefined,
  };
}

function createStateModel(
  initialState: EventDetails,
  stateOptions?: RuntimeStateOptions,
) {
  let state = initialState;
  let target = new EventTarget();
  let stateSources = createStateEventSources(target, () => state);
  let events = createCustomEventsDescriptor<EventDetails, EventDetails>(
    { host: target },
    { owner: target, sources: stateSources },
  );
  return Object.assign(target, state, {
    events,
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
        let { routingKeys, changedPaths } = normalizePatches(
          state,
          nextState,
          keyPatches,
          stateOptions?.keyBy?.[key] === "value",
        );
        entries.push({
          [key]: {
            detail: nextState[key],
            options: { routingKeys, changedPaths },
          },
        });
      }

      state = nextState;
      target.dispatchEvent(
        (events as (...args: unknown[]) => Event)(entries),
      );
    },
  });
}
