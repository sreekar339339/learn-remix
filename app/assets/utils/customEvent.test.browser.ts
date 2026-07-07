import * as assert from "remix/assert";
import { describe, it } from "remix/test";
import { TypedEventTarget } from "remix/ui";

import {
  dispatchCustomEvent,
  type CustomEventMap,
  type DispatchCustomEvent,
  type DispatchCustomEventArgs,
  type DispatchCustomEventOptions,
  type Namespaced,
} from "./customEvent.ts";

type ThemeEventMap = CustomEventMap<{
  value: "light" | "dark";
  reset: null;
}>;
type ThemeEventTypes = Namespaced<ThemeEventMap, "test-theme">;

type TodoEventMap = CustomEventMap<{
  actionSubmitted: null;
  actionErrored: { error: Error };
}>;

type WorkerEventMap = CustomEventMap<{
  ready: { source: "worker" };
  stopped: null;
}>;

type ReservedChangeEventMap = CustomEventMap<{
  change: { value: string };
}>;

type NamespacedLocalKeyEventMap = CustomEventMap<{
  "test-theme:value": "light" | "dark";
}>;

type RawNamespacedEventTypes = Namespaced<{
  value: "light" | "dark";
}, "test-raw">;

declare global {
  interface HTMLElementEventMap
    extends
      ThemeEventTypes,
      Namespaced<TodoEventMap, "test-todo"> {}
}

type ObservedEvent = {
  type: string;
  detail: unknown;
  bubbles: boolean;
  cancelable: boolean;
};

function observe(target: EventTarget, name: string, events: ObservedEvent[]) {
  target.addEventListener(name, (event) => {
    let customEvent = event as CustomEvent<unknown>;
    events.push({
      type: customEvent.type,
      detail: customEvent.detail,
      bubbles: customEvent.bubbles,
      cancelable: customEvent.cancelable,
    });
  });
}

