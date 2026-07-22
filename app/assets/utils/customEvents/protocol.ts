import {
  CHANGE_EVENT_NAME,
  CUSTOM_EVENTS_EVENT_PREFIX,
} from "./constants.ts";
import type { CustomEventsRuntime } from "./runtime.ts";
import type {
  ChangeEventDetailFromMap,
  EventDetails,
} from "./types.ts";

// Event type strings and known event types
//
// Descriptor event type strings are globally unique, so descriptor-owned events
// can be bridged or processed without colliding with browser events or another
// CustomEvents instance. Known event types are discovered lazily through proxy
// property access and event factory calls.
export function getEventName(descriptor: CustomEventsRuntime, type: string) {
  return `${CUSTOM_EVENTS_EVENT_PREFIX}:${descriptor.ownerId}:${type}`;
}

export function getEventType(
  descriptor: CustomEventsRuntime,
  eventName: string,
) {
  let prefix = `${CUSTOM_EVENTS_EVENT_PREFIX}:${descriptor.ownerId}:`;
  if (!eventName.startsWith(prefix)) return undefined;
  return eventName.slice(prefix.length);
}

export function addEventType(
  descriptor: CustomEventsRuntime,
  type: string,
) {
  if (descriptor.eventTypes.has(type)) return;
  descriptor.eventTypes.add(type);
  for (let listener of descriptor.typeListeners) listener();
}

export function subscribeEventTypes(
  descriptor: CustomEventsRuntime,
  listener: () => void,
) {
  descriptor.typeListeners.add(listener);
  return () => descriptor.typeListeners.delete(listener);
}

// Change detail helpers
//
// Every granular product event derives a change event. A product change event
// behaves as a batch: it records all provided details and expands into granular
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

export function getChangeEventEntries(
  detail: ChangeEventDetailFromMap<EventDetails>,
) {
  if (!detail.event) return Object.entries(detail.events);

  return [[detail.event.type, detail.event.detail]] satisfies Array<
    [string, unknown]
  >;
}

function getEntriesObject(entries: Array<[string, unknown]>) {
  let object: Partial<EventDetails> = {};
  for (let [type, detail] of entries) {
    object[type] = detail;
  }
  return object;
}

export function resolveCustomEventsDispatchEntries(
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

// Initial event projection
//
// Initial values are descriptor-created Event objects. A single product event
// can initialize a change renderer, and a change initial event can initialize
// the matching product-event renderer. Initial projection never dispatches.
export function createInitialEvent(
  type: string,
  descriptor: CustomEventsRuntime,
  initial: Event | undefined,
) {
  if (!(initial instanceof CustomEvent)) return undefined;

  let eventName = getEventName(descriptor, type);
  let initialType = getEventType(descriptor, initial.type);
  if (!initialType) return undefined;

  if (initialType === type) {
    return initial;
  }

  if (type === CHANGE_EVENT_NAME) {
    return new CustomEvent(eventName, {
      detail: createCustomEventChangeDetail([[initialType, initial.detail]]),
    });
  }

  if (initialType !== CHANGE_EVENT_NAME) return undefined;

  let detail = initial.detail as ChangeEventDetailFromMap<EventDetails>;
  if (!detail.event) {
    if (!Object.hasOwn(detail.events, type)) return undefined;
    return new CustomEvent(eventName, {
      detail: detail.events[type],
    });
  }

  if (detail.event.type !== type) return undefined;

  return new CustomEvent(eventName, {
    detail: detail.event.detail,
  });
}

function getInitialEventEntriesFromEvent(
  descriptor: CustomEventsRuntime,
  initial: CustomEvent,
) {
  let type = getEventType(descriptor, initial.type);
  if (!type) return undefined;
  if (type !== CHANGE_EVENT_NAME) {
    return [[type, initial.detail]] satisfies Array<[string, unknown]>;
  }

  let detail = initial.detail as ChangeEventDetailFromMap<EventDetails>;
  return getChangeEventEntries(detail);
}

export function getInitialEventEntries(descriptor: CustomEventsRuntime) {
  let initial = descriptor.initial;
  return initial instanceof CustomEvent
    ? getInitialEventEntriesFromEvent(descriptor, initial)
    : undefined;
}
