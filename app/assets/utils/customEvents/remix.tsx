import {
  addEventListeners,
  createElement,
  createMixin,
  on as remixOn,
  ref,
  type Handle,
  type RemixNode,
} from "remix/ui";
import {
  addEventType,
  getEventName,
  subscribeEventTypes,
} from "./protocol.ts";
import type {
  CustomEventsRuntime,
  CustomEventsTransaction,
} from "./runtime.ts";
import type {
  AnyCustomEventsName,
  CustomEventWithMetadata,
  CustomEventsEvent,
  CustomEventsEventElement,
  CustomEventsEventElements,
  CustomEventsEventElementProps,
  CustomEventsEventType,
  CustomEventsRenderDetail,
  CustomEventsRenderEvent,
  EventDetails,
} from "./types.ts";

type RenderScope = {
  descriptor: CustomEventsRuntime;
  eventName: string;
  transaction: CustomEventsTransaction | null;
  version: number;
};

// Bridged events are non-bubbling clones dispatched on a mixin host so Remix
// on(...) listeners see the host as currentTarget.
function createBridgedEvent(
  event: CustomEvent,
  descriptor: CustomEventsRuntime,
  options?: { replay?: boolean },
) {
  let origin = descriptor.getOriginTarget(event);
  let bridgedEvent = descriptor.createCustomEvent(
    event.type,
    {
      bubbles: false,
      cancelable: event.cancelable,
      composed: event.composed,
    },
    event.detail,
    {
      ...(origin ? { origin } : {}),
    },
  );
  descriptor.markBridgedEvent(bridgedEvent, {
    source: event,
    ...(options?.replay ? { replay: true } : {}),
  });
  return bridgedEvent;
}

function CustomEventsRenderScopeProvider(
  handle: Handle<
    {
      scope: RenderScope;
      children: RemixNode;
    },
    RenderScope
  >,
) {
  return () => {
    handle.context.set(handle.props.scope);
    return handle.props.children;
  };
}

function shouldDeferScopedListener(
  descriptor: CustomEventsRuntime,
  scope: RenderScope | undefined,
  event: Event,
) {
  if (scope?.descriptor !== descriptor) return false;
  return descriptor.getTransaction(event)?.events.has(scope.eventName) ?? false;
}

function shouldBridgeEventToElement(
  event: Event,
  element: Element | undefined,
): element is Element {
  if (!element) return false;
  if (event.composedPath().includes(element)) return false;
  return true;
}

// Descriptor-owned on() bridges events from the nearest host/window to the
// element that owns the mixin. It depends on host discovery for default
// targeting and on event-type subscriptions so newly discovered product events
// are bridged without remounting user elements.
const forwardEventsMixin = createMixin<
  Element,
  [descriptor: CustomEventsRuntime]
>((handle) => {
  let currentElement: Element | undefined;
  let currentState: CustomEventsRuntime | undefined;
  let controller: AbortController | undefined;
  let unsubscribeHost: (() => void) | undefined;
  let unsubscribeEventTypes: (() => void) | undefined;

  function syncHostSubscription() {
    unsubscribeHost?.();
    unsubscribeHost = undefined;

    if (currentState) {
      unsubscribeHost = currentState.subscribe(listen);
    }
  }

  function syncEventTypeSubscription() {
    unsubscribeEventTypes?.();
    unsubscribeEventTypes = undefined;
    if (currentState) {
      unsubscribeEventTypes = subscribeEventTypes(currentState, listen);
    }
  }

  function listen() {
    controller?.abort();
    controller = undefined;
    let target = currentState
      ? currentState.getDefaultTarget(currentElement)
      : undefined;

    if (!currentElement || !target || !currentState) return;

    let descriptor = currentState;
    controller = new AbortController();
    let signal = controller.signal;
    let listeners: Record<string, (event: Event) => void> = {};
    for (let type of descriptor.eventTypes) {
      listeners[getEventName(descriptor, type)] = (event) => {
        if (!(event instanceof CustomEvent)) return;
        if (descriptor.isProductEvent(event)) return;
        if (!descriptor.ownsEvent(event)) return;
        if (descriptor.isBridgedEvent(event)) return;
        let element = currentElement;
        if (!shouldBridgeEventToElement(event, element)) return;
        element.dispatchEvent(createBridgedEvent(event, descriptor));
      };
    }
    addEventListeners(target, signal, listeners as never);
  }

  function mount(element: Element) {
    currentElement = element;
    syncHostSubscription();
    syncEventTypeSubscription();
    listen();
    queueMicrotask(() => {
      if (currentElement === element) listen();
    });
  }

  handle.addEventListener("insert", (event) => mount(event.node));
  handle.addEventListener("reclaimed", (event) => mount(event.node));
  handle.addEventListener("remove", () => {
    unsubscribeHost?.();
    unsubscribeHost = undefined;
    unsubscribeEventTypes?.();
    unsubscribeEventTypes = undefined;
    controller?.abort();
    controller = undefined;
    currentElement = undefined;
  });

  return (descriptor) => {
    let needsListen = currentState !== descriptor;

    currentState = descriptor;

    if (needsListen) {
      syncHostSubscription();
      syncEventTypeSubscription();
      listen();
    }

    return handle.element;
  };
});

