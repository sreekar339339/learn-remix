import {
  createElement,
  createMixin,
  ref,
  type Handle,
  type RemixNode,
} from "remix/ui";
import { createListenerEvent, type CustomEventsRuntime } from "./runtime.ts";
import {
  type CustomEventsEventElement,
  type CustomEventsEventElements,
  type CustomEventsEventElementProps,
  type CustomEventsEventType,
  type CustomEventsEventMap,
  type EventDetails,
} from "./types.ts";

const ALL_EVENTS = "*";

function selectEventTypes(types: string | readonly string[]) {
  let selected = typeof types === "string" ? [types] : types;
  if (selected.length === 1 && selected[0] === ALL_EVENTS) return null;
  return new Set(selected);
}

export const customEventsOnMixin = createMixin<
  Element,
  [
    runtime: CustomEventsRuntime,
    types: string | readonly string[],
    listener: (event: Event, signal: AbortSignal) => void | Promise<void>,
  ]
>((handle) => {
  return (runtime, types, listener) => {
    let eventTypes = selectEventTypes(types);
    return (
      <handle.element
        mix={ref((element, signal) => {
          let reentry: AbortController | undefined;
          runtime.subscribeElement({
            element,
            eventTypes,
            phase: "effect",
            notify(event) {
              reentry?.abort();
              reentry = new AbortController();
              return listener(
                createListenerEvent(event, element),
                reentry.signal,
              );
            },
          }, signal);
          signal.addEventListener("abort", () => reentry?.abort(), {
            once: true,
          });
        })}
      />
    );
  };
});

function prependMixin(mix: unknown, internalMixin: unknown) {
  if (mix === undefined) return [internalMixin];
  return Array.isArray(mix)
    ? [internalMixin, ...mix]
    : [internalMixin, mix];
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
  types: readonly Type[] | typeof ALL_EVENTS,
  tag: Tag,
  runtime: CustomEventsRuntime,
): CustomEventsEventElement<Events, Type, Tag> {
  let eventTypes = selectEventTypes(types);

  return function CustomEventsEventElement(
    handle: Handle<CustomEventsEventElementProps<Events, Type, Tag>>,
  ) {
    let currentEvent:
      | CustomEventsEventMap<Events>[Type]
      | undefined;
    let projectionMix = ref((element, signal) => {
      runtime.subscribeElement(
        {
          element,
          eventTypes,
          phase: "projection",
          notify(event) {
            currentEvent = event as
              unknown as CustomEventsEventMap<Events>[Type];
            return handle.update();
          },
        },
        signal,
      );
    });

    return () => {
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
        ? child(currentEvent)
        : children;
      let resolvedProps = resolveEventElementProps(
        elementProps,
        currentEvent,
      );
      return createElement(
        tag,
        {
          ...resolvedProps,
          mix: prependMixin(mix, projectionMix),
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
  types: readonly Type[] | typeof ALL_EVENTS,
  runtime: CustomEventsRuntime,
): CustomEventsEventElements<Events, Type> {
  let elements = new Map<
    string,
    CustomEventsEventElements<Events, Type>[keyof JSX.IntrinsicElements]
  >();

  return new Proxy({}, {
    get(_, property) {
      if (typeof property !== "string") return undefined;

      let element = elements.get(property);
      if (!element) {
        element = createCustomEventsEventElement(
          types,
          property as keyof JSX.IntrinsicElements,
          runtime,
        );
        elements.set(property, element);
      }
      return element;
    },
  }) as CustomEventsEventElements<Events, Type>;
}
