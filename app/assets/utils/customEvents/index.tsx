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
import { isPropertyKey } from "./eventSources.ts";
export type { CustomEventsEventMap } from "./types.ts";

enablePatches();
enableMapSet();

type DescriptorWithState<Events extends EventDetails> =
  & CustomEventsDescriptor<Events>
  & {
    /** Retains the supplied event-map entries as directly readable state. */
    withState<const Value extends Partial<Events>>(
      value: StateInput<Events, Value>,
    ): Store<
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
    withState(value: EventDetails) {
      if (descriptorOptions?.host) {
        throw new TypeError(
          "customEvents withState() supplies its own EventTarget host.",
        );
      }
      return createStore(value);
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
      keyof EventTarget | "events" | "update" | "view" | "state"
    >,
> = [InvalidKeys] extends [never] ? Value : Value & {
  readonly __customEventsStateError:
    "withState() keys must be declared events and cannot overwrite its API.";
  readonly invalidKeys: InvalidKeys;
};

/** An EventTarget whose supplied map entries are directly readable state. */
type StoreEvents<Events, State> = Omit<Events, keyof State> &
  Immutable<State>;

/**
 * A state store: an EventTarget host, retained immutable state, and the event
 * source graph. State is readable only through `state`; `update()` writes it.
 */
type Store<
  Events extends EventDetails,
  State extends EventDetails,
> =
  & TypedEventTarget<CustomEventsEventMap<StoreEvents<Events, State>>>
  & {
    readonly events: CustomEventsDescriptor<
      StoreEvents<Events, State>,
      Immutable<State>
    >;
    readonly view: CustomEventsDescriptor<
      StoreEvents<Events, State>,
      Immutable<State>
    >["view"];
    /** The current immutable state snapshot. */
    readonly state: Immutable<State>;
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
      logicalPath.push(canonicalAddressSegment(segment));
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

    addAddress(previousPath);
    addAddress(nextPath);
    if (addresses.length === addressCount) addAddress([]);
  }
  return addresses;
}

function isPrimitive(value: unknown) {
  return value === null || typeof value !== "object";
}

function ownerAddress(value: unknown): readonly unknown[] {
  return [canonicalAddressSegment(value)];
}

/**
 * A stable live read-through view of the current snapshot: each top-level key
 * is an accessor forwarding to the latest `state`, so a destructured `state`
 * stays live through updates without capturing a frozen snapshot at setup.
 */
function createLiveState(getSnapshot: () => EventDetails): EventDetails {
  let state: EventDetails = {};
  for (let key of Object.keys(getSnapshot())) {
    Object.defineProperty(state, key, {
      enumerable: true,
      configurable: true,
      get() {
        return getSnapshot()[key];
      },
      set() {
        throw new TypeError(
          "Store state is immutable; update it through update().",
        );
      },
    });
  }
  return state;
}

function createStore(
  initialState: EventDetails,
) {
  let state = freeze(initialState, true) as EventDetails;
  let target = new EventTarget();
  let events = createCustomEventsDescriptor<EventDetails, EventDetails>(
    { host: target },
    { owner: target, getState: () => state },
  );
  Object.defineProperty(target, "state", {
    configurable: true,
    value: createLiveState(() => state),
  });
  return Object.assign(target, {
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
        let addresses = normalizePatches(
          state,
          nextState,
          keyPatches,
        );
        let nextValue = nextState[key];
        let previousOwner = state[key];

        if (
          isPrimitive(previousOwner) &&
          isPrimitive(nextValue)
        ) {
          entries.push({
            [key]: {
              detail: nextValue,
              options: {
                addresses: [
                  ...(previousOwner !== undefined && previousOwner !== null
                    ? [ownerAddress(previousOwner)]
                    : []),
                  ...(nextValue !== undefined && nextValue !== null
                    ? [ownerAddress(nextValue)]
                    : []),
                ],
              },
            },
          });
          continue;
        }

        entries.push({
          [key]: {
            detail: nextValue,
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
