import * as assert from "remix/assert";
import { describe, it } from "remix/test";
import { on, ref, TypedEventTarget, type Handle } from "remix/ui";
import { render } from "remix/ui/test";
import { CustomEvents, __customEventsTest } from "./customEvents.tsx";

type CheckoutDetails = {
  submitted: { id: string };
  paid: null;
};

class CheckoutEvents extends CustomEvents<CheckoutDetails> {}

class PanelEvents extends CustomEvents<
  "listUpdated" | "editorUpdated"
> {}

describe("CustomEvents", () => {
  it("accepts a string union for null-detail event signals", async (t) => {
    let events = new PanelEvents();

    if (false) {
      // @ts-expect-error - null-detail batch names must be unique.
      events.create(["listUpdated", "listUpdated"]);
      // @ts-expect-error - product events are created through create(...).
      events.listUpdated();
    }

    assert.throws(
      () => events.create(["listUpdated", "listUpdated"] as never),
      /duplicate event names/,
    );

    function Panel() {
      return () => (
        <section mix={events.host()}>
          <button
            type="button"
            mix={on("click", ({ currentTarget }) => {
              currentTarget.dispatchEvent(
                events.create(["listUpdated", "editorUpdated"]),
              );
            })}
          >
            Refresh
          </button>
          <events.on.editorUpdated
            render={(event) => (
              <output data-testid="editor-status">
                {event ? "Updated" : "Idle"}
              </output>
            )}
          />
        </section>
      );
    }

    let result = render(<Panel />);
    t.after(() => result.cleanup());

    let button = result.$("button") as HTMLButtonElement;
    await result.act(() => button.click());

    let status = result.$('[data-testid="editor-status"]')!;
    assert.equal(status.textContent, "Updated");
  });

  it("listens to same-element events through descriptor-owned on()", async (t) => {
    let events = new CheckoutEvents();

    function CheckoutButton(handle: Handle) {
      return () => (
        <button
          type="button"
          data-testid="checkout-button"
          mix={[
            events.on(
              "submitted",
              ({ currentTarget, detail, target }) => {
                currentTarget.dataset.submittedId = detail.id;
                currentTarget.dataset.currentTargetIsButton = String(
                  currentTarget.dataset.testid === "checkout-button",
                );
                currentTarget.dataset.eventTargetIsButton = String(
                  target === currentTarget,
                );
              },
            ),
            events.on("change", ({ currentTarget, target }) => {
              currentTarget.dataset.changeTargetIsButton = String(
                target === currentTarget,
              );
            }),
            on("click", ({ currentTarget }) => {
              currentTarget.dispatchEvent(
                events.create("submitted", { id: "button-order" }),
              );
            }),
          ]}
        >
          Checkout
        </button>
      );
    }

    let result = render(<CheckoutButton />);
    t.after(() => result.cleanup());

    let button = result.$(
      '[data-testid="checkout-button"]',
    ) as HTMLButtonElement;
    await result.act(() => button.click());

    assert.equal(button.dataset.submittedId, "button-order");
    assert.equal(button.dataset.currentTargetIsButton, "true");
    assert.equal(button.dataset.eventTargetIsButton, "true");
    assert.equal(button.dataset.changeTargetIsButton, "true");
  });

  it("forwards sibling DOM events through descriptor-owned on()", async (t) => {
    let events = new CheckoutEvents();

    function CheckoutPanel(handle: Handle) {
      return () => (
        <section>
          <button
            type="button"
            data-testid="submit-checkout"
            mix={on("click", ({ currentTarget }) => {
              currentTarget.dispatchEvent(
                events.create("submitted", { id: "summary-order" }),
              );
            })}
          >
            Submit
          </button>
          <output
            data-testid="checkout-status"
            mix={events.on("change", ({ currentTarget, detail }) => {
              if (detail.event?.type !== "submitted") {
                return;
              }
              currentTarget.dataset.eventType = detail.event.type;
              currentTarget.textContent = String(detail.event.detail.id);
            })}
          />
        </section>
      );
    }

    let result = render(<CheckoutPanel />);
    t.after(() => result.cleanup());

    let button = result.$(
      '[data-testid="submit-checkout"]',
    ) as HTMLButtonElement;
    let status = result.$(
      '[data-testid="checkout-status"]',
    ) as HTMLOutputElement;

    await result.act(() => button.click());

    assert.equal(status.dataset.eventType, "submitted");
    assert.equal(status.textContent, "summary-order");
  });

  it("listens with descriptor-owned on() without naming the generated event", async (t) => {
    let events = new CheckoutEvents();

    function CheckoutPanel(handle: Handle) {
      return () => (
        <section>
          <button
            type="button"
            data-testid="submit-checkout"
            mix={on("click", ({ currentTarget }) => {
              currentTarget.dispatchEvent(
                events.create("submitted", { id: "shortcut-order" }),
              );
            })}
          >
            Submit
          </button>
          <output
            data-testid="checkout-status"
            mix={[
              events.on("submitted", ({ currentTarget, detail }) => {
                currentTarget.textContent = detail.id;
                currentTarget.dataset.hostTag =
                  currentTarget.tagName.toLowerCase();
              }),
              events.on("paid", ({ currentTarget, detail }) => {
                currentTarget.dataset.paidDetail = String(detail);
              }),
            ]}
          />
        </section>
      );
    }

    let result = render(<CheckoutPanel />);
    t.after(() => result.cleanup());

    let button = result.$(
      '[data-testid="submit-checkout"]',
    ) as HTMLButtonElement;
    let status = result.$(
      '[data-testid="checkout-status"]',
    ) as HTMLOutputElement;

    await result.act(() => button.click());

    assert.equal(status.textContent, "shortcut-order");
    assert.equal(status.dataset.hostTag, "output");
    assert.equal(status.dataset.paidDetail, undefined);
  });

  it("catches same-element events dispatched from a later ref on mount", async (t) => {
    let events = new CheckoutEvents();

    function CheckoutSearch(handle: Handle) {
      return () => (
        <input
          data-testid="checkout-search"
          mix={[
            on("input", ({ currentTarget }) => {
              currentTarget.dispatchEvent(events.create("paid"));
            }),
            events.on("change", ({ currentTarget, detail }) => {
              if (!detail.event) return;
              currentTarget.dataset.latestEvent = detail.event.type;
            }),
            ref((input) => input.dispatchEvent(new InputEvent("input"))),
          ]}
        />
      );
    }

    let result = render(<CheckoutSearch />);
    t.after(() => result.cleanup());

    let input = result.$('[data-testid="checkout-search"]') as HTMLInputElement;

    await result.act(() => Promise.resolve());

    assert.equal(input.dataset.latestEvent, "paid");
  });

  it("renders from a default event and later custom events without mirrored component state", async (t) => {
    let events = new CheckoutEvents();
    let initialSubmittedEvent = events.create("submitted", {
      id: "initial-order",
    });
    let initialChangeEvent = events.create({
      submitted: { id: "initial-order" },
    });

    function CheckoutSummary(handle: Handle) {
      return () => (
        <section>
          <button
            type="button"
            data-testid="submit-checkout"
            mix={on("click", ({ currentTarget }) => {
              currentTarget.dispatchEvent(
                events.create("submitted", { id: "rendered-order" }),
              );
            })}
          >
            Submit
          </button>
          <events.on.submitted
            render={({ detail } = initialSubmittedEvent) => (
              <output data-testid="checkout-summary">
                {detail.id}
              </output>
            )}
          />
          <events.on.change
            render={({ detail } = initialChangeEvent) => {
              let text =
                detail.event?.type === "submitted"
                  ? detail.event.detail.id
                  : "many";
              return (
                <output data-testid="checkout-change-summary">{text}</output>
              );
            }}
          />
        </section>
      );
    }

    let result = render(<CheckoutSummary />);
    t.after(() => result.cleanup());

    let summary = result.$(
      '[data-testid="checkout-summary"]',
    ) as HTMLOutputElement;
    let changeSummary = result.$(
      '[data-testid="checkout-change-summary"]',
    ) as HTMLOutputElement;
    let button = result.$(
      '[data-testid="submit-checkout"]',
    ) as HTMLButtonElement;

    assert.equal(summary.textContent, "initial-order");
    assert.equal(changeSummary.textContent, "initial-order");

    await result.act(() => button.click());

    assert.equal(summary.textContent, "rendered-order");
    assert.equal(changeSummary.textContent, "rendered-order");
  });

  it("runs event-component-scoped listeners after the event render commits", async (t) => {
    let events = new CheckoutEvents();

    function CheckoutStatus(handle: Handle) {
      return () => (
        <section>
          <button
            type="button"
            data-testid="submit-checkout"
            mix={on("click", ({ currentTarget }) => {
              currentTarget.dispatchEvent(
                events.create("submitted", { id: "pending-order" }),
              );
            })}
          >
            Submit
          </button>
          <button
            type="button"
            data-testid="pay-checkout"
            mix={on("click", ({ currentTarget }) => {
              currentTarget.dispatchEvent(events.create("paid"));
            })}
          >
            Pay
          </button>
          <events.on.change
            render={(event) => (
              <input
                data-testid="checkout-input"
                disabled={event?.detail.event?.type === "submitted"}
                mix={events.on("change", ({ currentTarget, detail }) => {
                  if (detail.event?.type !== "paid") return;
                  currentTarget.dataset.disabledWhenPaid = String(
                    currentTarget.disabled,
                  );
                  currentTarget.dataset.paidCalls = String(
                    Number(currentTarget.dataset.paidCalls ?? 0) + 1,
                  );
                })}
              />
            )}
          />
        </section>
      );
    }

    let result = render(<CheckoutStatus />);
    t.after(() => result.cleanup());

    let submit = result.$(
      '[data-testid="submit-checkout"]',
    ) as HTMLButtonElement;
    let pay = result.$('[data-testid="pay-checkout"]') as HTMLButtonElement;

    await result.act(() => submit.click());

    let pendingInput = result.$(
      '[data-testid="checkout-input"]',
    ) as HTMLInputElement;
    assert.equal(pendingInput.disabled, true);

    await result.act(() => pay.click());

    let paidInput = result.$(
      '[data-testid="checkout-input"]',
    ) as HTMLInputElement;
    assert.equal(paidInput.disabled, false);
    assert.equal(paidInput.dataset.disabledWhenPaid, "false");
    assert.equal(paidInput.dataset.paidCalls, "1");
  });

  it("defers sibling events even when they are dispatched before the render event", async (t) => {
    type GameDetails = {
      turn: { locked: boolean };
      focus: { cellId: number };
    };
    class GameEvents extends CustomEvents<GameDetails> {}
    let events = new GameEvents();
    let initialTurnEvent = events.create("turn", { locked: true });

    function GameBoard(handle: Handle) {
      return () => (
        <section>
          <button
            type="button"
            data-testid="reset-game"
            mix={on("click", ({ currentTarget }) => {
              currentTarget.dispatchEvent(
                events.create({
                  focus: { cellId: 0 },
                  turn: { locked: false },
                }),
              );
            })}
          >
            Reset
          </button>
          <events.on.turn
            render={({ detail } = initialTurnEvent) => (
              <button
                type="button"
                data-testid="game-cell"
                disabled={detail.locked}
                mix={events.on("focus", ({ currentTarget, detail }) => {
                  if (detail.cellId !== 0) return;
                  currentTarget.dataset.disabledWhenFocused = String(
                    currentTarget.disabled,
                  );
                  currentTarget.dataset.focusCalls = String(
                    Number(currentTarget.dataset.focusCalls ?? 0) + 1,
                  );
                })}
              >
                Cell
              </button>
            )}
          />
        </section>
      );
    }

    let result = render(<GameBoard />);
    t.after(() => result.cleanup());

    let reset = result.$('[data-testid="reset-game"]') as HTMLButtonElement;
    let initialCell = result.$('[data-testid="game-cell"]') as HTMLButtonElement;
    assert.equal(initialCell.disabled, true);

    await result.act(() => reset.click());

    let updatedCell = result.$('[data-testid="game-cell"]') as HTMLButtonElement;
    assert.equal(updatedCell.disabled, false);
    assert.equal(updatedCell.dataset.disabledWhenFocused, "false");
    assert.equal(updatedCell.dataset.focusCalls, "1");
  });

  it("keeps event-component-scoped listeners immediate for unrelated updates", async (t) => {
    type GameDetails = {
      turn: { locked: boolean };
      focus: { cellId: number };
    };
    class GameEvents extends CustomEvents<GameDetails> {}
    let events = new GameEvents();
    let initialTurnEvent = events.create("turn", { locked: true });

    function GameBoard(handle: Handle) {
      return () => (
        <section>
          <button
            type="button"
            data-testid="focus-game"
            mix={on("click", ({ currentTarget }) => {
              currentTarget.dispatchEvent(events.create("focus", { cellId: 0 }));
            })}
          >
            Focus
          </button>
          <events.on.turn
            render={({ detail } = initialTurnEvent) => (
              <button
                type="button"
                data-testid="game-cell"
                disabled={detail.locked}
                mix={events.on("focus", ({ currentTarget, detail }) => {
                  if (detail.cellId !== 0) return;
                  currentTarget.dataset.disabledWhenFocused = String(
                    currentTarget.disabled,
                  );
                  currentTarget.dataset.focusCalls = String(
                    Number(currentTarget.dataset.focusCalls ?? 0) + 1,
                  );
                })}
              >
                Cell
              </button>
            )}
          />
        </section>
      );
    }

    let result = render(<GameBoard />);
    t.after(() => result.cleanup());

    let focus = result.$('[data-testid="focus-game"]') as HTMLButtonElement;
    let cell = result.$('[data-testid="game-cell"]') as HTMLButtonElement;
    assert.equal(cell.disabled, true);

    await result.act(() => focus.click());

    assert.equal(cell.dataset.disabledWhenFocused, "true");
    assert.equal(cell.dataset.focusCalls, "1");
  });

  it("does not run stale event-component-scoped listeners for replaced nodes", async (t) => {
    let events = new CheckoutEvents();
    let initialChangeEvent = events.create({
      submitted: { id: "pending-order" },
    });

    function CheckoutStatus(handle: Handle) {
      return () => (
        <section>
          <button
            type="button"
            data-testid="pay-checkout"
            mix={on("click", ({ currentTarget }) => {
              currentTarget.dispatchEvent(events.create("paid"));
            })}
          >
            Pay
          </button>
          <events.on.change
            render={({ detail } = initialChangeEvent) =>
              detail.event?.type === "paid" ? (
                <output data-testid="paid-output">Paid</output>
              ) : (
                <input
                  data-testid="stale-checkout-input"
                  mix={events.on("change", ({ currentTarget, detail }) => {
                    if (detail.event?.type === "paid") {
                      currentTarget.dataset.stalePaidCall = "true";
                    }
                  })}
                />
              )
            }
          />
        </section>
      );
    }

    let result = render(<CheckoutStatus />);
    t.after(() => result.cleanup());

    let staleInput = result.$(
      '[data-testid="stale-checkout-input"]',
    ) as HTMLInputElement;
    let pay = result.$('[data-testid="pay-checkout"]') as HTMLButtonElement;

    await result.act(() => pay.click());

    assert.equal(staleInput.dataset.stalePaidCall, undefined);
    assert.ok(result.$('[data-testid="paid-output"]'));
  });

  it("does not fire event-component-scoped listeners for a default event", async (t) => {
    let events = new CheckoutEvents();
    let initialSubmittedEvent = events.create("submitted", { id: "initial-order" });

    function CheckoutStatus(handle: Handle) {
      return () => (
        <events.on.submitted
          render={({ detail } = initialSubmittedEvent) => (
            <input
              data-testid="initial-checkout-input"
              value={detail.id}
              mix={events.on("submitted", ({ currentTarget }) => {
                currentTarget.dataset.initialListenerCall = "true";
              })}
            />
          )}
        />
      );
    }

    let result = render(<CheckoutStatus />);
    t.after(() => result.cleanup());

    let input = result.$(
      '[data-testid="initial-checkout-input"]',
    ) as HTMLInputElement;
    assert.equal(input.value, "initial-order");
    assert.equal(input.dataset.initialListenerCall, undefined);
  });

  it("renders with an undefined event before the first matching event", async (t) => {
    let events = new CheckoutEvents();

    function CheckoutSummary(handle: Handle) {
      return () => (
        <section>
          <button
            type="button"
            data-testid="submit-checkout"
            mix={on("click", ({ currentTarget }) => {
              currentTarget.dispatchEvent(
                events.create("submitted", { id: "first-order" }),
              );
            })}
          >
            Submit
          </button>
          <events.on.submitted
            render={(event) => (
              <output data-testid="checkout-summary">
                {event ? event.detail.id : "No checkout yet"}
              </output>
            )}
          />
        </section>
      );
    }

    let result = render(<CheckoutSummary />);
    t.after(() => result.cleanup());

    let summary = result.$(
      '[data-testid="checkout-summary"]',
    ) as HTMLOutputElement;
    let button = result.$(
      '[data-testid="submit-checkout"]',
    ) as HTMLButtonElement;

    assert.equal(summary.textContent, "No checkout yet");

    await result.act(() => button.click());

    assert.equal(summary.textContent, "first-order");
  });

  it("uses a default event with a constructor host option", async (t) => {
    let terminal = new EventTarget();
    let events = new CheckoutEvents({
      host: terminal,
    });
    let initialEvent = events.create("submitted", { id: "initial-order" });

    function CheckoutTerminalSummary(handle: Handle) {
      return () => (
        <>
          <button
            type="button"
            data-testid="terminal-submit"
            mix={on("click", () => {
              terminal.dispatchEvent(
                events.create("submitted", { id: "submitted-order" }),
              );
            })}
          >
            Submit
          </button>
          <events.on.submitted
            render={(event = initialEvent) => (
              <output data-testid="terminal-summary">
                {event?.detail.id ?? "idle"}
              </output>
            )}
          />
        </>
      );
    }

    let result = render(<CheckoutTerminalSummary />);
    t.after(() => result.cleanup());

    let summary = result.$(
      '[data-testid="terminal-summary"]',
    ) as HTMLOutputElement;
    let button = result.$(
      '[data-testid="terminal-submit"]',
    ) as HTMLButtonElement;

    assert.equal(summary.textContent, "initial-order");

    await result.act(() => button.click());

    assert.equal(summary.textContent, "submitted-order");
  });

  it("uses host boundaries for isolated rows and composed events for escape", async (t) => {
    let events = new CheckoutEvents();

    function CheckoutRows(handle: Handle) {
      return () => (
        <section
          data-testid="checkout-root"
          mix={events.on("change", ({ currentTarget, detail }) => {
            if (detail.event?.type !== "submitted") {
              return;
            }
            currentTarget.dataset.latestOrder = detail.event.detail.id;
          })}
        >
          <form data-testid="checkout-row" mix={events.host()}>
            <button
              type="button"
              data-testid="local-submit"
              mix={on("click", ({ currentTarget }) => {
                currentTarget.dispatchEvent(
                  events.create("submitted", { id: "local-order" }),
                );
              })}
            >
              Local
            </button>
            <button
              type="button"
              data-testid="composed-submit"
              mix={on("click", ({ currentTarget }) => {
                currentTarget.dispatchEvent(
                  events.create("submitted",
                    { id: "composed-order" },
                    { composed: true },
                  ),
                );
              })}
            >
              Composed
            </button>
          </form>
        </section>
      );
    }

    let result = render(<CheckoutRows />);
    t.after(() => result.cleanup());

    let root = result.$('[data-testid="checkout-root"]') as HTMLElement;
    let localButton = result.$(
      '[data-testid="local-submit"]',
    ) as HTMLButtonElement;
    let composedButton = result.$(
      '[data-testid="composed-submit"]',
    ) as HTMLButtonElement;

    await result.act(() => localButton.click());
    assert.equal(root.dataset.latestOrder, undefined);

    await result.act(() => composedButton.click());
    assert.equal(root.dataset.latestOrder, "composed-order");
  });

  it("lets host listeners project resolved events into a local model", async (t) => {
    let events = new CheckoutEvents();
    let latestChange: CheckoutEvents["map"]["change"]["detail"] | undefined;
    let latestEvents: Partial<CheckoutDetails> = {};
    let submittedId: string | undefined;
    let listenerTarget: Element | undefined;

    function CheckoutHost(handle: Handle) {
      return () => (
        <section
          data-testid="checkout-host"
          mix={events.host({
            change({ detail }) {
              latestChange = detail;
              Object.assign(latestEvents, detail.events ?? {
                [detail.event!.type]: detail.event!.detail,
              });
            },
            submitted({ detail, currentTarget }) {
              submittedId = detail.id;
              listenerTarget = currentTarget;
            },
          })}
        >
          <button
            type="button"
            data-testid="checkout-patch"
            mix={on("click", ({ currentTarget }) => {
              currentTarget.dispatchEvent(
                events.create({
                  submitted: { id: "aggregate-order" },
                  paid: null,
                }),
              );
            })}
          >
            Patch
          </button>
        </section>
      );
    }

    let result = render(<CheckoutHost />);
    t.after(() => result.cleanup());

    let button = result.$(
      '[data-testid="checkout-patch"]',
    ) as HTMLButtonElement;

    await result.act(() => button.click());

    assert.deepEqual(latestChange, {
      event: null,
      events: { submitted: { id: "aggregate-order" }, paid: null },
    });
    assert.equal(latestEvents.submitted?.id, "aggregate-order");
    assert.equal(latestEvents.paid, null);
    assert.equal(submittedId, "aggregate-order");
    assert.equal(listenerTarget, button.parentElement);
  });

  it("resolves granular callbacks from their previous detail and event map", async (t) => {
    type CounterDetails = {
      count: number;
      incrementOffset: number;
    };
    class CounterEvents extends CustomEvents<CounterDetails> {}
    let events = new CounterEvents();

    function Counter(handle: Handle) {
      return () => (
        <section data-testid="counter-host" mix={events.host()}>
          <button
            type="button"
            data-testid="prime-counter"
            mix={on("click", ({ currentTarget }) => {
              currentTarget.dispatchEvent(
                events.create({ count: 0, incrementOffset: 2 }),
              );
            })}
          >
            Prime
          </button>
          <button
            type="button"
            data-testid="increment-counter"
            mix={[
              events.on("count", ({ currentTarget, detail }) => {
                currentTarget.dataset.detailType = typeof detail;
                currentTarget.dataset.count = String(detail);
              }),
              on("click", ({ currentTarget }) => {
                currentTarget.dispatchEvent(
                  events.create("count", (count, { incrementOffset }) => {
                    return (
                      (count ?? 0) +
                      (incrementOffset ?? 1)
                    );
                  }),
                );
              }),
            ]}
          >
            Increment
          </button>
        </section>
      );
    }

    let result = render(<Counter />);
    t.after(() => result.cleanup());

    let button = result.$(
      '[data-testid="increment-counter"]',
    ) as HTMLButtonElement;
    let primeButton = result.$(
      '[data-testid="prime-counter"]',
    ) as HTMLButtonElement;

    await result.act(() => primeButton.click());
    await result.act(() => button.click());

    assert.equal(button.dataset.detailType, "number");
    assert.equal(button.dataset.count, "2");
  });

  it("cancels a resolver dispatch when its callback returns undefined", async (t) => {
    class CounterEvents extends CustomEvents<{ count: number }> {}
    let events = new CounterEvents();

    function Counter(handle: Handle) {
      return () => (
        <section data-testid="counter-host" mix={events.host()}>
          <button
            type="button"
            data-testid="cancel-count"
            mix={[
              events.on("count", ({ currentTarget }) => {
                currentTarget.dataset.countEvent = "received";
              }),
              events.on("change", ({ currentTarget }) => {
                currentTarget.dataset.changeEvent = "received";
              }),
              on("click", ({ currentTarget }) => {
                currentTarget.dispatchEvent(events.create("count", () => undefined));
              }),
            ]}
          >
            Cancel count
          </button>
        </section>
      );
    }

    let result = render(<Counter />);
    t.after(() => result.cleanup());

    let button = result.$('[data-testid="cancel-count"]') as HTMLButtonElement;

    await result.act(() => button.click());

    assert.equal(button.dataset.countEvent, undefined);
    assert.equal(button.dataset.changeEvent, undefined);
  });

  it("keeps callback detail resolution scoped to each host", async (t) => {
    type CounterDetails = {
      count: number;
      incrementOffset: number;
    };
    class CounterEvents extends CustomEvents<CounterDetails> {}
    let events = new CounterEvents();

    function CounterList(handle: Handle) {
      return () => (
        <>
          <section data-testid="slow-host" mix={events.host()}>
            <button
              type="button"
              data-testid="slow-initial"
              mix={ref((button) => {
                button.dispatchEvent(
                  events.create({
                    count: 0,
                    incrementOffset: 2,
                  }),
                );
              })}
            >
              Seed
            </button>
            <button
              type="button"
              data-testid="slow-increment"
              mix={[
                events.on("count", ({ currentTarget, detail }) => {
                  currentTarget.dataset.count = String(detail);
                }),
                on("click", ({ currentTarget }) => {
                  currentTarget.dispatchEvent(
                    events.create("count",
                      (count, { incrementOffset }) =>
                        (count ?? 0) +
                        (incrementOffset ?? 1),
                    ),
                  );
                }),
              ]}
            >
              Increment
            </button>
          </section>
          <section data-testid="fast-host" mix={events.host()}>
            <button
              type="button"
              data-testid="fast-initial"
              mix={ref((button) => {
                button.dispatchEvent(
                  events.create({
                    count: 0,
                    incrementOffset: 5,
                  }),
                );
              })}
            >
              Seed
            </button>
            <button
              type="button"
              data-testid="fast-increment"
              mix={[
                events.on("count", ({ currentTarget, detail }) => {
                  currentTarget.dataset.count = String(detail);
                }),
                on("click", ({ currentTarget }) => {
                  currentTarget.dispatchEvent(
                    events.create("count",
                      (count, { incrementOffset }) =>
                        (count ?? 0) +
                        (incrementOffset ?? 1),
                    ),
                  );
                }),
              ]}
            >
              Increment
            </button>
          </section>
        </>
      );
    }

    let result = render(<CounterList />);
    t.after(() => result.cleanup());
    await result.act(() => Promise.resolve());

    let slowButton = result.$(
      '[data-testid="slow-increment"]',
    ) as HTMLButtonElement;
    let fastButton = result.$(
      '[data-testid="fast-increment"]',
    ) as HTMLButtonElement;

    await result.act(() => slowButton.click());
    await result.act(() => fastButton.click());
    await result.act(() => fastButton.click());

    assert.equal(slowButton.dataset.count, "2");
    assert.equal(fastButton.dataset.count, "10");
  });

  it("resolves batch callbacks before expanding granular events", async (t) => {
    type GameDetails = {
      turn: { nextPlayer: "X" | "O"; moves: number };
      focus: { cellId: number };
    };
    class GameEvents extends CustomEvents<GameDetails> {}
    let events = new GameEvents();

    function GameControls(handle: Handle) {
      return () => (
        <section data-testid="game-host" mix={events.host()}>
          <button
            type="button"
            data-testid="initialize-game"
            mix={on("click", ({ currentTarget }) => {
              currentTarget.dispatchEvent(
                events.create({
                  turn: { nextPlayer: "X", moves: 0 },
                  focus: { cellId: 0 },
                }),
              );
            })}
          >
            Initialize
          </button>
          <button
            type="button"
            data-testid="play-turn"
            mix={on("click", ({ currentTarget }) => {
              currentTarget.dispatchEvent(
                events.create(({ turn }, change, { target }) => {
                  currentTarget.dataset.resolverTargetIsButton = String(
                    target === currentTarget,
                  );
                  return {
                    turn: {
                      nextPlayer: turn!.nextPlayer === "X" ? "O" : "X",
                      moves: turn!.moves + 1,
                    },
                    focus: { cellId: turn!.moves + 1 },
                  };
                }),
              );
            })}
          >
            Play
          </button>
          <output
            data-testid="turn-output"
            mix={events.on("turn", ({ currentTarget, detail }) => {
              currentTarget.textContent = `${detail.nextPlayer}:${detail.moves}`;
            })}
          />
          <output
            data-testid="focus-output"
            mix={events.on("focus", ({ currentTarget, detail }) => {
              currentTarget.textContent = String(detail.cellId);
            })}
          />
        </section>
      );
    }

    let result = render(<GameControls />);
    t.after(() => result.cleanup());

    let button = result.$('[data-testid="play-turn"]') as HTMLButtonElement;
    let initializeButton = result.$(
      '[data-testid="initialize-game"]',
    ) as HTMLButtonElement;
    let turnOutput = result.$(
      '[data-testid="turn-output"]',
    ) as HTMLOutputElement;
    let focusOutput = result.$(
      '[data-testid="focus-output"]',
    ) as HTMLOutputElement;

    await result.act(() => initializeButton.click());
    await result.act(() => button.click());

    assert.equal(turnOutput.textContent, "O:1");
    assert.equal(focusOutput.textContent, "1");
    assert.equal(button.dataset.resolverTargetIsButton, "true");
  });

  it("expands batch change events into single product events", async (t) => {
    let events = new CheckoutEvents();

    function CheckoutBatch(handle: Handle) {
      return () => (
        <section>
          <button
            type="button"
            data-testid="checkout-batch"
            mix={on("click", ({ currentTarget }) => {
              currentTarget.dispatchEvent(
                events.create({
                  submitted: { id: "batched-order" },
                  paid: null,
                }),
              );
            })}
          >
            Batch
          </button>
          <output
            data-testid="submitted-listener"
            mix={events.on("submitted", ({ currentTarget, detail }) => {
              currentTarget.textContent = detail.id;
            })}
          />
          <output
            data-testid="paid-listener"
            mix={events.on("paid", ({ currentTarget, detail }) => {
              currentTarget.textContent = String(detail);
            })}
          />
        </section>
      );
    }

    let result = render(<CheckoutBatch />);
    t.after(() => result.cleanup());

    let button = result.$(
      '[data-testid="checkout-batch"]',
    ) as HTMLButtonElement;
    let submitted = result.$(
      '[data-testid="submitted-listener"]',
    ) as HTMLOutputElement;
    let paid = result.$('[data-testid="paid-listener"]') as HTMLOutputElement;

    await result.act(() => button.click());

    assert.equal(submitted.textContent, "batched-order");
    assert.equal(paid.textContent, "null");
  });

  it("ignores manually created events that reuse descriptor types", async (t) => {
    let events = new CheckoutEvents();

    function CheckoutButton(handle: Handle) {
      return () => (
        <button
          type="button"
          data-testid="fake-checkout"
          mix={[
            events.on("change", ({ currentTarget }) => {
              currentTarget.dataset.changed = "true";
            }),
            on("click", ({ currentTarget }) => {
              currentTarget.dispatchEvent(
                new CustomEvent(events.types.submitted, {
                  bubbles: true,
                  detail: { id: "fake-order" },
                }),
              );
            }),
          ]}
        >
          Fake
        </button>
      );
    }

    let result = render(<CheckoutButton />);
    t.after(() => result.cleanup());

    let button = result.$('[data-testid="fake-checkout"]') as HTMLButtonElement;
    await result.act(() => button.click());

    assert.equal(button.dataset.changed, undefined);
  });

  it("supports TypedEventTarget subclass owners through the same descriptor", async (t) => {
    class TerminalEvents extends CustomEvents<CheckoutDetails> {}

    class CheckoutTerminal extends TypedEventTarget<TerminalEvents["map"]> {
      events = new TerminalEvents({host: this});

      submit() {
        this.dispatchEvent(this.events.create("submitted", { id: "terminal-order" }));
      }
    }

    let terminal = new CheckoutTerminal();

    function TerminalSummary(handle: Handle) {
      return () => (
        <>
          <button
            type="button"
            data-testid="terminal-submit"
            mix={on("click", () => terminal.submit())}
          >
            Submit
          </button>
          <terminal.events.on.submitted
            render={(event) => (
              <output data-testid="terminal-summary">
                {event?.detail.id ?? "idle"}
              </output>
            )}
          />
        </>
      );
    }

    let result = render(<TerminalSummary />);
    t.after(() => result.cleanup());

    let button = result.$(
      '[data-testid="terminal-submit"]',
    ) as HTMLButtonElement;
    await result.act(() => button.click());

    let summary = result.$(
      '[data-testid="terminal-summary"]',
    ) as HTMLOutputElement;
    assert.equal(summary.textContent, "terminal-order");
  });

  it("keeps descriptor event types separate for different instances", () => {
    let firstEvents = new CheckoutEvents();
    let secondEvents = new CheckoutEvents();

    assert.notEqual(
      firstEvents.types.submitted,
      secondEvents.types.submitted,
    );
  });

  it("removes stale window listeners and recreates them on later dispatches", async (t) => {
    let events = new CheckoutEvents();
    let submittedName = events.types.submitted;
    let changeName = events.types.change;

    t.after(() => {
      __customEventsTest.removeWindowListener(submittedName);
      __customEventsTest.removeWindowListener(changeName);
      __customEventsTest.removeWindowListener(events.types.paid);
    });

    assert.equal(__customEventsTest.hasWindowListener(submittedName), false);
    assert.equal(__customEventsTest.hasWindowListener(changeName), false);

    function CheckoutPanel(handle: Handle) {
      return () => (
        <section>
          <button
            type="button"
            data-testid="submit-checkout"
            mix={on("click", ({ currentTarget }) => {
              currentTarget.dispatchEvent(
                events.create("submitted", {
                  id: currentTarget.dataset.orderId!,
                }),
              );
            })}
          >
            Submit
          </button>
          <button
            type="button"
            data-testid="patch-checkout"
            mix={on("click", ({ currentTarget }) => {
              currentTarget.dispatchEvent(
                events.create({
                  submitted: {
                    id: currentTarget.dataset.orderId!,
                  },
                  paid: null,
                }),
              );
            })}
          >
            Patch
          </button>
          <output
            data-testid="checkout-status"
            mix={events.on("change", ({ currentTarget, detail }) => {
              if (detail.event?.type === "submitted") {
                currentTarget.textContent = detail.event.detail.id;
              }
            })}
          />
          <output
            data-testid="paid-status"
            mix={events.on("paid", ({ currentTarget, detail }) => {
              currentTarget.textContent = String(detail);
            })}
          />
        </section>
      );
    }

    let result = render(<CheckoutPanel />);
    t.after(() => result.cleanup());

    let submitButton = result.$(
      '[data-testid="submit-checkout"]',
    ) as HTMLButtonElement;
    let patchButton = result.$(
      '[data-testid="patch-checkout"]',
    ) as HTMLButtonElement;
    let status = result.$(
      '[data-testid="checkout-status"]',
    ) as HTMLOutputElement;
    let paidStatus = result.$(
      '[data-testid="paid-status"]',
    ) as HTMLOutputElement;

    submitButton.dataset.orderId = "first-order";
    await result.act(() => submitButton.click());

    assert.equal(status.textContent, "first-order");
    assert.equal(__customEventsTest.hasWindowListener(submittedName), true);
    assert.equal(__customEventsTest.hasWindowListener(changeName), true);

    assert.equal(__customEventsTest.expireWindowListener(submittedName), true);

    submitButton.dataset.orderId = "stale-order";
    await result.act(() => submitButton.click());

    assert.equal(status.textContent, "first-order");
    assert.equal(__customEventsTest.hasWindowListener(submittedName), false);

    submitButton.dataset.orderId = "recreated-order";
    await result.act(() => submitButton.click());

    assert.equal(status.textContent, "recreated-order");
    assert.equal(__customEventsTest.hasWindowListener(submittedName), true);

    assert.equal(__customEventsTest.expireWindowListener(changeName), true);

    patchButton.dataset.orderId = "stale-patch-order";
    await result.act(() => patchButton.click());

    assert.equal(paidStatus.textContent, "");
    assert.equal(__customEventsTest.hasWindowListener(changeName), false);

    patchButton.dataset.orderId = "recreated-patch-order";
    await result.act(() => patchButton.click());

    assert.equal(paidStatus.textContent, "null");
    assert.equal(__customEventsTest.hasWindowListener(changeName), true);
  });
});
