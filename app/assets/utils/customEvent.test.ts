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
    let target = createTypedTarget<ThemeEventMap["target"]>();
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

  it("uses the required target option as the direct target descriptor", () => {
    let target = createTypedTarget<ThemeEventMap["target"]>();
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

  it("exposes mutually exclusive change detail branches", () => {
    let target = createTypedTarget<ThemeEventMap["target"]>();
    let signal = new AbortController().signal;
    let eventDetail: ThemeEventMap["types"]["theme:change"]["detail"] = {
      event: "theme:value",
      type: "value",
      detail: "dark",
    };
    let noDetailEvent: ThemeEventMap["types"]["theme:change"]["detail"] = {
      event: "theme:reset",
      type: "reset",
    };
    let changesDetail: ThemeEventMap["types"]["theme:change"]["detail"] = {
      changes: { value: "light" },
    };
    // @ts-expect-error change details allow either event/detail or changes, not both.
    let invalidDetail: ThemeEventMap["types"]["theme:change"]["detail"] = {
      event: "theme:value",
      type: "value",
      detail: "dark",
      changes: { value: "dark" as const },
    };

    assert.deepEqual(eventDetail, { event: "theme:value", type: "value", detail: "dark" });
    assert.deepEqual(noDetailEvent, { event: "theme:reset", type: "reset" });
    assert.deepEqual(changesDetail, { changes: { value: "light" } });
    assert.ok(invalidDetail);

    dispatchCustomEvent(target, signal, "theme:change", eventDetail);
    dispatchCustomEvent(target, signal, "theme:change", changesDetail);

    if (false) {
      dispatchCustomEvent(
        target,
        signal,
        "theme:change",
        // @ts-expect-error direct change dispatch accepts either branch, not both.
        {
          event: "theme:value",
          type: "value",
          detail: "dark",
          changes: { value: "dark" as const },
        },
      );
    }
  });

  it("supports explicit HTML, SVG, and MathML targets", () => {
    let htmlElement = createTypedTarget<DragReleaseEventMap["target"]>();
    let svgCircleElement = createTypedTarget<SvgDragReleaseEventMap["target"]>();
    let mathElement = createTypedTarget<MathDragReleaseEventMap["target"]>();
    let signal = new AbortController().signal;

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
  });

  it("dispatches granular events and the change envelopes used by state subscribers", () => {
    let target = createTypedTarget<ThemeEventMap["target"]>();
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
    let target = createTypedTarget<ThemeEventMap["target"]>();
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
    let target = createTypedTarget<TodoEventMap["target"]>();
    let signal = new AbortController().signal;
    let form = {} as HTMLFormElement;
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
    let target = createTypedTarget<TodoEventMap["target"]>();
    let signal = new AbortController().signal;
    let form = {} as HTMLFormElement;
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
    let target = createTypedTarget<ThemeEventMap["target"]>();
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
    let target = createTypedTarget<ThemeEventMap["target"]>();
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
    let target = createTypedTarget<ThemeEventMap["target"]>();
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
    let target = createTypedTarget<ThemeEventMap["target"]>();
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

  it("reports cancellation if any dispatched event is prevented", () => {
    let target = createTypedTarget<ThemeEventMap["target"]>();
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
