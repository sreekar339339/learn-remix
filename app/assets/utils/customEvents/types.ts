import type { Handle, MixinDescriptor, Props, RemixNode } from "remix/ui";

export type EventDetails = Record<string, unknown>;

/** Payload maps and null-detail event names, which may be combined in a union. */
export type CustomEventsDefinition = EventDetails | string;

type EventNames<Definition> = Definition extends string ? Definition
  : Definition extends EventDetails ? keyof Definition & string
  : never;

type EventDetail<Definition, Type extends string> =
  Definition extends EventDetails ? Type extends keyof Definition
    ? Definition[Type]
    : never
    : Definition extends Type ? null
    : never;

type NativeDOMEventName = Extract<
  | keyof GlobalEventHandlersEventMap
  | keyof HTMLElementEventMap
  | keyof SVGElementEventMap
  | keyof DocumentEventMap
  | keyof WindowEventMap,
  string
>;

type NativeNamesIn<Definition> = Extract<
  EventNames<Definition>,
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

/**
 * Normalizes signal names and payload maps into one event-detail map.
 *
 * `"saved" | { failed: Error }` becomes
 * `{ saved: null; failed: Error }`.
 */
export type NormalizeCustomEventsDefinition<
  Definition extends CustomEventsDefinition,
> = {
  [Type in EventNames<Definition>]: EventDetail<Definition, Type>;
};

/**
 * Options for events created by `customEvents`.
 *
 * These include the standard propagation flags except `cancelable`.
 * An already-aborted `signal` synchronously throws its abort reason instead
 * of creating an event.
 */
export type CustomEventsInit = Omit<EventInit, "cancelable"> & {
  /** Custom events describe completed facts and are never cancelable. */
  cancelable?: never;
  /** Throws the signal's abort reason when it is already aborted. */
  signal?: AbortSignal;
  /** Routes the event to event-aware elements with the same DOM `id`. */
  key?: PropertyKey;
};

export type CustomEventsOptions = {
  /** Immediately registers a domain `EventTarget` as the default host. */
  host?: EventTarget;
};

export type CustomEventsEventType<
  Definition extends CustomEventsDefinition,
> = Exclude<EventNames<Definition>, "*" | NativeDOMEventName>;

/** Canonical event map for descriptor consumers and TypedEventTarget. */
export type CustomEventsEventMap<
  Definition extends CustomEventsDefinition,
> = {
  [Type in CustomEventsEventType<Definition>]:
    & CustomEvent<NormalizeCustomEventsDefinition<Definition>[Type]>
    & { readonly type: Type };
};

type CustomEventsElementProjection<
  Events extends EventDetails,
  Type extends CustomEventsEventType<Events>,
  Value,
> = (
  event: CustomEventsEventMap<Events>[Type] | undefined,
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
} & {
  [Key in `data-${string}`]?:
    | string
    | undefined
    | CustomEventsElementProjection<Events, Type, string | undefined>;
};

type CustomEventsIntrinsicChildren<
  Tag extends keyof JSX.IntrinsicElements,
> = Props<Tag> extends { children?: infer Children } ? Children : RemixNode;

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
        child: CustomEventsElementProjection<Events, Type, RemixNode>;
      }
  );

/** Event-aware intrinsic element with declarative reactive attributes. */
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

type NullDetailEventTypes<Events extends EventDetails> = {
  [Type in keyof Events & string]: [Events[Type]] extends [null]
    ? Type
    : never;
}[keyof Events & string];

/** Per-entry routing; propagation belongs to the shared batch carrier. */
export type CustomEventsBatchEntryOptions = Pick<CustomEventsInit, "key">;

type CustomEventsBatchEntryConfiguration<Detail> = [Detail] extends [null]
  ? {
      detail?: null;
      options?: CustomEventsBatchEntryOptions;
    }
  : {
      detail: Detail;
      options?: CustomEventsBatchEntryOptions;
    };

/** One independently configured entry in a shared event transaction. */
export type CustomEventsBatchEntry<Events extends EventDetails> = {
  [Type in keyof Events & string]: {
    [EntryType in Type]: CustomEventsBatchEntryConfiguration<Events[Type]>;
  };
}[keyof Events & string];

/** A detail-less event-name shorthand or a configured transaction entry. */
export type CustomEventsBatchItem<Events extends EventDetails> =
  | NullDetailEventTypes<Events>
  | CustomEventsBatchEntry<Events>;

type NonEmptyArray<Value> = readonly [Value, ...Value[]];

type CustomEventsOperationMode = "create" | "dispatch";

type CustomEventsOperationPrefix<Mode extends CustomEventsOperationMode> =
  Mode extends "dispatch" ? [target: EventTarget] : [];

type CustomEventsBatchResult<Mode extends CustomEventsOperationMode> =
  Mode extends "create" ? CustomEvent<undefined> : Promise<void>;

type CustomEventsSingleResult<
  Events extends EventDetails,
  Type extends CustomEventsEventType<Events>,
  Mode extends CustomEventsOperationMode,
> = Mode extends "create"
  ? CustomEventsEventMap<Events>[Type]
  : Promise<void>;

/**
 * Shared call grammar for event creation and awaitable dispatch.
 *
 * Dispatch prepends a target and changes only the result type.
 */
type CustomEventsOperation<
  Events extends EventDetails,
  Mode extends CustomEventsOperationMode,
