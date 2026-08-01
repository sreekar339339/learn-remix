import type { TypedEventTarget } from "remix/ui";
import { createCustomEventsDescriptor } from "./descriptor.tsx";
import type {
  CustomEventsBatchEntryOptions,
  CustomEventsDescriptor,
  CustomEventsDefinition,
  CustomEventsFactoryArgs,
  CustomEventsEventMap,
  CustomEventsOptions,
  EventDetails,
  NormalizeCustomEventsDefinition,
} from "./types.ts";
export type { CustomEventsEventMap } from "./types.ts";

type DescriptorWithState<Events extends EventDetails> =
  & CustomEventsDescriptor<Events>
  & {
    /** Retains the supplied event-map entries as directly readable state. */
    withState<const Value extends Partial<Events>>(
      value: StateInput<Events, Value>,
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
    withState(value: EventDetails) {
      if (descriptorOptions?.host) {
        throw new TypeError(
          "customEvents withState() supplies its own EventTarget host.",
        );
      }
      return createStateModel(value);
    },
  });
}

type StateInput<
  Events extends EventDetails,
  Value extends Partial<Events>,
  InvalidKeys extends PropertyKey =
    | Exclude<keyof Value, keyof Events>
    | Extract<keyof Value, keyof EventTarget | "events" | "patch">,
> = [InvalidKeys] extends [never] ? Value : Value & {
  readonly __customEventsStateError:
    "withState() keys must be declared events and cannot overwrite its API.";
  readonly invalidKeys: InvalidKeys;
};

/** An EventTarget whose supplied map entries are directly readable state. */
type StateModel<
  Events extends EventDetails,
  State extends EventDetails,
> =
  & TypedEventTarget<CustomEventsEventMap<Events>>
  & Readonly<State>
  & {
    readonly events: CustomEventsDescriptor<
      Omit<Events, keyof State>,
      Events
    >;
    patch(
      value: Partial<State>,
      options?: CustomEventsBatchEntryOptions,
    ): void;
  };

function createStateModel(value: EventDetails) {
  let target = new EventTarget();
  let events = createCustomEventsDescriptor<EventDetails>({ host: target });
  return Object.assign(target, value, {
    events,
    patch(value: EventDetails, options?: CustomEventsBatchEntryOptions) {
      Object.assign(target, value);
      target.dispatchEvent(events(value, options));
    },
  });
}
