import {
  addEventListeners,
  createMixin,
  ref,
  type Handle,
  type MixinDescriptor,
  type RemixNode,
} from "remix/ui";

type Listeners<Target extends EventTarget> = Parameters<
  typeof addEventListeners<Target>
>[2];

type EventType<Target extends EventTarget> = Extract<
  keyof Listeners<Target>,
  string
>;

type EventFor<
  Target extends EventTarget,
  Type extends EventType<Target>,
> = Parameters<NonNullable<Listeners<Target>[Type]>>[0];

type DetailFor<Target extends EventTarget, Type extends EventType<Target>> =
  EventFor<Target, Type> extends CustomEvent<infer Detail> ? Detail : never;

type InitialEventMap<Target extends EventTarget> = Partial<{
  [Type in EventType<Target>]: DetailFor<Target, Type>;
}>;

export type OnCustomEventListener<
  Element extends HTMLElement,
  Target extends EventTarget,
  Type extends EventType<Target>,
> = (
  event: EventFor<Target, Type>,
  element: Element,
  signal: AbortSignal,
) => void | Promise<void>;

export type OnCustomEventGuard<Element extends HTMLElement = HTMLElement> = (
  event: Event,
  element: Element,
  signal: AbortSignal,
) => boolean;

type OnCustomEventScope<Target extends EventTarget> = {
  target: Target;
  initial?: InitialEventMap<Target>;
  guard?: OnCustomEventGuard;
};

type OnCustomEventElement<
  Target extends EventTarget,
  Type extends EventType<Target>,
> = (
  handle: Handle<{
    initial?: Pick<InitialEventMap<Target>, Type>;
    render: (event: EventFor<Target, Type>) => RemixNode;
  }>,
) => () => RemixNode;

type ScopedOnCustomEventFunction<Target extends EventTarget> = {
  <
    Type extends EventType<Target>,
    Element extends HTMLElement = HTMLElement,
  >(
    type: Type,
    listener: OnCustomEventListener<Element, Target, Type>,
  ): MixinDescriptor<Element, unknown[]>;
};

type ScopedOnCustomEvent<Target extends EventTarget> =
  ScopedOnCustomEventFunction<Target> & {
    [Type in EventType<Target>]: OnCustomEventElement<Target, Type>;
};

type OnCustomEvent = {
  <
    Target extends EventTarget,
    Type extends EventType<Target>,
    Element extends HTMLElement = HTMLElement,
  >(
    target: Target,
    type: Type,
    listener: OnCustomEventListener<Element, Target, Type>,
    initial?: DetailFor<Target, Type>,
  ): MixinDescriptor<Element, unknown[]>;

  with<Target extends EventTarget>(
    scope: OnCustomEventScope<Target>,
  ): ScopedOnCustomEvent<Target>;
};

type RuntimeScope = {
  target: EventTarget;
  initial?: Record<string, unknown>;
  guard?: OnCustomEventGuard;
};

type RuntimeListener = (
  event: Event,
  element: HTMLElement,
  signal: AbortSignal,
) => void | Promise<void>;

function createInitialEvent(type: string, initial: unknown) {
  if (!initial || typeof initial !== "object") return undefined;
  return Object.hasOwn(initial, type)
    ? new CustomEvent(type, {
        detail: (initial as Record<string, unknown>)[type],
      })
    : undefined;
}

export function sourceContainsElement(event: Event, element: Element) {
  let source = (event as Event & { source?: unknown }).source;
  return source instanceof Node && source.contains(element);
}

const onCustomEventMixin = createMixin<
  HTMLElement,
  [scope: RuntimeScope, type: string, listener: RuntimeListener]
