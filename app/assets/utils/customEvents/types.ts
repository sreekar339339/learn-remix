import type { Handle, MixinDescriptor, Props, RemixNode } from "remix/ui";
import {
  CHANGE_EVENT_NAME,
  CUSTOM_EVENTS_EVENT_PREFIX,
} from "./constants.ts";

// Public and internal types
//
// The public descriptor surface is type-derived: product engineers declare an
// event-detail map once. The callable descriptor creates events, while its
// proxy-backed `on` and `types` surfaces provide event elements and event
// type strings.
export type EventDetails = Record<string, unknown>;

/** A payload map, or a union of null-detail event names. */
export type CustomEventsDefinition = EventDetails | string;

/** Normalizes `"saved" | "closed"` to `{ saved: null; closed: null }`. */
export type NormalizeCustomEventsDefinition<
  Definition extends CustomEventsDefinition,
> = [Definition] extends [string]
  ? Record<Definition, null>
  : Extract<Definition, EventDetails>;

export type CustomEventWithMetadata<Detail> = CustomEvent<Detail> & {
  /**
   * Original target that dispatched the product event. This is useful when an
   * event is observed from a sibling branch or through a derived `change` event.
   */
  originTarget?: EventTarget;
};

export type AnyCustomEventsName =
  `${typeof CUSTOM_EVENTS_EVENT_PREFIX}:${string}:${string}`;

declare global {
  interface HTMLElementEventMap {
    [eventName: AnyCustomEventsName]: CustomEventWithMetadata<any>;
  }

  interface SVGElementEventMap {
    [eventName: AnyCustomEventsName]: CustomEventWithMetadata<any>;
  }

  interface ElementEventMap {
    [eventName: AnyCustomEventsName]: CustomEventWithMetadata<any>;
  }
}

export type ChangeEventDetailFromMap<EventMap extends EventDetails> =
  | {
      event: {
        [K in keyof EventMap & string]: {
          type: K;
          detail: EventMap[K];
        };
      }[keyof EventMap & string];
      events: null;
    }
  | {
      event: null;
      events: Partial<EventMap>;
    };

type LocalCustomEventTypes<EventMap extends EventDetails> = {
  [K in typeof CHANGE_EVENT_NAME]: CustomEventWithMetadata<
    ChangeEventDetailFromMap<EventMap>
  >;
} & {
  [K in keyof EventMap & string]: CustomEventWithMetadata<EventMap[K]>;
};

type EventMapChangeKey<EventMap extends EventDetails> = Extract<
  keyof EventMap,
  typeof CHANGE_EVENT_NAME
>;

type EventMapColonKeys<EventMap extends EventDetails> = Extract<
  keyof EventMap & string,
  `${string}:${string}`
>;

type ChangeCustomEventMapKeyError<Keys extends PropertyKey> = {
  readonly __customEventMapChangeKeyError: "CustomEventMap event maps cannot define the derived 'change' event.";
  readonly changeEventKeys: Keys;
};

type ColonCustomEventMapKeyError<Keys extends PropertyKey> = {
  readonly __customEventMapColonKeyError: "CustomEventMap event names cannot contain colons.";
  readonly colonEventKeys: Keys;
};

type CustomEventMapError<EventMap extends EventDetails> =
  EventMapChangeKey<EventMap> extends never
    ? EventMapColonKeys<EventMap> extends never
      ? never
      : ColonCustomEventMapKeyError<EventMapColonKeys<EventMap>>
    : ChangeCustomEventMapKeyError<EventMapChangeKey<EventMap>>;

export type CustomEventMap<EventMap extends EventDetails> =
  CustomEventMapError<EventMap> extends never
    ? LocalCustomEventTypes<EventMap>
    : CustomEventMapError<EventMap>;

/**
 * Options for events created by `CustomEvents`.
 *
 * These include standard `EventInit` flags. Pass `signal` when async work may
 * be aborted before dispatch.
 */
export type CustomEventsInit = EventInit & {
  /** When already aborted, the factory returns an inert event. */
  signal?: AbortSignal;
};

