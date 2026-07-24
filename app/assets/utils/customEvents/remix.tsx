import {
  createMixin,
  on as remixOn,
  ref,
  type Handle,
  type RemixNode,
} from "remix/ui";
import {
  addEventType,
  createInitialEvent,
  getEventName,
  subscribeEventTypes,
} from "./protocol.ts";
import type { CustomEventsRuntime } from "./runtime.ts";
import type {
  AnyCustomEventsName,
  CustomEventWithMetadata,
  CustomEventsEvent,
  CustomEventsEventComponent,
  CustomEventsEventType,
  CustomEventsRenderEvent,
  CustomEventsRenderProps,
  CustomEventsRenderScope,
  CustomEventsSeedEvent,
  EventDetails,
} from "./types.ts";

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
      scope: CustomEventsRenderScope;
      children: RemixNode;
    },
    CustomEventsRenderScope
  >,
) {
  return () => {
    handle.context.set(handle.props.scope);
    return handle.props.children;
  };
}

function getSourceEventForListener(
  descriptor: CustomEventsRuntime,
  event: Event,
) {
  return descriptor.getBridgedEvent(event)?.source ?? event;
}

function shouldDeferScopedListener(
  descriptor: CustomEventsRuntime,
  scope: CustomEventsRenderScope | undefined,
  event: Event,
) {
  if (scope?.descriptor !== descriptor) return false;
  return descriptor.getTransaction(event)?.events.has(scope.eventName) ?? false;
}

function shouldBridgeEventToElement(
  event: Event,
  descriptor: CustomEventsRuntime,
  element: Element | undefined,
): element is Element {
  if (!element) return false;
  if (descriptor.isBridgedEvent(event)) return false;
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
    for (let type of descriptor.eventTypes) {
      target.addEventListener(
        getEventName(descriptor, type),
        (event) => {
          if (!(event instanceof CustomEvent)) return;
          if (descriptor.getProductMetadata(event)) return;
          if (!descriptor.ownsEvent(event)) return;
          let element = currentElement;
          if (!shouldBridgeEventToElement(event, descriptor, element)) return;
          element.dispatchEvent(createBridgedEvent(event, descriptor));
        },
        { signal },
      );
    }
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
      if (descriptor.getProductMetadata(event)) return;

      let bridgedEvent = descriptor.getBridgedEvent(event);
      let sourceEvent = getSourceEventForListener(descriptor, event);
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

// Descriptor event components render from the latest matching event, or from
// `null` before any matching event exists. They depend on host discovery to
// choose a default target and on initial event projection for SSR/first-render
// output. An inert template marker discovers the parent host element; unlike a
// span, it is valid inside table sections and does not cause HTML reparenting
// during hydration. Rendering itself remains owned by Remix.
export function createCustomEventsEventComponent<
  Events extends EventDetails,
  Type extends CustomEventsEventType<Events>,
>(
  type: Type,
  descriptor: CustomEventsRuntime,
): CustomEventsEventComponent<Events, Type> {
  addEventType(descriptor, type);
  let component = function CustomEventsEventComponent(
    handle: Handle<
      CustomEventsRenderProps<
        Events,
        Type,
        CustomEventsSeedEvent<Events> | undefined
      >
    >,
  ) {
    let eventName = getEventName(descriptor, type);
    let hasSeed = handle.props.seed !== undefined;
    let initialEvent = createInitialEvent(
      type,
      descriptor,
      handle.props.seed ?? descriptor.initial,
    );
    let hostElement: HTMLElement | undefined;
    let currentEvent: Event | null = initialEvent ?? null;
    let currentTarget: EventTarget | undefined;
    let controller: AbortController | undefined;
    let unsubscribeHost: (() => void) | undefined;
    let renderScope: CustomEventsRenderScope = {
      descriptor,
      eventName,
      transaction: null,
      version: 0,
    };

    function canRender(event: Event) {
      return event === initialEvent || descriptor.ownsEvent(event);
    }

    function syncDefaultTarget() {
      syncTarget(descriptor.getDefaultTarget(hostElement));
    }

    function ensureHostSubscription() {
      if (unsubscribeHost) return;
      unsubscribeHost = descriptor.subscribe(syncDefaultTarget);
    }

    function setHostFromMarker(marker: Element) {
      let nextHost = marker.parentElement;
      if (!nextHost || hostElement === nextHost) return;

      hostElement = nextHost;
      ensureHostSubscription();
      syncDefaultTarget();
      queueMicrotask(() => {
        if (hostElement === nextHost) {
          syncDefaultTarget();
        }
      });
    }

    function syncTarget(nextTarget: EventTarget | undefined) {
      if (currentTarget === nextTarget) return;

      controller?.abort();
      controller = undefined;
      currentTarget = nextTarget;
      if (!currentTarget) return;

      controller = new AbortController();
      let signal = controller.signal;
      currentTarget.addEventListener(
        eventName,
        (event) => {
          if (descriptor.getProductMetadata(event)) return;
          if (descriptor.isBridgedEvent(event)) return;
          if (!canRender(event)) return;
          currentEvent = event;
          renderScope.transaction = descriptor.getTransaction(event) ?? null;
          renderScope.version += 1;
          let version = renderScope.version;
          void handle.update().then(() => {
            if (renderScope.version === version) {
              renderScope.transaction = null;
            }
          });
        },
        { signal },
      );
    }

    handle.signal.addEventListener(
      "abort",
      () => {
        unsubscribeHost?.();
        unsubscribeHost = undefined;
        controller?.abort();
        controller = undefined;
        currentTarget = undefined;
      },
      { once: true },
    );

    return () => {
      ensureHostSubscription();
      syncDefaultTarget();

      let event =
        currentEvent?.type === eventName && canRender(currentEvent)
          ? (currentEvent as CustomEventsEvent<Events, Type>)
          : null;
      let node: RemixNode;
      if (hasSeed) {
        if (!event) {
          throw new TypeError(
            `CustomEvents seed for "${type}" must initialize that event component.`,
          );
        }
        node = handle.props.render(event, handle);
      } else {
        let render = handle.props.render as unknown as (
          event: CustomEventsRenderEvent<Events, Type>,
          handle: Handle<
            CustomEventsRenderProps<
              Events,
              Type,
              CustomEventsSeedEvent<Events> | undefined
            >
          >,
        ) => RemixNode;
        node = render(event, handle);
      }

      return (
        <CustomEventsRenderScopeProvider scope={renderScope}>
          <template mix={ref(setHostFromMarker)} />
          {node}
        </CustomEventsRenderScopeProvider>
      );
    };
  };
  return component as CustomEventsEventComponent<Events, Type>;
}
