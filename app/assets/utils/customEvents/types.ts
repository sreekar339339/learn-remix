import type {
  GenericJSXComponent,
  MixinDescriptor,
  Props,
  RemixNode,
} from "remix/ui";
import type {
  StateEventSource,
  StateEventSources,
} from "./stateEventSources.ts";

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

type CustomEventsElementProjection<Input, Value> = (input: Input) => Value;

type CustomEventsReactiveElementProps<
  Input,
  Tag extends keyof JSX.IntrinsicElements,
> = {
  [Key in keyof Props<Tag>]: Key extends string
    ? Key extends "children" | "key" | "mix" | "ref" | "on" | `on${string}`
      ? Props<Tag>[Key]
      :
          | Props<Tag>[Key]
          | CustomEventsElementProjection<NoInfer<Input>, Props<Tag>[Key]>
    : Props<Tag>[Key];
} & {
  [Key in `data-${string}`]?:
    | string
    | undefined
    | CustomEventsElementProjection<NoInfer<Input>, string | undefined>;
};

type CustomEventsIntrinsicChildren<
  Tag extends keyof JSX.IntrinsicElements,
> = Props<Tag> extends { children?: infer Children } ? Children : RemixNode;

/** Props for an intrinsic element driven by one descriptor event. */
type CustomEventsElementProps<
  On,
  Input,
  Tag extends keyof JSX.IntrinsicElements,
> = Omit<CustomEventsReactiveElementProps<Input, Tag>, "children"> &
  {
    on: On;
    children?:
      | CustomEventsIntrinsicChildren<Tag>
      | CustomEventsElementProjection<NoInfer<Input>, RemixNode>;
  };

type CustomEventsUninitializedElementProps<
  On,
  Input,
  Tag extends keyof JSX.IntrinsicElements,
> = CustomEventsElementProps<On, Input | undefined, Tag> & {
  initial?: never;
};

type CustomEventsInitializedElementProps<
  On,
  Input,
  Tag extends keyof JSX.IntrinsicElements,
> = CustomEventsElementProps<On, Input, Tag> & {
  initial: Input;
};

type EventNameSource<Events extends EventDetails> =
  | "*"
  | CustomEventsEventType<Events>;

type EventForName<
  Events extends EventDetails,
  Source extends EventNameSource<Events>,
> = Source extends "*"
  ? CustomEventsEventMap<Events>[CustomEventsEventType<Events>]
  : Source extends CustomEventsEventType<Events>
    ? CustomEventsEventMap<Events>[Source]
  : never;

type SourceSelection<Source> = Source | readonly Source[];

type CustomEventsSourceItem<
  Events extends EventDetails,
  State extends EventDetails,
> =
  | EventNameSource<Events>
  | StateEventSource<unknown, keyof State & string>;

type CustomEventsSource<
  Events extends EventDetails,
  State extends EventDetails,
> =
  | StateEventSource<unknown, keyof State & string>
  | readonly [
    StateEventSource<unknown, keyof State & string>,
    ...CustomEventsSourceItem<Events, State>[],
  ];

type CustomEventsStateSources<
  Events extends EventDetails,
  State extends EventDetails,
> =
  & StateEventSources<State>
  & {
    readonly [Type in Exclude<
      CustomEventsEventType<Events>,
      keyof State & string
    >]: Type;
  };

type CustomEventsSourceEvent<
  Events extends EventDetails,
  Source,
> = Source extends readonly (infer Item)[]
  ? CustomEventsSourceEvent<Events, Item>
  : Source extends StateEventSource<infer Value, infer Type>
    ? CustomEvent<Value> & { readonly type: Type }
  : Source extends EventNameSource<Events>
    ? EventForName<Events, Source>
  : never;

type CustomEventsDefaultElementProps<
  Events extends EventDetails,
  Tag extends keyof JSX.IntrinsicElements,
  Initialized extends boolean,
> = (Initialized extends true ? CustomEventsInitializedElementProps<
    "*",
    CustomEventsEventMap<Events>[CustomEventsEventType<Events>],
    Tag
  >
  : CustomEventsUninitializedElementProps<
    "*",
    CustomEventsEventMap<Events>[CustomEventsEventType<Events>],
    Tag
  >) extends infer ElementProps
  ? ElementProps extends { on: "*" }
    ? Omit<ElementProps, "on"> & { on?: "*" }
  : never
  : never;

type CustomEventsOccurrenceProps<
  Events extends EventDetails,
  Source extends SourceSelection<EventNameSource<Events>>,
  Tag extends keyof JSX.IntrinsicElements,
  Initialized extends boolean,
