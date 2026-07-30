import type { Handle, MixinDescriptor, Props, RemixNode } from "remix/ui";
import { CUSTOM_EVENTS_ALL } from "./constants.ts";

// Public and internal types
//
// The public descriptor surface is type-derived: product engineers declare an
// event-detail map once. The callable descriptor creates events, while its
// proxy-backed `on` surface provides event elements.
export type EventDetails = Record<string, unknown>;

/** Payload maps and null-detail event names, which may be combined in a union. */
export type CustomEventsDefinition = EventDetails | string;

type CustomEventsDefinitionMapKeys<Definition> =
  Definition extends EventDetails ? keyof Definition & string : never;

type CustomEventsDefinitionKeys<Definition> =
  | Extract<Definition, string>
  | CustomEventsDefinitionMapKeys<Definition>;

type NativeDOMEventName = Extract<
  | keyof GlobalEventHandlersEventMap
  | keyof HTMLElementEventMap
  | keyof SVGElementEventMap
  | keyof DocumentEventMap
  | keyof WindowEventMap,
  string
>;

type NativeNamesIn<Definition> = Extract<
  CustomEventsDefinitionKeys<Definition>,
  NativeDOMEventName
>;

type NativeEventNameError<Names extends string> = {
  readonly __customEventsNativeEventNameError:
    "customEvents names cannot overlap native DOM event names.";
  readonly nativeEventNames: Names;
};

export type CustomEventsFactoryArgs<Definition> =
  [NativeNamesIn<Definition>] extends [never]
    ? [options?: CustomEventsOptions]
    : [error: NativeEventNameError<NativeNamesIn<Definition>>];

type CustomEventsDefinitionMapDetail<Definition, Type extends string> =
  Definition extends EventDetails
    ? Type extends keyof Definition
      ? Definition[Type]
      : never
    : never;

/**
 * Normalizes signal names and payload maps into one event-detail map.
 *
 * `"saved" | { failed: Error }` becomes
 * `{ saved: null; failed: Error }`.
 */
export type NormalizeCustomEventsDefinition<
  Definition extends CustomEventsDefinition,
> = {
  [Type in CustomEventsDefinitionKeys<Definition>]:
    Type extends CustomEventsDefinitionMapKeys<Definition>
      ? CustomEventsDefinitionMapDetail<Definition, Type>
      : null;
};

/**
 * Options for events created by `customEvents`.
 *
 * These include standard `EventInit` flags. An already-aborted `signal`
 * synchronously throws its abort reason instead of creating an event.
 */
export type CustomEventsInit = EventInit & {
  /** Throws the signal's abort reason when it is already aborted. */
  signal?: AbortSignal;
  /** Routes the event to event-aware elements with the same DOM `id`. */
  key?: PropertyKey;
};

export type CustomEventsOptions = {
  /**
   * Register this target as a host immediately.
   *
   * This is mainly useful for `EventTarget` domain objects.
   * DOM components usually prefer `mix={events.host()}`.
   */
  host?: EventTarget;
};

export type CustomEventsEventType<Events extends EventDetails> = Extract<
  Exclude<keyof Events, typeof CUSTOM_EVENTS_ALL | NativeDOMEventName>,
  string
>;

export type CustomEventsEvent<
  Events extends EventDetails,
  Type extends CustomEventsEventType<Events>,
> = Type extends CustomEventsEventType<Events>
  ? CustomEvent<Events[Type]> & { readonly type: Type }
  : never;

/** Internal batch carrier accepted by native `dispatchEvent(...)`. */
export type CustomEventsTransactionEvent = CustomEvent<undefined>;

type CustomEventsElementEvent<
  Events extends EventDetails,
  Type extends CustomEventsEventType<Events>,
> =
  | CustomEventsEvent<Events, Type>
  | undefined;

type CustomEventsElementProjection<
  Events extends EventDetails,
  Type extends CustomEventsEventType<Events>,
  Tag extends keyof JSX.IntrinsicElements,
  Value,