describe("dispatchCustomEvent", () => {
  it("keeps the exported type helpers shaped for user-facing consumption", () => {
    let localChange: ThemeEventMap["change"]["detail"] = {
      type: "value",
      detail: "dark",
    };
    let localNoDetailChange: ThemeEventMap["change"]["detail"] = {
      type: "reset",
    };
    let namespacedChange: ThemeEventTypes["test-theme:change"]["detail"] = {
      type: "value",
      name: "test-theme:value",
      detail: "light",
    };
    let batchChange: ThemeEventMap["change"]["detail"] = {
      type: ["value", "reset"],
      detail: { value: "dark", reset: null },
    };
    let dispatchArgs: DispatchCustomEventArgs<HTMLDivElement, "test-theme"> = [
      { value: "dark" },
    ];

    let nativeEventArgs: DispatchCustomEventArgs<HTMLDivElement, "test-theme"> = [
      // @ts-expect-error native events are not dispatchCustomEvent names.
      { click: null },
    ];
    let changeEventArgs: DispatchCustomEventArgs<HTMLDivElement, "test-theme"> = [
      // @ts-expect-error users cannot dispatch generated change events directly.
      { change: null },
    ];
    // @ts-expect-error DOM targets require a namespace for dispatchCustomEvent.
    let domOptionsWithoutNamespace: DispatchCustomEventOptions<HTMLDivElement> = {
      target: document.createElement("div"),
      signal: new AbortController().signal,
    };
    // @ts-expect-error namespace must be present on the target's custom events.
    let invalidNamespaceArgs: DispatchCustomEventArgs<HTMLDivElement, "wrong"> = [
      { value: "dark" },
    ];
    // @ts-expect-error local event targets do not accept namespaced dispatchers.
    let localNamespaceArgs: DispatchCustomEventArgs<TypedEventTarget<WorkerEventMap>, "test-theme"> = [
      { ready: { source: "worker" } },
    ];
    // @ts-expect-error event maps cannot define the reserved "change" key.
    let reservedEvents: ReservedChangeEventMap = {};
    // @ts-expect-error local event maps cannot define namespaced event keys.
    let namespacedLocalEvents: NamespacedLocalKeyEventMap = {};
    // @ts-expect-error Namespaced expects a CustomEventMap, not a raw detail map.
    let rawNamespacedEvents: RawNamespacedEventTypes = {};

    assert.deepEqual(localChange, { type: "value", detail: "dark" });
    assert.deepEqual(localNoDetailChange, { type: "reset" });
    assert.deepEqual(namespacedChange, {
      type: "value",
      name: "test-theme:value",
      detail: "light",
    });
    assert.deepEqual(batchChange, {
      type: ["value", "reset"],
      detail: { value: "dark", reset: null },
    });
    assert.deepEqual(dispatchArgs, [{ value: "dark" }]);
    assert.deepEqual(nativeEventArgs, [{ click: null }]);
    assert.deepEqual(changeEventArgs, [{ change: null }]);
    assert.equal(domOptionsWithoutNamespace.target.tagName, "DIV");
    assert.deepEqual(invalidNamespaceArgs, [{ value: "dark" }]);
    assert.deepEqual(localNamespaceArgs, [{ ready: { source: "worker" } }]);
    assert.deepEqual(reservedEvents, {});
    assert.deepEqual(namespacedLocalEvents, {});
    assert.deepEqual(rawNamespacedEvents, {});
  });

  it("dispatches namespaced DOM events through globally merged event maps", () => {
    let target = document.createElement("div");
    let signal = new AbortController().signal;
    let events: ObservedEvent[] = [];

    observe(target, "test-theme:change", events);
    observe(target, "test-theme:value", events);

    let result = dispatchCustomEvent(
      { target, signal, namespace: "test-theme" },
      { value: "light" },
    );

    assert.equal(result, true);
    assert.deepEqual(events, [
      {
        type: "test-theme:change",
        detail: {
          type: "value",
          name: "test-theme:value",
          detail: "light",
        },
        bubbles: true,
        cancelable: true,
      },
      {
        type: "test-theme:value",
        detail: "light",
        bubbles: true,
        cancelable: true,
      },
    ]);
  });

  it("supports bound dispatchers with scoped source metadata", () => {
    let target = document.createElement("form");
    let source = document.createElement("form");
    let signal = new AbortController().signal;
    let events: ObservedEvent[] = [];

    observe(target, "test-todo:change", events);
    observe(target, "test-todo:actionSubmitted", events);
    observe(target, "test-todo:actionErrored", events);

    let dispatch: DispatchCustomEvent<HTMLFormElement, "test-todo"> =
      dispatchCustomEvent.bind(null, {
        target,
        signal,
        source,
        namespace: "test-todo",
      });

    assert.equal(dispatch({ actionSubmitted: null }), true);
    assert.equal(
      dispatch({ actionErrored: { error: new Error("Nope") } }),
      true,
    );

    assert.deepEqual(events, [
      {
        type: "test-todo:change",
        detail: {
          type: "actionSubmitted",
          name: "test-todo:actionSubmitted",
          source,
        },
        bubbles: true,
        cancelable: true,
      },
      {
        type: "test-todo:actionSubmitted",
        detail: null,
        bubbles: true,
        cancelable: true,
      },
      {
        type: "test-todo:change",
        detail: {
          type: "actionErrored",
          name: "test-todo:actionErrored",
          detail: { error: new Error("Nope") },
          source,
        },
        bubbles: true,
        cancelable: true,
      },
      {
        type: "test-todo:actionErrored",
        detail: { error: new Error("Nope") },
        bubbles: true,
        cancelable: true,
      },
    ]);
  });

  it("supports local TypedEventTarget events without namespacing", () => {
    let target = new TypedEventTarget<WorkerEventMap>();
    let signal = new AbortController().signal;
    let events: ObservedEvent[] = [];

    observe(target, "change", events);
    observe(target, "ready", events);
    observe(target, "stopped", events);

    assert.throws(() => {
      dispatchCustomEvent(
        { target, signal },
        // @ts-expect-error users cannot dispatch generated change events directly.
        { change: { type: "stopped" } },
      );
    });
    assert.equal(
      dispatchCustomEvent(
        { target, signal },
        { ready: { source: "worker" } },
      ),
      true,
    );
    assert.equal(
      dispatchCustomEvent({ target, signal }, { stopped: null }),
      true,
    );

    assert.deepEqual(events, [
      {
        type: "change",
        detail: {
          type: "ready",
          detail: { source: "worker" },
        },
        bubbles: true,
        cancelable: true,
      },
      {
        type: "ready",
        detail: { source: "worker" },
        bubbles: true,
        cancelable: true,
      },
      {
        type: "change",
        detail: { type: "stopped" },
        bubbles: true,
        cancelable: true,
      },
      {
        type: "stopped",
        detail: null,
        bubbles: true,
        cancelable: true,
      },
    ]);
  });

  it("honors event options, cancellation, and aborted signals", () => {
    let target = document.createElement("div");
    let controller = new AbortController();
    let events: ObservedEvent[] = [];

    observe(target, "test-theme:change", events);
    observe(target, "test-theme:value", events);
    target.addEventListener("test-theme:value", (event) => {
      event.preventDefault();
    });

    let result = dispatchCustomEvent(
      {
        target,
        signal: controller.signal,
        namespace: "test-theme",
        bubbles: false,
        cancelable: true,
      },
      { value: "dark" },
    );

    controller.abort();
    let abortedResult = dispatchCustomEvent(
      { target, signal: controller.signal, namespace: "test-theme" },
      { value: "light" },
    );

    assert.equal(result, false);
    assert.equal(abortedResult, true);
    assert.deepEqual(events, [
      {
        type: "test-theme:change",
        detail: {
          type: "value",
          name: "test-theme:value",
          detail: "dark",
        },
        bubbles: false,
        cancelable: true,
      },
      {
        type: "test-theme:value",
        detail: "dark",
        bubbles: false,
        cancelable: true,
      },
    ]);
  });
});
