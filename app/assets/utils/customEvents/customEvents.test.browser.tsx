import * as assert from "remix/assert";
import { describe, it } from "remix/test";
import { on, ref } from "remix/ui";
import { render } from "remix/ui/test";
import { customEvents } from "./index.tsx";
import {
  createCustomEventsRuntimeState,
  customEventsRuntime,
} from "./runtime.ts";
import type { CustomEventsOptions } from "./types.ts";

type TestEvents = {
  submitted: { id: string };
  paid: null;
  focusRequested: null;
};

function createEvents(options?: CustomEventsOptions) {
  return customEvents<TestEvents>(options);
}

async function settleEffects() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe("customEvents", () => {
  it("publishes withState properties as typed events", () => {
    let state = customEvents<{ count: number; label: string }>().withState({
      count: 0,
      label: "idle",
    });
    let received: Array<[string, unknown]> = [];

    state.addEventListener("count", (event) => {
      received.push([event.type, event.detail]);
    });
    state.addEventListener("label", (event) => {
      received.push([event.type, event.detail]);
    });

    state.update((draft) => {
      draft.count = 1;
      draft.label = "ready";
    });

    assert.equal(state.count, 1);
    assert.equal(state.label, "ready");
    assert.deepEqual(received, [
      ["count", 1],
      ["label", "ready"],
    ]);

    if (false) {
      let nested = customEvents<{
        profile: { name: string };
        tags: string[];
      }>().withState({ profile: { name: "Ada" }, tags: [] });
      // @ts-expect-error - state properties change only through update().
      state.count = 2;
      // @ts-expect-error - nested state changes only through update().
      nested.profile.name = "Grace";
      // @ts-expect-error - collection state changes only through update().
      nested.tags.push("compiler");
      nested.addEventListener("profile", (event) => {
        // @ts-expect-error - published state details are immutable.
        event.detail.name = "Grace";
      });
      // @ts-expect-error - update recipes must be synchronous.
      state.update(async (draft) => {
        draft.count = 2;
      });
      // @ts-expect-error - update recipes return no value.
      state.update((draft) => draft.count++);
      // @ts-expect-error - state properties cannot overwrite the state API.
      customEvents<{ events: string }>().withState({ events: "collision" });
      // @ts-expect-error - state properties cannot overwrite the state API.
      customEvents<{ update: string }>().withState({ update: "collision" });
      // @ts-expect-error - update addresses are scoped to event-element on().
      state.updates;
      // @ts-expect-error - state property events cannot use native DOM names.
      customEvents<{ click: boolean }>().withState({ click: false });
      // @ts-expect-error - initial state keys must belong to the event map.
      customEvents<{ count: number }>().withState({ count: 0, missing: true });
    }
  });

  it("freezes retained initial state references", () => {
    let initial = {
      profile: { name: "Ada" },
      tags: ["compiler"],
    };
    let state = customEvents<typeof initial>().withState(initial);

    assert.throws(() => {
      initial.profile.name = "Grace";
    });
    assert.throws(() => {
      initial.tags.push("navy");
    });
    assert.equal(state.profile.name, "Ada");
    assert.deepEqual(state.tags, ["compiler"]);
  });

  it("derives state events from nested Immer updates", () => {
    let state = customEvents<{
      draft: { name: string; surname: string };
      people: Array<{ id: number; name: string }>;
    }>().withState({
      draft: { name: "Grace", surname: "Hopper" },
      people: [{ id: 1, name: "Grace" }],
    });
    let originalDraft = state.draft;
    let originalPeople = state.people;
    let received: Array<[string, unknown]> = [];

    state.addEventListener("draft", (event) => {
      received.push([event.type, event.detail]);
      assert.equal(state.people[0]?.name, "Ada");
    });
    state.addEventListener("people", (event) => {
      received.push([event.type, event.detail]);
      assert.equal(state.draft.name, "Ada");
    });

    state.update((draft) => {
      draft.draft.name = "Ada";
      draft.people[0]!.name = "Ada";
    });

    assert.equal(originalDraft.name, "Grace");
    assert.equal(originalPeople[0]?.name, "Grace");
    assert.equal(state.draft.name, "Ada");
    assert.equal(state.people[0]?.name, "Ada");
    assert.equal(received.length, 2);
    assert.equal(received.find(([type]) => type === "draft")?.[1], state.draft);
    assert.equal(
      received.find(([type]) => type === "people")?.[1],
      state.people,
    );

    state.update((draft) => {
      draft.draft.name = "Ada";
    });
    assert.equal(received.length, 2);

    assert.throws(() => {
      state.update((draft) => {
        draft.draft.name = "discarded";
        throw new Error("stop");
      });
    }, /stop/);
    assert.equal(state.draft.name, "Ada");
    assert.equal(received.length, 2);

    if (false) {
      state.update((draft) => {
        // @ts-expect-error - occurrences and undeclared properties are absent.
        draft.missing = true;
      });
    }
  });

  it("infers nested update details and ignores unrelated paths", async (t) => {
    let state = customEvents<{
      profile: { name: string; address: { city: string } };
      status: string;
    }>().withState({
      profile: { name: "Ada", address: { city: "London" } },
      status: "idle",
    });
    let projections = 0;

    function Profile() {
      return () => (
        <state.events.output
          data-testid="name"
          on={(event) => event.profile.name}
          class={(event) => event.detail.toLowerCase()}
        >
          {(event) => {
            event.detail satisfies string;
            if (false) {
              // @ts-expect-error The update detail is a string, not a number.
              event.detail.toFixed();
            }
            projections++;
            return event.detail;
          }}
        </state.events.output>
      );
    }

    let result = render(<Profile />);
    t.after(() => result.cleanup());
    assert.equal(projections, 1);

    await result.act(async () => {
      state.update((draft) => {
        draft.status = "ready";
      });
      await settleEffects();
    });
    assert.equal(projections, 1);

    await result.act(async () => {
      state.update((draft) => {
        draft.profile.name = "Grace";
      });
      await settleEffects();
    });
    assert.equal(projections, 2);
    assert.equal(result.$('[data-testid="name"]')?.textContent, "Grace");

    await result.act(async () => {
      state.update((draft) => {
        draft.profile.address.city = "Arlington";
      });
      await settleEffects();
    });
    assert.equal(projections, 2);

    await result.act(async () => {
      state.update((draft) => {
        draft.profile = {
          name: "Katherine",
          address: { city: "Cleveland" },
        };
      });
      await settleEffects();
    });
    assert.equal(projections, 3);
    assert.equal(result.$('[data-testid="name"]')?.textContent, "Katherine");
  });

  it("derives keyed routes from Map and primitive Set patches", async (t) => {
    let state = customEvents<{
      position: Map<string, string>;
      selected: Set<string>;
    }>().withState({
      position: new Map([
        ["a", "X"],
        ["b", "O"],
      ]),
      selected: new Set(["red"]),
    });
    let calls = { mapA: 0, mapB: 0, mapAll: 0, red: 0, blue: 0 };
    let positionEvents = 0;
    state.addEventListener("position", () => positionEvents++);

    function Collections() {
      return () => (
        <section>
          <state.events.output on={(event) => event.position.get("a")} id="a">
            {(event) => `${++calls.mapA}:${event.detail}`}
          </state.events.output>
          <state.events.output on={(event) => event.position.get("b")} id="b">
            {(event) => `${++calls.mapB}:${event.detail}`}
          </state.events.output>
          <state.events.output on={(event) => event.position}>
            {(event) => `${++calls.mapAll}:${event.detail.size}`}
          </state.events.output>
          <state.events.output
            on={(event) => event.selected.has("red")}
            id="red"
          >
            {(event) => `${++calls.red}:${event.detail}`}
          </state.events.output>
          <state.events.output
            on={(event) => event.selected.has("blue")}
            id="blue"
          >
            {(event) => `${++calls.blue}:${event.detail}`}
          </state.events.output>
        </section>
      );
    }

    let result = render(<Collections />);
    t.after(() => result.cleanup());

    await result.act(async () => {
      state.update((draft) => {
        draft.position.set("a", "A");
      });
      await settleEffects();
    });
    assert.deepEqual(calls, {
      mapA: 2,
      mapB: 1,
      mapAll: 2,
      red: 1,
      blue: 1,
    });
    assert.equal(positionEvents, 1);

    await result.act(async () => {
      state.update((draft) => {
        draft.position.set("a", "AA");
        draft.position.set("b", "BB");
        draft.selected.add("blue");
      });
      await settleEffects();
    });
    assert.deepEqual(calls, {
      mapA: 3,
      mapB: 2,
      mapAll: 3,
      red: 1,
      blue: 2,
    });
    assert.equal(positionEvents, 2);
  });

  it("routes deep patches through every nested identity boundary", async (t) => {
    let state = customEvents<{
      columns: Map<
        string,
        {
          cards: Map<string, { urgent: boolean }>;
        }
      >;
    }>().withState({
      columns: new Map([
        [
          "column:todo",
          {
            cards: new Map([
              ["card:one", { urgent: false }],
              ["card:two", { urgent: false }],
            ]),
          },
        ],
        [
          "column:done",
          {
            cards: new Map([["card:three", { urgent: false }]]),
          },
        ],
      ]),
    });
    let calls = { todo: 0, done: 0, one: 0, two: 0, three: 0 };

    function Board() {
      return () => (
        <section>
          <state.events.output
            on={(event) => event.columns.get("column:todo")}
            id="column:todo"
          >
            {() => String(++calls.todo)}
          </state.events.output>
          <state.events.output
            on={(event) => event.columns.get("column:done")}
            id="column:done"
          >
            {() => String(++calls.done)}
          </state.events.output>
          <state.events.output
            on={(event) =>
              event.columns.get("column:todo").cards.get("card:one")
            }
            id="card:one"
          >
            {() => String(++calls.one)}
          </state.events.output>
          <state.events.output
            on={(event) =>
              event.columns.get("column:todo").cards.get("card:two")
            }
            id="card:two"
          >
            {() => String(++calls.two)}
          </state.events.output>
          <state.events.output
            on={(event) =>
              event.columns.get("column:done").cards.get("card:three")
            }
            id="card:three"
          >
            {() => String(++calls.three)}
          </state.events.output>
        </section>
      );
    }

    let result = render(<Board />);
    t.after(() => result.cleanup());

    await result.act(async () => {
      state.update((draft) => {
        draft.columns.get("column:todo")!.cards.get("card:one")!.urgent = true;
      });
      await settleEffects();
    });

    assert.deepEqual(calls, {
      todo: 2,
      done: 1,
      one: 2,
      two: 1,
      three: 1,
    });
  });

  it("preserves object identity in Map update addresses", async (t) => {
    let recordKey = {};
    let state = customEvents<{
      records: Map<object, { value: number }>;
    }>().withState({
      records: new Map([[recordKey, { value: 1 }]]),
    });
    let projections = 0;

    function RecordValue() {
      return () => (
        <state.events.output on={(event) => event.records.get(recordKey).value}>
          {(event) => `${++projections}:${event.detail}`}
        </state.events.output>
      );
    }

    let result = render(<RecordValue />);
    t.after(() => result.cleanup());

    await result.act(async () => {
      state.update((draft) => {
        draft.records.get(recordKey)!.value = 2;
      });
      await settleEffects();
    });

    assert.equal(projections, 2);
    assert.equal(result.$("output")?.textContent, "2:2");
  });

  it("derives array index routes by default", async (t) => {
    let state = customEvents<{ items: string[] }>().withState({
      items: ["first", "second"],
    });
    let calls = { first: 0, second: 0, all: 0 };

    function Items() {
      return () => (
        <section>
          <state.events.output on={(event) => event.items[0]} id="0">
            {() => String(++calls.first)}
          </state.events.output>
          <state.events.output on={(event) => event.items[1]} id="1">
            {() => String(++calls.second)}
          </state.events.output>
          <state.events.output on={(event) => event.items}>
            {() => String(++calls.all)}
          </state.events.output>
        </section>
      );
    }

    let result = render(<Items />);
    t.after(() => result.cleanup());

    await result.act(async () => {
      state.update((draft) => {
        draft.items[1] = "updated";
      });
      await settleEffects();
    });
    assert.deepEqual(calls, { first: 1, second: 2, all: 2 });

    await result.act(async () => {
      state.update((draft) => {
        draft.items.splice(0, 1);
      });
      await settleEffects();
    });
    assert.deepEqual(calls, { first: 2, second: 3, all: 3 });

    await result.act(async () => {
      state.update((draft) => {
        draft.items = ["replacement"];
      });
      await settleEffects();
    });
    assert.deepEqual(calls, { first: 3, second: 4, all: 4 });
  });

  it("derives conventional ids and record paths", async (t) => {
    type Circle = { id: number; diameter: number };
    let state = customEvents<{
      circles: Circle[];
      values: Record<string, string>;
    }>().withState({
      circles: [
        { id: 7, diameter: 30 },
        { id: 8, diameter: 40 },
      ],
      values: { A0: "10", B0: "20" },
    });
    let calls = { circle7: 0, circle8: 0, A0: 0, B0: 0 };

    function Collections() {
      return () => (
        <section>
          <state.events.output on={(event) => event.circles[7]} id="7">
            {() => String(++calls.circle7)}
          </state.events.output>
          <state.events.output on={(event) => event.circles[8]} id="8">
            {() => String(++calls.circle8)}
          </state.events.output>
          <state.events.output on={(event) => event.values.A0}>
            {() => String(++calls.A0)}
          </state.events.output>
          <state.events.output on={(event) => event.values.B0}>
            {() => String(++calls.B0)}
          </state.events.output>
        </section>
      );
    }

    let result = render(<Collections />);
    t.after(() => result.cleanup());

    await result.act(async () => {
      state.update((draft) => {
        draft.circles[0]!.diameter = 35;
        draft.values.A0 = "11";
      });
      await settleEffects();
    });
    assert.deepEqual(calls, { circle7: 2, circle8: 1, A0: 2, B0: 1 });

    await result.act(async () => {
      state.update((draft) => {
        draft.circles.splice(0, 1);
      });
      await settleEffects();
    });
    assert.deepEqual(calls, { circle7: 3, circle8: 1, A0: 2, B0: 1 });

    await result.act(async () => {
      state.update((draft) => {
        draft.circles = [
          { id: 7, diameter: 50 },
          {
            id: 8,
            diameter: 60,
          },
        ];
      });
      await settleEffects();
    });
    assert.deepEqual(calls, { circle7: 4, circle8: 2, A0: 2, B0: 1 });

    if (false) {
      customEvents<{ circles: Circle[] }>().withState(
        { circles: [] },
        {
          keyBy: {
            // @ts-expect-error - collection identity is structural, not selected.
            circles: (circle) => circle.id,
          },
        },
      );
    }
  });

  it("routes identity-valued state to its previous and next values", async (t) => {
    let state = customEvents<{
      selectedId: number | null;
    }>().withState(
      { selectedId: null },
      {
        keyBy: { selectedId: "value" },
      },
    );
    let calls = { first: 0, second: 0, all: 0 };
    let effectOrder: string[] = [];

    function Selection() {
      return () => (
        <section>
          <state.events.button
            on={(event) => event.selectedId}
            id="1"
            type="button"
            mix={state.events.on("selectedId", ({ currentTarget }) => {
              effectOrder.push(currentTarget.id);
              currentTarget.focus();
            })}
          >
            {() => String(++calls.first)}
          </state.events.button>
          <state.events.button
            on={(event) => event.selectedId}
            id="2"
            type="button"
            mix={state.events.on("selectedId", ({ currentTarget }) => {
              effectOrder.push(currentTarget.id);
              currentTarget.focus();
            })}
          >
            {() => String(++calls.second)}
          </state.events.button>
          <state.events.output on={(event) => event.selectedId}>
            {() => String(++calls.all)}
          </state.events.output>
        </section>
      );
    }

    let result = render(<Selection />);
    t.after(() => result.cleanup());

    await result.act(async () => {
      state.update((draft) => {
        draft.selectedId = 1;
      });
      await settleEffects();
    });
    assert.deepEqual(calls, { first: 2, second: 1, all: 2 });
    assert.deepEqual(effectOrder, ["1"]);
    assert.equal(document.activeElement?.id, "1");

    effectOrder.length = 0;
    await result.act(async () => {
      state.update((draft) => {
        draft.selectedId = 2;
      });
      await settleEffects();
    });
    assert.deepEqual(calls, { first: 3, second: 2, all: 3 });
    assert.deepEqual(effectOrder, ["1", "2"]);
    assert.equal(document.activeElement?.id, "2");

    await result.act(async () => {
      state.update((draft) => {
        draft.selectedId = null;
      });
      await settleEffects();
    });
    assert.deepEqual(calls, { first: 3, second: 3, all: 4 });

    if (false) {
      state.update(
        (draft) => {
          draft.selectedId = 1;
        },
        // @ts-expect-error - state routing is declared by withState().
        { key: 1 },
      );
    }
  });

  it("derives occurrences from event-map entries omitted by withState", () => {
    type State = { count: number };
    type Occurrences = { refreshRequested: null; countDrafted: number };
    let state = customEvents<State & Occurrences>().withState({ count: 0 });
    let received: Array<[string, unknown]> = [];

    state.addEventListener("count", (event) => {
      received.push([event.type, event.detail]);
    });
    state.addEventListener("countDrafted", (event) => {
      received.push([event.type, event.detail]);
    });
    state.addEventListener("refreshRequested", (event) => {
      received.push([event.type, event.detail]);
    });

    state.update((draft) => {
      draft.count = 1;
    });
    state.dispatchEvent(state.events("countDrafted", 2));
    state.dispatchEvent(state.events("refreshRequested"));

    assert.equal(state.count, 1);
    assert.deepEqual(received, [
      ["count", 1],
      ["countDrafted", 2],
      ["refreshRequested", null],
    ]);

    if (false) {
      // @ts-expect-error - property events are produced only by update().
      state.events("count", 2);
      state.update((draft) => {
        // @ts-expect-error - occurrences are not state properties.
        draft.countDrafted = 2;
      });
      // @ts-expect-error - occurrences do not become readable state.
      state.countDrafted;
      // @ts-expect-error - occurrences cannot use native DOM event names.
      customEvents<State & { click: null }>().withState({ count: 0 });
    }
  });

  it("selects state paths and occurrences from one event-source callback", async (t) => {
    let state = customEvents<{
      count: number;
      countDrafted: number;
    }>().withState({ count: 0 });
    let projections = 0;

    function Count() {
      return () => (
        <state.events.output on={(event) => [event.count, event.countDrafted]}>
          {(event) => `${event.detail}:${++projections}`}
        </state.events.output>
      );
    }

    let result = render(<Count />);
    t.after(() => result.cleanup());
    assert.equal(result.$("output")?.textContent, "0:1");

    await result.act(async () => {
      state.dispatchEvent(state.events("countDrafted", 2));
      await settleEffects();
    });
    assert.equal(result.$("output")?.textContent, "2:2");
  });

  it("creates an independent EventTarget host for each state model", () => {
    let models = customEvents<{ count: number }>();
    let first = models.withState({ count: 0 });
    let second = models.withState({ count: 10 });
    let firstCalls = 0;
    let secondCalls = 0;

    first.addEventListener("count", () => firstCalls++);
    second.addEventListener("count", () => secondCalls++);

    first.update((draft) => {
      draft.count = 1;
    });

    assert.equal(first.count, 1);
    assert.equal(second.count, 10);
    assert.equal(firstCalls, 1);
    assert.equal(secondCalls, 0);

    assert.throws(
      () =>
        customEvents<{ count: number }>({ host: new EventTarget() }).withState({
          count: 0,
        }),
      /supplies its own EventTarget host/,
    );
  });

  it("creates typed local-name single and batch events", () => {
    let events = createEvents();
    let otherEvents = createEvents();
    let first = events("submitted", { id: "first" });
    let second = events("submitted", { id: "second" });
    let signal = events("paid");
    let batch = events([
      "paid",
      {
        submitted: {
          detail: { id: "batched" },
          options: { key: "row-1" },
        },
      },
    ]);

    assert.equal(first.detail.id, "first");
    assert.equal(signal.detail, null);
    assert.equal(batch.detail, undefined);
    assert.ok(first !== second);
    assert.equal(first.type, second.type);
    assert.equal(first.type, "submitted");
    assert.equal(first.cancelable, false);
    first.preventDefault();
    assert.equal(first.defaultPrevented, false);
    assert.equal(otherEvents("submitted", { id: "other" }).type, "submitted");
    let target = new EventTarget();
    let observed = false;
    target.addEventListener("submitted", () => {
      observed = true;
    });
    assert.equal(target.dispatchEvent(first), true);
    assert.equal(observed, true);

    let createWithEventInit = events as unknown as (
      type: "submitted",
      detail: { id: string },
      init: EventInit,
    ) => CustomEvent<{ id: string }>;
    assert.throws(
      () =>
        createWithEventInit(
          "submitted",
          { id: "runtime-check" },
          { cancelable: true },
        ),
      /cannot be cancelable/,
    );

    if (false) {
      // @ts-expect-error - detailed events require detail.
      events("submitted");
      // @ts-expect-error - signal events do not accept detail.
      events("paid", "unexpected");
      // @ts-expect-error - detailed events require configured batch detail.
      events([{ submitted: {} }]);
      // @ts-expect-error - transactions use the ordered array grammar.
      events({ paid: null });
      // @ts-expect-error - entry options route only; propagation belongs to the batch.
      events([{
        submitted: {
          detail: { id: "invalid-options" },
          options: { composed: true },
        },
      }]);
      // @ts-expect-error - `*` is reserved for subscriptions.
      events("*");
      // @ts-expect-error - native DOM event names are reserved.
      customEvents<"click">();
      customEvents<TestEvents>({
        host: new EventTarget(),
        // @ts-expect-error - factory host registration has no abort lifecycle.
        signal: new AbortController().signal,
      });
      // @ts-expect-error - descriptor events are completed, non-cancelable facts.
      events("paid", { cancelable: true });
      // @ts-expect-error - awaitable dispatch preserves detailed-event typing.
      events.dispatch(new EventTarget(), "submitted");
      // @ts-expect-error - customEvents effects do not expose reentry signals.
      events.on("paid", (_event, _signal) => {});
      // @ts-expect-error - customEvents observers do not expose reentry signals.
      events.observe(new EventTarget(), (_event, _signal) => {});
      events.on("*", (event) => {
        switch (event.type) {
          case "submitted":
            event.detail.id satisfies string;
            break;
          case "paid":
          case "focusRequested":
            event.detail satisfies null;
            break;
          default:
            event satisfies never;
        }
      });
    }
  });

  it("throws an already-aborted signal's exact reason", () => {
    let events = createEvents();
    let controller = new AbortController();
    let reason = new Error("stale transition");
    controller.abort(reason);

    let factories = [
      () => events("paid", { signal: controller.signal }),
      () => events(["paid"], { signal: controller.signal }),
    ];

    for (let createEvent of factories) {
      let thrown: unknown;
      try {
        createEvent();
      } catch (error) {
        thrown = error;
      }
      assert.equal(thrown, reason);
    }
  });

  it("supports event names that collide with Function properties", async (t) => {
    let events = customEvents<"name" | "length" | "bind" | "toString">();

    function CollidingEventNames() {
      return () => (
        <section mix={events.host}>
          <events.output on="name" data-testid="name">
            {(event) => event?.type}
          </events.output>
          <events.output on="length" data-testid="length">
            {(event) => event?.type}
          </events.output>
          <events.output on="bind" data-testid="bind">
            {(event) => event?.type}
          </events.output>
          <events.output on="toString" data-testid="toString">
            {(event) => event?.type}
          </events.output>
        </section>
      );
    }

    let result = render(<CollidingEventNames />);
    t.after(() => result.cleanup());
    let section = result.$("section") as HTMLElement;

    await result.act(async () => {
      section.dispatchEvent(events(["name", "length", "bind", "toString"]));
      await settleEffects();
    });

    for (let type of ["name", "length", "bind", "toString"]) {
      assert.equal(result.$(`[data-testid="${type}"]`)?.textContent, type);
    }
  });

  it("updates reactive props and children before running DOM effects", async (t) => {
    let events = createEvents();

    function Checkout() {
      return () => (
        <section mix={events.host}>
          <button
            data-testid="submit"
            mix={on("click", ({ currentTarget }) => {
              currentTarget.dispatchEvent(
                events("submitted", { id: "order-1" }),
              );
            })}
          >
            Submit
          </button>
          <events.form
            on="submitted"
            initial={events("submitted", { id: "idle" })}
            data-testid="form"
            class={(event) => (event.detail.id === "idle" ? "" : "pending")}
            aria-busy={(event) => event.detail.id !== "idle"}
            mix={events.on("submitted", ({ currentTarget }) => {
              currentTarget.dataset.committed = String(
                currentTarget.classList.contains("pending"),
              );
            })}
          >
            {(event) => <output>{event.detail.id}</output>}
          </events.form>
        </section>
      );
    }

    let result = render(<Checkout />);
    t.after(() => result.cleanup());
    let form = result.$('[data-testid="form"]') as HTMLFormElement;

    assert.equal(form.className, "");
    assert.equal(form.textContent, "idle");

    await result.act(() =>
      (result.$('[data-testid="submit"]') as HTMLButtonElement).click(),
    );
    await settleEffects();

    assert.equal(result.$('[data-testid="form"]'), form);
    assert.equal(form.className, "pending");
    assert.equal(form.getAttribute("aria-busy"), "true");
    assert.equal(form.textContent, "order-1");
    assert.equal(form.dataset.committed, "true");
  });

  it("projects undefined until an occurrence first matches", async (t) => {
    let events = createEvents();

    function Confirmation() {
      return () => (
        <section mix={events.host} data-testid="confirmation-host">
          <events.output
            on="submitted"
            hidden={(event) => event === undefined}
            data-testid="confirmation"
          >
            {(event) => event?.detail.id ?? null}
          </events.output>
          <events.output
            on="submitted"
            initial={events("submitted", { id: "initial" })}
            hidden={(event) => event.detail.id === "hidden"}
            data-testid="initial-confirmation"
          >
            {(event) => event.detail.id}
          </events.output>
        </section>
      );
    }

    let result = render(<Confirmation />);
    t.after(() => result.cleanup());
    let host = result.$('[data-testid="confirmation-host"]') as HTMLElement;
    let confirmation = result.$(
      '[data-testid="confirmation"]',
    ) as HTMLOutputElement;
    let initialConfirmation = result.$(
      '[data-testid="initial-confirmation"]',
    ) as HTMLOutputElement;

    assert.equal(confirmation.hidden, true);
    assert.equal(confirmation.textContent, "");
    assert.equal(initialConfirmation.hidden, false);
    assert.equal(initialConfirmation.textContent, "initial");

    await result.act(() => host.dispatchEvent(events("paid")));
    assert.equal(confirmation.hidden, true);

    await result.act(() =>
      host.dispatchEvent(events("submitted", { id: "order-1" }))
    );
    assert.equal(confirmation.hidden, false);
    assert.equal(confirmation.textContent, "order-1");
  });

  it("commits the source projection before downstream projections", async (t) => {
    let events = createEvents();

    function Form() {
      return () => (
        <events.form
          data-testid="source"
          data-action={(event) => event?.type}
          mix={[
            events.host,
            on("focusout", ({ currentTarget }) => {
              currentTarget.dataset.actionSeenOnFocusout =
                currentTarget.dataset.action ?? "missing";
            }),
          ]}
        >
          <events.input
            data-testid="input"
            disabled={(event) => event?.type === "submitted"}
          />
        </events.form>
      );
    }

    let result = render(<Form />);
    t.after(() => result.cleanup());
    let form = result.$('[data-testid="source"]') as HTMLFormElement;
    let input = result.$('[data-testid="input"]') as HTMLInputElement;
    input.focus();

    await result.act(async () => {
      form.dispatchEvent(events("submitted", { id: "order-1" }));
      await settleEffects();
    });

    assert.equal(input.disabled, true);
    assert.equal(form.dataset.action, "submitted");
    assert.equal(form.dataset.actionSeenOnFocusout, "submitted");
  });

  it("supports named groups, wildcards, and keyed routing", async (t) => {
    let events = createEvents();
    let initialOutcome = events("paid");

    function Orders() {
      return () => (
        <section mix={events.host}>
          <button
            data-testid="update"
            mix={on("click", ({ currentTarget }) => {
              currentTarget.dispatchEvent(
                events("submitted", { id: "first" }, { key: "first" }),
              );
            })}
          />
          {["first", "second"].map((id) => (
            <events.output
              on={["submitted", "paid"]}
              initial={initialOutcome}
              id={id}
              data-testid={id}
              mix={events.on("*", ({ currentTarget, type }) => {
                currentTarget.dataset.effect = type;
              })}
            >
              {(event) =>
                event.type === "submitted" ? event.detail.id : "idle"
              }
            </events.output>
          ))}
          <events.output on="*" initial={initialOutcome} data-testid="all">
            {(event) => (event.type === "paid" ? "idle" : event.type)}
          </events.output>
        </section>
      );
    }

    let result = render(<Orders />);
    t.after(() => result.cleanup());

    await result.act(() =>
      (result.$('[data-testid="update"]') as HTMLButtonElement).click(),
    );
    await settleEffects();

    let first = result.$('[data-testid="first"]') as HTMLOutputElement;
    let second = result.$('[data-testid="second"]') as HTMLOutputElement;
    assert.equal(first.textContent, "first");
    assert.equal(first.dataset.effect, "submitted");
    assert.equal(second.textContent, "idle");
    assert.equal(second.dataset.effect, undefined);
    assert.equal(result.$('[data-testid="all"]')?.textContent, "submitted");

    await result.act(() => {
      (result.$("section") as HTMLElement).dispatchEvent(
        events(
          [
            {
              submitted: {
                detail: { id: "first-again" },
                options: { key: "first" },
              },
            },
            {
              submitted: {
                detail: { id: "second" },
                options: { key: "second" },
              },
            },
          ],
          { composed: true },
        ),
      );
    });
    await settleEffects();

    assert.equal(first.textContent, "first-again");
    assert.equal(second.textContent, "second");
    assert.equal(first.dataset.effect, "submitted");
    assert.equal(second.dataset.effect, "submitted");
  });

  it("keeps unhosted events local and routes siblings through explicit hosts", async (t) => {
    let events = createEvents();

    function Scopes() {
      return () => (
        <div>
          <button
            data-testid="local"
            mix={[
              events.on("paid", ({ currentTarget }) => {
                currentTarget.dataset.received = "true";
              }),
              on("click", ({ currentTarget }) => {
                currentTarget.dispatchEvent(events("paid", { bubbles: false }));
              }),
            ]}
          />
          <section>
            <button
              data-testid="unhosted-source"
              mix={on("click", ({ currentTarget }) => {
                currentTarget.dispatchEvent(events("paid"));
              })}
            />
            <output
              data-testid="unhosted-listener"
              mix={events.on("paid", ({ currentTarget }) => {
                currentTarget.textContent = "received";
              })}
            />
          </section>
          <section mix={events.host}>
            <button
              data-testid="hosted-source"
              mix={on("click", ({ currentTarget }) => {
                currentTarget.dispatchEvent(events("paid"));
              })}
            />
            <output
              data-testid="hosted-listener"
              mix={events.on("paid", ({ currentTarget }) => {
                currentTarget.textContent = "received";
              })}
            />
          </section>
        </div>
      );
    }

    let result = render(<Scopes />);
    t.after(() => result.cleanup());
    let local = result.$('[data-testid="local"]') as HTMLButtonElement;
    let foreignEventReachedParent = false;
    result.container.addEventListener("paid", () => {
      foreignEventReachedParent = true;
    });

    await result.act(() => local.click());
    assert.equal(local.dataset.received, "true");

    await result.act(() =>
      (
        result.$('[data-testid="unhosted-source"]') as HTMLButtonElement
      ).click(),
    );
    assert.equal(
      result.$('[data-testid="unhosted-listener"]')?.textContent,
      "",
    );

    await result.act(() =>
      (result.$('[data-testid="hosted-source"]') as HTMLButtonElement).click(),
    );
    assert.equal(
      result.$('[data-testid="hosted-listener"]')?.textContent,
      "received",
    );

    foreignEventReachedParent = false;
    (
      result.$('[data-testid="hosted-source"]') as HTMLButtonElement
    ).dispatchEvent(new CustomEvent("paid", { bubbles: true }));
    assert.equal(foreignEventReachedParent, true);
  });

  it("contains non-composed events and lets composed events cross nested hosts", async (t) => {
    let events = createEvents();

    function NestedHosts() {
      return () => (
        <section
          mix={[
            events.host,
            events.on("submitted", ({ currentTarget, detail }) => {
              currentTarget.dataset.latest = detail.id;
            }),
          ]}
        >
          <form mix={events.host}>
            <button
              data-testid="local"
              mix={on("click", ({ currentTarget }) => {
                currentTarget.dispatchEvent(
                  events("submitted", { id: "local" }),
                );
              })}
            />
            <button
              data-testid="composed"
              mix={on("click", ({ currentTarget }) => {
                currentTarget.dispatchEvent(
                  events(
                    [
                      {
                        submitted: { detail: { id: "composed" } },
                      },
                    ],
                    { composed: true },
                  ),
                );
              })}
            />
          </form>
        </section>
      );
    }

    let result = render(<NestedHosts />);
    t.after(() => result.cleanup());
    let root = result.$("section") as HTMLElement;

    await result.act(() =>
      (result.$('[data-testid="local"]') as HTMLButtonElement).click(),
    );
    assert.equal(root.dataset.latest, undefined);

    await result.act(() =>
      (result.$('[data-testid="composed"]') as HTMLButtonElement).click(),
    );
    assert.equal(root.dataset.latest, "composed");
  });

  it("dispatches a transaction and awaits projections and ordered effects", async (t) => {
    let events = createEvents();
    let projectionUpdates = 0;
    let effects: string[] = [];
    let dispatchTarget!: HTMLButtonElement;

    function Transaction() {
      return () => (
        <section mix={events.host}>
          <button
            data-testid="dispatch"
            mix={ref((button) => {
              dispatchTarget = button;
            })}
          />
          <events.output
            data-testid="projection"
            mix={events.on("*", async ({ type, currentTarget }) => {
              await Promise.resolve();
              effects.push(`${type}:${currentTarget.textContent}`);
            })}
          >
            {(event) => event && `${event.type}:${++projectionUpdates}`}
          </events.output>
        </section>
      );
    }

    let result = render(<Transaction />);
    t.after(() => result.cleanup());

    await result.act(() =>
      events.dispatch(dispatchTarget, [
        {
          submitted: {
            detail: { id: "batched" },
          },
        },
        "paid",
      ]),
    );

    assert.equal(result.$('[data-testid="projection"]')?.textContent, "paid:1");
    assert.deepEqual(effects, ["submitted:paid:1", "paid:paid:1"]);
  });

  it("observes all descriptor events on explicit and default hosts", async () => {
    let explicitTarget = new EventTarget();
    let defaultTarget = new EventTarget();
    let explicitEvents = createEvents();
    let otherEvents = createEvents();
    let hostedEvents = createEvents({ host: defaultTarget });
    let controller = new AbortController();
    let calls: string[] = [];

    explicitEvents.observe(
      explicitTarget,
      (event) => {
        assert.equal(event.currentTarget, explicitTarget);
        calls.push(`all:${event.type}`);
      },
      { signal: controller.signal },
    );

    hostedEvents.observe(async (event) => {
      assert.equal(event.currentTarget, defaultTarget);
      await Promise.resolve();
      calls.push(`hosted:${event.type}`);
    });
    otherEvents.observe(explicitTarget, () => {
      calls.push("wrong-descriptor");
    });

    explicitTarget.dispatchEvent(explicitEvents("submitted", { id: "direct" }));
    explicitTarget.dispatchEvent(explicitEvents("paid"));
    await hostedEvents.dispatch(defaultTarget, "paid");
    assert.deepEqual(calls, ["all:submitted", "all:paid", "hosted:paid"]);

    controller.abort();
    explicitTarget.dispatchEvent(
      explicitEvents("submitted", { id: "ignored" }),
    );
    assert.equal(calls.length, 3);
  });

  it("mirrors batch entries only on configured domain EventTargets", async () => {
    let domain = new EventTarget();
    let events = createEvents({ host: domain });
    let nativeCalls: string[] = [];
    domain.addEventListener("submitted", (event) => {
      nativeCalls.push(
        `submitted:${(event as CustomEvent<{ id: string }>).detail.id}`,
      );
    });
    domain.addEventListener("paid", () => nativeCalls.push("paid"));

    await events.dispatch(domain, [
      { submitted: { detail: { id: "batch" } } },
      "paid",
    ]);
    await events.dispatch(domain, ["paid", "paid"]);

    assert.deepEqual(nativeCalls, ["submitted:batch", "paid", "paid", "paid"]);
  });

  it("catches a mount-time event after listener setup", async (t) => {
    let events = createEvents();

    function MountedInput() {
      return () => (
        <input
          data-testid="input"
          mix={[
            events.host,
            on("input", ({ currentTarget }) => {
              currentTarget.dispatchEvent(events("paid"));
            }),
            events.on("paid", ({ currentTarget }) => {
              currentTarget.dataset.ready = "true";
            }),
            ref((input) => input.dispatchEvent(new InputEvent("input"))),
          ]}
        />
      );
    }

    let result = render(<MountedInput />);
    t.after(() => result.cleanup());
    await result.act(() => Promise.resolve());

    assert.equal(
      (result.$('[data-testid="input"]') as HTMLInputElement).dataset.ready,
      "true",
    );
  });

  it("indexes subscriptions by phase, type, and event address", async () => {
    let runtime = createCustomEventsRuntimeState();
    let host = document.createElement("section");
    let origin = document.createElement("button");
    host.append(origin);
    let unregisterHost = customEventsRuntime.registerHost(runtime, host);
    let calls: string[] = [];
    let cleanups: Array<() => void> = [];
    let assertCalls = (...expected: string[]) => {
      assert.deepEqual([...calls].sort(), [...expected].sort());
    };

    function subscribe(
      name: string,
      id: string,
      eventTypes: ReadonlySet<string> | null,
      phase: "projection" | "effect" = "projection",
    ) {
      let element = document.createElement("output");
      element.id = id;
      host.append(element);
      let subscription = {
        element,
        eventTypes,
        notify(event: CustomEvent) {
          calls.push(`${name}:${event.type}`);
        },
      };
      let cleanup =
        phase === "effect"
          ? customEventsRuntime.subscribe(runtime, "effect", subscription)
          : customEventsRuntime.subscribe(
            runtime,
            "projection",
            subscription,
          );
      cleanups.push(cleanup);
      return cleanup;
    }

    let removeExact = subscribe("exact", "first", new Set(["updated"]));
    let removeBroad = subscribe("broad", "", new Set(["updated"]));
    subscribe("other-key", "second", new Set(["updated"]));
    subscribe("wildcard", "first", null);
    subscribe("effect", "first", new Set(["updated"]), "effect");

    function event(key?: string) {
      let init = { bubbles: true, cancelable: false };
      return customEventsRuntime.createProductEvent(
        runtime,
        "updated",
        null,
        init,
        [{
          type: "updated",
          detail: null,
          ...(key === undefined ? {} : { addresses: [[String(key)]] }),
        }],
      );
    }

    await customEventsRuntime.dispatch(runtime, origin, event("first"));
    assertCalls(
      "broad:updated",
      "exact:updated",
      "wildcard:updated",
      "effect:updated",
    );

    calls = [];
    await customEventsRuntime.dispatch(runtime, origin, event("second"));
    assertCalls("broad:updated", "other-key:updated");

    calls = [];
    await customEventsRuntime.dispatch(runtime, origin, event());
    assertCalls(
      "exact:updated",
      "broad:updated",
      "other-key:updated",
      "wildcard:updated",
      "effect:updated",
    );

    removeExact();
    removeBroad();
    calls = [];
    await customEventsRuntime.dispatch(runtime, origin, event("first"));
    assertCalls("wildcard:updated", "effect:updated");

    for (let cleanup of cleanups) cleanup();
    unregisterHost();
  });

  it("derives host containment independently of registration order", () => {
    let runtime = createCustomEventsRuntimeState();
    let parent = document.createElement("main");
    let host = document.createElement("section");
    parent.append(host);
    let reachedParent = false;
    parent.addEventListener("updated", () => {
      reachedParent = true;
    });

    let unsubscribe = customEventsRuntime.subscribe(runtime, "projection", {
      element: host,
      eventTypes: new Set(["updated"]),
      notify() {},
    });
    let unregisterHost = customEventsRuntime.registerHost(runtime, host);
    let init = { bubbles: true, cancelable: false };
    host.dispatchEvent(
      customEventsRuntime.createProductEvent(runtime, "updated", null, init, [
        {
          type: "updated",
          detail: null,
        },
      ]),
    );

    assert.equal(reachedParent, false);
    unregisterHost();
    unsubscribe();
  });
});
