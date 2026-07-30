import {
  createElement,
  createMixin,
  ref,
  type Handle,
  type RemixNode,
} from "remix/ui";
import { CUSTOM_EVENTS_ALL } from "./constants.ts";
import {
  createListenerEvent,
  type CustomEventsRuntime,
} from "./runtime.ts";
import type {
  CustomEventsEvent,
  CustomEventsEventElement,
  CustomEventsEventElements,
  CustomEventsEventElementProps,
  CustomEventsEventType,
  EventDetails,
} from "./types.ts";

function registerElementSubscription(
  element: Element,
  signal: AbortSignal,
  descriptor: CustomEventsRuntime,
  eventTypes: ReadonlySet<string> | null,
  phase: "projection" | "effect",
  notify: (event: CustomEvent) => Promise<unknown> | void,
) {
  let unregisterTarget = descriptor.registerDispatchTarget(element);
  let unregisterSubscription = descriptor.registerElementSubscription({
    element,
    eventTypes,
    phase,
    notify,
  });
  signal.addEventListener("abort", () => {
    unregisterSubscription();
    unregisterTarget();
  }, { once: true });
}

export const customEventsOnMixin = createMixin<
  Element,
  [
    descriptor: CustomEventsRuntime,
    types: string | readonly string[],
    listener: (event: Event, signal: AbortSignal) => void | Promise<void>,
  ]
>((handle) => {
  return (descriptor, types, listener) => {
    let eventTypes = typeof types === "string" ? [types] : [...types];
    let allEvents = eventTypes.length === 1 &&
      eventTypes[0] === CUSTOM_EVENTS_ALL;
    if (allEvents) eventTypes = [];
    for (let type of eventTypes) descriptor.addEventType(type);
    let selectedTypes = allEvents
      ? null
      : new Set(eventTypes);
    return (
      <handle.element
        mix={ref((element, signal) => {
          let reentry: AbortController | undefined;
          registerElementSubscription(
            element,
            signal,
            descriptor,
            selectedTypes,
            "effect",
            (event) => {
              reentry?.abort();
              reentry = new AbortController();
              void listener(
                createListenerEvent(event, element),
                reentry.signal,
              );
            },
          );
          signal.addEventListener("abort", () => reentry?.abort(), {
            once: true,
          });
        })}
      />
    );
  };
});

function prependMixins(mix: unknown, internalMixins: unknown[]) {
  if (mix === undefined) return internalMixins;
  return Array.isArray(mix)
    ? [...internalMixins, ...mix]
    : [...internalMixins, mix];
}

function isReactiveElementProp(key: string) {
  return !(
    key === "children" ||
    key === "key" ||
    key === "mix" ||
    key === "ref" ||
    key === "child" ||
    key === "on" ||
    key.startsWith("on")
  );
}

function resolveEventElementProps(
  props: Record<string, unknown>,
  event: Event | undefined,
) {
  let resolved = { ...props };
  for (let key of Object.keys(props)) {
    let value = props[key];
    if (typeof value === "function" && isReactiveElementProp(key)) {
      resolved[key] = value(event);
    }
  }
  return resolved;
}

function createCustomEventsEventElement<
  Events extends EventDetails,
  Type extends CustomEventsEventType<Events>,
  Tag extends keyof JSX.IntrinsicElements,
>(
  types: readonly Type[] | typeof CUSTOM_EVENTS_ALL,
  tag: Tag,
  descriptor: CustomEventsRuntime,
): CustomEventsEventElement<Events, Type, Tag> {
  let allEvents = types === CUSTOM_EVENTS_ALL;
  let eventTypes: readonly Type[] = allEvents
    ? []
    : types as readonly Type[];
  for (let type of eventTypes) descriptor.addEventType(type);
  let selectedTypes = allEvents
    ? null
    : new Set(eventTypes);

  return function CustomEventsEventElement(
    handle: Handle<CustomEventsEventElementProps<Events, Type, Tag>>,
  ) {
    let currentEvent: Event | undefined;
    let projectionMix = ref((element, signal) => {
      registerElementSubscription(
        element,
        signal,
        descriptor,
        selectedTypes,
        "projection",
        (event) => {
          currentEvent = event as unknown as CustomEventsEvent<Events, Type>;
          return handle.update();
        },
      );
    });

    return () => {
      let event = currentEvent as CustomEventsEvent<Events, Type> | undefined;
      let {
        children,
        mix,
        child,
        ...elementProps
      } = handle.props as CustomEventsEventElementProps<
        Events,
        Type,
        Tag
      > & Record<string, unknown>;

      if (child !== undefined && children !== undefined) {
        throw new Error(
          "customEvents event elements accept either static children or child(), not both.",
        );
      }

      let content = typeof child === "function"
        ? child(event, handle)
        : children;
      let resolvedProps = resolveEventElementProps(
        elementProps,
        event,
      );
      return createElement(
        tag,
        {
          ...resolvedProps,
          mix: prependMixins(mix, [projectionMix]),
        },
        content,
      );
    };
  } as CustomEventsEventElement<Events, Type, Tag>;
}

export function createCustomEventsEventElements<
  Events extends EventDetails,
  Type extends CustomEventsEventType<Events>,
>(
  types: readonly Type[] | typeof CUSTOM_EVENTS_ALL,
  descriptor: CustomEventsRuntime,
): CustomEventsEventElements<Events, Type> {
  let elements = new Map<string, CustomEventsEventElement<Events, Type, any>>();

  return new Proxy({}, {
    get(_, property) {
      if (typeof property !== "string") return undefined;

      let element = elements.get(property);
      if (!element) {
        element = createCustomEventsEventElement(
          types,
          property as keyof JSX.IntrinsicElements,
          descriptor,
        );
        elements.set(property, element);
      }
      return element;
    },
  }) as CustomEventsEventElements<Events, Type>;
}
