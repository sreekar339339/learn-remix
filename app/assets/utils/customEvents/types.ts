import type {
  GenericJSXComponent,
  MixinDescriptor,
  Props,
  RemixNode,
} from "remix/ui";
import type {
  EventSource,
  EventSourceHasCurrent,
  EventSources,
} from "./eventSources.ts";

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

type ReservedCustomEventsName =
  | "create"
  | "dispatch"
  | "host"
  | "on"
  | "view"
  | "withState";
type ReservedNamesIn<Definition> = Extract<
  EventNames<Definition>,
  ReservedCustomEventsName
>;

type NativeEventNameError<Names extends string> = {
  readonly __customEventsNativeEventNameError:
    "customEvents names cannot overlap native DOM event names.";
  readonly nativeEventNames: Names;
};

export type CustomEventsFactoryArgs<Definition> =
  [NativeNamesIn<Definition>] extends [never]
    ? [ReservedNamesIn<Definition>] extends [never]
      ? [options?: CustomEventsOptions]
      : [error: {
          readonly __customEventsReservedNameError:
            "customEvents names cannot overwrite its API.";
          readonly reservedEventNames: ReservedNamesIn<Definition>;
        }]
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

type CustomEventsInputProps<
  On,
  Input,
  Tag extends keyof JSX.IntrinsicElements,
  Initialized extends boolean,
> = CustomEventsElementProps<
  On,
  Input | (Initialized extends true ? never : undefined),
  Tag
> & (Initialized extends true ? { initial: Input } : { initial?: never });

type SourceSelection<Source> = Source | readonly Source[];

type CustomEventsSourceItem<
  Events extends EventDetails,
  _State extends EventDetails,
> = EventSource<any, keyof Events & string, boolean>;

type CustomEventsSourceEvent<Source> = Source extends readonly (infer Item)[]
  ? CustomEventsSourceEvent<Item>
  : Source extends EventSource<infer Value, infer Type, boolean>
    ? CustomEvent<Value> & { readonly type: Type }
  : never;

type SourceHasCurrent<Source> = Source extends readonly (infer Item)[]
  ? true extends SourceHasCurrent<Item> ? true : false
  : EventSourceHasCurrent<Source>;

type CustomEventsDefaultElementProps<
  Events extends EventDetails,
  Tag extends keyof JSX.IntrinsicElements,
  Initialized extends boolean,
> = Omit<
  CustomEventsInputProps<
    "*",
    CustomEventsEventMap<Events>[CustomEventsEventType<Events>],
    Tag,
    Initialized
  >,
  "on"
> & { on?: never };

type CustomEventsOccurrenceProps<
  Source,
  Tag extends keyof JSX.IntrinsicElements,
  Initialized extends boolean,
> = CustomEventsElementProps<
  Source,
  | CustomEventsSourceEvent<Source>
  | (Initialized extends true ? never
    : SourceHasCurrent<Source> extends true ? never
    : undefined),
  Tag
> & (Initialized extends true ? { initial: CustomEventsSourceEvent<Source> }
  : { initial?: never });

/** Event-aware intrinsic element with declarative reactive attributes. */
export type CustomEventsEventElement<
  Events extends EventDetails,
  State extends EventDetails | never,
  Tag extends keyof JSX.IntrinsicElements,
> = GenericJSXComponent & {
  (props: CustomEventsDefaultElementProps<Events, Tag, true>): RemixNode;
  (props: CustomEventsDefaultElementProps<Events, Tag, false>): RemixNode;
  <const Source extends SourceSelection<CustomEventsSourceItem<Events, State>>>(
    props: CustomEventsOccurrenceProps<Source, Tag, true>,
  ): RemixNode;
  <const Source extends SourceSelection<CustomEventsSourceItem<Events, State>>>(
    props: CustomEventsOccurrenceProps<Source, Tag, false>,
  ): RemixNode;
};

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

type CustomEventsListener<
  Events extends EventDetails,
  Type extends CustomEventsEventType<Events>,
  Target extends EventTarget,
> = (
  event: CustomEventsListenerEvent<Events, Type, Target>,
) => void | Promise<unknown>;

export type CustomEventsOnFunction<Events extends EventDetails> = {
  <HostElement extends Element = Element>(
    listener: CustomEventsListener<
      Events,
      CustomEventsEventType<Events>,
      HostElement
    >,
  ): MixinDescriptor<HostElement, any>;
};

export type CustomEventsDescriptor<
  Events extends EventDetails,
  State extends EventDetails | never = never,
> =
  & EventSources<Events, State>
  & {
    /** Creates one occurrence event or an occurrence transaction. */
    create: CustomEventsFactory<
      [State] extends [never] ? Events : Omit<Events, keyof State>
    >;
    /** Dispatches and resolves after projections and effects settle. */
    dispatch: CustomEventsDispatch<
      [State] extends [never] ? Events : Omit<Events, keyof State>
    >;
    /** Runs a mounted-element effect for every descriptor event. */
    on: CustomEventsOnFunction<Events>;
    /** Makes an element the local boundary for this descriptor. */
    host: MixinDescriptor<Element, any>;
    /** Event-aware intrinsic elements for this descriptor. */
    view: CustomEventsEventElements<Events, State>;
  }
;
