import {
  createElement,
  createMixin,
  ref,
  type Handle,
  type RemixNode,
} from "remix/ui";
import {
  addEventType,
  getEventName,
  getEventType,
} from "./protocol.ts";
import { defineEventValue } from "./dom.ts";
import type { CustomEventsRuntime } from "./runtime.ts";
import type {
  CustomEventWithMetadata,
  CustomEventsEvent,
  CustomEventsEventElement,
  CustomEventsEventElements,
  CustomEventsEventElementProps,
  CustomEventsEventType,
  CustomEventsRenderDetail,
  EventDetails,
} from "./types.ts";

function createListenerEvent(
  event: CustomEvent,
  descriptor: CustomEventsRuntime,
  currentTarget: Element,
) {
  let origin = descriptor.getOriginTarget(event);
  let key = descriptor.getEventKey(event);
  let localType = getEventType(descriptor, event.type) ?? event.type;
  let listenerEvent = descriptor.createCustomEvent(
    localType,
    {
      bubbles: false,
      cancelable: event.cancelable,
      composed: event.composed,
    },
    event.detail,
    {
      ...(origin ? { origin } : {}),
      ...(key === undefined ? {} : { key }),
    },
  );
  defineEventValue(listenerEvent, "target", event.target);
  defineEventValue(listenerEvent, "currentTarget", currentTarget);
  return listenerEvent;
}

function registerElementSubscription(
  element: Element,
  signal: AbortSignal,
  descriptor: CustomEventsRuntime,
  eventNames: ReadonlySet<string>,
  phase: "projection" | "effect",
  notify: (event: CustomEvent, committed?: () => void) => boolean | void,
) {
  let unregisterTarget = descriptor.registerDispatchTarget(element);
  let unregisterSubscription = descriptor.registerSubscription({
    element,
    eventNames,
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
    for (let type of eventTypes) addEventType(descriptor, type);
    let eventNames = new Set(
      eventTypes.map((type) => getEventName(descriptor, type)),
    );
    return (
      <handle.element
        mix={ref((element, signal) => {
          let reentry: AbortController | undefined;
          registerElementSubscription(
            element,
            signal,
            descriptor,
            eventNames,
            "effect",
            (event) => {
              reentry?.abort();
              reentry = new AbortController();
              void listener(
                createListenerEvent(event, descriptor, element),
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
  detail: unknown,
  event: Event | undefined,
) {
  let resolved = { ...props };
  for (let key of Object.keys(props)) {
    let value = props[key];
    if (typeof value === "function" && isReactiveElementProp(key)) {
      resolved[key] = value(detail, event);
    }
  }
  return resolved;
}

function createCustomEventsEventElement<
  Events extends EventDetails,
  Type extends CustomEventsEventType<Events>,
  Tag extends keyof JSX.IntrinsicElements,
>(
  types: readonly Type[],
  tag: Tag,
  descriptor: CustomEventsRuntime,
): CustomEventsEventElement<Events, Type, Tag> {
  for (let type of types) addEventType(descriptor, type);
  let eventNames = new Set(
    types.map((type) => getEventName(descriptor, type)),
  );

  return function CustomEventsEventElement(
    handle: Handle<CustomEventsEventElementProps<Events, Type, Tag>>,
  ) {
    let currentEvent: Event | undefined;
    let projectionMix = ref((element, signal) => {
      registerElementSubscription(
        element,
        signal,
        descriptor,
        eventNames,
        "projection",
        (event, committed) => {
          let projectedEvent = createListenerEvent(
            event,
            descriptor,
            element,
          ) as unknown as CustomEventsEvent<Events, Type>;
          let detail = (projectedEvent as unknown as CustomEvent)
            .detail as CustomEventsRenderDetail<
            Events,
            Type
          >;
          let when = handle.props.when;
          if (when && !when(detail, projectedEvent)) return;
          currentEvent = projectedEvent;
          handle.update();
          handle.queueTask(() => committed?.());
          return true;
        },
      );
    });

    return () => {
      let event =
        currentEvent && descriptor.ownsEvent(currentEvent)
          ? (currentEvent as CustomEventsEvent<Events, Type>)
          : undefined;
      let detail = (event
        ? (event as unknown as CustomEvent).detail
        : undefined) as CustomEventsRenderDetail<Events, Type>;
      let {
        children,
        mix,
        child,
        when: _when,
        ...elementProps
      } = handle.props as CustomEventsEventElementProps<
        Events,
        Type,
        Tag
      > & Record<string, unknown>;

      if (child !== undefined && children !== undefined) {
        throw new Error(
          "CustomEvents event elements accept either static children or child(), not both.",
        );
      }

      let content = typeof child === "function"
        ? child(detail, event, handle)
        : children;
      let resolvedProps = resolveEventElementProps(
        elementProps,
        detail,
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
  types: readonly Type[],
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
