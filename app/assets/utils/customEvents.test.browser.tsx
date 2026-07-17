import * as assert from "remix/assert";
import { describe, it } from "remix/test";
import { on, TypedEventTarget, type Handle } from "remix/ui";
import { render } from "remix/ui/test";
import { CustomEvents, __customEventsTest } from "./customEvents.tsx";

type CheckoutDetails = {
  submitted: { id: string };
  paid: null;
};

class CheckoutEvents extends CustomEvents<CheckoutDetails> {}

describe("CustomEvents", () => {
  it("creates descriptor-owned types for Remix on() listeners", async (t) => {
    let checkoutEvents = new CheckoutEvents();

    function CheckoutButton(handle: Handle) {
      return () => (
        <button
          type="button"
          data-testid="checkout-button"
          mix={[
            checkoutEvents.listen(),
            on(checkoutEvents.types.submitted, ({
              currentTarget,
              detail,
              target,
            }) => {
              currentTarget.dataset.submittedId = detail.id;
              currentTarget.dataset.currentTargetIsButton = String(
                currentTarget.dataset.testid === "checkout-button",
              );
              currentTarget.dataset.eventTargetIsButton = String(
                target === currentTarget,
              );
            }),
            on(checkoutEvents.types.change, ({ currentTarget, target }) => {
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

  it("forwards sibling DOM events through listen() while preserving normal on()", async (t) => {
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
            mix={[
              checkoutEvents.listen(),
              on(checkoutEvents.types.change, ({ currentTarget, detail }) => {
                if (Array.isArray(detail.type)) return;
                currentTarget.dataset.eventType = detail.type;
                currentTarget.textContent = String(
                  detail.details.submitted?.id,
                );
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

  it("renders from initial and later custom events without mirrored component state", async (t) => {
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
          <checkoutEvents.submitted
            initial={checkoutEvents.submitted({ id: "initial-order" })}
            render={({ detail }) => (
              <output data-testid="checkout-summary">{detail.id}</output>
            )}
          />
          <checkoutEvents.change
            initial={checkoutEvents.submitted({ id: "initial-order" })}
            render={({ detail }) => {
              let text =
                !Array.isArray(detail.type) && detail.type === "submitted"
                  ? detail.detail.id
                  : "many";
              return (
                <output data-testid="checkout-change-summary">
                  {text}
                </output>
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

  it("uses host boundaries for isolated rows and composed events for escape", async (t) => {
    let checkoutEvents = new CheckoutEvents();

    function CheckoutRows(handle: Handle) {
      return () => (
        <section
          data-testid="checkout-root"
          mix={[
            checkoutEvents.listen(),
            on(checkoutEvents.types.change, ({ currentTarget, detail }) => {
              if (Array.isArray(detail.type)) return;
              currentTarget.dataset.latestOrder =
                detail.details.submitted?.id;
            }),
          ]}
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

    let root = result.$(
      '[data-testid="checkout-root"]',
    ) as HTMLElement;
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

  it("stores latest change detail and aggregate event details on the host", async (t) => {
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

    let latest = checkoutEvents.getHost(host).latest;
    assert.deepEqual(latest?.event.type, ["submitted", "paid"]);
    assert.equal(latest?.events.submitted?.id, "aggregate-order");
    assert.equal(latest?.events.paid, null);
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
            mix={[
              checkoutEvents.listen(),
              on(checkoutEvents.types.submitted, ({
                currentTarget,
                detail,
              }) => {
                currentTarget.textContent = detail.id;
              }),
            ]}
          />
          <output
            data-testid="paid-listener"
            mix={[
              checkoutEvents.listen(),
              on(checkoutEvents.types.paid, ({ currentTarget, detail }) => {
                currentTarget.textContent = String(detail);
              }),
            ]}
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
            checkoutEvents.listen(),
            on(checkoutEvents.types.change, ({ currentTarget }) => {
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

    let button = result.$(
      '[data-testid="fake-checkout"]',
    ) as HTMLButtonElement;
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
          <terminal.events.submitted
            target={terminal}
            render={({ detail }) => (
              <output data-testid="terminal-summary">{detail.id}</output>
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
      terminal.events.getHost(terminal).latest?.events.submitted?.id,
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
            mix={[
              checkoutEvents.listen(),
              on(checkoutEvents.types.change, ({ currentTarget, detail }) => {
                if (Array.isArray(detail.type)) return;
                currentTarget.textContent = detail.details.submitted?.id ?? "";
              }),
            ]}
          />
          <output
            data-testid="paid-status"
            mix={[
              checkoutEvents.listen(),
              on(checkoutEvents.types.paid, ({ currentTarget, detail }) => {
                currentTarget.textContent = String(detail);
              }),
            ]}
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
      checkoutEvents.getHost(submitButton).latest?.events.submitted?.id,
      "first-order",
    );
    assert.equal(__customEventsTest.hasWindowListener(submittedName), true);
    assert.equal(__customEventsTest.hasWindowListener(changeName), true);

    assert.equal(__customEventsTest.expireWindowListener(submittedName), true);

    submitButton.dataset.orderId = "stale-order";
    await result.act(() => submitButton.click());

    assert.equal(status.textContent, "first-order");
    assert.equal(
      checkoutEvents.getHost(submitButton).latest?.events.submitted?.id,
      "first-order",
    );
    assert.equal(__customEventsTest.hasWindowListener(submittedName), false);

    submitButton.dataset.orderId = "recreated-order";
    await result.act(() => submitButton.click());

    assert.equal(status.textContent, "recreated-order");
    assert.equal(
      checkoutEvents.getHost(submitButton).latest?.events.submitted?.id,
      "recreated-order",
    );
    assert.equal(__customEventsTest.hasWindowListener(submittedName), true);

    assert.equal(__customEventsTest.expireWindowListener(changeName), true);

    patchButton.dataset.orderId = "stale-patch-order";
    await result.act(() => patchButton.click());

    assert.equal(paidStatus.textContent, "");
    assert.equal(
      checkoutEvents.getHost(patchButton).latest?.events.submitted?.id,
      "recreated-order",
    );
    assert.equal(__customEventsTest.hasWindowListener(changeName), false);

    patchButton.dataset.orderId = "recreated-patch-order";
    await result.act(() => patchButton.click());

    assert.equal(paidStatus.textContent, "null");
    assert.equal(
      checkoutEvents.getHost(patchButton).latest?.events.submitted?.id,
      "recreated-patch-order",
    );
    assert.equal(
      checkoutEvents.getHost(patchButton).latest?.events.paid,
      null,
    );
    assert.equal(__customEventsTest.hasWindowListener(changeName), true);
  });
});
