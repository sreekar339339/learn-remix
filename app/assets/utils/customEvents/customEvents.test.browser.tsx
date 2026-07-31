import * as assert from "remix/assert";
import { describe, it } from "remix/test";
import { on, ref } from "remix/ui";
import { render } from "remix/ui/test";
import { customEvents } from "./index.tsx";
import { CustomEventsRuntime } from "./runtime.ts";
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
    assert.equal(
      otherEvents("submitted", { id: "other" }).type,
      "submitted",
    );
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
      // @ts-expect-error - entry options route only; propagation belongs to the batch.
      events([{ submitted: {
        detail: { id: "invalid-options" },
        options: { composed: true },
      } }]);
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
        <section mix={events.host()}>
          <events.on.name.output
            data-testid="name"
            child={(event) => event?.type ?? "idle"}
          />
          <events.on.length.output
            data-testid="length"
            child={(event) => event?.type ?? "idle"}
          />
          <events.on.bind.output
            data-testid="bind"
            child={(event) => event?.type ?? "idle"}
          />
          <events.on.toString.output
            data-testid="toString"
            child={(event) => event?.type ?? "idle"}
          />
        </section>
      );
    }

    let result = render(<CollidingEventNames />);
    t.after(() => result.cleanup());
    let section = result.$("section") as HTMLElement;

    await result.act(async () => {
      section.dispatchEvent(
        events(["name", "length", "bind", "toString"]),
      );
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
        <section mix={events.host()}>
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
          <events.on.submitted.form
            data-testid="form"
            class={(event) => event ? "pending" : ""}
            aria-busy={(event) => Boolean(event)}
            mix={events.on("submitted", ({ currentTarget }) => {
              currentTarget.dataset.committed = String(
                currentTarget.classList.contains("pending"),
              );
            })}
            child={(event) => (
              <output>{event?.detail.id ?? "idle"}</output>
            )}
          />
        </section>
      );
    }

    let result = render(<Checkout />);
    t.after(() => result.cleanup());
    let form = result.$('[data-testid="form"]') as HTMLFormElement;

    assert.equal(form.className, "");
    assert.equal(form.textContent, "idle");

    await result.act(() =>
      (result.$('[data-testid="submit"]') as HTMLButtonElement).click()
    );
    await settleEffects();

    assert.equal(result.$('[data-testid="form"]'), form);
    assert.equal(form.className, "pending");
    assert.equal(form.getAttribute("aria-busy"), "true");
    assert.equal(form.textContent, "order-1");
    assert.equal(form.dataset.committed, "true");
  });

  it("commits the source projection before downstream projections", async (t) => {
    let events = createEvents();

    function Form() {
      return () => (
        <events.form
          data-testid="source"
          data-action={(event) => event?.type}
          mix={[
            events.host(),
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
    let outcomes = events.on(["submitted", "paid"]);

    function Orders() {
      return () => (
        <section mix={events.host()}>
          <button
            data-testid="update"
            mix={on("click", ({ currentTarget }) => {
              currentTarget.dispatchEvent(
                events("submitted", { id: "first" }, { key: "first" }),
              );
            })}
          />
          {["first", "second"].map((id) => (
            <outcomes.output
              id={id}
              data-testid={id}
              child={(event) => event?.detail?.id ?? "idle"}
              mix={events.on("*", ({ currentTarget, type }) => {
                currentTarget.dataset.effect = type;
              })}
            />
          ))}
          <events.output
            data-testid="all"
            child={(event) => event?.type ?? "idle"}
          />
        </section>
      );
    }

    let result = render(<Orders />);
    t.after(() => result.cleanup());

    await result.act(() =>
      (result.$('[data-testid="update"]') as HTMLButtonElement).click()
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
        events([
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
        ], { composed: true }),
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
                currentTarget.dispatchEvent(
                  events("paid", { bubbles: false }),
                );
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
          <section mix={events.host()}>
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
      (result.$('[data-testid="unhosted-source"]') as HTMLButtonElement).click()
    );
    assert.equal(
      result.$('[data-testid="unhosted-listener"]')?.textContent,
      "",
    );

    await result.act(() =>
      (result.$('[data-testid="hosted-source"]') as HTMLButtonElement).click()
    );
    assert.equal(
      result.$('[data-testid="hosted-listener"]')?.textContent,
      "received",
    );

    foreignEventReachedParent = false;
    (result.$('[data-testid="hosted-source"]') as HTMLButtonElement)
      .dispatchEvent(new CustomEvent("paid", { bubbles: true }));
    assert.equal(foreignEventReachedParent, true);
  });

  it("contains non-composed events and lets composed events cross nested hosts", async (t) => {
    let events = createEvents();

    function NestedHosts() {
      return () => (
        <section
          mix={[
            events.host(),
            events.on("submitted", ({ currentTarget, detail }) => {
              currentTarget.dataset.latest = detail.id;
            }),
          ]}
        >
          <form mix={events.host()}>
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
                    "submitted",
                    { id: "composed" },
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
      (result.$('[data-testid="local"]') as HTMLButtonElement).click()
    );
    assert.equal(root.dataset.latest, undefined);

    await result.act(() =>
      (result.$('[data-testid="composed"]') as HTMLButtonElement).click()
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
        <section mix={events.host()}>
          <button
            data-testid="dispatch"
            mix={ref((button) => {
              dispatchTarget = button;
            })}
          />
          <events.output
            data-testid="projection"
            child={(event) =>
              event ? `${event.type}:${++projectionUpdates}` : "idle:0"}
            mix={events.on("*", async ({ type, currentTarget }) => {
              await Promise.resolve();
              effects.push(`${type}:${currentTarget.textContent}`);
            })}
          />
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
      ])
    );

    assert.equal(
      result.$('[data-testid="projection"]')?.textContent,
      "paid:1",
    );
    assert.deepEqual(effects, [
      "submitted:paid:1",
      "paid:paid:1",
    ]);
  });

  it("observes all descriptor events on explicit and default hosts", async () => {
    let explicitTarget = new EventTarget();
    let defaultTarget = new EventTarget();
    let explicitEvents = createEvents();
    let otherEvents = createEvents();
    let hostedEvents = createEvents({ host: defaultTarget });
    let controller = new AbortController();
    let calls: string[] = [];

    explicitEvents.observe(explicitTarget, (event) => {
      assert.equal(event.currentTarget, explicitTarget);
      calls.push(`all:${event.type}`);
    }, { signal: controller.signal });

    hostedEvents.observe(async (event) => {
      assert.equal(event.currentTarget, defaultTarget);
      await Promise.resolve();
      calls.push(`hosted:${event.type}`);
    });
    otherEvents.observe(explicitTarget, () => {
      calls.push("wrong-descriptor");
    });

    explicitTarget.dispatchEvent(
      explicitEvents("submitted", { id: "direct" }),
    );
    explicitTarget.dispatchEvent(explicitEvents("paid"));
    await hostedEvents.dispatch(defaultTarget, "paid");
    assert.deepEqual(calls, [
      "all:submitted",
      "all:paid",
      "hosted:paid",
    ]);

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

    assert.deepEqual(nativeCalls, [
      "submitted:batch",
      "paid",
      "paid",
      "paid",
    ]);
  });

  it("catches a mount-time event after listener setup", async (t) => {
    let events = createEvents();

    function MountedInput() {
      return () => (
        <input
          data-testid="input"
          mix={[
            events.host(),
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

  it("indexes subscriptions by phase, type, and routing id", async () => {
    let runtime = new CustomEventsRuntime();
    let host = document.createElement("section");
    let origin = document.createElement("button");
    host.append(origin);
    let unregisterHost = runtime.registerHost(host);
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
      let cleanup = phase === "effect"
        ? runtime.subscribeEffect(subscription)
        : runtime.subscribeProjection(subscription);
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
      return runtime.createProductEvent("updated", null, init, [{
        type: "updated",
        detail: null,
        init,
        ...(key === undefined ? {} : { key }),
      }]);
    }

    await runtime.dispatch(origin, event("first"));
    assertCalls(
      "broad:updated",
      "exact:updated",
      "wildcard:updated",
      "effect:updated",
    );

    calls = [];
    await runtime.dispatch(origin, event("second"));
    assertCalls("broad:updated", "other-key:updated");

    calls = [];
    await runtime.dispatch(origin, event());
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
    await runtime.dispatch(origin, event("first"));
    assertCalls("wildcard:updated", "effect:updated");

    for (let cleanup of cleanups) cleanup();
    unregisterHost();
  });

  it("derives host containment independently of registration order", () => {
    let runtime = new CustomEventsRuntime();
    let parent = document.createElement("main");
    let host = document.createElement("section");
    parent.append(host);
    let reachedParent = false;
    parent.addEventListener("updated", () => {
      reachedParent = true;
    });

    let unsubscribe = runtime.subscribeProjection({
      element: host,
      eventTypes: new Set(["updated"]),
      notify() {},
    });
    let unregisterHost = runtime.registerHost(host);
    let init = { bubbles: true, cancelable: false };
    host.dispatchEvent(
      runtime.createProductEvent("updated", null, init, [{
        type: "updated",
        detail: null,
        init,
      }]),
    );

    assert.equal(reachedParent, false);
    unregisterHost();
    unsubscribe();
  });
});