> = Initialized extends true ? CustomEventsInitializedElementProps<
    Source,
    CustomEventsSourceEvent<Events, Source>,
    Tag
  >
  : CustomEventsUninitializedElementProps<
    Source,
    CustomEventsSourceEvent<Events, Source>,
    Tag
  >;

/** Event-aware intrinsic element with declarative reactive attributes. */
export type CustomEventsEventElement<
  Events extends EventDetails,
  State extends EventDetails | never,
  Tag extends keyof JSX.IntrinsicElements,
> = GenericJSXComponent & {
  (props: CustomEventsDefaultElementProps<Events, Tag, true>): RemixNode;
  (props: CustomEventsDefaultElementProps<Events, Tag, false>): RemixNode;
  <const Source extends SourceSelection<EventNameSource<Events>>>(
    props: CustomEventsOccurrenceProps<Events, Source, Tag, true>,
  ): RemixNode;
  <const Source extends SourceSelection<EventNameSource<Events>>>(
    props: CustomEventsOccurrenceProps<Events, Source, Tag, false>,
  ): RemixNode;
} & ([State] extends [never] ? unknown : {
  <const Source extends CustomEventsSource<Events, State>>(
    props: CustomEventsElementProps<
      (event: CustomEventsStateSources<Events, State>) => Source,
      CustomEventsSourceEvent<Events, Source>,
      Tag
    > & { initial?: never },
  ): RemixNode;
});

export type CustomEventsEventElements<
  Events extends EventDetails,
  State extends EventDetails | never = never,
> = {
  [Tag in keyof JSX.IntrinsicElements]: CustomEventsEventElement<
    Events,
    State,
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
  [Type in keyof Events & string]: Record<
    Type,
    CustomEventsBatchEntryConfiguration<Events[Type]>
  >;
}[keyof Events & string];

/** A detail-less event-name shorthand or a configured transaction entry. */
export type CustomEventsBatchItem<Events extends EventDetails> =
  | NullDetailEventTypes<Events>
  | CustomEventsBatchEntry<Events>;

type NonEmptyArray<Value> = readonly [Value, ...Value[]];

type CustomEventsResult<
  Events extends EventDetails,
  Type extends CustomEventsEventType<Events> | never,
  Async extends boolean,
> = Async extends true ? Promise<void>
  : [Type] extends [never] ? CustomEvent<undefined>
  : CustomEventsEventMap<Events>[Type];

/**
 * Shared call grammar for event creation and awaitable dispatch.
 *
 * Dispatch prepends a target and changes only the result type.
 */
type CustomEventsOperation<
  Events extends EventDetails,
  Prefix extends unknown[],
  Async extends boolean,
> = {
  <const Entries extends NonEmptyArray<CustomEventsBatchItem<Events>>>(
    ...args: [
      ...Prefix,
      entries: Entries,
      init?: CustomEventsInit,
    ]
  ): CustomEventsResult<Events, never, Async>;

  <Type extends NullDetailEventTypes<Events> & CustomEventsEventType<Events>>(
    ...args: [
      ...Prefix,
      type: Type,
      init?: CustomEventsInit,
    ]
  ): CustomEventsResult<Events, Type, Async>;

  <Type extends keyof Events & string & CustomEventsEventType<Events>>(
    ...args: [
      ...Prefix,
      type: Type,
      detail: Events[Type],
      init?: CustomEventsInit,
    ]
  ): CustomEventsResult<Events, Type, Async>;
};

export type CustomEventsFactory<Events extends EventDetails> =
  CustomEventsOperation<Events, [], false>;

export type CustomEventsDispatch<Events extends EventDetails> =
  CustomEventsOperation<Events, [target: EventTarget], true>;

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
    const Types extends readonly [
      CustomEventsEventType<Events>,
      ...CustomEventsEventType<Events>[],
    ],
    HostElement extends Element = Element,
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
};

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

export type CustomEventsDescriptor<
  Events extends EventDetails,
  State extends EventDetails | never = never,
> =
  & CustomEventsFactory<
    [State] extends [never] ? Events : Omit<Events, keyof State>
  >
  & {
    /** Dispatches and resolves after projections, effects, and observers settle. */
    dispatch: CustomEventsDispatch<
      [State] extends [never] ? Events : Omit<Events, keyof State>
    >;
    /** Runs post-projection effects for selected events. */
    on: CustomEventsOnFunction<Events>;
    /** Observes every descriptor-owned event on one exact target. */
    observe: CustomEventsObserveFunction<Events>;
    /** Makes an element the local boundary for this descriptor. */
    host: MixinDescriptor<Element, any>;
  }
  & CustomEventsEventElements<Events, State>;
