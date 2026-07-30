import { createCustomEventsDescriptor } from "./descriptor.tsx";
import type {
  CustomEventsDescriptor,
  CustomEventsDefinition,
  CustomEventsFactoryArgs,
  CustomEventsOptions,
  NormalizeCustomEventsDefinition,
} from "./types.ts";

/** A typed native-event descriptor. See README.md for usage and design rules. */
export type CustomEvents<Definition extends CustomEventsDefinition> =
  CustomEventsDescriptor<NormalizeCustomEventsDefinition<Definition>>;

/** Creates a typed native-event descriptor. */
export function customEvents<Definition extends CustomEventsDefinition>(
  ...args: CustomEventsFactoryArgs<Definition>
): CustomEvents<Definition>;
export function customEvents(options?: unknown) {
  return createCustomEventsDescriptor(
    options as CustomEventsOptions | undefined,
  );
}
