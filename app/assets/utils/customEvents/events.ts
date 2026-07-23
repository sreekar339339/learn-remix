import { CHANGE_EVENT_NAME } from "./constants.ts";
import { isElement, isEventTarget } from "./dom.ts";
import {
  addEventType,
  createCustomEventChangeDetail,
  getChangeEventEntries,
  getEventInit,
  getEventName,
  getEventType,
  resolveCustomEventsDispatchEntries,
} from "./protocol.ts";
import type { CustomEventsRuntime } from "./runtime.ts";
import type {
  ChangeEventDetailFromMap,
  CustomEventProductKind,
  CustomEventsTransaction,
  EventDetails,
} from "./types.ts";
import { createCustomEventsTransaction } from "./types.ts";

// Event construction
//
// Event factory methods return normal CustomEvent instances for native
// dispatchEvent(). The runtime stores ownership and processing metadata in weak
// collections; `originTarget` is the only public property added to derived or
// bridged events.
export function createProductCustomEvent(
  descriptor: CustomEventsRuntime,
  type: string,
  init: EventInit,
  detail: unknown,
  product: CustomEventProductKind,
  options?: { resolveDetail?: boolean },
) {
  return descriptor.createCustomEvent(
    getEventName(descriptor, type),
    init,
    detail,
    {
      product: {
        kind: product,
        resolveDetail: options?.resolveDetail,
      },
    },
  );
}

function createDescriptorEvent(
  descriptor: CustomEventsRuntime,
  type: string,
  init: EventInit,
  detail: unknown,
  origin: EventTarget,
  transaction?: CustomEventsTransaction,
) {
  let event = descriptor.createCustomEvent(
    getEventName(descriptor, type),
    init,
    detail,
    { origin },
  );
  transaction?.events.set(event.type, event);
  if (transaction) descriptor.markTransaction(event, transaction);
  return event;
}

// Event processing
//
// Product events are user-dispatched events. Processing records host memory and
// emits the derived event(s) back on the original event target. Derived events
// are runtime-owned but not product events, so they never recurse.
//
// Each processing pass creates one transaction for every derived event emitted
// from that product event. Event components use that transaction to render first
// and let descriptor-scoped listeners in the rendered subtree run afterward.
function dispatchLocalTypedEvent(
  target: EventTarget,
  descriptor: CustomEventsRuntime,
  type: string,
  init: EventInit,
  detail: unknown,
) {
  if (isElement(target)) return;
  if (typeof window !== "undefined" && target === window) return;
  target.dispatchEvent(
    descriptor.createCustomEvent(type, init, detail, {
      origin: target,
    }),
  );
}

function emitDerivedChangeEvent(
  target: EventTarget,
  descriptor: CustomEventsRuntime,
  entries: Array<[string, unknown]>,
  init: EventInit,
  transaction: CustomEventsTransaction,
) {
  let changeDetail = descriptor.record(target, entries);
  target.dispatchEvent(
    createDescriptorEvent(
      descriptor,
      CHANGE_EVENT_NAME,
      init,
      changeDetail,
      target,
      transaction,
    ),
  );
  dispatchLocalTypedEvent(
    target,
    descriptor,
    CHANGE_EVENT_NAME,
    init,
    changeDetail,
  );
}

function emitExpandedGranularEvents(
  target: EventTarget,
  descriptor: CustomEventsRuntime,
  entries: Array<[string, unknown]>,
  init: EventInit,
  transaction: CustomEventsTransaction,
) {
  let events = entries.map(([type, detail]) =>
    createDescriptorEvent(
      descriptor,
      type,
      init,
      detail,
      target,
      transaction,
    ),
  );

  for (let event of events) {
    target.dispatchEvent(event);
  }

  for (let [type, detail] of entries) {
    dispatchLocalTypedEvent(target, descriptor, type, init, detail);
  }
}

function commitProductEvent(
  target: EventTarget,
  descriptor: CustomEventsRuntime,
  entries: Array<[string, unknown]>,
  product: CustomEventProductKind,
  init: EventInit,
) {
  let transaction = createCustomEventsTransaction();

  if (product === "event") {
    emitDerivedChangeEvent(target, descriptor, entries, init, transaction);
    emitExpandedGranularEvents(target, descriptor, entries, init, transaction);
    return;
  }

  let changeDetail = descriptor.record(target, entries);
  dispatchLocalTypedEvent(
    target,
    descriptor,
    CHANGE_EVENT_NAME,
    init,
    changeDetail,
  );
  emitExpandedGranularEvents(target, descriptor, entries, init, transaction);
}

function resolveCustomEventsDetail(
  resolve: (
    eventMap: Partial<EventDetails>,
    change: ChangeEventDetailFromMap<EventDetails> | undefined,
    context: { target: EventTarget },
  ) => unknown,
  descriptor: CustomEventsRuntime,
  target: EventTarget,
) {
  let latest = descriptor.getReference(target).latest;
  return resolve(
    { ...(latest?.eventMap ?? {}) },
    latest?.change,
    { target },
  );
}

function resolveProductEventEntries(
  event: CustomEvent,
  descriptor: CustomEventsRuntime,
  target: EventTarget,
) {
  let metadata = descriptor.getProductMetadata(event);
  if (!metadata) return undefined;

  if (metadata.kind === "event") {
    let type = getEventType(descriptor, event.type);
    if (!type || type === CHANGE_EVENT_NAME) return undefined;
    let detail =
      metadata.resolveDetail && typeof event.detail === "function"
        ? resolveCustomEventsDetail(event.detail, descriptor, target)
        : event.detail;
    return [[type, detail]] satisfies Array<[string, unknown]>;
  }

  let detail =
    metadata.resolveDetail && typeof event.detail === "function"
      ? createCustomEventChangeDetail(
          resolveCustomEventsDispatchEntries(
            resolveCustomEventsDetail(
              event.detail,
              descriptor,
              target,
            ) as Partial<EventDetails>,
          ),
        )
      : (event.detail as ChangeEventDetailFromMap<EventDetails>);
  let entries = getChangeEventEntries(detail);
  for (let [type] of entries) addEventType(descriptor, type);
  return entries;
}

export function processCustomEventsEvent(
  event: CustomEvent,
  descriptor: CustomEventsRuntime,
) {
  if (!descriptor.ownsEvent(event)) return;

  let metadata = descriptor.getProductMetadata(event);
  if (!metadata || metadata.processed) return;

  let origin = isEventTarget(event.target) ? event.target : undefined;
  if (!origin) return;

  descriptor.markProductEventProcessed(event);
  let init = getEventInit(event);
  let entries = resolveProductEventEntries(event, descriptor, origin);
  if (!entries?.length) return;

  queueMicrotask(() => {
    commitProductEvent(origin, descriptor, entries, metadata.kind, init);
  });
}
