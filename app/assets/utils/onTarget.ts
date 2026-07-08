import {
  addEventListeners,
  ref,
  type MixinDescriptor,
} from "remix/ui";

type EventListeners<Target extends EventTarget> = Parameters<
  typeof addEventListeners<Target>
>[2];

type OnTargetEventType<Target extends EventTarget> = Extract<
  keyof EventListeners<Target>,
  string
>;

export type OnTargetListener<
  ObservedElement extends Element,
  Target extends EventTarget,
  Type extends OnTargetEventType<Target>,
> = (
  event: Parameters<NonNullable<EventListeners<Target>[Type]>>[0],
  element: ObservedElement,
  signal: AbortSignal,
) => void | Promise<void>;

export type OnTargetListeners<
  ObservedElement extends Element,
  Target extends EventTarget,
> = {
  [Type in OnTargetEventType<Target>]?: OnTargetListener<
    ObservedElement,
    Target,
    Type
  >;
};

export type OnTargetGuard<ObservedElement extends Element = Element> = (
  event: Event,
  element: ObservedElement,
  signal: AbortSignal,
) => boolean;

export type OnTargetOptions<ObservedElement extends Element = Element> = {
  guard?: OnTargetGuard<ObservedElement>;
};

export type OnTargetScope<Target extends EventTarget> = OnTargetOptions & {
  target: Target;
};

type ScopedOnTarget<Target extends EventTarget> = {
  <ObservedElement extends Element = Element>(
    listeners: OnTargetListeners<ObservedElement, Target>,
    options?: OnTargetOptions<ObservedElement>,
  ): MixinDescriptor<ObservedElement, unknown[]>;

  <
    Type extends OnTargetEventType<Target>,
    ObservedElement extends Element = Element,
  >(
    type: Type,
    listener: OnTargetListener<ObservedElement, Target, Type>,
    options?: OnTargetOptions<ObservedElement>,
  ): MixinDescriptor<ObservedElement, unknown[]>;
};

type OnTarget = {
  <
    Target extends EventTarget,
    ObservedElement extends Element = Element,
  >(
    target: Target,
    listeners: OnTargetListeners<ObservedElement, Target>,
    options?: OnTargetOptions<ObservedElement>,
  ): MixinDescriptor<ObservedElement, unknown[]>;

  <
    Target extends EventTarget,
    Type extends OnTargetEventType<Target>,
    ObservedElement extends Element = Element,
  >(
    target: Target,
    type: Type,
    listener: OnTargetListener<ObservedElement, Target, Type>,
    options?: OnTargetOptions<ObservedElement>,
  ): MixinDescriptor<ObservedElement, unknown[]>;

  with<Target extends EventTarget>(
    scope: OnTargetScope<Target>,
  ): ScopedOnTarget<Target>;
};

type AnyListener = (
  event: Event,
  element: Element,
  signal: AbortSignal,
) => void | Promise<void>;
type AnyListeners = Record<string, AnyListener | undefined>;
type AnyOptions = OnTargetOptions;

function getListeners(
  listenersOrType: AnyListeners | string,
  listener?: AnyListener | AnyOptions,
) {
  return typeof listenersOrType === "string"
    ? { [listenersOrType]: listener as AnyListener }
    : listenersOrType;
}

function mergeOptions(scope: AnyOptions, options: AnyOptions | undefined) {
  return options ? { ...scope, ...options } : scope;
}

export function sourceContainsElement(event: Event, element: Element) {
  let source = (event as Event & { source?: unknown }).source;
  return source instanceof Node && source.contains(element);
}

function createOnTargetMixin(
  target: EventTarget,
  listenersOrType: AnyListeners | string,
  listenerOrOptions?: AnyListener | AnyOptions,
  options?: AnyOptions,
) {
  let listenersToObserve = getListeners(listenersOrType, listenerOrOptions);
  let listenerOptions =
    typeof listenersOrType === "string"
      ? options
      : listenerOrOptions as AnyOptions | undefined;

  return ref((element, signal) => {
    let listeners: Record<string, (event: Event) => void> = {};

    for (let type of Object.keys(listenersToObserve)) {
      listeners[type] = (event) => {
        let listener = listenersToObserve[type];
        if (!listener) return;
        if (listenerOptions?.guard?.(event, element, signal) === false) return;
        listener(event, element, signal);
      };
    }

    addEventListeners(
      target,
      signal,
      listeners as EventListeners<typeof target>,
    );
  });
}

function scopeOnTarget<Target extends EventTarget>(
  scope: OnTargetScope<Target>,
): ScopedOnTarget<Target> {
  let scopeOptions = { guard: scope.guard };

  return ((
    listenersOrType: AnyListeners | string,
    listenerOrOptions?: AnyListener | AnyOptions,
    options?: AnyOptions,
  ) => {
    if (typeof listenersOrType === "string") {
      return createOnTargetMixin(
        scope.target,
        listenersOrType,
        listenerOrOptions as AnyListener,
        mergeOptions(scopeOptions, options),
      );
    }

    return createOnTargetMixin(
      scope.target,
      listenersOrType,
      mergeOptions(scopeOptions, listenerOrOptions as AnyOptions | undefined),
    );
  }) as ScopedOnTarget<Target>;
}

export const onTarget = Object.assign(createOnTargetMixin, {
  with: scopeOnTarget,
}) as OnTarget;
