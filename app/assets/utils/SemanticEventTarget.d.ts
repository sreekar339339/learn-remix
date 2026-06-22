export declare const SemanticEventTarget: {
  new <
    InputShape extends object,
    StateShape = InputShape
  >(
    init: EventShapeInit<InputShape, StateShape>
  ): SemanticEventTarget<InputShape, StateShape, true>;

  new <
    InputShape extends object,
    StateShape = InputShape
  >(
    init: ObjectShapeInit<InputShape, StateShape>
  ): SemanticEventTarget<InputShape, StateShape, false>;
};

export interface SemanticEventTarget<
  InputShape extends object,
  StateShape = InputShape,
  HasInitialEvent extends boolean = boolean
> extends EventTarget {
  readonly __eventMap: SemanticEventMap<InputShape>;

  event: HasInitialEvent extends true
    ? NormalizedEventShape<InputShape>
    : NormalizedEventShape<InputShape> | null;

  state: StateShape;

  dispatchEvent(event: Event): boolean;

  dispatchEvent<
    K extends keyof NormalizedEventMap<InputShape> & string
  >(
    ...args: DispatchArgs<NormalizedEventMap<InputShape>, K>
  ): Promise<void>;

  addEventListener<
    K extends keyof SemanticEventMap<InputShape> & string
  >(
    type: K,
    listener: TypedEventListener<InputShape>[K],
    options?: boolean | AddEventListenerOptions
  ): void;

  addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | AddEventListenerOptions
  ): void;

  removeEventListener<
    K extends keyof SemanticEventMap<InputShape> & string
  >(
    type: K,
    listener: TypedEventListener<InputShape>[K],
    options?: boolean | EventListenerOptions
  ): void;

  removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | EventListenerOptions
  ): void;
}

export interface EventShapeInit<
  InputShape extends object,
  StateShape
> {
  /**
   * Presence of `event` puts the runtime into event-union mode.
   */
  event: NormalizedEventShape<InputShape>;

  /**
   * Optional separate state.
   * If omitted, state starts as the initial event.
   */
  state?: StateShape;

  reducer?: StateReducer<InputShape, StateShape>;

  onChange?: TypedEventListener<InputShape>["change"];

  options?: boolean | AddEventListenerOptions;
}

export interface ObjectShapeInit<
  InputShape extends object,
  StateShape
> {
  /**
   * Presence of `state`, without `event`, puts the runtime into POJO-state mode.
   */
  state: StateShape;

  event?: never;

  reducer?: StateReducer<InputShape, StateShape>;

  onChange?: TypedEventListener<InputShape>["change"];

  options?: boolean | AddEventListenerOptions;
}

export type StateReducer<
  InputShape extends object,
  StateShape
> = (
  state: StateShape,
  event: NormalizedEventShape<InputShape>,
  meta: {
    kind: "event" | "object";
    type: keyof NormalizedEventMap<InputShape> & string;
    payload: NormalizedEventMap<InputShape>[keyof NormalizedEventMap<InputShape>];
    stateKey: string | undefined;
    statePatch: unknown;
  }
) => StateShape | void | Promise<StateShape | void>;

type MaybePromise<T = void> =
  | T
  | Promise<T>;

type DispatchArgs<
  EventMap extends object,
  K extends keyof EventMap & string
> =
  keyof EventMap[K] extends never
    ? [type: K, payload?: EventMap[K]]
    : [type: K, payload: EventMap[K]];

type TypedEventListener<
  InputShape extends object
> = {
  [K in keyof SemanticEventMap<InputShape>]:
    (event: SemanticEventMap<InputShape>[K]) => MaybePromise;
};

type SemanticEventMap<
  InputShape extends object
> =
  NormalizedEventMap<InputShape> & {
    change: NormalizedEventShape<InputShape>;
  };

type NormalizedEventShape<
  InputShape extends object
> =
  [InputShape] extends [{ type: PropertyKey }]
    ? InputShape
    : ObjectToChangeTaggedUnion<InputShape>;

type NormalizedEventMap<
  InputShape extends object
> =
  [InputShape] extends [{ type: PropertyKey }]
    ? UnionToMap<InputShape & { type: PropertyKey }>
    : ObjectToChangeEventMap<InputShape>;

type UnionToMap<
  T extends { type: PropertyKey }
> = {
  [E in T as E["type"]]: Omit<E, "type">;
};

type ObjectToChangeEventMap<
  T extends object
> = {
  [K in keyof T & string as `${K}Change`]: T[K];
};

type ObjectToChangeTaggedUnion<
  T extends object
> = {
  [K in keyof T & string]: {
    type: `${K}Change`;
  } & {
    [P in K]: T[K];
  };
}[keyof T & string];

export {};