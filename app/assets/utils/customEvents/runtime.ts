import { defineEventValue, isElement, isEventTarget } from "./dom.ts";

type DispatchTargetRegistration = {
  count: number;
  cleanup(): void;
};

type ElementSubscription = {
  element: Element;
  eventTypes: ReadonlySet<string> | null;
  phase: "projection" | "effect";
  notify(event: CustomEvent): Promise<unknown> | void;
};

type TargetSubscription = {
  target: EventTarget;
  notify(event: CustomEvent): unknown;
};

export type CustomEventsBatchRuntimeEntry = {
  type: string;
  detail: unknown;
  init: EventInit;
  key?: PropertyKey;
};

function createEventSnapshot(
  entry: CustomEventsBatchRuntimeEntry,
  target: EventTarget,
) {
  let event = new CustomEvent(entry.type, {
    ...entry.init,
    detail: entry.detail,
  });
  defineEventValue(event, "target", target);
  return event;
}

export function createListenerEvent(
  event: CustomEvent,
  currentTarget: EventTarget,
) {
  let listenerEvent = new CustomEvent(event.type, {
    bubbles: false,
    cancelable: event.cancelable,
    composed: event.composed,
    detail: event.detail,
  });
  defineEventValue(listenerEvent, "target", event.target);
  defineEventValue(listenerEvent, "currentTarget", currentTarget);
  return listenerEvent;
}

type ProductEventMetadata = {
  entries: CustomEventsBatchRuntimeEntry[];
  processed: boolean;
  completion?: Promise<void>;
};

type TransactionEvent = {
  event: CustomEvent;
  key?: PropertyKey;
};

/**
 * Private mechanics owned by one descriptor.
 *
 * Product events are the only events dispatched through the DOM. Once one
 * reaches a local listener or explicit host, the runtime turns its entries into
 * in-memory snapshots and notifies matching projections and effects.
 */
export class CustomEventsRuntime {
  #eventTypes = new Set<string>();
  #eventTypeListeners = new Set<(type: string) => void>();
  #eventMetadata = new WeakMap<Event, ProductEventMetadata>();
  #elementSubscriptions = new Set<ElementSubscription>();
  #targetSubscriptions = new Set<TargetSubscription>();
  #dispatchTargets = new WeakMap<EventTarget, DispatchTargetRegistration>();
  #hosts = new WeakMap<Element, number>();
  #defaultHost: EventTarget | undefined;