>((handle) => {
  let currentScope: RuntimeScope | undefined;
  let currentType = "";
  let currentListener: RuntimeListener = () => {};
  let currentElement: HTMLElement | undefined;
  let controller: AbortController | undefined;

  function react(event: Event, signal: AbortSignal) {
    if (signal.aborted || !currentElement || !currentScope) return;
    if (currentScope.guard?.(event, currentElement, signal) === false) return;
    void currentListener(event, currentElement, signal);
  }

  function listen() {
    controller?.abort();
    controller = undefined;
    if (!currentScope || !currentElement || !currentType) return;

    controller = new AbortController();
    addEventListeners(
      currentScope.target,
      controller.signal,
      {
        [currentType]: react,
      } as Listeners<typeof currentScope.target>,
    );
  }

  function reactToInitial() {
    let initial = currentScope?.initial
      ? createInitialEvent(currentType, currentScope.initial)
      : undefined;
    if (!initial) return;
    handle.queueTask((_, signal) => react(initial, signal));
  }

  function mount(element: HTMLElement) {
    currentElement = element;
    listen();
    reactToInitial();
  }

  handle.addEventListener("insert", (event) => mount(event.node));
  handle.addEventListener("reclaimed", (event) => mount(event.node));
  handle.addEventListener("remove", () => {
    controller?.abort();
    controller = undefined;
    currentElement = undefined;
  });

  return (scope, type, listener) => {
    let needsListen =
      currentScope?.target !== scope.target || currentType !== type;

    currentScope = scope;
    currentType = type;
    currentListener = listener;

    if (needsListen) {
      listen();
    }

    if (currentElement) {
      reactToInitial();
    }

    return handle.element;
  };
});

function createOnCustomEvent<
  Target extends EventTarget,
  Type extends EventType<Target>,
  Element extends HTMLElement = HTMLElement,
>(
  target: Target,
  type: Type,
  listener: OnCustomEventListener<Element, Target, Type>,
  initial?: DetailFor<Target, Type>,
) {
  return onCustomEvent.with({
    target,
    initial:
      initial === undefined
        ? undefined
        : ({ [type]: initial } as InitialEventMap<Target>),
  })(type, listener);
}

function createScopedOnCustomEvent<Target extends EventTarget>(
  scope: OnCustomEventScope<Target>,
): ScopedOnCustomEvent<Target> {
  let scoped = ((type: string, listener: RuntimeListener) =>
    onCustomEventMixin(
      scope,
      type,
      listener,
    )) as unknown as ScopedOnCustomEventFunction<Target>;

  let elements = new Map<
    string,
    OnCustomEventElement<Target, EventType<Target>>
  >();

  return new Proxy(scoped, {
    get(target, property, receiver) {
      if (Reflect.has(target, property)) {
        return Reflect.get(target, property, receiver);
      }

      if (typeof property !== "string") {
        return Reflect.get(target, property, receiver);
      }

      let element = elements.get(property);
      if (!element) {
        element = createOnCustomEventElement(scope, property as EventType<Target>);
        elements.set(property, element);
      }

      return element;
    },
  }) as ScopedOnCustomEvent<Target>;
}

function createOnCustomEventElement<
  Target extends EventTarget,
  Type extends EventType<Target>,
>(
  scope: OnCustomEventScope<Target>,
  type: Type,
): OnCustomEventElement<Target, Type> {
  return function OnCustomEventElement(
    handle: Handle<{
      initial?: Record<string, unknown>;
      render: (event: Event) => RemixNode;
    }>,
  ) {
    let initialEvent: Event | undefined =
      (handle.props.initial
        ? createInitialEvent(type, handle.props.initial)
        : undefined) ??
      (scope.initial ? createInitialEvent(type, scope.initial) : undefined);
    let currentEvent: Event | undefined = initialEvent;
    let parentElement: HTMLElement | undefined;

    function canRender(event: Event) {
      if (event === initialEvent) return true;
      if (!scope.guard) return true;
      return (
        parentElement !== undefined &&
        scope.guard(event, parentElement, handle.signal) !== false
      );
    }

    addEventListeners(
      scope.target,
      handle.signal,
      {
        [type](event: Event) {
          if (!canRender(event)) return;
          currentEvent = event;
          void handle.update();
        },
      } as unknown as Listeners<typeof scope.target>,
    );

    return () => (
      <>
        <span
          hidden
          aria-hidden="true"
          mix={ref((element) => {
            parentElement = element.parentElement ?? undefined;
            void handle.update();
          })}
        />
        {currentEvent?.type === type
          ? canRender(currentEvent)
            ? handle.props.render(currentEvent)
            : undefined
          : undefined}
      </>
    );
  } as unknown as OnCustomEventElement<Target, Type>;
}

export const onCustomEvent = Object.assign(createOnCustomEvent, {
  with: createScopedOnCustomEvent,
}) as OnCustomEvent;
