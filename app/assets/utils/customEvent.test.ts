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
  "theme"
>;

type TodoEventMap = CustomEventMap<
  {
    actionSubmitted: { form: HTMLFormElement };
  },
  "todo"
>;

type DragReleaseEventMap = CustomEventMap<
  {
    release: { velocityX: number; velocityY: number };
  },
  "drag"
>;

type ObservedEvent = {
  type: string;
  detail: unknown;
  bubbles: boolean;
  cancelable: boolean;
};

function createTypedTarget<Target>() {
  return new EventTarget() as unknown as Target;
}

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
    let target = createTypedTarget<ThemeEventMap["target"]["div"]>();
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

  it("exposes generic, HTML, SVG, and MathML targets", () => {
    let genericElement = createTypedTarget<DragReleaseEventMap["target"]["element"]>();
    let htmlElement = createTypedTarget<DragReleaseEventMap["target"]["htmlElement"]>();
    let divElement = createTypedTarget<DragReleaseEventMap["target"]["div"]>();
    let svgElement = createTypedTarget<DragReleaseEventMap["target"]["svgElement"]>();
    let svgCircleElement = createTypedTarget<DragReleaseEventMap["target"]["svg"]["circle"]>();
    let mathElement = createTypedTarget<DragReleaseEventMap["target"]["mathElement"]>();
    let mathIdentifierElement = createTypedTarget<DragReleaseEventMap["target"]["math"]["mi"]>();
    let signal = new AbortController().signal;

    let dispatchFromElement = dispatchCustomEvent(genericElement, signal);
    let dispatchFromHTMLElement = dispatchCustomEvent(htmlElement, signal);
    let dispatchFromDiv = dispatchCustomEvent(divElement, signal);
    let dispatchFromSvgElement = dispatchCustomEvent(svgElement, signal);
    let dispatchFromSvgCircleElement = dispatchCustomEvent(svgCircleElement, signal);
    let dispatchFromMathElement = dispatchCustomEvent(mathElement, signal);
    let dispatchFromMathIdentifierElement = dispatchCustomEvent(
      mathIdentifierElement,
      signal,
    );

    assert.equal(
      dispatchFromElement("drag:release", { velocityX: 1, velocityY: 2 }),
      true,
    );
    assert.equal(
      dispatchFromHTMLElement("drag:release", { velocityX: 3, velocityY: 4 }),
      true,
    );
    assert.equal(
      dispatchFromDiv("drag:release", { velocityX: 5, velocityY: 6 }),
      true,
    );
    assert.equal(
      dispatchFromSvgElement("drag:release", { velocityX: 7, velocityY: 8 }),
      true,
    );
    assert.equal(
      dispatchFromSvgCircleElement("drag:release", {
        velocityX: 9,
        velocityY: 10,
      }),
      true,
    );
    assert.equal(
      dispatchFromMathElement("drag:release", { velocityX: 11, velocityY: 12 }),
      true,
    );
    assert.equal(
      dispatchFromMathIdentifierElement("drag:release", {
        velocityX: 13,
        velocityY: 14,
      }),
      true,
    );
  });

  it("dispatches granular events and the change envelopes used by state subscribers", () => {
    let target = createTypedTarget<ThemeEventMap["target"]["div"]>();
    let signal = new AbortController().signal;
    let events: ObservedEvent[] = [];

    observe(target, "theme:value", events);
    observe(target, "theme:change", events);
    observe(target, "theme:changeMany", events);

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
        detail: { event: "theme:value", detail: "light" },
        bubbles: true,
        cancelable: true,
      },
      {
        type: "theme:changeMany",
        detail: { value: "light" },
        bubbles: true,
        cancelable: true,
      },
    ]);
  });

  it("represents no-detail events as a change envelope without a detail property", () => {
    let target = createTypedTarget<ThemeEventMap["target"]["button"]>();
    let signal = new AbortController().signal;
    let events: ObservedEvent[] = [];

    observe(target, "theme:reset", events);
    observe(target, "theme:change", events);
    observe(target, "theme:changeMany", events);

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
        detail: { event: "theme:reset" },
        bubbles: true,
        cancelable: true,
      },
      {
        type: "theme:changeMany",
        detail: {},
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
    let target = createTypedTarget<TodoEventMap["target"]["form"]>();
    let signal = new AbortController().signal;
    let form = {} as HTMLFormElement;
    let events: ObservedEvent[] = [];

    observe(target, "todo:actionSubmitted", events);
    observe(target, "todo:changeMany", events);

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
        type: "todo:changeMany",
        detail: { actionSubmitted: { form } },
        bubbles: true,
        cancelable: true,
      },
    ]);
  });

  it("can bind the target first and receive the signal later", () => {
    let target = createTypedTarget<TodoEventMap["target"]["form"]>();
    let signal = new AbortController().signal;
    let form = {} as HTMLFormElement;
    let events: ObservedEvent[] = [];

    observe(target, "todo:actionSubmitted", events);
    observe(target, "todo:changeMany", events);

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
        type: "todo:changeMany",
        detail: { actionSubmitted: { form } },
        bubbles: true,
        cancelable: true,
      },
    ]);
  });

  it("can bind the target first and dispatch when the signal is supplied", () => {
    let target = createTypedTarget<ThemeEventMap["target"]["div"]>();
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
    let target = createTypedTarget<ThemeEventMap["target"]["button"]>();
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
    let target = createTypedTarget<ThemeEventMap["target"]["div"]>();
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

  it("dispatches aggregate events directly without recursively fanning them out", () => {
    let target = createTypedTarget<ThemeEventMap["target"]["div"]>();
    let signal = new AbortController().signal;
    let events: ObservedEvent[] = [];

    observe(target, "theme:value", events);
    observe(target, "theme:change", events);
    observe(target, "theme:changeMany", events);

    dispatchCustomEvent(
      target,
      signal,
      "theme:change",
      { event: "theme:value", detail: "dark" },
    );
    dispatchCustomEvent(target, signal, "theme:changeMany", { value: "dark" });

    assert.deepEqual(
      events.map((event) => event.type),
      ["theme:change", "theme:changeMany"],
    );
    assert.deepEqual(events[0].detail, {
      event: "theme:value",
      detail: "dark",
    });
    assert.deepEqual(events[1].detail, { value: "dark" });
  });

  it("reports cancellation if any dispatched event is prevented", () => {
    let target = createTypedTarget<ThemeEventMap["target"]["div"]>();
    let signal = new AbortController().signal;
    let observedTypes: string[] = [];

    target.addEventListener("theme:value", (event) => {
      event.preventDefault();
      observedTypes.push(event.type);
    });
    target.addEventListener("theme:change", (event) => {
      observedTypes.push(event.type);
    });
    target.addEventListener("theme:changeMany", (event) => {
      observedTypes.push(event.type);
    });

    let result = dispatchCustomEvent(target, signal, "theme:value", "dark");

    assert.equal(result, false);
    assert.deepEqual(observedTypes, [
      "theme:value",
      "theme:change",
      "theme:changeMany",
    ]);
  });
});
