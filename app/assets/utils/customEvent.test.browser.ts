import * as assert from "remix/assert";
import { describe, it } from "remix/test";

import {
  dispatchCustomEvent,
  type CustomEventMap,
} from "./customEvent.ts";

type ThemeEventMap = CustomEventMap<
  {
    value: "light" | "dark";
    reset: null;
  },
  { namespace: "theme"; target: HTMLDivElement }
>;

type TodoEventMap = CustomEventMap<
  {
    actionSubmitted: { form: HTMLFormElement };
  },
  { namespace: "todo"; target: HTMLFormElement }
>;

type DragReleaseEventMap = CustomEventMap<
  {
    release: { velocityX: number; velocityY: number };
  },
  { namespace: "drag"; target: HTMLElement }
>;

type SvgDragReleaseEventMap = CustomEventMap<
  {
    release: { velocityX: number; velocityY: number };
  },
  { namespace: "drag"; target: SVGCircleElement }
>;

type MathDragReleaseEventMap = CustomEventMap<
  {
    release: { velocityX: number; velocityY: number };
  },
  { namespace: "drag"; target: MathMLElement }
>;

type PlainEventTargetEventMap = CustomEventMap<
  {
    ready: { source: "worker" };
  },
  { namespace: "plain"; target: EventTarget }
>;

type ReservedChangeEventMap = CustomEventMap<
  {
    change: { value: string };
  },
  { namespace: "reserved"; target: HTMLDivElement }
