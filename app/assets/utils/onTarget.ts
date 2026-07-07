import {
  addEventListeners,
  createMixin,
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

type OnTargetDescriptor<ObservedElement extends Element> = MixinDescriptor<
  ObservedElement,
  unknown[]
>;

type OnTarget = {
  <
    Target extends EventTarget,
    ObservedElement extends Element = Element,
  >(
    target: Target,
    listeners: OnTargetListeners<ObservedElement, Target>,
  ): OnTargetDescriptor<ObservedElement>;

  <
    Target extends EventTarget,
    Type extends OnTargetEventType<Target>,
    ObservedElement extends Element = Element,
  >(
    target: Target,
    type: Type,
    listener: OnTargetListener<ObservedElement, Target, Type>,
  ): OnTargetDescriptor<ObservedElement>;
};

const onTargetMixin = createMixin<
  Element,
  [
    target: EventTarget,
    listenersOrType: OnTargetListeners<Element, EventTarget> | string,
    listener?: OnTargetListener<
      Element,
      EventTarget,
      OnTargetEventType<EventTarget>
    >,
  ]
>((handle) => {
  return (target, listenersOrType, listener) => {
    handle.queueTask((element, signal) => {
      let observedListeners: Record<string, (event: Event) => void> = {};
      let listeners =
        typeof listenersOrType === "string"
          ? { [listenersOrType]: listener }
          : listenersOrType;

      for (let type of Object.keys(listeners) as Array<keyof typeof listeners>) {
        let listener = listeners[type];
        if (!listener) continue;

        observedListeners[type as string] = (event) => {
          listener(event as never, element, signal);
        };
      }

      addEventListeners(
        target,
        signal,
        observedListeners as EventListeners<typeof target>,
      );
    });
  };
});

export const onTarget = onTargetMixin as OnTarget;
