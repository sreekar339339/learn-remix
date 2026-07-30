import { CUSTOM_EVENTS_ALL } from "./constants.ts";
import type { CustomEventsRuntime } from "./runtime.ts";
import type { EventDetails } from "./types.ts";

// Event type strings and known event types
//
// Descriptor event type strings are globally unique, so descriptor-owned events
// can be observed and processed without colliding with browser events or another
// CustomEvents instance. Known event types are discovered lazily through proxy
// property access and event factory calls.
export function getEventName(descriptor: CustomEventsRuntime, type: string) {
  let eventName = descriptor.eventNames.get(type);
  if (eventName) return eventName;

  eventName = `${descriptor.eventPrefix}${type}`;
  descriptor.eventNames.set(type, eventName);
  return eventName;
}

export function getEventType(
  descriptor: CustomEventsRuntime,
  eventName: string,
) {
  if (!eventName.startsWith(descriptor.eventPrefix)) return undefined;
  return eventName.slice(descriptor.eventPrefix.length);
}

export function addEventType(
  descriptor: CustomEventsRuntime,
  type: string,
) {
  if (descriptor.eventTypes.has(type)) return;
  descriptor.eventTypes.add(type);
  for (let listener of descriptor.typeListeners) listener(type);
}

export function subscribeEventTypes(
  descriptor: CustomEventsRuntime,
  listener: (type: string) => void,
) {
  descriptor.typeListeners.add(listener);
  return () => descriptor.typeListeners.delete(listener);
}

export function getCustomEventsDispatchEntries(
  events: Partial<EventDetails>,
) {
  let entries: Array<[string, unknown]> = [];

  for (let [type, detail] of Object.entries(events)) {
    if (type === CUSTOM_EVENTS_ALL) {
      throw new TypeError('CustomEvents reserves "*" for subscriptions.');
    }
    entries.push([type, detail]);
  }

  return entries;
}

export function getEventInit(init: EventInit | undefined): EventInit {
  return {
    bubbles: init?.bubbles ?? true,
    cancelable: init?.cancelable ?? true,
    ...(init?.composed === undefined ? {} : { composed: init.composed }),
  };
}