>;

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
    let target = document.createElement("div") as ThemeEventMap["target"];
    let signal = new AbortController().signal;

    let dispatch: ThemeEventMap["dispatcherWithoutSignal"] =
      dispatchCustomEvent(target);
    let dispatchFromTargetAndSignal: ThemeEventMap["dispatcher"] =
      dispatchCustomEvent(target, signal);
    let dispatchFromCurriedSignal: ThemeEventMap["dispatcher"] =
      dispatchCustomEvent(target)(signal);

    assert.equal(typeof dispatch, "function");
    assert.equal(typeof dispatchFromTargetAndSignal, "function");
    assert.equal(typeof dispatchFromCurriedSignal, "function");
  });

  it("reserves the local change event name for aggregate change details", () => {
    // @ts-expect-error event maps cannot expose a user-defined local "change" event.
    let reservedTarget: ReservedChangeEventMap["target"] =
      document.createElement("div");

    assert.equal(reservedTarget.tagName, "DIV");
  });

  it("uses the required target option as the direct target descriptor", () => {
    let target = document.createElement("div") as ThemeEventMap["target"];
    let signal = new AbortController().signal;
    let events: ObservedEvent[] = [];

    observe(target, "theme:value", events);

    let result = dispatchCustomEvent(target, signal, "theme:value", "light");

    assert.equal(result, true);
    assert.deepEqual(events, [
      {
        type: "theme:value",
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
    let eventDetail: ThemeEventMap["namespacedEvents"]["theme:change"]["detail"] = {
      event: "theme:value",
      type: "value",
      detail: "dark",
    };
    let noDetailEvent: ThemeEventMap["namespacedEvents"]["theme:change"]["detail"] = {
      event: "theme:reset",
      type: "reset",
    };
    let changesDetail: ThemeEventMap["events"]["change"]["detail"] = {
      changes: { value: "light" },
    };
    // @ts-expect-error change details allow either event/detail or changes, not both.
    let invalidDetail: ThemeEventMap["namespacedEvents"]["theme:change"]["detail"] = {
      event: "theme:value",
      type: "value",
      detail: "dark",
      changes: { value: "dark" as const },
    };

    assert.deepEqual(localEventDetail, { type: "value", detail: "dark" });
    assert.deepEqual(localNoDetailEvent, { type: "reset" });
    assert.deepEqual(eventDetail, { event: "theme:value", type: "value", detail: "dark" });
    assert.deepEqual(noDetailEvent, { event: "theme:reset", type: "reset" });
    assert.deepEqual(changesDetail, { changes: { value: "light" } });
    assert.deepEqual(invalidDetail, {
      event: "theme:value",
      type: "value",
      detail: "dark",
      changes: { value: "dark" },
    });
  });

  it("supports explicit HTML, SVG, and MathML targets", () => {
    let htmlElement = document.createElement("section") as DragReleaseEventMap["target"];
    let svgCircleElement = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "circle",
    ) as SvgDragReleaseEventMap["target"];
    let mathElement = document.createElementNS(
      "http://www.w3.org/1998/Math/MathML",
      "mi",
    ) as MathDragReleaseEventMap["target"];
    let signal = new AbortController().signal;
    let htmlEvents: ObservedEvent[] = [];
    let svgEvents: ObservedEvent[] = [];
    let mathEvents: ObservedEvent[] = [];

    observe(htmlElement, "drag:release", htmlEvents);
    observe(svgCircleElement, "drag:release", svgEvents);
    observe(mathElement, "drag:release", mathEvents);

    let dispatchFromHTMLElement = dispatchCustomEvent(htmlElement, signal);
    let dispatchFromSvgCircleElement = dispatchCustomEvent(svgCircleElement, signal);
    let dispatchFromMathElement = dispatchCustomEvent(mathElement, signal);

    assert.equal(
      dispatchFromHTMLElement("drag:release", { velocityX: 3, velocityY: 4 }),
      true,
    );
    assert.equal(
      dispatchFromSvgCircleElement("drag:release", { velocityX: 9, velocityY: 10 }),
      true,
    );
    assert.equal(
      dispatchFromMathElement("drag:release", { velocityX: 11, velocityY: 12 }),
      true,
    );
    assert.deepEqual(htmlEvents[0].detail, { velocityX: 3, velocityY: 4 });
    assert.deepEqual(svgEvents[0].detail, { velocityX: 9, velocityY: 10 });
    assert.deepEqual(mathEvents[0].detail, { velocityX: 11, velocityY: 12 });
  });

  it("supports plain EventTarget targets for non-DOM use cases", () => {
    let target = new EventTarget() as PlainEventTargetEventMap["target"];
    let signal = new AbortController().signal;
    let events: ObservedEvent[] = [];

    observe(target, "plain:ready", events);

    let dispatch = dispatchCustomEvent(target, signal);
    let result = dispatch("plain:ready", { source: "worker" });

    assert.equal(result, true);
    assert.deepEqual(events, [
      {
        type: "plain:ready",
        detail: { source: "worker" },
        bubbles: true,
        cancelable: true,
      },
    ]);
  });

  it("dispatches granular events and the change envelopes used by state subscribers", () => {
    let target = document.createElement("div") as ThemeEventMap["target"];
    let signal = new AbortController().signal;
    let events: ObservedEvent[] = [];

    observe(target, "theme:value", events);
    observe(target, "theme:change", events);

    let result = dispatchCustomEvent(target, signal, "theme:value", "light");

    assert.equal(result, true);
    assert.deepEqual(events, [
      {
        type: "theme:value",
        detail: "light",
        bubbles: true,
        cancelable: true,
      },
      {
        type: "theme:change",
        detail: {
          event: "theme:value",
          type: "value",
          detail: "light",
        },
        bubbles: true,
        cancelable: true,
      },
    ]);
  });

  it("represents no-detail events as a change envelope without a detail property", () => {
    let target = document.createElement("div") as ThemeEventMap["target"];
    let signal = new AbortController().signal;
    let events: ObservedEvent[] = [];

    observe(target, "theme:reset", events);
    observe(target, "theme:change", events);

    let result = dispatchCustomEvent(target, signal, "theme:reset");

    assert.equal(result, true);
    assert.deepEqual(events, [
      {
        type: "theme:reset",
        detail: null,
        bubbles: true,
        cancelable: true,
      },
      {
        type: "theme:change",
        detail: { event: "theme:reset", type: "reset" },
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
    let target = document.createElement("form") as TodoEventMap["target"];
    let signal = new AbortController().signal;
    let form = document.createElement("form");
    let events: ObservedEvent[] = [];

    observe(target, "todo:actionSubmitted", events);
    observe(target, "todo:change", events);

    let dispatch = dispatchCustomEvent(target, signal);
    let result = dispatch("todo:actionSubmitted", { form });

    assert.equal(result, true);
    assert.deepEqual(events, [
      {
        type: "todo:actionSubmitted",
        detail: { form },
        bubbles: true,
        cancelable: true,
      },
      {
        type: "todo:change",
        detail: {
          event: "todo:actionSubmitted",
          type: "actionSubmitted",
          detail: { form },
        },
        bubbles: true,
        cancelable: true,
      },
    ]);
  });

  it("can bind the target first and receive the signal later", () => {
    let target = document.createElement("form") as TodoEventMap["target"];
    let signal = new AbortController().signal;
    let form = document.createElement("form");
    let events: ObservedEvent[] = [];

    observe(target, "todo:actionSubmitted", events);
    observe(target, "todo:change", events);

    let withSignal = dispatchCustomEvent(target);
    let dispatch = withSignal(signal);
    let result = dispatch("todo:actionSubmitted", { form });

    assert.equal(result, true);
    assert.deepEqual(events, [
      {
        type: "todo:actionSubmitted",
        detail: { form },
        bubbles: true,
        cancelable: true,
      },
      {
        type: "todo:change",
        detail: {
          event: "todo:actionSubmitted",
          type: "actionSubmitted",
          detail: { form },
        },
        bubbles: true,
        cancelable: true,
      },
    ]);
  });

  it("can bind the target first and dispatch when the signal is supplied", () => {
    let target = document.createElement("div") as ThemeEventMap["target"];
    let signal = new AbortController().signal;
    let events: ObservedEvent[] = [];

    observe(target, "theme:value", events);

    let result = dispatchCustomEvent(target)(
      signal,
      "theme:value",
      "light",
    );

    assert.equal(result, true);
    assert.deepEqual(events, [
      {
        type: "theme:value",
        detail: "light",
        bubbles: true,
        cancelable: true,
      },
    ]);
  });

  it("accepts custom event init settings after the detail argument", () => {
    let target = document.createElement("div") as ThemeEventMap["target"];
    let signal = new AbortController().signal;
    let events: ObservedEvent[] = [];

    observe(target, "theme:value", events);
    observe(target, "theme:reset", events);

    let dispatch = dispatchCustomEvent(target, signal);
    dispatch("theme:value", "dark", { bubbles: false, cancelable: false });
    dispatch("theme:reset", undefined, {
      bubbles: false,
      cancelable: false,
    });

    assert.deepEqual(events, [
      {
        type: "theme:value",
        detail: "dark",
        bubbles: false,
        cancelable: false,
      },
      {
        type: "theme:reset",
        detail: null,
        bubbles: false,
        cancelable: false,
      },
    ]);
  });

  it("does not dispatch anything after the supplied signal is aborted", () => {
    let target = document.createElement("div") as ThemeEventMap["target"];
    let controller = new AbortController();
    let events: ObservedEvent[] = [];

    observe(target, "theme:value", events);
    observe(target, "theme:change", events);

    controller.abort();
    let result = dispatchCustomEvent(
      target,
      controller.signal,
      "theme:value",
      "dark",
    );

    assert.equal(result, true);
    assert.deepEqual(events, []);
  });

  it("fans direct change events out to their granular subscribers", () => {
    let target = document.createElement("div") as ThemeEventMap["target"];
    let signal = new AbortController().signal;
    let events: ObservedEvent[] = [];

    observe(target, "theme:value", events);
    observe(target, "theme:reset", events);
    observe(target, "theme:change", events);

    dispatchCustomEvent(
      target,
      signal,
      "theme:change",
      { event: "theme:value", type: "value", detail: "dark" },
    );
    dispatchCustomEvent(
      target,
      signal,
      "theme:change",
      { changes: { value: "light", reset: null } },
    );

    assert.deepEqual(
      events.map((event) => event.type),
      [
        "theme:change",
        "theme:value",
        "theme:change",
        "theme:value",
        "theme:reset",
      ],
    );
    assert.deepEqual(events[0].detail, {
      event: "theme:value",
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
    let target = document.createElement("div") as ThemeEventMap["target"];
    let signal = new AbortController().signal;
    let events: ObservedEvent[] = [];

    observe(target, "theme:value", events);
    observe(target, "theme:change", events);

    dispatchCustomEvent(
      target,
      signal,
      "theme:change",
      {
        event: "theme:value",
        type: "reset",
        detail: "dark",
      } as unknown as ThemeEventMap["namespacedEvents"]["theme:change"]["detail"],
    );

    assert.deepEqual(events, [
      {
        type: "theme:change",
        detail: {
          event: "theme:value",
          type: "value",
          detail: "dark",
        },
        bubbles: true,
        cancelable: true,
      },
      {
        type: "theme:value",
        detail: "dark",
        bubbles: true,
        cancelable: true,
      },
    ]);
  });

  it("reports cancellation if any dispatched event is prevented", () => {
    let target = document.createElement("div") as ThemeEventMap["target"];
    let signal = new AbortController().signal;
    let observedTypes: string[] = [];

    target.addEventListener("theme:value", (event) => {
      event.preventDefault();
      observedTypes.push(event.type);
    });
    target.addEventListener("theme:change", (event) => {
      observedTypes.push(event.type);
    });

    let result = dispatchCustomEvent(target, signal, "theme:value", "dark");

    assert.equal(result, false);
    assert.deepEqual(observedTypes, [
      "theme:value",
      "theme:change",
    ]);
  });
});