export type CustomEventsConstructorOptions = {
  /**
   * Register this target as a host immediately.
   *
   * This is mainly useful for `EventTarget` and `TypedEventTarget` objects.
   * DOM components usually prefer `mix={events.host()}`.
   */
  host?: EventTarget;
  /**
   * Removes the constructor host registration when aborted.
   */
  signal?: AbortSignal;
};

export interface CustomEventsConstructor {
  new <Definition extends CustomEventsDefinition>(
    options?: CustomEventsConstructorOptions,
  ): CustomEventsDescriptor<NormalizeCustomEventsDefinition<Definition>>;
}

export type CustomEventsEventType<Events extends EventDetails> = Extract<
  keyof CustomEventMap<Events>,
  string
>;

export type CustomEventsTypeName<Type extends string> =
  `${typeof CUSTOM_EVENTS_EVENT_PREFIX}:${string}:${Type}`;

export type CustomEventsTypes<Events extends EventDetails> = {
  readonly [Type in CustomEventsEventType<Events>]: CustomEventsTypeName<Type>;
};

export type CustomEventsEvent<
  Events extends EventDetails,
  Type extends CustomEventsEventType<Events>,
> = Event & CustomEventMap<Events>[Type];

export type CustomEventsRenderEvent<
  Events extends EventDetails,
  Type extends CustomEventsEventType<Events>,
> = CustomEventsEvent<Events, Type> | undefined;

/** Detail passed to an event-aware element before the matching native event. */
export type CustomEventsRenderDetail<
  Events extends EventDetails,
  Type extends CustomEventsEventType<Events>,
> = CustomEventMap<Events>[Type] extends CustomEvent<infer Detail>
  ? Detail | undefined
  : never;

type CustomEventsElementProjection<
  Events extends EventDetails,
  Type extends CustomEventsEventType<Events>,
  Value,
> = (
  detail: CustomEventsRenderDetail<Events, Type>,
  event: CustomEventsRenderEvent<Events, Type>,
) => Value;

type CustomEventsReactiveElementProps<
  Events extends EventDetails,
  Type extends CustomEventsEventType<Events>,
  Tag extends keyof JSX.IntrinsicElements,
> = {
  [Key in keyof Props<Tag>]: Key extends string
    ? Key extends "children" | "key" | "mix" | "ref" | "on" | `on${string}`
      ? Props<Tag>[Key]
      :
          | Props<Tag>[Key]
          | CustomEventsElementProjection<Events, Type, Props<Tag>[Key]>
    : Props<Tag>[Key];
};

type CustomEventsIntrinsicChildren<
  Tag extends keyof JSX.IntrinsicElements,
> = Props<Tag> extends { children?: infer Children } ? Children : RemixNode;

export type CustomEventsEventElementRender<
  Events extends EventDetails,
  Type extends CustomEventsEventType<Events>,
  Tag extends keyof JSX.IntrinsicElements,
> = (
  detail: CustomEventsRenderDetail<Events, Type>,
  event: CustomEventsRenderEvent<Events, Type>,
  handle: Handle<CustomEventsEventElementProps<Events, Type, Tag>>,
) => RemixNode;

export type CustomEventsEventElementGuard<
  Events extends EventDetails,
  Type extends CustomEventsEventType<Events>,
> = (
  detail: CustomEventsRenderDetail<Events, Type>,
  event: CustomEventsRenderEvent<Events, Type>,
) => boolean;

/** Props for an intrinsic element driven by one descriptor event. */
export type CustomEventsEventElementProps<
  Events extends EventDetails,
  Type extends CustomEventsEventType<Events>,
  Tag extends keyof JSX.IntrinsicElements,
> = Omit<CustomEventsReactiveElementProps<Events, Type, Tag>, "children"> & {
  /** Return true to project this event; false skips the render update. */
  guard?: CustomEventsEventElementGuard<Events, Type>;
} &
  (
    | {
        children?: CustomEventsIntrinsicChildren<Tag>;
        child?: never;
      }
    | {
        children?: never;
        child: CustomEventsEventElementRender<Events, Type, Tag>;
      }
  );

