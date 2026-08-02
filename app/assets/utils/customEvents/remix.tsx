import {
  createElement,
  createMixin,
  ref,
  type Handle,
  type RemixNode,
} from "remix/ui";
import {
  ALL_EVENTS,
  createCurrentTargetEvent,
  type CustomEventsRuntime,
} from "./runtime.ts";
import {
  type CustomEventsEventElement,
  type EventDetails,
} from "./types.ts";
import {
  getStateEventSourceMetadata,
  type StateEventSourceMetadata,
} from "./stateEventSources.ts";

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
    listener: (event: Event) => void | Promise<unknown>,
  ]
>((handle) => {
  return (runtime, types, listener) => {
    let eventTypes = selectEventTypes(types);
    return (
      <handle.element
        mix={ref((element, signal) => {
          runtime.subscribe("effect", {
            element,
            eventTypes,
            notify(event) {
              return listener(createCurrentTargetEvent(event, element));
            },
          }, signal);
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

function createStateEvent(
  metadata: StateEventSourceMetadata,
  sourceEvent?: CustomEvent,
) {
  return new CustomEvent(metadata.type, {
    bubbles: false,
    cancelable: false,
    composed: sourceEvent?.composed,
    detail: metadata.read(),
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
  runtime: CustomEventsRuntime,
  stateOwner?: object,
  stateSources?: object,
): CustomEventsEventElement<Events, State, Tag> {
  type RuntimeProps = Record<string, unknown> & {
    on?: string | readonly string[] | object | ((sources: object) => unknown);
    initial?: unknown;
  };

  function CustomEventsEventElement(
    handle: Handle<RuntimeProps>,
  ) {
    let configuredSource = handle.props.on ?? ALL_EVENTS;
    let source = typeof configuredSource === "function"
      ? configuredSource(stateSources ?? Object.create(null))
      : configuredSource;
    let sources = Array.isArray(source) ? source : [source];
    let stateEventSources = sources.flatMap((source) => {
      let metadata = getStateEventSourceMetadata(source);
      return metadata ? [metadata] : [];
    });
    let stateEventSource = stateEventSources[0];
    for (let source of stateEventSources) {
      if (source.owner !== stateOwner) {
        throw new TypeError(
          "State event sources must belong to this event model.",
        );
      }
    }
    let currentInput = stateEventSource
      ? createStateEvent(stateEventSource)
      : handle.props.initial;
    let occurrenceTypes = sources.filter((source): source is string =>
      typeof source === "string"
    );
    let eventTypes = occurrenceTypes.includes(ALL_EVENTS)
      ? null
      : new Set([
        ...occurrenceTypes,
        ...stateEventSources.map(({ type }) => type),
      ]);
    let statePaths = new Map<string, readonly unknown[]>();
    let stateSourceByType = new Map<string, StateEventSourceMetadata>();
    for (let source of stateEventSources) {
      if (stateSourceByType.has(source.type)) {
        throw new TypeError(
          "An event-aware element accepts one source per state property.",
        );
      }
      stateSourceByType.set(source.type, source);
      statePaths.set(source.type, source.path);
    }
    let projectionMix = ref((element, signal) => {
      runtime.subscribe(
        "projection",
        {
          element,
          eventTypes,
          ...(statePaths.size ? { statePaths } : {}),
          notify(event) {
            let matchedSource = stateSourceByType.get(event.type);
            currentInput = matchedSource
              ? createStateEvent(matchedSource, event)
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
  runtime: CustomEventsRuntime,
  stateOwner?: object,
  stateSources?: object,
) {
  let elements = new Map<string, unknown>();

  return <Tag extends keyof JSX.IntrinsicElements>(tag: Tag) => {
    let element = elements.get(tag);
    if (!element) {
      element = createCustomEventsEventElement<Events, State, Tag>(
        tag,
        runtime,
        stateOwner,
        stateSources,
      );
      elements.set(tag, element);
    }
    return element as CustomEventsEventElement<Events, State, Tag>;
  };
}
