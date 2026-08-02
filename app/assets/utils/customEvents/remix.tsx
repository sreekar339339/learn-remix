import {
  createElement,
  createMixin,
  ref,
  type Handle,
  type RemixNode,
} from "remix/ui";
import {
  createCurrentTargetEvent,
  customEventsRuntime,
  type CustomEventsRuntimeState,
} from "./runtime.ts";
import {
  type CustomEventsEventElement,
  type EventDetails,
} from "./types.ts";
import {
  getEventSourceMetadata,
  readEventSource,
  type EventSourceMetadata,
} from "./eventSources.ts";

export const customEventsOnMixin = createMixin<
  Element,
  [
    runtime: CustomEventsRuntimeState,
    source: EventSourceMetadata | undefined,
    listener: (event: Event) => void | Promise<unknown>,
  ]
>((handle) => {
  return (runtime, source, listener) => {
    return (
      <handle.element
        mix={ref((element, signal) => {
          customEventsRuntime.subscribe(
            runtime,
            "effect",
            {
              element,
              eventTypes: source ? new Set([source.type]) : null,
              ...(source
                ? { addresses: new Map([[source.type, source.path]]) }
                : {}),
              notify(event) {
                return listener(createCurrentTargetEvent(event, element));
              },
            },
            signal,
          );
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

function createProjectionEvent(
  metadata: EventSourceMetadata,
  sourceEvent?: CustomEvent,
) {
  return new CustomEvent(metadata.type, {
    bubbles: false,
    cancelable: false,
    composed: sourceEvent?.composed,
    detail: readEventSource(metadata),
  });
}

function isReactiveElementProp(key: string) {
  return !(
    key === "children" ||
    key === "key" ||
    key === "mix" ||
    key === "ref" ||
    key === "on" ||
    key.startsWith("on")
  );
}

function resolveEventElementProps(
  props: Record<string, unknown>,
  input: unknown,
) {
  let resolved = { ...props };
  for (let key of Object.keys(props)) {
    let value = props[key];
    if (typeof value === "function" && isReactiveElementProp(key)) {
      resolved[key] = value(input);
    }
  }
  return resolved;
}

function createCustomEventsEventElement<
  Events extends EventDetails,
  State extends EventDetails | never,
  Tag extends keyof JSX.IntrinsicElements,
>(
  tag: Tag,
  runtime: CustomEventsRuntimeState,
  sourceOwner: object,
): CustomEventsEventElement<Events, State, Tag> {
  type RuntimeProps = Record<string, unknown> & {
    on?: object | readonly object[];
    initial?: unknown;
  };

  function CustomEventsEventElement(
    handle: Handle<RuntimeProps>,
  ) {
    let configuredSource = handle.props.on;
    let sources = configuredSource === undefined
      ? []
      : Array.isArray(configuredSource) ? configuredSource : [configuredSource];
    let eventSources = sources.flatMap((source) => {
      let metadata = getEventSourceMetadata(source);
      return metadata ? [metadata] : [];
    });
    if (eventSources.length !== sources.length) {
      throw new TypeError("Event-aware element on accepts event sources.");
    }
    for (let source of eventSources) {
      if (source.owner !== sourceOwner) {
        throw new TypeError(
          "Event sources must belong to this event model.",
        );
      }
    }
    let readableSource = eventSources.find(({ read }) => read !== undefined);
    let currentInput = readableSource
      ? createProjectionEvent(readableSource)
      : handle.props.initial;
    let eventTypes = configuredSource === undefined
      ? null
      : new Set(eventSources.map(({ type }) => type));
    let addresses = new Map<string, readonly unknown[]>();
    let sourceByType = new Map<string, EventSourceMetadata>();
    for (let source of eventSources) {
      if (sourceByType.has(source.type)) {
        throw new TypeError(
          "An event-aware element accepts one source per event type.",
        );
      }
      sourceByType.set(source.type, source);
      addresses.set(source.type, source.path);
    }
    let projectionMix = ref((element, signal) => {
      customEventsRuntime.subscribe(
        runtime,
        "projection",
        {
          element,
          eventTypes,
          ...(addresses.size ? { addresses } : {}),
          notify(event) {
            let matchedSource = sourceByType.get(event.type);
            currentInput = matchedSource?.read
              ? createProjectionEvent(matchedSource, event)
              : event;
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
        on: _on,
        initial: _initial,
        ...elementProps
      } = handle.props as RuntimeProps;

      let childrenProjection = typeof children === "function"
        ? children
        : undefined;
      let content = childrenProjection
        ? childrenProjection(currentInput)
        : children;
      let resolvedProps = resolveEventElementProps(
        elementProps,
        currentInput,
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
  }

  return Object.assign(CustomEventsEventElement, {
    __rmxGenericJSXComponent: true as const,
  }) as unknown as CustomEventsEventElement<Events, State, Tag>;
}

export function createEventElementFactory<
  Events extends EventDetails,
  State extends EventDetails | never = never,
>(
  runtime: CustomEventsRuntimeState,
  sourceOwner: object,
) {
  let elements = new Map<string, unknown>();

  return <Tag extends keyof JSX.IntrinsicElements>(tag: Tag) => {
    let element = elements.get(tag);
    if (!element) {
      element = createCustomEventsEventElement<Events, State, Tag>(
        tag,
        runtime,
        sourceOwner,
      );
      elements.set(tag, element);
    }
    return element as CustomEventsEventElement<Events, State, Tag>;
  };
}