/**
 * Event-aware intrinsic element with declarative reactive attributes.
 *
 * Attribute projections receive `(detail, event)`. `mix`, `ref`, and static
 * children stay normal Remix props. Use Remix's `on(...)` mixin for native DOM
 * handlers. Use `child` instead of static children when the element's children
 * need to change with the event.
 */
export type CustomEventsEventElement<
  Events extends EventDetails,
  Type extends CustomEventsEventType<Events>,
  Tag extends keyof JSX.IntrinsicElements,
> = (
  handle: Handle<CustomEventsEventElementProps<Events, Type, Tag>>,
) => () => RemixNode;

export type CustomEventsEventElements<
  Events extends EventDetails,
  Type extends CustomEventsEventType<Events>,
> = {
  [Tag in keyof JSX.IntrinsicElements]: CustomEventsEventElement<
    Events,
    Type,
    Tag
  >;
};

type ExactEventDetail<Expected, Actual> = Actual extends Expected
  ? Expected extends object
    ? Actual extends object
      ? Exclude<keyof Actual, keyof Expected> extends never
        ? Actual
        : never
      : Actual
  : Actual
  : never;

type NullDetailEventTypes<Events extends EventDetails> = {
  [Type in keyof Events & string]: [Events[Type]] extends [null]
    ? Type
    : never;
}[keyof Events & string];

type UniqueEventTypes<
  Types extends readonly string[],
  Seen extends string = never,
> = Types extends readonly [
  infer First extends string,
  ...infer Rest extends readonly string[],
]
  ? First extends Seen
    ? never
    : UniqueEventTypes<Rest, Seen | First> extends never
      ? never
      : Types
  : Types;

/** Callable factory surface of a custom-events descriptor. */
export type CustomEventsFactory<Events extends EventDetails> = {
  /** Creates a batch from non-payload event names. */
  <const Types extends readonly [
    NullDetailEventTypes<Events>,
    ...Array<NullDetailEventTypes<Events>>,
  ]>(
    types: Types & UniqueEventTypes<Types>,
    init?: CustomEventsInit,
  ): CustomEventsEvent<
    Events,
    typeof CHANGE_EVENT_NAME & CustomEventsEventType<Events>
  >;

  /** Creates a dynamic batch from null-detail event names. */
  <const Types extends readonly NullDetailEventTypes<Events>[]>(
    types: Types & (number extends Types["length"] ? unknown : never),
    init?: CustomEventsInit,
  ): CustomEventsEvent<
    Events,
    typeof CHANGE_EVENT_NAME & CustomEventsEventType<Events>
  >;

  /**
   * Creates a batch event for native `dispatchEvent(...)`.
   *
   * Dispatch this when several details change together. The event system will
   * also notify listeners for each changed event type.
   *
   * @example
   * target.dispatchEvent(events({ user, settings }));
   */
  (events: Partial<Events>, init?: CustomEventsInit): CustomEventsEvent<
    Events,
    typeof CHANGE_EVENT_NAME & CustomEventsEventType<Events>
  >;

  /** Creates one null-detail product event. */
  <Type extends NullDetailEventTypes<Events> & CustomEventsEventType<Events>>(
    type: Type,
  ): CustomEventsEvent<Events, Type>;

  /**
   * Creates this product event for native `dispatchEvent(...)`.
   *
   * Dispatch product events on the element or object where the change happened.
   * A corresponding `change` event is derived automatically.
   *
   * @example
   * form.dispatchEvent(events("actionSubmitted"));
   *
   * @example
   * form.dispatchEvent(events("actionErrored", { error }, { signal }));
   */
  <
    Type extends keyof Events & string & CustomEventsEventType<Events>,
    Detail extends Events[Type],
  >(
    type: Type,
    detail: ExactEventDetail<Events[Type], Detail>,
    init?: CustomEventsInit,
  ): CustomEventsEvent<Events, Type>;

};

export type CustomEventsEventElementGroups<Events extends EventDetails> = {
  [Type in CustomEventsEventType<Events>]: CustomEventsEventElements<
    Events,
    Type
  >;
};