> = (
  event: CustomEventsElementEvent<Events, Type>,
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
          | CustomEventsElementProjection<Events, Type, Tag, Props<Tag>[Key]>
    : Props<Tag>[Key];
} & {
  [Key in `data-${string}`]?:
    | string
    | undefined
    | CustomEventsElementProjection<Events, Type, Tag, string | undefined>;
};

type CustomEventsIntrinsicChildren<
  Tag extends keyof JSX.IntrinsicElements,
> = Props<Tag> extends { children?: infer Children } ? Children : RemixNode;

export type CustomEventsEventElementRender<
  Events extends EventDetails,
  Type extends CustomEventsEventType<Events>,
  Tag extends keyof JSX.IntrinsicElements,
> = (
  event: CustomEventsElementEvent<Events, Type>,
  handle: Handle<CustomEventsEventElementProps<Events, Type, Tag>>,
) => RemixNode;

/** Props for an intrinsic element driven by one descriptor event. */
export type CustomEventsEventElementProps<
  Events extends EventDetails,
  Type extends CustomEventsEventType<Events>,
  Tag extends keyof JSX.IntrinsicElements,
> = Omit<CustomEventsReactiveElementProps<Events, Type, Tag>, "children"> &
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
 * Attribute projections receive the event. Read payloads from `event.detail`.
 * `mix`, `ref`, and static children stay normal Remix props. Use Remix's
 * `on(...)` mixin for native DOM handlers. Use `child` instead of static
 * children when the element's children need to change with the event.
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

type CustomEventsBatchEntryConfiguration<Detail> = [Detail] extends [null]
  ? {
      detail?: null;
      options?: CustomEventsInit;
    }
  : {
      detail: Detail;
      options?: CustomEventsInit;
    };

/** One independently configured entry in a shared event transaction. */
export type CustomEventsBatchEntry<Events extends EventDetails> = {
  [Type in keyof Events & string]: {
    [EntryType in Type]: CustomEventsBatchEntryConfiguration<Events[Type]>;
  };
}[keyof Events & string];

/** A signal shorthand or an independently configured transaction entry. */
export type CustomEventsBatchItem<Events extends EventDetails> =
  | NullDetailEventTypes<Events>
  | CustomEventsBatchEntry<Events>;

