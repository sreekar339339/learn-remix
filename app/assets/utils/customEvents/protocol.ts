import { CHANGE_EVENT_NAME } from "./constants.ts";
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

// Change detail helpers
//
// Every granular product event derives a change event. A product change event
// behaves as a batch: it contains all provided details and expands into granular
// events.
export function createCustomEventChangeDetail(
  entries: Array<[string, unknown]>,
) {
  if (entries.length === 1) {
    let [[type, detail]] = entries;
    return {
      event: {
        type,
        detail,
      },
      events: null,
    };
  }

  return {
    event: null,
    events: getEntriesObject(entries),
  };
}

function getEntriesObject(entries: Array<[string, unknown]>) {
  let object: Partial<EventDetails> = {};
  for (let [type, detail] of entries) {
    object[type] = detail;
  }
  return object;
}

export function getCustomEventsDispatchEntries(
  events: Partial<EventDetails>,
) {
  let entries: Array<[string, unknown]> = [];

  for (let [type, detail] of Object.entries(events)) {
    if (type === CHANGE_EVENT_NAME) {
      throw new TypeError('CustomEvents does not dispatch "change" directly.');
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