export type CustomEventsListenerEvent<
  Events extends EventDetails,
  Type extends CustomEventsEventType<Events>,
  HostElement extends Element,
> = CustomEventsEvent<Events, Type> & {
  readonly currentTarget: HostElement;
};

export type CustomEventsOnFunction<Events extends EventDetails> = {
  /**
   * Reacts to one custom event on the element that owns this mixin.
   *
   * Events are observed from the nearest `host()` boundary when one exists, or
   * from the page fallback otherwise. The callback receives the same
   * `currentTarget` shape as Remix `on(...)`, so DOM effects can stay local to
   * the element.
   *
   * When this mixin is rendered inside an event-aware element such as
   * `<events.on.someEvent.form ...>`,
   * matching events from the same dispatch transaction run after that event
   * element commits. Elsewhere, callbacks run immediately like normal DOM
   * listeners.
   *
   * Use an event-aware element for attributes such as `disabled` and `class`.
   * Keep this mixin for post-render DOM work:
   *
   * @example
   * <input mix={events.on("saveFailed", ({ currentTarget }) => {
   *   currentTarget.focus();
   * })} />
   */
  <
    HostElement extends Element = Element,
    Type extends CustomEventsEventType<Events> = CustomEventsEventType<Events>,
  >(
    type: Type,
    listener: (
      event: CustomEventsListenerEvent<Events, Type, HostElement>,
      signal: AbortSignal,
    ) => void | Promise<void>,
  ): MixinDescriptor<HostElement, any>;
} & CustomEventsEventElementGroups<Events>;

/**
 * Descriptor-aware listeners attached to a host boundary.
 *
 * This follows Remix's `addEventListeners(...)` listener-map shape, but keys
 * use the descriptor's local event names and values receive resolved custom
 * events only.
 */
export type CustomEventsHostListeners<
  Events extends EventDetails,
  HostElement extends Element = Element,
> = Partial<{
  [Type in CustomEventsEventType<Events>]: (
    event: CustomEventsListenerEvent<Events, Type, HostElement>,
    signal: AbortSignal,
  ) => void | Promise<void>;
}>;

export type HostableCustomEventsDescriptor<Events extends EventDetails> = {
  /**
   * Makes an element the local event boundary for this event set.
   *
   * Use it on a widget root when sibling branches should share events through
   * that root. Use it on repeated rows or forms when each instance should keep
   * its non-composed events independent. Events stay inside the host unless
   * they are created with `{ composed: true }`.
   *
   * The optional listener map works like Remix's `addEventListeners(...)`, but
   * uses this descriptor's local event names and receives resolved events only.
   * Keep any local model in your component and update it in these listeners.
   *
   * You do not need a host for every component. Add one when you want a local
   * boundary or less page-level event traffic.
   *
   * @example
   * <form mix={events.host({
   *   actionSubmitted() {
   *     todo.pending = true;
   *   },
   *   actionSucceeded() {
   *     todo.pending = false;
   *   },
   * })} />
   */
  host<HostElement extends Element = Element>(
    listeners?: CustomEventsHostListeners<Events, HostElement>,
  ): MixinDescriptor<HostElement, any>;
};

export type CustomEventsDescriptor<Events extends EventDetails> =
  /**
   * Creates a custom event for native `dispatchEvent(...)`.
   *
   * Call the descriptor with a name and detail for one event, an array of
   * null-detail names, or a detail map for a coordinated batch. `change`
   * remains derived and listener-facing; product code does not create it
   * directly.
   */
  CustomEventsFactory<Events> &
  {
    /**
     * Reacts to a product event from this descriptor.
     *
     * Use this when an element should update itself from custom events in its
     * host boundary, sibling branches, or the page-level fallback. Use
     * `events.on.someEvent` when providing children from the latest event.
     */
    on: CustomEventsOnFunction<Events>;

    /**
     * Generated event type strings for low-level event interop.
     */
    readonly types: CustomEventsTypes<Events>;

    /**
     * Local event map for `TypedEventTarget` and strongly typed event details.
     */
    readonly map: CustomEventMap<Events>;
  } &
  HostableCustomEventsDescriptor<Events>;
