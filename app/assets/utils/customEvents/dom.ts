export function defineEventValue(
  event: Event,
  property: PropertyKey,
  value: unknown,
  options?: { enumerable?: boolean },
) {
  Object.defineProperty(event, property, {
    configurable: true,
    enumerable: options?.enumerable,
    value,
  });
}

export function isElement(value: unknown): value is Element {
  return typeof Element !== "undefined" && value instanceof Element;
}

export function isEventTarget(value: unknown): value is EventTarget {
  return typeof EventTarget !== "undefined" && value instanceof EventTarget;
}
