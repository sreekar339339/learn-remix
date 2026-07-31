import type { Handle, MixinDescriptor, Props, RemixNode } from "remix/ui";

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
> = Extract<
  Exclude<CustomEventsDefinitionKeys<Definition>, "*" | NativeDOMEventName>,
  string
>;

/** Canonical event map for descriptor consumers and TypedEventTarget. */
export type CustomEventsEventMap<
  Definition extends CustomEventsDefinition,
> = {
  [Type in CustomEventsEventType<Definition>]:
    & CustomEvent<NormalizeCustomEventsDefinition<Definition>[Type]>
    & { readonly type: Type };
};

type CustomEventsElementEvent<
  Events extends EventDetails,
  Type extends CustomEventsEventType<Events>,
> =
  | CustomEventsEventMap<Events>[Type]
  | undefined;

type CustomEventsElementProjection<
  Events extends EventDetails,
  Type extends CustomEventsEventType<Events>,
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

type CustomEventsEventElementRender<
  Events extends EventDetails,
  Type extends CustomEventsEventType<Events>,
> = (
  event: CustomEventsElementEvent<Events, Type>,
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
        child: CustomEventsEventElementRender<Events, Type>;
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
  <const Types extends readonly [
    NullDetailEventTypes<Events>,
    ...Array<NullDetailEventTypes<Events>>,
  ]>(
    ...args: [
      ...CustomEventsOperationPrefix<Mode>,
      types: Types & UniqueEventTypes<Types>,
      init?: CustomEventsInit,
    ]
  ): CustomEventsBatchResult<Mode>;

  <const Entries extends readonly [
    CustomEventsBatchItem<Events>,
    ...CustomEventsBatchItem<Events>[],
  ]>(
    ...args: [
      ...CustomEventsOperationPrefix<Mode>,
      entries: Entries & (
        Extract<Entries[number], CustomEventsBatchEntry<Events>> extends never
          ? never
          : unknown
      ),
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

  <
    Type extends keyof Events & string & CustomEventsEventType<Events>,
    Detail extends Events[Type],
  >(
    ...args: [
      ...CustomEventsOperationPrefix<Mode>,
      type: Type,
      detail: ExactEventDetail<Events[Type], Detail>,
      init?: CustomEventsInit,
    ]
  ): CustomEventsSingleResult<Events, Type, Mode>;
};

export type CustomEventsFactory<Events extends EventDetails> =
  CustomEventsOperation<Events, "create">;

export type CustomEventsDispatch<Events extends EventDetails> =
  CustomEventsOperation<Events, "dispatch">;

export type CustomEventsEventElementGroups<Events extends EventDetails> = {
  [Type in CustomEventsEventType<Events>]: CustomEventsEventElements<
    Events,
    Type
  >;
};

type CustomEventsTypeGroup<Events extends EventDetails> = readonly [
  CustomEventsEventType<Events>,
  ...CustomEventsEventType<Events>[],
];

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
  signal?: AbortSignal;
};

type CustomEventsListener<
  Events extends EventDetails,
  Type extends CustomEventsEventType<Events>,
  Target extends EventTarget,
> = (
  event: CustomEventsListenerEvent<Events, Type, Target>,
  signal: AbortSignal,
) => void | Promise<void>;

export type CustomEventsOnFunction<Events extends EventDetails> = {
  <HostElement extends Element = Element>(
    type: "*",
    listener: CustomEventsListener<
      Events,
      CustomEventsEventType<Events>,
      HostElement
    >,
  ): MixinDescriptor<HostElement, any>;
  <const Types extends CustomEventsTypeGroup<Events>>(
    types: Types,
  ): CustomEventsEventElements<Events, Types[number]>;
  <
    HostElement extends Element = Element,
    const Types extends CustomEventsTypeGroup<Events> =
      CustomEventsTypeGroup<Events>,
  >(
    types: Types,
    listener: CustomEventsListener<Events, Types[number], HostElement>,
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

export type CustomEventsDescriptor<Events extends EventDetails> =
  CustomEventsFactory<Events> &
  {
    /** Dispatches and resolves after projections, effects, and observers settle. */
    dispatch: CustomEventsDispatch<Events>;
    /** Selects events for element effects or event elements. */
    on: CustomEventsOnFunction<Events>;
    /** Observes every descriptor-owned event on a target. */
    observe: CustomEventsObserveFunction<Events>;
    /** Makes an element the local boundary for this descriptor. */
    host<HostElement extends Element = Element>(): MixinDescriptor<
      HostElement,
      any
    >;
  } &
  CustomEventsEventElements<Events, CustomEventsEventType<Events>>;
