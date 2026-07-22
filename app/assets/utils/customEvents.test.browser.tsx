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

describe("CustomEvents", () => {
  it("listens to same-element events through descriptor-owned on()", async (t) => {
    let checkoutEvents = new CheckoutEvents();

    function CheckoutButton(handle: Handle) {
      return () => (
        <button
          type="button"
          data-testid="checkout-button"
          mix={[
            checkoutEvents.on(
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
            checkoutEvents.on("change", ({ currentTarget, target }) => {
              currentTarget.dataset.changeTargetIsButton = String(
                target === currentTarget,
              );
            }),
            on("click", ({ currentTarget }) => {
              currentTarget.dispatchEvent(
                checkoutEvents.submitted({ id: "button-order" }),
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
    let checkoutEvents = new CheckoutEvents();

    function CheckoutPanel(handle: Handle) {
      return () => (
        <section>
          <button
            type="button"
            data-testid="submit-checkout"
            mix={on("click", ({ currentTarget }) => {
              currentTarget.dispatchEvent(
                checkoutEvents.submitted({ id: "summary-order" }),
              );
            })}
          >
            Submit
          </button>
          <output
            data-testid="checkout-status"
            mix={checkoutEvents.on("change", ({ currentTarget, detail }) => {
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
    let checkoutEvents = new CheckoutEvents();

    function CheckoutPanel(handle: Handle) {
      return () => (
        <section>
          <button
            type="button"
            data-testid="submit-checkout"
            mix={on("click", ({ currentTarget }) => {
              currentTarget.dispatchEvent(
                checkoutEvents.submitted({ id: "shortcut-order" }),
              );
            })}
          >
            Submit
          </button>
          <output
            data-testid="checkout-status"
            mix={[
              checkoutEvents.on("submitted", ({ currentTarget, detail }) => {
                currentTarget.textContent = detail.id;
                currentTarget.dataset.hostTag =
                  currentTarget.tagName.toLowerCase();
              }),
              checkoutEvents.on("paid", ({ currentTarget, detail }) => {
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
    let checkoutEvents = new CheckoutEvents();

    function CheckoutSearch(handle: Handle) {
      return () => (
        <input
          data-testid="checkout-search"
          mix={[
            on("input", ({ currentTarget }) => {
              currentTarget.dispatchEvent(checkoutEvents.paid());
            }),
            checkoutEvents.on("change", ({ currentTarget, detail }) => {
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

  it("renders from seed and later custom events without mirrored component state", async (t) => {
    let checkoutEvents = new CheckoutEvents();

    function CheckoutSummary(handle: Handle) {
      return () => (
        <section>
          <button
            type="button"
            data-testid="submit-checkout"
            mix={on("click", ({ currentTarget }) => {
              currentTarget.dispatchEvent(
                checkoutEvents.submitted({ id: "rendered-order" }),
              );
            })}
          >
            Submit
          </button>
          <checkoutEvents.on.submitted
            seed={checkoutEvents.submitted({ id: "initial-order" })}
            render={({ detail }) => (
              <output data-testid="checkout-summary">
                {detail.id}
              </output>
            )}
          />
          <checkoutEvents.on.change
            seed={checkoutEvents.submitted({ id: "initial-order" })}
            render={({ detail }) => {
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
    let checkoutEvents = new CheckoutEvents();

    function CheckoutStatus(handle: Handle) {
      return () => (
        <section>
          <button
            type="button"
            data-testid="submit-checkout"
            mix={on("click", ({ currentTarget }) => {
              currentTarget.dispatchEvent(
                checkoutEvents.submitted({ id: "pending-order" }),
              );
            })}
          >
            Submit
          </button>
          <button
            type="button"
            data-testid="pay-checkout"
            mix={on("click", ({ currentTarget }) => {
              currentTarget.dispatchEvent(checkoutEvents.paid());
            })}
          >
            Pay
          </button>
          <checkoutEvents.on.change
            render={(event) => (
              <input
                data-testid="checkout-input"
                disabled={event?.detail.event?.type === "submitted"}
                mix={checkoutEvents.on("change", ({ currentTarget, detail }) => {
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
    let gameEvents = new GameEvents();

    function GameBoard(handle: Handle) {
      return () => (
        <section>
          <button
            type="button"
            data-testid="reset-game"
            mix={on("click", ({ currentTarget }) => {
              currentTarget.dispatchEvent(
                gameEvents.change({
                  focus: { cellId: 0 },
                  turn: { locked: false },
                }),
              );
            })}
          >
            Reset
          </button>
          <gameEvents.on.turn
            seed={gameEvents.turn({ locked: true })}
            render={({ detail }) => (
              <button
                type="button"
                data-testid="game-cell"
                disabled={detail.locked}
                mix={gameEvents.on("focus", ({ currentTarget, detail }) => {
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
    let gameEvents = new GameEvents();

    function GameBoard(handle: Handle) {
      return () => (
        <section>
          <button
            type="button"
            data-testid="focus-game"
            mix={on("click", ({ currentTarget }) => {
              currentTarget.dispatchEvent(gameEvents.focus({ cellId: 0 }));
            })}
          >
            Focus
          </button>
          <gameEvents.on.turn
            seed={gameEvents.turn({ locked: true })}
            render={({ detail }) => (
              <button
                type="button"
                data-testid="game-cell"
                disabled={detail.locked}
                mix={gameEvents.on("focus", ({ currentTarget, detail }) => {
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
    let checkoutEvents = new CheckoutEvents();

    function CheckoutStatus(handle: Handle) {
      return () => (
        <section>
          <button
            type="button"
            data-testid="pay-checkout"
            mix={on("click", ({ currentTarget }) => {
              currentTarget.dispatchEvent(checkoutEvents.paid());
            })}
          >
            Pay
          </button>
          <checkoutEvents.on.change
            seed={checkoutEvents.submitted({ id: "pending-order" })}
            render={({ detail }) =>
              detail.event?.type === "paid" ? (
                <output data-testid="paid-output">Paid</output>
              ) : (
                <input
                  data-testid="stale-checkout-input"
                  mix={checkoutEvents.on("change", ({ currentTarget, detail }) => {
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

  it("does not fire event-component-scoped listeners for render-only seed", async (t) => {
    let checkoutEvents = new CheckoutEvents();

    function CheckoutStatus(handle: Handle) {
      return () => (
        <checkoutEvents.on.submitted
          seed={checkoutEvents.submitted({ id: "seed-order" })}
          render={({ detail }) => (
            <input
              data-testid="seeded-checkout-input"
              value={detail.id}
              mix={checkoutEvents.on("submitted", ({ currentTarget }) => {
                currentTarget.dataset.seedListenerCall = "true";
              })}
            />
          )}
        />
      );
    }

    let result = render(<CheckoutStatus />);
    t.after(() => result.cleanup());

    let input = result.$(
      '[data-testid="seeded-checkout-input"]',
    ) as HTMLInputElement;
    assert.equal(input.value, "seed-order");
    assert.equal(input.dataset.seedListenerCall, undefined);
  });

  it("renders with a null event before the first seed or matching event", async (t) => {
    let checkoutEvents = new CheckoutEvents();

    function CheckoutSummary(handle: Handle) {
      return () => (
        <section>
          <button
            type="button"
            data-testid="submit-checkout"
            mix={on("click", ({ currentTarget }) => {
              currentTarget.dispatchEvent(
                checkoutEvents.submitted({ id: "first-order" }),
              );
            })}
          >
            Submit
          </button>
          <checkoutEvents.on.submitted
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

  it("accepts constructor host option and explicit seed", async (t) => {
    let terminal = new EventTarget();
    let checkoutEvents = new CheckoutEvents({
      host: terminal,
    });
    checkoutEvents.seed(checkoutEvents.submitted({ id: "seeded-order" }));

    assert.equal(
      checkoutEvents.getHost(terminal).latest?.eventMap.submitted?.id,
      "seeded-order",
    );

    function CheckoutTerminalSummary(handle: Handle) {
      return () => (
        <>
          <button
            type="button"
            data-testid="terminal-submit"
            mix={on("click", () => {
              terminal.dispatchEvent(
                checkoutEvents.submitted({ id: "submitted-order" }),
              );
            })}
          >
            Submit
          </button>
          <checkoutEvents.on.submitted
            render={(event) => (
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

    assert.equal(summary.textContent, "seeded-order");

    await result.act(() => button.click());

    assert.equal(summary.textContent, "submitted-order");
  });

  it("uses host boundaries for isolated rows and composed events for escape", async (t) => {
    let checkoutEvents = new CheckoutEvents();

    function CheckoutRows(handle: Handle) {
      return () => (
        <section
          data-testid="checkout-root"
          mix={checkoutEvents.on("change", ({ currentTarget, detail }) => {
            if (detail.event?.type !== "submitted") {
              return;
            }
            currentTarget.dataset.latestOrder = detail.event.detail.id;
          })}
        >
          <form data-testid="checkout-row" mix={checkoutEvents.host()}>
            <button
              type="button"
              data-testid="local-submit"
              mix={on("click", ({ currentTarget }) => {
                currentTarget.dispatchEvent(
                  checkoutEvents.submitted({ id: "local-order" }),
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
                  checkoutEvents.submitted(
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

  it("stores the latest change detail and event map on the host", async (t) => {
    let checkoutEvents = new CheckoutEvents();

    function CheckoutHost(handle: Handle) {
      return () => (
        <section data-testid="checkout-host" mix={checkoutEvents.host()}>
          <button
            type="button"
            data-testid="checkout-patch"
            mix={on("click", ({ currentTarget }) => {
              currentTarget.dispatchEvent(
                checkoutEvents.change({
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

    let host = result.$('[data-testid="checkout-host"]') as HTMLElement;
    let button = result.$(
      '[data-testid="checkout-patch"]',
    ) as HTMLButtonElement;

    await result.act(() => button.click());

    let hostReference = checkoutEvents.getHost(host);
    assert.deepEqual(hostReference.latest?.change, {
      event: null,
      events: { submitted: { id: "aggregate-order" }, paid: null },
    });
    assert.equal(
      hostReference.latest?.eventMap.submitted?.id,
      "aggregate-order",
    );
    assert.equal(hostReference.latest?.eventMap.paid, null);
  });

  it("expands batch change events into single product events", async (t) => {
    let checkoutEvents = new CheckoutEvents();

    function CheckoutBatch(handle: Handle) {
      return () => (
        <section>
          <button
            type="button"
            data-testid="checkout-batch"
            mix={on("click", ({ currentTarget }) => {
              currentTarget.dispatchEvent(
                checkoutEvents.change({
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
            mix={checkoutEvents.on("submitted", ({ currentTarget, detail }) => {
              currentTarget.textContent = detail.id;
            })}
          />
          <output
            data-testid="paid-listener"
            mix={checkoutEvents.on("paid", ({ currentTarget, detail }) => {
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
    let checkoutEvents = new CheckoutEvents();

    function CheckoutButton(handle: Handle) {
      return () => (
        <button
          type="button"
          data-testid="fake-checkout"
          mix={[
            checkoutEvents.on("change", ({ currentTarget }) => {
              currentTarget.dataset.changed = "true";
            }),
            on("click", ({ currentTarget }) => {
              currentTarget.dispatchEvent(
                new CustomEvent(checkoutEvents.types.submitted, {
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
    assert.equal(checkoutEvents.getHost(button).latest, undefined);
  });

  it("supports TypedEventTarget subclass owners through the same descriptor", async (t) => {
    class TerminalEvents extends CustomEvents<CheckoutDetails> {}

    class CheckoutTerminal extends TypedEventTarget<TerminalEvents["map"]> {
      events = new TerminalEvents();

      constructor() {
        super();
        this.events.setHost(this);
      }

      submit() {
        this.dispatchEvent(this.events.submitted({ id: "terminal-order" }));
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
    assert.equal(
      terminal.events.getHost(terminal).latest?.eventMap.submitted?.id,
      "terminal-order",
    );
  });

  it("keeps descriptor event types separate for different instances", () => {
    let firstCheckoutEvents = new CheckoutEvents();
    let secondCheckoutEvents = new CheckoutEvents();

    assert.notEqual(
      firstCheckoutEvents.types.submitted,
      secondCheckoutEvents.types.submitted,
    );
  });

  it("removes stale window listeners and recreates them on later dispatches", async (t) => {
    let checkoutEvents = new CheckoutEvents();
    let submittedName = checkoutEvents.types.submitted;
    let changeName = checkoutEvents.types.change;

    t.after(() => {
      __customEventsTest.removeWindowListener(submittedName);
      __customEventsTest.removeWindowListener(changeName);
      __customEventsTest.removeWindowListener(checkoutEvents.types.paid);
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
                checkoutEvents.submitted({
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
                checkoutEvents.change({
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
            mix={checkoutEvents.on("change", ({ currentTarget, detail }) => {
              if (detail.event?.type === "submitted") {
                currentTarget.textContent = detail.event.detail.id;
              }
            })}
          />
          <output
            data-testid="paid-status"
            mix={checkoutEvents.on("paid", ({ currentTarget, detail }) => {
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
    assert.equal(
      checkoutEvents.getHost(submitButton).latest?.eventMap.submitted?.id,
      "first-order",
    );
    assert.equal(__customEventsTest.hasWindowListener(submittedName), true);
    assert.equal(__customEventsTest.hasWindowListener(changeName), true);

    assert.equal(__customEventsTest.expireWindowListener(submittedName), true);

    submitButton.dataset.orderId = "stale-order";
    await result.act(() => submitButton.click());

    assert.equal(status.textContent, "first-order");
    assert.equal(
      checkoutEvents.getHost(submitButton).latest?.eventMap.submitted?.id,
      "first-order",
    );
    assert.equal(__customEventsTest.hasWindowListener(submittedName), false);

    submitButton.dataset.orderId = "recreated-order";
    await result.act(() => submitButton.click());

    assert.equal(status.textContent, "recreated-order");
    assert.equal(
      checkoutEvents.getHost(submitButton).latest?.eventMap.submitted?.id,
      "recreated-order",
    );
    assert.equal(__customEventsTest.hasWindowListener(submittedName), true);

    assert.equal(__customEventsTest.expireWindowListener(changeName), true);

    patchButton.dataset.orderId = "stale-patch-order";
    await result.act(() => patchButton.click());

    assert.equal(paidStatus.textContent, "");
    assert.equal(
      checkoutEvents.getHost(patchButton).latest?.eventMap.submitted?.id,
      "recreated-order",
    );
    assert.equal(__customEventsTest.hasWindowListener(changeName), false);

    patchButton.dataset.orderId = "recreated-patch-order";
    await result.act(() => patchButton.click());

    assert.equal(paidStatus.textContent, "null");
    assert.equal(
      checkoutEvents.getHost(patchButton).latest?.eventMap.submitted?.id,
      "recreated-patch-order",
    );
    assert.equal(
      checkoutEvents.getHost(patchButton).latest?.eventMap.paid,
      null,
    );
    assert.equal(__customEventsTest.hasWindowListener(changeName), true);
  });
});