  addEventType(type: string) {
    if (this.#eventTypes.has(type)) return;
    this.#eventTypes.add(type);
    for (let listener of this.#eventTypeListeners) listener(type);
  }

  createProductEvent(
    carrierType: string,
    detail: unknown,
    init: EventInit,
    entries: CustomEventsBatchRuntimeEntry[],
  ) {
    this.addEventType(carrierType);
    let event = new CustomEvent(carrierType, {
      ...init,
      detail,
    });
    if (detail === undefined) defineEventValue(event, "detail", undefined);
    this.#eventMetadata.set(event, { entries, processed: false });
    return event;
  }

  dispatch(target: EventTarget, event: Event) {
    target.dispatchEvent(event);
    return this.#eventMetadata.get(event)?.completion ?? Promise.resolve();
  }

  registerElementSubscription(subscription: ElementSubscription) {
    this.#elementSubscriptions.add(subscription);
    return () => this.#elementSubscriptions.delete(subscription);
  }

  registerTargetSubscription(subscription: TargetSubscription) {
    this.#targetSubscriptions.add(subscription);
    return () => this.#targetSubscriptions.delete(subscription);
  }

  addHost(element: Element) {
    this.#hosts.set(element, (this.#hosts.get(element) ?? 0) + 1);
  }

  removeHost(element: Element) {
    let count = this.#hosts.get(element) ?? 0;
    if (count <= 1) this.#hosts.delete(element);
    else this.#hosts.set(element, count - 1);
  }

  setDefaultHost(target: EventTarget | undefined) {
    this.#defaultHost = target;
  }

  #findHost(element: Element | undefined) {
    for (
      let current = element;
      current;
      current = current.parentElement ?? undefined
    ) {
      if (this.#hosts.has(current)) return current;
    }
  }

  #scopeFor(element: Element | undefined) {
    return this.#findHost(element) ??
      (!isElement(this.#defaultHost) ? this.#defaultHost : undefined);
  }

  #matches(
    subscription: ElementSubscription,
    transactionEvent: TransactionEvent,
    originScope: EventTarget,
    originTarget: EventTarget,
  ) {
    let { event, key } = transactionEvent;
    if (
      subscription.eventTypes &&
      !subscription.eventTypes.has(event.type)
    ) {
      return false;
    }
    if (
      !event.bubbles &&
      isElement(originTarget) &&
      subscription.element !== originTarget
    ) {
      return false;
    }

    let subscriptionScope =
      this.#scopeFor(subscription.element) ?? subscription.element;
    let inScope = subscriptionScope === originScope ||
      (
        event.composed &&
        isElement(subscriptionScope) &&
        isElement(originScope) &&
        subscriptionScope.contains(originScope)
      );
    if (!inScope) return false;

    return key === undefined ||
      subscription.element.id === "" ||
      subscription.element.id === String(key);
  }

  #notify(
    entries: CustomEventsBatchRuntimeEntry[],
    originScope: EventTarget,
    originTarget: EventTarget,
  ) {
    let events: TransactionEvent[] = entries.map((entry) => ({
      event: createEventSnapshot(entry, originTarget),
      ...(entry.key === undefined ? {} : { key: entry.key }),
    }));

    // Direct EventTarget subscriptions retain native synchronous invocation
    // timing. Their returned promises join transaction completion without
    // delaying projection commits.
    let directListenerResults: unknown[] = [];
    for (let subscription of [...this.#targetSubscriptions]) {
      if (subscription.target !== originTarget) continue;
      for (let { event } of events) {
        try {
          directListenerResults.push(subscription.notify(event));
        } catch (error) {
          directListenerResults.push(Promise.reject(error));
        }
      }
    }
    let directListenersSettled = Promise.all(directListenerResults);

    let projections: Array<{
      subscription: ElementSubscription;
      match: TransactionEvent;
    }> = [];
    for (let subscription of [...this.#elementSubscriptions]) {
      if (subscription.phase !== "projection") continue;
      let match = events.findLast((event) =>
        this.#matches(subscription, event, originScope, originTarget)
      );
      if (!match) continue;
      projections.push({ subscription, match });
    }

    let sourceProjections = projections.filter(
      ({ subscription }) => subscription.element === originTarget,
    );
    let remainingProjections = projections.filter(
      ({ subscription }) => subscription.element !== originTarget,
    );
    let commit = (
      selected: typeof projections,
    ) =>
      Promise.all(
        selected.map(({ subscription, match }) =>
          subscription.notify(match.event)
        ),
      );
    let projectionsCommitted = sourceProjections.length
      ? commit(sourceProjections).then(() => commit(remainingProjections))
      : commit(remainingProjections);

    let projectionsAndEffectsSettled = projectionsCommitted.then(() => {
      let effects = [...this.#elementSubscriptions].filter(
        (subscription) => subscription.phase === "effect",
      );
      let effectResults: unknown[] = [];
      for (let transactionEvent of events) {
        for (let subscription of effects) {
          if (
            this.#matches(
              subscription,
              transactionEvent,
              originScope,
              originTarget,
            )
          ) {
            try {
              effectResults.push(
                subscription.notify(transactionEvent.event),
              );
            } catch (error) {
              effectResults.push(Promise.reject(error));
            }
          }
        }
      }
      return Promise.all(effectResults);
    });

    return Promise.all([
      directListenersSettled,
      projectionsAndEffectsSettled,
    ]).then(() => {});
  }

  #process(event: Event, fallbackScope: EventTarget, hosted: boolean) {
    if (!(event instanceof CustomEvent)) return;
    let metadata = this.#eventMetadata.get(event);
    if (!metadata || metadata.processed) return;
    let originTarget = isEventTarget(event.target) ? event.target : undefined;
    if (!originTarget) return;

    if (hosted && event.composed !== true) event.stopPropagation();
    metadata.processed = true;
    let originScope = this.#scopeFor(
      isElement(originTarget) ? originTarget : undefined,
    ) ?? fallbackScope;
    try {
      metadata.completion = this.#notify(
        metadata.entries,
        originScope,
        originTarget,
      );
    } catch (error) {
      metadata.completion = Promise.reject(error);
    }
  }

  registerDispatchTarget(target: EventTarget, hosted = false) {
    let existing = this.#dispatchTargets.get(target);
    if (existing) {
      existing.count += 1;
      return () => {
        existing.count -= 1;
        if (existing.count > 0) return;
        existing.cleanup();
        this.#dispatchTargets.delete(target);
      };
    }

    let controller = new AbortController();
    let listenedTypes = new Set<string>();
    let listen = (type: string) => {
      if (listenedTypes.has(type)) return;
      listenedTypes.add(type);
      target.addEventListener(
        type,
        (event) => {
          this.#process(event, target, hosted);
        },
        { signal: controller.signal },
      );
    };
    this.#eventTypeListeners.add(listen);
    for (let type of this.#eventTypes) listen(type);

    let registration: DispatchTargetRegistration = {
      count: 1,
      cleanup: () => {
        this.#eventTypeListeners.delete(listen);
        controller.abort();
      },
    };
    this.#dispatchTargets.set(target, registration);

    return () => {
      registration.count -= 1;
      if (registration.count > 0) return;
      registration.cleanup();
      this.#dispatchTargets.delete(target);
    };
  }
}
