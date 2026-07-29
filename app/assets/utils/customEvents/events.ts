import { CHANGE_EVENT_NAME } from "./constants.ts";
import { isElement, isEventTarget } from "./dom.ts";
import {
  createCustomEventChangeDetail,
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
// collections; `originTarget` and an optional routing key are the public event
// metadata exposed by derived events.
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

function commitTransaction(
  target: EventTarget,
  descriptor: CustomEventsRuntime,
  entries: CustomEventsBatchRuntimeEntry[],
  aggregateInit: EventInit,
  aggregateKey: PropertyKey | undefined,
  originScope: EventTarget,
) {
  let transaction = createCustomEventsTransaction();
  let details = entries.map(({ type, detail }) => [type, detail] as [
    string,
    unknown,
  ]);
  emitDerivedChangeEvent(
    target,
    descriptor,
    details,
    aggregateInit,
    aggregateKey,
    transaction,
  );

  let granularEvents = entries.map(({ type, detail, init, key }) =>
    createDescriptorEvent(
      descriptor,
      type,
      init,
      detail,
      target,
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
    if (!type || type === CHANGE_EVENT_NAME) return;
    entries = [{
      type,
      detail: event.detail,
      init,
      ...(key === undefined ? {} : { key }),
    }];
  }

  queueMicrotask(() => {
    commitTransaction(origin, descriptor, entries, init, key, originScope);
  });
}
