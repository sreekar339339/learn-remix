import { CHANGE_EVENT_NAME } from "./constants.ts";
import { isElement, isEventTarget } from "./dom.ts";
import {
  addEventType,
  createCustomEventChangeDetail,
  getChangeEventEntries,
  getEventInit,
  getEventName,
  getEventType,
} from "./protocol.ts";
import {
  createCustomEventsTransaction,
  type CustomEventsRuntime,
  type CustomEventsTransaction,
} from "./runtime.ts";
import type {
  ChangeEventDetailFromMap,
  EventDetails,
} from "./types.ts";

// Event construction
//
// Event factory methods return normal CustomEvent instances for native
// dispatchEvent(). The runtime stores ownership and processing metadata in weak
// collections; `originTarget` and an optional routing key are the public event
// metadata exposed by derived or bridged events.
export function createProductCustomEvent(
  descriptor: CustomEventsRuntime,
  type: string,
  init: EventInit,
  detail: unknown,
  key?: PropertyKey,
) {
  return descriptor.createCustomEvent(
    getEventName(descriptor, type),
    init,
    detail,
    { product: true, ...(key === undefined ? {} : { key }) },
  );
}

function createDescriptorEvent(
  descriptor: CustomEventsRuntime,
  type: string,
  init: EventInit,
  detail: unknown,
  origin: EventTarget,
  key?: PropertyKey,
  transaction?: CustomEventsTransaction,
) {
  let event = descriptor.createCustomEvent(
    getEventName(descriptor, type),
    init,
    detail,
    { origin, ...(key === undefined ? {} : { key }) },
  );
  transaction?.events.set(event.type, event);
  if (transaction) descriptor.markTransaction(event, transaction);
  return event;
}

// Event processing
//
// Product events are user-dispatched events. Processing emits the derived
// event(s) back on the original event target. Derived events are runtime-owned
// but not product events, so they never recurse.
//
// Each processing pass creates one transaction for every derived event emitted
// from that product event. Event-aware elements use that transaction to render first
// and let descriptor-scoped listeners in the rendered subtree run afterward.
function dispatchLocalTypedEvent(
  target: EventTarget,
  descriptor: CustomEventsRuntime,
  type: string,
  init: EventInit,
  detail: unknown,
  key?: PropertyKey,
) {
  if (isElement(target)) return;
  if (typeof window !== "undefined" && target === window) return;
  target.dispatchEvent(
    descriptor.createCustomEvent(type, init, detail, {
      origin: target,
      ...(key === undefined ? {} : { key }),
    }),
  );
}

function emitDerivedChangeEvent(
  target: EventTarget,
  descriptor: CustomEventsRuntime,
  entries: Array<[string, unknown]>,
  init: EventInit,
  key: PropertyKey | undefined,
  transaction: CustomEventsTransaction,
) {
  let changeDetail = createCustomEventChangeDetail(entries);
  target.dispatchEvent(
    createDescriptorEvent(
      descriptor,
      CHANGE_EVENT_NAME,
      init,
      changeDetail,
      target,
      key,
      transaction,
    ),
  );
  dispatchLocalTypedEvent(
    target,
    descriptor,
    CHANGE_EVENT_NAME,
    init,
    changeDetail,
    key,
  );
}

function emitExpandedGranularEvents(
  target: EventTarget,
  descriptor: CustomEventsRuntime,
  entries: Array<[string, unknown]>,
  init: EventInit,
  key: PropertyKey | undefined,
  transaction: CustomEventsTransaction,
) {
  if (entries.length === 1) {
    let [[type, detail]] = entries;
    target.dispatchEvent(
      createDescriptorEvent(
        descriptor,
        type,
        init,
        detail,
        target,
        key,
        transaction,
      ),
    );
    dispatchLocalTypedEvent(target, descriptor, type, init, detail, key);
    return;
  }

  let events = entries.map(([type, detail]) =>
    createDescriptorEvent(
      descriptor,
      type,
      init,
      detail,
      target,
      key,
      transaction,
    ),
  );

  for (let event of events) {
    target.dispatchEvent(event);
  }

  for (let [type, detail] of entries) {
    dispatchLocalTypedEvent(target, descriptor, type, init, detail, key);
  }
}

function commitProductEvent(
  target: EventTarget,
  descriptor: CustomEventsRuntime,
  entries: Array<[string, unknown]>,
  init: EventInit,
  key: PropertyKey | undefined,
) {
  let transaction = createCustomEventsTransaction();
  emitDerivedChangeEvent(target, descriptor, entries, init, key, transaction);
  emitExpandedGranularEvents(target, descriptor, entries, init, key, transaction);
}

function getProductEventEntries(
  event: CustomEvent,
  descriptor: CustomEventsRuntime,
) {
  let type = getEventType(descriptor, event.type);
  if (!type) return undefined;

  if (type !== CHANGE_EVENT_NAME) {
    return [[type, event.detail]] satisfies Array<[string, unknown]>;
  }

  let detail = event.detail as ChangeEventDetailFromMap<EventDetails>;
  let entries = getChangeEventEntries(detail);
  for (let [type] of entries) addEventType(descriptor, type);
  return entries;
}

export function processCustomEventsEvent(
  event: CustomEvent,
  descriptor: CustomEventsRuntime,
) {
  if (!descriptor.ownsEvent(event)) return;
  if (!descriptor.claimProductEvent(event)) return;

  let origin = isEventTarget(event.target) ? event.target : undefined;
  if (!origin) return;

  let init = getEventInit(event);
  let key = descriptor.getEventKey(event);
  let entries = getProductEventEntries(event, descriptor);
  if (!entries?.length) return;

  queueMicrotask(() => {
    commitProductEvent(origin, descriptor, entries, init, key);
  });
}
