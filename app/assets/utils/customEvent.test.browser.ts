import * as assert from "remix/assert";
import { describe, it } from "remix/test";
import { TypedEventTarget } from "remix/ui";

import {
  dispatchCustomEvent,
  type CustomEventMap,
} from "./customEvent.ts";

type ThemeEventMap = CustomEventMap<
  {
    value: "light" | "dark";
    reset: null;
  },
  { namespace: "test-theme" }
>;
type ThemeEventTypes = ThemeEventMap["namespacedEvents"];

type TodoEventMap = CustomEventMap<
  {
    actionSubmitted: { form: HTMLFormElement };
  },
  { namespace: "test-todo" }
>;
type TodoEventTypes = TodoEventMap["namespacedEvents"];

type DragReleaseEventMap = CustomEventMap<
  {
    release: { velocityX: number; velocityY: number };
  },
  { namespace: "test-drag" }
>;
type DragReleaseEventTypes = DragReleaseEventMap["namespacedEvents"];

type SvgDragReleaseEventMap = CustomEventMap<
  {
    release: { velocityX: number; velocityY: number };
  },
  { namespace: "test-svg-drag" }
>;
type SvgDragReleaseEventTypes = SvgDragReleaseEventMap["namespacedEvents"];

type MathDragReleaseEventMap = CustomEventMap<
  {
    release: { velocityX: number; velocityY: number };
  },
  { namespace: "test-math-drag" }
>;
type MathDragReleaseEventTypes = MathDragReleaseEventMap["namespacedEvents"];

type LocalDomEventMap = CustomEventMap<
  {
    selected: { id: string };
  }
>;

type PlainEventTargetEventMap = CustomEventMap<
  {
    ready: { source: "worker" };
  }
>;

type ReservedChangeEventMap = CustomEventMap<
  {
    change: { value: string };
  },
  { namespace: "reserved" }
>;