export const customEventsOnMixin = createMixin<
  Element,
  [
    descriptor: CustomEventsRuntime,
    type: string,
    listener: (event: Event, signal: AbortSignal) => void | Promise<void>,
  ]
>((handle) => {
  return (descriptor, type, listener) => {
    addEventType(descriptor, type);
    let eventName = getEventName(descriptor, type);
    let renderScope = handle.context.get(CustomEventsRenderScopeProvider);
    if (renderScope?.descriptor === descriptor) {
      let pendingEvent = renderScope.transaction?.events.get(eventName);
      let pendingScope = renderScope;
      let pendingVersion = renderScope.version;
      if (pendingEvent) {
        handle.queueTask((node, signal) => {
          if (signal.aborted) return;
          if (pendingScope.version !== pendingVersion) return;

          let replayEvent = createBridgedEvent(
            pendingEvent as CustomEvent,
            descriptor,
            { replay: true },
          );
          node.dispatchEvent(replayEvent);
        });
      }
    }

    let wrappedListener = (
      event: CustomEventWithMetadata<any>,
      signal: AbortSignal,
    ) => {
      if (descriptor.isProductEvent(event)) return;

      let bridgedEvent = descriptor.getBridgedEvent(event);
      let sourceEvent = descriptor.getBridgedEvent(event)?.source ?? event;
      let scope = handle.context.get(CustomEventsRenderScopeProvider);

      if (
        !bridgedEvent?.replay &&
        shouldDeferScopedListener(descriptor, scope, sourceEvent)
      ) {
        return;
      }

      return listener(event, signal);
    };

    return (
      <handle.element
        mix={[
          forwardEventsMixin(descriptor),
          remixOn(eventName as AnyCustomEventsName, wrappedListener),
        ]}
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
  return Object.fromEntries(
    Object.entries(props).map(([key, value]) => [
      key,
      typeof value === "function" && isReactiveElementProp(key)
        ? value(detail, event)
        : value,
    ]),
  );
}

function createCustomEventsEventElement<
  Events extends EventDetails,
  Type extends CustomEventsEventType<Events>,
  Tag extends keyof JSX.IntrinsicElements,
>(
  type: Type,
  tag: Tag,
  descriptor: CustomEventsRuntime,
): CustomEventsEventElement<Events, Type, Tag> {
  addEventType(descriptor, type);
  return function CustomEventsEventElement(
    handle: Handle<CustomEventsEventElementProps<Events, Type, Tag>>,
  ) {
    let eventName = getEventName(descriptor, type);
    let currentEvent: Event | undefined;
    let renderScope: RenderScope = {
      descriptor,
      eventName,
      transaction: null,
      version: 0,
    };

    let projectionMix = [
      forwardEventsMixin(descriptor),
      remixOn(eventName as AnyCustomEventsName, (event) => {
        if (descriptor.isProductEvent(event)) return;
        if (!descriptor.ownsEvent(event)) return;

        currentEvent = event;
        let sourceEvent = descriptor.getBridgedEvent(event)?.source ?? event;
        renderScope.transaction = descriptor.getTransaction(sourceEvent) ?? null;
        let version = ++renderScope.version;
        void handle.update().then(() => {
          if (renderScope.version === version) {
            renderScope.transaction = null;
          }
        });
      }),
    ];

    return () => {
      let event =
        currentEvent?.type === eventName && descriptor.ownsEvent(currentEvent)
          ? (currentEvent as CustomEventsEvent<Events, Type>)
          : undefined;
      let detail = (event
        ? (event as unknown as CustomEvent).detail
        : undefined) as CustomEventsRenderDetail<Events, Type>;
      let props = handle.props as CustomEventsEventElementProps<
        Events,
        Type,
        Tag
      >;
      let { children, mix, child, ...elementProps } = props as Record<
        string,
        unknown
      >;
      if (child !== undefined && children !== undefined) {
        throw new Error(
          "CustomEvents event elements accept either static children or child(), not both.",
        );
      }

      let content = typeof child === "function"
        ? child(detail, event, handle)
        : children;
      let resolvedProps = resolveEventElementProps(elementProps, detail, event);
      let element = createElement(
        tag,
        {
          ...resolvedProps,
          mix: prependMixins(mix, projectionMix),
        },
        content,
      );

      return (
        <CustomEventsRenderScopeProvider scope={renderScope}>
          {element}
        </CustomEventsRenderScopeProvider>
      );
    };
  } as CustomEventsEventElement<Events, Type, Tag>;
}

export function createCustomEventsEventElements<
  Events extends EventDetails,
  Type extends CustomEventsEventType<Events>,
>(
  type: Type,
  descriptor: CustomEventsRuntime,
): CustomEventsEventElements<Events, Type> {
  let elements = new Map<string, CustomEventsEventElement<Events, Type, any>>();

  return new Proxy({}, {
    get(_, property) {
      if (typeof property !== "string") {
        return undefined;
      }

      let element = elements.get(property);
      if (!element) {
        element = createCustomEventsEventElement(
          type,
          property as keyof JSX.IntrinsicElements,
          descriptor,
        );
        elements.set(property, element);
      }
      return element;
    },
  }) as CustomEventsEventElements<Events, Type>;
}