/** Callable factory surface of a custom-events descriptor. */
export type CustomEventsFactory<Events extends EventDetails> = {
  /** Creates a batch from non-payload event names. */
  <const Types extends readonly [
    NullDetailEventTypes<Events>,
    ...Array<NullDetailEventTypes<Events>>,
  ]>(
    types: Types & UniqueEventTypes<Types>,
    init?: CustomEventsInit,
  ): CustomEventsTransactionEvent;

  /**
   * Creates one transaction whose entries have independent detail and options.
   *
   * @example
   * events([
   *   "modelChanged",
   *   { focusRequested: { options: { key: itemId } } },
   *   { draftSet: { detail: value, options: { key: itemId } } },
   * ])
   */
  <const Entries extends readonly [
    CustomEventsBatchItem<Events>,
    ...CustomEventsBatchItem<Events>[],
  ]>(
    entries: Entries & (
      Extract<Entries[number], CustomEventsBatchEntry<Events>> extends never
        ? never
        : unknown
    ),
  ): CustomEventsTransactionEvent;

  /** Creates a dynamic batch from null-detail event names. */
  <const Types extends readonly NullDetailEventTypes<Events>[]>(
    types: Types & (number extends Types["length"] ? unknown : never),
    init?: CustomEventsInit,
  ): CustomEventsTransactionEvent;

  /**
   * Creates a batch event for native `dispatchEvent(...)`.
   *
   * Dispatch this when several details change together. The event system will
   * also notify listeners for each changed event type.
   *
   * @example
   * target.dispatchEvent(events({ user, settings }));
   */
  (
    events: Partial<Events>,
    init?: CustomEventsInit,
  ): CustomEventsTransactionEvent;

  /**
   * Creates one null-detail product event. For string-union descriptors, the
   * options bag may be passed as the second argument because no detail exists.
   */
  <Type extends NullDetailEventTypes<Events> & CustomEventsEventType<Events>>(
    type: Type,
    init?: CustomEventsInit,
  ): CustomEventsEvent<Events, Type>;

  /**
   * Creates this product event for native `dispatchEvent(...)`.
   *
   * Dispatch product events on the element or object where the change happened.
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

export type CustomEventsTargetListenerOptions = {
  signal?: AbortSignal;
};

export type CustomEventsTargetListenerEvent<
  Events extends EventDetails,
  Type extends CustomEventsEventType<Events>,
  Target extends EventTarget,
> = Type extends CustomEventsEventType<Events>
  ? Omit<CustomEventsEvent<Events, Type>, "currentTarget"> & {
    readonly currentTarget: Target;
  }
  : never;

type CustomEventsTargetListener<
  Events extends EventDetails,
  Type extends CustomEventsEventType<Events>,
  Target extends EventTarget,
> = (
  event: CustomEventsTargetListenerEvent<Events, Type, Target>,
  signal: AbortSignal,
) => void | Promise<void>;

export type CustomEventsTargetListeners<
  Events extends EventDetails,
  Target extends EventTarget,
> =
  & Partial<{
    [Type in CustomEventsEventType<Events>]: CustomEventsTargetListener<
      Events,
      Type,
      Target
    >;
  }>
  & {
    [CUSTOM_EVENTS_ALL]?: CustomEventsTargetListener<
      Events,
      CustomEventsEventType<Events>,
      Target
    >;
  };

export type CustomEventsOnFunction<Events extends EventDetails> = {
  /**
   * Attaches a listener map directly to the configured host.
   *
   * Requires `customEvents({ host })` at runtime.
   */
  (
    listeners: CustomEventsTargetListeners<Events, EventTarget>,
    options?: CustomEventsTargetListenerOptions,
  ): () => void;

  /**
   * Attaches a wildcard listener directly to the configured host.
   *
   * The options argument distinguishes this from the element-mixin form.
   */
  (
    type: typeof CUSTOM_EVENTS_ALL,
    listener: CustomEventsTargetListener<
      Events,
      CustomEventsEventType<Events>,
      EventTarget
    >,
    options: CustomEventsTargetListenerOptions,
  ): () => void;

  /**
   * Attaches a selected event group directly to the configured host.
   *
   * The options argument distinguishes this from the element-mixin form.
   */
  <
    const Types extends readonly [
      CustomEventsEventType<Events>,
      ...CustomEventsEventType<Events>[],
    ],
  >(
    types: Types,
    listener: CustomEventsTargetListener<Events, Types[number], EventTarget>,
    options: CustomEventsTargetListenerOptions,
  ): () => void;

  /**
   * Attaches one listener directly to the configured host.
   *
   * The options argument distinguishes this from the element-mixin form.
   */
  <Type extends CustomEventsEventType<Events>>(
    type: Type,
    listener: CustomEventsTargetListener<Events, Type, EventTarget>,
    options: CustomEventsTargetListenerOptions,
  ): () => void;

  /** Attaches named and wildcard listeners directly to an EventTarget. */
  <Target extends EventTarget>(
    target: Target,
    listeners: CustomEventsTargetListeners<Events, Target>,
    options?: CustomEventsTargetListenerOptions,
  ): () => void;

  /** Attaches one listener to every descriptor event on a target. */
  <Target extends EventTarget>(
    target: Target,
    type: typeof CUSTOM_EVENTS_ALL,
    listener: CustomEventsTargetListener<
      Events,
      CustomEventsEventType<Events>,
      Target
    >,
    options?: CustomEventsTargetListenerOptions,
  ): () => void;

  /** Attaches one listener to a selected event group on a target. */
  <
    Target extends EventTarget,
    const Types extends readonly [
      CustomEventsEventType<Events>,
      ...CustomEventsEventType<Events>[],
    ],
  >(
    target: Target,
    types: Types,
    listener: CustomEventsTargetListener<Events, Types[number], Target>,
    options?: CustomEventsTargetListenerOptions,
  ): () => void;

  /** Attaches one precisely typed listener directly to an EventTarget. */
  <
    Target extends EventTarget,
    Type extends CustomEventsEventType<Events>,
  >(
    target: Target,
    type: Type,
    listener: CustomEventsTargetListener<Events, Type, Target>,
    options?: CustomEventsTargetListenerOptions,
  ): () => void;

  /** Reacts to every descriptor event on the element that owns this mixin. */
  <HostElement extends Element = Element>(
    type: typeof CUSTOM_EVENTS_ALL,
    listener: (
      event: CustomEventsListenerEvent<
        Events,
        CustomEventsEventType<Events>,
        HostElement
      >,
      signal: AbortSignal,
    ) => void | Promise<void>,
  ): MixinDescriptor<HostElement, any>;

  /** Creates event-aware elements driven by any listed event. */
  <
    const Types extends readonly [
      CustomEventsEventType<Events>,
      ...CustomEventsEventType<Events>[],
    ],
  >(
    types: Types,
  ): CustomEventsEventElements<Events, Types[number]>;

  /** Reacts to any listed event on the element that owns this mixin. */
  <
    HostElement extends Element = Element,
    const Types extends readonly [
      CustomEventsEventType<Events>,
      ...CustomEventsEventType<Events>[],
    ] = readonly [
      CustomEventsEventType<Events>,
      ...CustomEventsEventType<Events>[],
    ],
  >(
    types: Types,
    listener: (
      event: CustomEventsListenerEvent<
        Events,
        Types[number],
        HostElement
      >,
      signal: AbortSignal,
    ) => void | Promise<void>,
  ): MixinDescriptor<HostElement, any>;

  /**
   * Reacts to one custom event on the element that owns this mixin.
   *
   * Events are observed locally on this element, or from the nearest `host()`
   * boundary when one exists. The callback receives the same
   * `currentTarget` shape as Remix `on(...)`, so DOM effects can stay local to
   * the element. For keyed events, a non-empty `currentTarget.id` is its routing
   * address; mismatched listeners are skipped, while listeners without an `id`
   * continue to observe every key.
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

export type HostableCustomEventsDescriptor<Events extends EventDetails> = {
  /**
   * Makes an element the local event boundary for this event set.
   *
   * Use it on a widget root when sibling branches should share events through
   * that root. Use it on repeated rows or forms when each instance should keep
   * its non-composed events independent. Events stay inside the host unless
   * they are created with `{ composed: true }`.
   *
   * Same-element delivery does not need a host. Add one when sibling branches
   * need to share events; no implicit window route is installed.
   */
  host<HostElement extends Element = Element>(): MixinDescriptor<
    HostElement,
    any
  >;
};

export type CustomEventsDescriptor<Events extends EventDetails> =
  /**
   * Creates a custom event for native `dispatchEvent(...)`.
   *
   * Call the descriptor with a name and detail for one event, an array of
   * null-detail names, or a detail map for a coordinated batch.
   */
  CustomEventsFactory<Events> &
  {
    /**
     * Selects named events for effects or event-aware elements.
     *
     * Use `events.on("name", listener)` for one post-render effect,
     * `events.on("*", listener)` for every event, and
     * `events.on.name.tag` for a projection of one event. Use `<events.tag>`
     * when a projection observes every declared event. Pass an `EventTarget`
     * first to attach direct named, grouped, wildcard, or listener-map
     * subscriptions.
     */
    on: CustomEventsOnFunction<Events>;
  } &
  HostableCustomEventsDescriptor<Events> &
  CustomEventsEventElements<Events, CustomEventsEventType<Events>>;
