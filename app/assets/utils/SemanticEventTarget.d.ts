
export declare class SemanticEventTarget<eventShape extends object> extends EventTarget {
    readonly __eventMap?: NormalisedEventMap<eventShape> & {change: NormalisedEventShape<eventShape>}
    constructor(changeEventListener?: TypedEventListener<eventShape>['change'], options?: boolean | AddEventListenerOptions) {}
}
/**
 * Interface surface for {@link SemanticEventTarget} with typed listener overloads.
 */
export interface SemanticEventTarget<eventShape extends object> {
    addEventListener<type extends Extract<keyof eventShape, string>>(type: type, listener: TypedEventListener<eventShape>[type], options?: AddEventListenerOptions): void;

    addEventListener(type: 'change', listener: TypedEventListener<eventShape>['change'], options?: AddEventListenerOptions): void;

    addEventListener(type: string, listener: EventListenerOrEventListenerObject | null, options?: boolean | AddEventListenerOptions): void;

    removeEventListener<type extends Extract<keyof eventShape, string>>(type: type, listener: TypedEventListener<eventShape>[type], options?: EventListenerOptions): void;

    removeEventListener(type: string, listener: EventListenerOrEventListenerObject | null, options?: EventListenerOptions): void;

    dispatchEvent(evt: Event): boolean

    dispatchEvent(evt: NormalisedEventShape<eventShape>): boolean
}
type TypedEventListener<eventShape extends object> = {
    [key in keyof eventShape]: (event: eventShape[key]) => void;
} & {
    change: (event: NormalisedEventShape<eventShape>) => void
};

type NormalisedEventShape<eventShape extends object> = eventShape extends { type: PropertyKey } ? eventShape : ObjectToTaggedUnion<eventShape>

type UnionToMap<T extends { type: PropertyKey }> = {
  [E in T as E["type"]]: Omit<E, "type">
};

type NormalisedEventMap<T> =
  [T] extends [{ type: PropertyKey }]
    ? UnionToMap<T & { type: PropertyKey }>
    : T;

type ObjectToTaggedUnion<T extends Record<PropertyKey, any>> = {
  [K in keyof T & PropertyKey]: {
    type: K;
  } & {
    [P in K]: T[K];
  };
}[keyof T & PropertyKey];

export {};


