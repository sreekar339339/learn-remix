import { isElement, isEventTarget } from "./dom.ts";
import {
  getEventInit,
  getEventName,
  getEventType,
} from "./protocol.ts";
import {
  createCustomEventsTransaction,
  type CustomEventsBatchRuntimeEntry,
  type CustomEventsRuntime,
  type CustomEventsTransaction,
} from "./runtime.ts";

// Event construction
//
// Event factory methods return normal CustomEvent instances for native
// dispatchEvent(). The runtime stores ownership and processing metadata in weak
// collections. Routing keys remain private runtime metadata.
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
  key?: PropertyKey,
  transaction?: CustomEventsTransaction,
) {
  let event = descriptor.createCustomEvent(
    getEventName(descriptor, type),
    init,
    detail,
    key === undefined ? undefined : { key },
  );
  transaction?.events.set(event.type, event);
  return event;
}

// Event processing
//
// Product events are user-dispatched events. Processing emits the derived
// event(s) back on the original event target. Derived events are runtime-owned
// but not product events, so they never recurse.
//
// Each processing pass creates one transaction for every derived event emitted
// from that product event. All matching projections render before matching
// post-render effects run.
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
    descriptor.createCustomEvent(
      type,
      init,
      detail,
      key === undefined ? undefined : { key },
    ),
  );
}

function commitTransaction(
  target: EventTarget,
  descriptor: CustomEventsRuntime,
  entries: CustomEventsBatchRuntimeEntry[],
  originScope: EventTarget,
) {
  let transaction = createCustomEventsTransaction();
  let granularEvents = entries.map(({ type, detail, init, key }) =>
    createDescriptorEvent(
      descriptor,
      type,
      init,
      detail,
      key,
      transaction,
    )
  );
  for (let granularEvent of granularEvents) {
    target.dispatchEvent(granularEvent);
  }
  for (let { type, detail, init, key } of entries) {
    dispatchLocalTypedEvent(target, descriptor, type, init, detail, key);
  }
  descriptor.notifyTransaction(transaction, originScope, target);
}

export function processCustomEventsEvent(
  event: CustomEvent,
  descriptor: CustomEventsRuntime,
  originScope: EventTarget,
) {
  if (!descriptor.ownsEvent(event)) return;
  if (!descriptor.claimProductEvent(event)) return;

  let origin = isEventTarget(event.target) ? event.target : undefined;
  if (!origin) return;

  let init = getEventInit(event);
  let key = descriptor.getEventKey(event);
  let entries = descriptor.getProductBatchEntries(event);
  if (!entries) {
    let type = getEventType(descriptor, event.type);
    if (!type) return;
    entries = [{
      type,
      detail: event.detail,
      init,
      ...(key === undefined ? {} : { key }),
    }];
  }

  commitTransaction(origin, descriptor, entries, originScope);
}