> = {
  <const Entries extends NonEmptyArray<CustomEventsBatchItem<Events>>>(
    ...args: [
      ...CustomEventsOperationPrefix<Mode>,
      entries: Entries,
      init?: CustomEventsInit,
    ]
  ): CustomEventsBatchResult<Mode>;

  <const Types extends readonly NullDetailEventTypes<Events>[]>(
    ...args: [
      ...CustomEventsOperationPrefix<Mode>,
      types: Types & (number extends Types["length"] ? unknown : never),
      init?: CustomEventsInit,
    ]
  ): CustomEventsBatchResult<Mode>;

  (...args: [
    ...CustomEventsOperationPrefix<Mode>,
    events: Partial<Events>,
    init?: CustomEventsInit,
  ]): CustomEventsBatchResult<Mode>;

  <Type extends NullDetailEventTypes<Events> & CustomEventsEventType<Events>>(
    ...args: [
      ...CustomEventsOperationPrefix<Mode>,
      type: Type,
      init?: CustomEventsInit,
    ]
  ): CustomEventsSingleResult<Events, Type, Mode>;

  <Type extends keyof Events & string & CustomEventsEventType<Events>>(
    ...args: [
      ...CustomEventsOperationPrefix<Mode>,
      type: Type,
      detail: Events[Type],
      init?: CustomEventsInit,
    ]
  ): CustomEventsSingleResult<Events, Type, Mode>;
};

export type CustomEventsFactory<Events extends EventDetails> =
  CustomEventsOperation<Events, "create">;

export type CustomEventsDispatch<Events extends EventDetails> =
  CustomEventsOperation<Events, "dispatch">;

type CustomEventsEventElementGroups<Events extends EventDetails> = {
  [Type in CustomEventsEventType<Events>]: CustomEventsEventElements<
    Events,
    Type
  >;
};

export type CustomEventsListenerEvent<
  Events extends EventDetails,
  Type extends CustomEventsEventType<Events>,
  Target extends EventTarget,
> = Type extends CustomEventsEventType<Events>
  ? Omit<CustomEventsEventMap<Events>[Type], "currentTarget"> & {
    readonly currentTarget: Target;
  }
  : never;

export type CustomEventsObserverOptions = {
  /** Removes the observation when aborted. */
  signal?: AbortSignal;
};

type CustomEventsListener<
  Events extends EventDetails,
  Type extends CustomEventsEventType<Events>,
  Target extends EventTarget,
> = (
  event: CustomEventsListenerEvent<Events, Type, Target>,
) => void | Promise<unknown>;

export type CustomEventsOnFunction<Events extends EventDetails> = {
  <HostElement extends Element = Element>(
    type: "*",
    listener: CustomEventsListener<
      Events,
      CustomEventsEventType<Events>,
      HostElement
    >,
  ): MixinDescriptor<HostElement, any>;
  <
    const Type extends CustomEventsEventType<Events>,
    const Rest extends readonly CustomEventsEventType<Events>[],
  >(
    types: readonly [Type, ...Rest],
  ): CustomEventsEventElements<Events, Type | Rest[number]>;
  <
    const Type extends CustomEventsEventType<Events>,
    const Rest extends readonly CustomEventsEventType<Events>[],
    HostElement extends Element = Element,
  >(
    types: readonly [Type, ...Rest],
    listener: CustomEventsListener<Events, Type | Rest[number], HostElement>,
  ): MixinDescriptor<HostElement, any>;
  <
    HostElement extends Element = Element,
    Type extends CustomEventsEventType<Events> = CustomEventsEventType<Events>,
  >(
    type: Type,
    listener: CustomEventsListener<Events, Type, HostElement>,
  ): MixinDescriptor<HostElement, any>;
} & CustomEventsEventElementGroups<Events>;

export type CustomEventsObserveFunction<Events extends EventDetails> = {
  (
    listener: CustomEventsListener<
      Events,
      CustomEventsEventType<Events>,
      EventTarget
    >,
    options?: CustomEventsObserverOptions,
  ): () => void;
  <Target extends EventTarget>(
    target: Target,
    listener: CustomEventsListener<
      Events,
      CustomEventsEventType<Events>,
      Target
    >,
    options?: CustomEventsObserverOptions,
  ): () => void;
};

/** The shared listener and event-aware-element surface of a descriptor. */
export type CustomEventsConsumer<Events extends EventDetails> = {
  /** Selects events for element-bound projections or post-projection effects. */
  on: CustomEventsOnFunction<Events>;
  /** Observes every descriptor-owned event on one exact target. */
  observe: CustomEventsObserveFunction<Events>;
  /** Makes an element the local boundary for this descriptor. */
  host<HostElement extends Element = Element>(): MixinDescriptor<
    HostElement,
    any
  >;
} & CustomEventsEventElements<Events, CustomEventsEventType<Events>>;

export type CustomEventsDescriptor<
  ProducedEvents extends EventDetails,
  ConsumedEvents extends EventDetails = ProducedEvents,
> =
  & CustomEventsFactory<ProducedEvents>
  & {
    /** Dispatches and resolves after projections, effects, and observers settle. */
    dispatch: CustomEventsDispatch<ProducedEvents>;
  }
  & CustomEventsConsumer<ConsumedEvents>;