declare global {
  interface HTMLElementEventMap
    extends ThemeEventTypes,
      TodoEventTypes,
      DragReleaseEventTypes {
    selected: LocalDomEventMap["events"]["selected"];
  }

  interface SVGElementEventMap extends SvgDragReleaseEventTypes {}

  interface ElementEventMap extends MathDragReleaseEventTypes {}
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
  it("exposes descriptor types for each partial application level", () => {
    let target = document.createElement("div");
    let signal = new AbortController().signal;

    let dispatch = dispatchCustomEvent(target);
    let dispatchFromTargetAndSignal = dispatchCustomEvent(target, signal);
    let dispatchFromCurriedSignal = dispatchCustomEvent(target)(signal);

    assert.equal(typeof dispatch, "function");
    assert.equal(typeof dispatchFromTargetAndSignal, "function");
    assert.equal(typeof dispatchFromCurriedSignal, "function");
  });

  it("reserves the local change event name for aggregate change details", () => {
    // @ts-expect-error event maps cannot expose a user-defined local "change" event.
    let reservedEvents: ReservedChangeEventMap["events"] = {};

    assert.deepEqual(reservedEvents, {});
  });

  it("infers globally merged custom event types from the DOM target", () => {
    let target = document.createElement("div");
    let signal = new AbortController().signal;
    let events: ObservedEvent[] = [];

    observe(target, "test-theme:value", events);

    // @ts-expect-error native events are not valid dispatchCustomEvent names.
    dispatchCustomEvent(target, signal, "click");
    let result = dispatchCustomEvent(target, signal, "test-theme:value", "light");

    assert.equal(result, true);
    assert.deepEqual(events, [
      {
        type: "test-theme:value",
        detail: "light",
        bubbles: true,
        cancelable: true,
      },
    ]);
  });

  it("exposes local and namespaced change detail branches", () => {
    let localEventDetail: ThemeEventMap["events"]["change"]["detail"] = {
      type: "value",
      detail: "dark",
    };
    let localNoDetailEvent: ThemeEventMap["events"]["change"]["detail"] = {
      type: "reset",
    };
    let eventDetail: ThemeEventMap["namespacedEvents"]["test-theme:change"]["detail"] = {
      event: "test-theme:value",
      type: "value",
      detail: "dark",
    };
    let noDetailEvent: ThemeEventMap["namespacedEvents"]["test-theme:change"]["detail"] = {
      event: "test-theme:reset",
      type: "reset",
    };
    let changesDetail: ThemeEventMap["events"]["change"]["detail"] = {
      changes: { value: "light" },
    };
    // @ts-expect-error change details allow either event/detail or changes, not both.
    let invalidDetail: ThemeEventMap["namespacedEvents"]["test-theme:change"]["detail"] = {
      event: "test-theme:value",
      type: "value",
      detail: "dark",
      changes: { value: "dark" as const },
    };

    assert.deepEqual(localEventDetail, { type: "value", detail: "dark" });
    assert.deepEqual(localNoDetailEvent, { type: "reset" });
    assert.deepEqual(eventDetail, { event: "test-theme:value", type: "value", detail: "dark" });
    assert.deepEqual(noDetailEvent, { event: "test-theme:reset", type: "reset" });
    assert.deepEqual(changesDetail, { changes: { value: "light" } });
    assert.deepEqual(invalidDetail, {
      event: "test-theme:value",
      type: "value",
      detail: "dark",
      changes: { value: "dark" },
    });
  });

  it("supports explicit HTML, SVG, and MathML targets", () => {
    let htmlElement = document.createElement("section");
    let svgCircleElement = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "circle",
    );
    let mathElement = document.createElementNS(
      "http://www.w3.org/1998/Math/MathML",
      "mi",
    );
    let signal = new AbortController().signal;
    let htmlEvents: ObservedEvent[] = [];
    let svgEvents: ObservedEvent[] = [];
    let mathEvents: ObservedEvent[] = [];

    observe(htmlElement, "test-drag:release", htmlEvents);
    observe(svgCircleElement, "test-svg-drag:release", svgEvents);
    observe(mathElement, "test-math-drag:release", mathEvents);

    let dispatchFromHTMLElement = dispatchCustomEvent(htmlElement, signal);
    let dispatchFromSvgCircleElement = dispatchCustomEvent(svgCircleElement, signal);
    let dispatchFromMathElement = dispatchCustomEvent(mathElement, signal);

    assert.equal(
      dispatchFromHTMLElement("test-drag:release", { velocityX: 3, velocityY: 4 }),
      true,
    );
    assert.equal(
      dispatchFromSvgCircleElement("test-svg-drag:release", { velocityX: 9, velocityY: 10 }),
      true,
    );
    assert.equal(
      dispatchFromMathElement("test-math-drag:release", { velocityX: 11, velocityY: 12 }),
      true,
    );
    assert.deepEqual(htmlEvents[0].detail, { velocityX: 3, velocityY: 4 });
    assert.deepEqual(svgEvents[0].detail, { velocityX: 9, velocityY: 10 });
    assert.deepEqual(mathEvents[0].detail, { velocityX: 11, velocityY: 12 });
  });

  it("supports plain EventTarget targets for non-DOM use cases", () => {
    let target = new TypedEventTarget<PlainEventTargetEventMap["events"]>();
    let signal = new AbortController().signal;
    let events: ObservedEvent[] = [];

    observe(target, "ready", events);

    let dispatch = dispatchCustomEvent(target, signal);
    let result = dispatch("ready", { source: "worker" });

    assert.equal(result, true);
    assert.deepEqual(events, [
      {
        type: "ready",
        detail: { source: "worker" },
        bubbles: true,
        cancelable: true,
      },
    ]);
  });

  it("uses local event names for DOM targets when no namespace is configured", () => {
    let target = document.createElement("div");
    let signal = new AbortController().signal;
    let events: ObservedEvent[] = [];

    observe(target, "selected", events);

    let dispatch = dispatchCustomEvent(target, signal);
    let result = dispatch("selected", { id: "book-1" });

    assert.equal(result, true);
    assert.deepEqual(events, [
      {
        type: "selected",
        detail: { id: "book-1" },
        bubbles: true,
        cancelable: true,
      },
    ]);
  });

  it("normalizes local change dispatch arguments when event is omitted", () => {
    let target = new TypedEventTarget<PlainEventTargetEventMap["events"]>();
    let signal = new AbortController().signal;
    let events: ObservedEvent[] = [];

    observe(target, "ready", events);
    observe(target, "change", events);

    let dispatch = dispatchCustomEvent(target, signal);
    // @ts-expect-error local change dispatch requires type when event is omitted.
    let invalidChangeDetail: PlainEventTargetEventMap["events"]["change"]["detail"] = {
      event: "ready",
      detail: { source: "worker" },
    };

    dispatch("change", { type: "ready", detail: { source: "worker" } });

    assert.deepEqual(events, [
      {
        type: "change",
        detail: {
          event: "ready",
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
    ]);
    assert.deepEqual(invalidChangeDetail, {
      event: "ready",
      detail: { source: "worker" },
    });
  });

  it("dispatches granular events and the change envelopes used by state subscribers", () => {
    let target = document.createElement("div");
    let signal = new AbortController().signal;
    let events: ObservedEvent[] = [];

    observe(target, "test-theme:value", events);
    observe(target, "test-theme:change", events);

    let result = dispatchCustomEvent(target, signal, "test-theme:value", "light");

    assert.equal(result, true);
    assert.deepEqual(events, [
      {
        type: "test-theme:value",
        detail: "light",
        bubbles: true,
        cancelable: true,
      },
      {
        type: "test-theme:change",
        detail: {
          event: "test-theme:value",
          type: "value",
          detail: "light",
        },
        bubbles: true,
        cancelable: true,
      },
    ]);
  });

  it("represents no-detail events as a change envelope without a detail property", () => {
    let target = document.createElement("div");
    let signal = new AbortController().signal;
    let events: ObservedEvent[] = [];

    observe(target, "test-theme:reset", events);
    observe(target, "test-theme:change", events);

    let result = dispatchCustomEvent(target, signal, "test-theme:reset");

    assert.equal(result, true);
    assert.deepEqual(events, [
      {
        type: "test-theme:reset",
        detail: null,
        bubbles: true,
        cancelable: true,
      },
      {
        type: "test-theme:change",
        detail: { event: "test-theme:reset", type: "reset" },
        bubbles: true,
        cancelable: true,
      },
    ]);
    assert.equal(
      Object.hasOwn(events[1].detail as object, "detail"),
      false,
    );
  });

  it("supports the bound dispatcher form used by component refs", () => {
    let target = document.createElement("form");
    let signal = new AbortController().signal;
    let form = document.createElement("form");
    let events: ObservedEvent[] = [];

    observe(target, "test-todo:actionSubmitted", events);
    observe(target, "test-todo:change", events);

    let dispatch = dispatchCustomEvent(target, signal);
    let result = dispatch("test-todo:actionSubmitted", { form });

    assert.equal(result, true);
    assert.deepEqual(events, [
      {
        type: "test-todo:actionSubmitted",
        detail: { form },
        bubbles: true,
        cancelable: true,
      },
      {
        type: "test-todo:change",
        detail: {
          event: "test-todo:actionSubmitted",
          type: "actionSubmitted",
          detail: { form },
        },
        bubbles: true,
        cancelable: true,
      },
    ]);
  });

  it("can bind the target first and receive the signal later", () => {
    let target = document.createElement("form");
    let signal = new AbortController().signal;
    let form = document.createElement("form");
    let events: ObservedEvent[] = [];

    observe(target, "test-todo:actionSubmitted", events);
    observe(target, "test-todo:change", events);

    let withSignal = dispatchCustomEvent(target);
    let dispatch = withSignal(signal);
    let result = dispatch("test-todo:actionSubmitted", { form });

    assert.equal(result, true);
    assert.deepEqual(events, [
      {
        type: "test-todo:actionSubmitted",
        detail: { form },
        bubbles: true,
        cancelable: true,
      },
      {
        type: "test-todo:change",
        detail: {
          event: "test-todo:actionSubmitted",
          type: "actionSubmitted",
          detail: { form },
        },
        bubbles: true,
        cancelable: true,
      },
    ]);
  });

  it("can bind the target first and dispatch when the signal is supplied", () => {
    let target = document.createElement("div");
    let signal = new AbortController().signal;
    let events: ObservedEvent[] = [];

    observe(target, "test-theme:value", events);

    let result = dispatchCustomEvent(target)(
      signal,
      "test-theme:value",
      "light",
    );

    assert.equal(result, true);
    assert.deepEqual(events, [
      {
        type: "test-theme:value",
        detail: "light",
        bubbles: true,
        cancelable: true,
      },
    ]);
  });

  it("accepts custom event init settings after the detail argument", () => {
    let target = document.createElement("div");
    let signal = new AbortController().signal;
    let events: ObservedEvent[] = [];

    observe(target, "test-theme:value", events);
    observe(target, "test-theme:reset", events);

    let dispatch = dispatchCustomEvent(target, signal);
    dispatch("test-theme:value", "dark", { bubbles: false, cancelable: false });
    dispatch("test-theme:reset", undefined, {
      bubbles: false,
      cancelable: false,
    });

    assert.deepEqual(events, [
      {
        type: "test-theme:value",
        detail: "dark",
        bubbles: false,
        cancelable: false,
      },
      {
        type: "test-theme:reset",
        detail: null,
        bubbles: false,
        cancelable: false,
      },
    ]);
  });

  it("does not dispatch anything after the supplied signal is aborted", () => {
    let target = document.createElement("div");
    let controller = new AbortController();
    let events: ObservedEvent[] = [];

    observe(target, "test-theme:value", events);
    observe(target, "test-theme:change", events);

    controller.abort();
    let result = dispatchCustomEvent(
      target,
      controller.signal,
      "test-theme:value",
      "dark",
    );

    assert.equal(result, true);
    assert.deepEqual(events, []);
  });

  it("fans direct change events out to their granular subscribers", () => {
    let target = document.createElement("div");
    let signal = new AbortController().signal;
    let events: ObservedEvent[] = [];

    observe(target, "test-theme:value", events);
    observe(target, "test-theme:reset", events);
    observe(target, "test-theme:change", events);

    dispatchCustomEvent(
      target,
      signal,
      "test-theme:change",
      { event: "test-theme:value", detail: "dark" },
    );
    dispatchCustomEvent(
      target,
      signal,
      "test-theme:change",
      { changes: { value: "light", reset: null } },
    );

    assert.deepEqual(
      events.map((event) => event.type),
      [
        "test-theme:change",
        "test-theme:value",
        "test-theme:change",
        "test-theme:value",
        "test-theme:reset",
      ],
    );
    assert.deepEqual(events[0].detail, {
      event: "test-theme:value",
      type: "value",
      detail: "dark",
    });
    assert.equal(events[1].detail, "dark");
    assert.deepEqual(events[2].detail, {
      changes: { value: "light", reset: null },
    });
    assert.equal(events[3].detail, "light");
    assert.equal(events[4].detail, null);
  });

  it("normalizes direct change event detail type before dispatching and fanning out", () => {
    let target = document.createElement("div");
    let signal = new AbortController().signal;
    let events: ObservedEvent[] = [];

    observe(target, "test-theme:value", events);
    observe(target, "test-theme:change", events);

    dispatchCustomEvent(
      target,
      signal,
      "test-theme:change",
      {
        event: "test-theme:value",
        type: "reset",
        detail: "dark",
      } as unknown as ThemeEventMap["namespacedEvents"]["test-theme:change"]["detail"],
    );

    assert.deepEqual(events, [
      {
        type: "test-theme:change",
        detail: {
          event: "test-theme:value",
          type: "value",
          detail: "dark",
        },
        bubbles: true,
        cancelable: true,
      },
      {
        type: "test-theme:value",
        detail: "dark",
        bubbles: true,
        cancelable: true,
      },
    ]);
  });

  it("reports cancellation if any dispatched event is prevented", () => {
    let target = document.createElement("div");
    let signal = new AbortController().signal;
    let observedTypes: string[] = [];

    target.addEventListener("test-theme:value", (event) => {
      event.preventDefault();
      observedTypes.push(event.type);
    });
    target.addEventListener("test-theme:change", (event) => {
      observedTypes.push(event.type);
    });

    let result = dispatchCustomEvent(target, signal, "test-theme:value", "dark");

    assert.equal(result, false);
    assert.deepEqual(observedTypes, [
      "test-theme:value",
      "test-theme:change",
    ]);
  });
});
