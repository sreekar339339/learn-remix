import * as assert from "remix/assert";
import { describe, it } from "remix/test";
import {
  addEventListeners,
  createMixin,
  on,
  ref,
  type Dispatched,
  type Handle,
  type Props,
  type RemixNode,
  TypedEventTarget,
} from "remix/ui";
import { render } from "remix/ui/test";
import { CustomEvents } from "./index.tsx";

type CheckoutDetails = {
  submitted: { id: string };
  paid: null;
};

class CheckoutEvents extends CustomEvents<CheckoutDetails> {}

class PanelEvents extends CustomEvents<
  "listUpdated" | "editorUpdated"
> {}

class MixedEvents extends CustomEvents<
  "sheetRecalculated" | { edit: string } | "someOtherEvent"
> {}

describe("CustomEvents", () => {
  it("combines detail-less and detailed events in one definition", () => {
    let events = new MixedEvents();

    let recalculated = events("sheetRecalculated");
    let edit = events("edit", "=A0+B0");
    let batch = events(["sheetRecalculated", "someOtherEvent"]);
    let configuredBatch = events([
      "sheetRecalculated",
      {
        edit: {
          detail: "=B0+C0",
          options: { key: "formula-editor" },
        },
      },
    ]);

    assert.equal(recalculated.detail, null);
    assert.equal(edit.detail, "=A0+B0");
    assert.equal(batch.detail, undefined);
    assert.equal(configuredBatch.detail, undefined);

    if (false) {
      // @ts-expect-error - detailed events require their declared detail.
      events("edit");
      // @ts-expect-error - signal-only events do not accept arbitrary detail.
      events("sheetRecalculated", "unexpected");
      // @ts-expect-error - detailed events cannot use the null-detail batch form.
      events(["sheetRecalculated", "edit"]);
      // @ts-expect-error - configured detailed events require detail.
      events([{ edit: {} }]);
      // @ts-expect-error - signal-only configured events accept only null detail.
      events([{ sheetRecalculated: { detail: "unexpected" } }]);
    }
  });

  it("accepts a string union for null-detail event signals", async (t) => {
    let events = new PanelEvents();

    if (false) {
      // @ts-expect-error - literal batch names must be unique.
      events(["listUpdated", "listUpdated"]);
      // @ts-expect-error - `*` is reserved for subscriptions.
      events("*");
    }

    assert.ok(events(["listUpdated", "listUpdated"] as never));

    function Panel() {
      return () => (
        <section mix={events.host()}>
          <button
            type="button"
            mix={on("click", ({ currentTarget }) => {
              currentTarget.dispatchEvent(
                events(["listUpdated", "editorUpdated"]),
              );
            })}
          >
            Refresh
          </button>
          <events.on.editorUpdated.div
            child={(event) => (
              <output
                data-testid="editor-status"
                data-detail={String(event?.detail)}
                data-received={String(event !== undefined)}
              >
                {event === undefined ? "Idle" : "Updated"}
              </output>
            )}
          />
        </section>
      );
    }

    let result = render(<Panel />);
    t.after(() => result.cleanup());

    let button = result.$("button") as HTMLButtonElement;
    let status = result.$('[data-testid="editor-status"]')!;
    assert.equal(status.dataset.detail, "undefined");
    assert.equal(status.dataset.received, "false");

    await result.act(() => button.click());

    assert.equal(status.textContent, "Updated");
    assert.equal(status.dataset.detail, "null");
    assert.equal(status.dataset.received, "true");
  });

  it("renders an event-aware intrinsic element with reactive props and children", async (t) => {
    let events = new CheckoutEvents();

    function CheckoutPanel(handle: Handle) {
      return () => (
        <section mix={events.host()}>
          <button
            type="button"
            data-testid="submit-checkout"
            mix={on("click", ({ currentTarget }) => {
              currentTarget.dispatchEvent(
                events("submitted", { id: "element-order" }),
              );
            })}
          >
            Submit
          </button>
          <events.form
            data-testid="checkout-form"
            class={(event) =>
              event?.type === "submitted" ? "pending" : ""
            }
            aria-busy={(event) =>
              event?.type === "submitted"
            }
            mix={[
              events.on("submitted", ({ currentTarget }) => {
                currentTarget.dataset.postCommitPending = String(
                  currentTarget.classList.contains("pending"),
                );
              }),
              on("submit", (event) => {
                event.preventDefault();
                event.currentTarget.dataset.nativeSubmit = "true";
              }),
            ]}
            child={(event) => (
              <output data-testid="checkout-result">
                {event?.type === "submitted"
                  ? event.detail.id
                  : "Idle"}
              </output>
            )}
          />
        </section>
      );
    }

    let result = render(<CheckoutPanel />);
    t.after(() => result.cleanup());

    let submit = result.$('[data-testid="submit-checkout"]') as HTMLButtonElement;
    let form = result.$('[data-testid="checkout-form"]') as HTMLFormElement;
    assert.equal(form.className, "");
    assert.equal(form.getAttribute("aria-busy"), "false");
    assert.equal(result.$('[data-testid="checkout-result"]')?.textContent, "Idle");

    await result.act(() => submit.click());
    await settleProjectionEffects();

    assert.equal(result.$('[data-testid="checkout-form"]'), form);
    assert.equal(form.className, "pending");
    assert.equal(form.getAttribute("aria-busy"), "true");
    assert.equal(form.dataset.postCommitPending, "true");
    assert.equal(
      result.$('[data-testid="checkout-result"]')?.textContent,
      "element-order",
    );

    await result.act(() => form.requestSubmit());
    assert.equal(form.dataset.nativeSubmit, "true");
  });

  it("routes keyed events to matching event-aware elements", async (t) => {
    let events = new CheckoutEvents();

    function Orders() {
      return () => (
        <section mix={events.host()}>
          <button
            data-testid="update-first"
            mix={on("click", ({ currentTarget }) => {
              currentTarget.dispatchEvent(
                events("submitted", { id: "first" }, { key: "first" }),
              );
            })}
          />
          <events.on.submitted.output
            data-testid="first-order"
            id="first"
            child={(event) => event?.detail.id ?? "idle"}
          />
          <events.on.submitted.output
            data-testid="second-order"
            id="second"
            child={(event) => event?.detail.id ?? "idle"}
          />
          <events.on.submitted.output
            data-testid="all-orders"
            child={(event) => event?.detail.id ?? "idle"}
          />
        </section>
      );
    }

    let result = render(<Orders />);
    t.after(() => result.cleanup());

    await result.act(() =>
      (result.$('[data-testid="update-first"]') as HTMLButtonElement).click(),
    );

    assert.equal(result.$('[data-testid="first-order"]')?.textContent, "first");
    assert.equal(result.$('[data-testid="second-order"]')?.textContent, "idle");
    assert.equal(result.$('[data-testid="all-orders"]')?.textContent, "first");
  });

  it("routes keyed events to matching events.on listeners", async (t) => {
    let events = new CustomEvents<"rendered" | "focusRequested">();

    function FocusTargets() {
      return () => (
        <section mix={events.host()}>
          <button
            data-testid="request-focus"
            mix={on("click", ({ currentTarget }) => {
              let focusEvent = events("focusRequested", { key: "second" });
              currentTarget.dataset.productHasKey = String(
                "key" in focusEvent,
              );
              currentTarget.dataset.productHasOriginTarget = String(
                "originTarget" in focusEvent,
              );
              currentTarget.dispatchEvent(focusEvent);
            })}
          />
          {["first", "second"].map((id) => (
            <events.on.rendered.button
              id={id}
              data-testid={id}
              mix={events.on("focusRequested", (event) => {
                let { currentTarget } = event;
                currentTarget.dataset.listenerHasKey = String("key" in event);
                currentTarget.dataset.listenerHasOriginTarget = String(
                  "originTarget" in event,
                );
                currentTarget.focus();
              })}
            />
          ))}
        </section>
      );
    }

    let result = render(<FocusTargets />);
    t.after(() => result.cleanup());

    await result.act(() =>
      (result.$('[data-testid="request-focus"]') as HTMLButtonElement).click(),
    );

    assert.equal(document.activeElement, result.$('[data-testid="second"]'));
    let source = result.$(
      '[data-testid="request-focus"]',
    ) as HTMLButtonElement;
    let target = result.$('[data-testid="second"]') as HTMLButtonElement;
    assert.equal(source.dataset.productHasKey, "false");
    assert.equal(source.dataset.productHasOriginTarget, "false");
    assert.equal(target.dataset.listenerHasKey, "false");
    assert.equal(target.dataset.listenerHasOriginTarget, "false");
  });

  it("subscribes projections and effects to explicit event groups", async (t) => {
    let events = new CustomEvents<
      "filterApplied" | { personSelected: number } | "draftSet"
    >();

    function EventGroup() {
      let selectionEvents = events.on([
        "filterApplied",
        "personSelected",
      ]);
      return () => (
        <section mix={events.host()}>
          <button
            data-testid="select-person"
            mix={on("click", ({ currentTarget }) => {
              currentTarget.dispatchEvent(events("personSelected", 2));
            })}
          />
          <button
            data-testid="set-draft"
            mix={on("click", ({ currentTarget }) => {
              currentTarget.dispatchEvent(events("draftSet"));
            })}
          />
          <selectionEvents.output
            data-testid="selection"
            child={(event) =>
              event ? `${event.type}:${String(event.detail)}` : "idle"
            }
            mix={events.on(
              ["filterApplied", "personSelected"],
              ({ currentTarget, type }) => {
                currentTarget.dataset.effectType = type;
              },
            )}
          />
        </section>
      );
    }

    let result = render(<EventGroup />);
    t.after(() => result.cleanup());

    await result.act(() =>
      (result.$('[data-testid="select-person"]') as HTMLButtonElement).click(),
    );
    await settleProjectionEffects();
    let selection = result.$('[data-testid="selection"]') as HTMLOutputElement;
    assert.equal(selection.textContent, "personSelected:2");
    assert.equal(selection.dataset.effectType, "personSelected");

    await result.act(() =>
      (result.$('[data-testid="set-draft"]') as HTMLButtonElement).click(),
    );
    assert.equal(selection.textContent, "personSelected:2");
  });

  it("processes a non-bubbling event dispatched on its event-aware element", async (t) => {
    let events = new CustomEvents<"activated">();

    function LocalEvent() {
      return () => (
        <events.on.activated.button
          data-testid="local-event"
          class={(event) => event?.detail === null ? "active" : ""}
          data-current-target={(event) => String(event?.currentTarget)}
          mix={on("click", ({ currentTarget }) => {
            currentTarget.dispatchEvent(
              events("activated", { bubbles: false }),
            );
          })}
        >
          Activate
        </events.on.activated.button>
      );
    }

    let result = render(<LocalEvent />);
    t.after(() => result.cleanup());

    let button = result.$('[data-testid="local-event"]') as HTMLButtonElement;
    await result.act(() => button.click());

    assert.equal(button.className, "active");
    assert.equal(button.dataset.currentTarget, "null");
  });

  it("keeps event-aware elements inside their own host boundary", async (t) => {
    let events = new CheckoutEvents();

    function CheckoutForm(handle: Handle) {
      return () => (
        <events.on.paid.form
          data-testid="hosted-checkout-form"
          class={(event) => event?.detail === null ? "paid" : ""}
          mix={events.host()}
        >
          <button
            type="button"
            data-testid="pay-checkout"
            mix={on("click", ({ currentTarget }) => {
              currentTarget.dispatchEvent(events("paid"));
            })}
          >
            Pay
          </button>
        </events.on.paid.form>
      );
    }

    let result = render(<CheckoutForm />);
    t.after(() => result.cleanup());

    let form = result.$('[data-testid="hosted-checkout-form"]') as HTMLFormElement;
    let pay = result.$('[data-testid="pay-checkout"]') as HTMLButtonElement;
    await result.act(() => pay.click());

    assert.equal(form.className, "paid");
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
            events.on("submitted", ({ currentTarget, target }) => {
              currentTarget.dataset.changeTargetIsButton = String(
                target === currentTarget,
              );
            }),
            on("click", ({ currentTarget }) => {
              currentTarget.dispatchEvent(
                events("submitted", { id: "button-order" }),
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

  it("does not implicitly route events between unhosted siblings", async (t) => {
    let events = new CheckoutEvents();

    function UnhostedSiblings() {
      return () => (
        <section>
          <button
            data-testid="unhosted-source"
            mix={on("click", ({ currentTarget }) => {
              currentTarget.dispatchEvent(
                events("submitted", { id: "unrouted-order" }),
              );
            })}
          />
          <output
            data-testid="unhosted-listener"
            mix={events.on("submitted", ({ currentTarget, detail }) => {
              currentTarget.textContent = detail.id;
            })}
          />
        </section>
      );
    }

    let result = render(<UnhostedSiblings />);
    t.after(() => result.cleanup());

    await result.act(() =>
      (result.$('[data-testid="unhosted-source"]') as HTMLButtonElement).click()
    );

    assert.equal(
      result.$('[data-testid="unhosted-listener"]')?.textContent,
      "",
    );
  });

  it("routes sibling DOM events through an explicit host", async (t) => {
    let events = new CheckoutEvents();

    function CheckoutPanel(handle: Handle) {
      return () => (
        <section mix={events.host()}>
          <button
            type="button"
            data-testid="submit-checkout"
            mix={on("click", ({ currentTarget }) => {
              currentTarget.dispatchEvent(
                events("submitted", { id: "summary-order" }),
              );
            })}
          >
            Submit
          </button>
          <output
            data-testid="checkout-status"
            mix={events.on("submitted", ({ currentTarget, detail, type }) => {
              if (type !== "submitted") {
                return;
              }
              currentTarget.dataset.eventType = type;
              currentTarget.textContent = detail.id;
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
        <section mix={events.host()}>
          <button
            type="button"
            data-testid="submit-checkout"
            mix={on("click", ({ currentTarget }) => {
              currentTarget.dispatchEvent(
                events("submitted", { id: "shortcut-order" }),
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
            events.host(),
            on("input", ({ currentTarget }) => {
              currentTarget.dispatchEvent(events("paid"));
            }),
            events.on("paid", ({ currentTarget, type }) => {
              currentTarget.dataset.latestEvent = type;
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
    let initialSubmittedEvent = events("submitted", {
      id: "initial-order",
    });

    function CheckoutSummary(handle: Handle) {
      return () => (
        <section mix={events.host()}>
          <button
            type="button"
            data-testid="submit-checkout"
            mix={on("click", ({ currentTarget }) => {
              currentTarget.dispatchEvent(
                events("submitted", { id: "rendered-order" }),
              );
            })}
          >
            Submit
          </button>
          <events.on.submitted.div
            child={(event = initialSubmittedEvent) => (
              <output data-testid="checkout-summary">
                {event.detail.id}
              </output>
            )}
          />
          <events.div
            child={(event) => {
              let text = event?.type === "submitted"
                ? event.detail.id
                : "initial-order";
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

  it("runs event-element-scoped listeners after the event render commits", async (t) => {
    let events = new CheckoutEvents();

    function CheckoutStatus(handle: Handle) {
      return () => (
        <section mix={events.host()}>
          <button
            type="button"
            data-testid="submit-checkout"
            mix={on("click", ({ currentTarget }) => {
              currentTarget.dispatchEvent(
                events("submitted", { id: "pending-order" }),
              );
            })}
          >
            Submit
          </button>
          <button
            type="button"
            data-testid="pay-checkout"
            mix={on("click", ({ currentTarget }) => {
              currentTarget.dispatchEvent(events("paid"));
            })}
          >
            Pay
          </button>
          <events.div
            child={(event) => (
              <input
                data-testid="checkout-input"
                disabled={event?.type === "submitted"}
                mix={events.on("paid", ({ currentTarget }) => {
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
    await settleProjectionEffects();

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
    let initialTurnEvent = events("turn", { locked: true });

    function GameBoard(handle: Handle) {
      return () => (
        <section mix={events.host()}>
          <button
            type="button"
            data-testid="reset-game"
            mix={on("click", ({ currentTarget }) => {
              currentTarget.dispatchEvent(
                events({
                  focus: { cellId: 0 },
                  turn: { locked: false },
                }),
              );
            })}
          >
            Reset
          </button>
          <events.on.turn.div
            child={(event = initialTurnEvent) => (
              <button
                type="button"
                data-testid="game-cell"
                disabled={event.detail.locked}
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
    await settleProjectionEffects();

    let updatedCell = result.$('[data-testid="game-cell"]') as HTMLButtonElement;
    assert.equal(updatedCell.disabled, false);
    assert.equal(updatedCell.dataset.disabledWhenFocused, "false");
    assert.equal(updatedCell.dataset.focusCalls, "1");
  });

  it("keeps event-element-scoped listeners immediate for unrelated updates", async (t) => {
    type GameDetails = {
      turn: { locked: boolean };
      focus: { cellId: number };
    };
    class GameEvents extends CustomEvents<GameDetails> {}
    let events = new GameEvents();
    let initialTurnEvent = events("turn", { locked: true });

    function GameBoard(handle: Handle) {
      return () => (
        <section mix={events.host()}>
          <button
            type="button"
            data-testid="focus-game"
            mix={on("click", ({ currentTarget }) => {
              currentTarget.dispatchEvent(events("focus", { cellId: 0 }));
            })}
          >
            Focus
          </button>
          <events.on.turn.div
            child={(event = initialTurnEvent) => (
              <button
                type="button"
                data-testid="game-cell"
                disabled={event.detail.locked}
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

  it("does not run stale event-element-scoped listeners for replaced nodes", async (t) => {
    let events = new CheckoutEvents();
    function CheckoutStatus(handle: Handle) {
      return () => (
        <section mix={events.host()}>
          <button
            type="button"
            data-testid="pay-checkout"
            mix={on("click", ({ currentTarget }) => {
              currentTarget.dispatchEvent(events("paid"));
            })}
          >
            Pay
          </button>
          <events.div
            child={(event) =>
              event?.type === "paid" ? (
                <output data-testid="paid-output">Paid</output>
              ) : (
                <input
                  data-testid="stale-checkout-input"
                  mix={events.on("paid", ({ currentTarget }) => {
                    currentTarget.dataset.stalePaidCall = "true";
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

  it("does not fire event-element-scoped listeners for a default event", async (t) => {
    let events = new CheckoutEvents();
    let initialSubmittedEvent = events("submitted", { id: "initial-order" });

    function CheckoutStatus(handle: Handle) {
      return () => (
        <events.on.submitted.div
          child={(event = initialSubmittedEvent) => (
            <input
              data-testid="initial-checkout-input"
              value={event.detail.id}
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
        <section mix={events.host()}>
          <button
            type="button"
            data-testid="submit-checkout"
            mix={on("click", ({ currentTarget }) => {
              currentTarget.dispatchEvent(
                events("submitted", { id: "first-order" }),
              );
            })}
          >
            Submit
          </button>
          <events.on.submitted.div
            child={(event) => (
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
    let initialEvent = events("submitted", { id: "initial-order" });

    function CheckoutTerminalSummary(handle: Handle) {
      return () => (
        <>
          <button
            type="button"
            data-testid="terminal-submit"
            mix={on("click", () => {
              terminal.dispatchEvent(
                events("submitted", { id: "submitted-order" }),
              );
            })}
          >
            Submit
          </button>
          <events.on.submitted.div
            child={(event = initialEvent) => (
              <output data-testid="terminal-summary">
                {event.detail.id}
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
          mix={events.on("submitted", ({ currentTarget, detail }) => {
            currentTarget.dataset.latestOrder = detail.id;
          })}
        >
          <form data-testid="checkout-row" mix={events.host()}>
            <button
              type="button"
              data-testid="local-submit"
              mix={on("click", ({ currentTarget }) => {
                currentTarget.dispatchEvent(
                  events("submitted", { id: "local-order" }),
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
                  events("submitted",
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

  it("expands batch transactions into granular events", async (t) => {
    let events = new CheckoutEvents();

    function CheckoutBatch(handle: Handle) {
      let projectionUpdates = 0;

      return () => (
        <section mix={events.host()}>
          <button
            type="button"
            data-testid="checkout-batch"
            mix={on("click", ({ currentTarget }) => {
              currentTarget.dispatchEvent(
                events({
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
          <events.output
            data-testid="all-projection"
            child={(event) =>
              event
                ? `${event.type}:${++projectionUpdates}`
                : "idle:0"}
          />
          <output
            data-testid="all-effects"
            mix={events.on("*", ({ currentTarget, type }) => {
              currentTarget.textContent +=
                `${currentTarget.textContent ? "," : ""}${type}`;
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
    let allProjection = result.$(
      '[data-testid="all-projection"]',
    ) as HTMLOutputElement;
    let allEffects = result.$(
      '[data-testid="all-effects"]',
    ) as HTMLOutputElement;

    await result.act(() => button.click());
    await result.act(settleProjectionEffects);

    assert.equal(submitted.textContent, "batched-order");
    assert.equal(paid.textContent, "null");
    assert.equal(allProjection.textContent, "paid:1");
    assert.equal(allEffects.textContent, "submitted,paid");
  });

  it("subscribes directly to EventTargets with names, groups, and wildcard maps", () => {
    let target = new EventTarget();
    let events = new CheckoutEvents();
    let controller = new AbortController();
    let calls: string[] = [];

    events.on(target, {
      submitted(event, signal) {
        assert.equal(event.currentTarget, target);
        assert.equal(event.detail.id, "direct-order");
        assert.equal(signal.aborted, false);
        calls.push("named:submitted");
      },
      "*"(event) {
        if (event.type === "submitted") {
          assert.equal(event.detail.id, "direct-order");
        }
        calls.push(`wildcard:${event.type}`);
      },
    }, { signal: controller.signal });

    events.on(
      target,
      ["submitted", "paid"],
      (event) => {
        calls.push(`group:${event.type}`);
      },
      { signal: controller.signal },
    );
    events.on(
      target,
      "paid",
      (event) => {
        calls.push(`single:${event.type}`);
      },
      { signal: controller.signal },
    );

    target.dispatchEvent(events("submitted", { id: "direct-order" }));
    target.dispatchEvent(events("paid"));

    assert.deepEqual(calls, [
      "named:submitted",
      "wildcard:submitted",
      "group:submitted",
      "wildcard:paid",
      "group:paid",
      "single:paid",
    ]);

    controller.abort();
    target.dispatchEvent(events("submitted", { id: "ignored-order" }));
    assert.equal(calls.length, 6);
  });

  it("uses the constructor host as the default direct-listener target", () => {
    let target = new EventTarget();
    let events = new CheckoutEvents({host: target});
    let calls: string[] = [];

    events.on({
      submitted(event) {
        assert.equal(event.currentTarget, target);
        calls.push(`map:${event.detail.id}`);
      },
    });
    events.on("submitted", (event) => {
      assert.equal(event.currentTarget, target);
      calls.push(`named:${event.detail.id}`);
    }, {});

    target.dispatchEvent(events("submitted", { id: "hosted-order" }));

    assert.deepEqual(calls, [
      "map:hosted-order",
      "named:hosted-order",
    ]);
  });

  it("supports TypedEventTarget subclass owners through the same descriptor", async (t) => {
    class TerminalEvents extends CustomEvents<CheckoutDetails> {}

    class CheckoutTerminal extends TypedEventTarget<TerminalEvents["map"]> {
      events = new TerminalEvents({host: this});

      submit() {
        this.dispatchEvent(this.events("submitted", { id: "terminal-order" }));
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
          <terminal.events.on.submitted.div
            child={(event) => (
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

});

class SearchEvents extends CustomEvents<{
  booksFound: { books: string[] };
  booksNotFound: { reason: "emptyList" | { other: string } };
  errorOccurred: Error;
  querySubmitted: { query: string };
  idle: null;
}> {}

class GestureEvents extends CustomEvents<{
  activated: { pointerId: number };
  moved: { x: number; y: number };
  released: null;
}> {}

class PlayerEvents extends CustomEvents<{
  loaded: { track: string };
  played: { track: string };
  stopped: null;
}> {}

class ScopedActionEvents extends CustomEvents<{
  actionSubmitted: null;
  actionSucceeded: null;
  actionErrored: { error: Error };
}> {}

type AppContextValue = {
  user: { name: string; age: number } | null;
  settings: {
    theme: "dark" | "light" | "system";
    layout: "zen" | "normal" | "grid";
  };
};

class TestAppContext extends TypedEventTarget<CustomEvents<AppContextValue>["map"]> {
  events = new CustomEvents<AppContextValue>({host: this});
  on = this.events.on;
  #value: AppContextValue;

  constructor(initial: Partial<AppContextValue>) {
    super();
    this.#value = initial as AppContextValue;
  }

  get value(): AppContextValue {
    return this.#value;
  }

  patch(value: Partial<AppContextValue>) {
    Object.assign(this.#value, value);
    this.dispatchEvent(this.events(value));
  }
}

let events = new GestureEvents();

const gestureMixin = Object.assign(createMixin<HTMLElement>((handle) => {
  let target: HTMLElement | null = null;

  handle.addEventListener("insert", (event) => {
    target = event.node;
  });

  return (props) => (
    <handle.element
      {...props}
      mix={[
        on("pointerdown", ({ currentTarget, pointerId }, signal) => {
          currentTarget.dispatchEvent(
            events("activated", { pointerId: pointerId }, { signal }),
          );
        }),
        on("pointermove", ({ currentTarget, clientX, clientY }, signal) => {
          currentTarget.dispatchEvent(
            events("moved", { x: clientX, y: clientY }, { signal }),
          );
        }),
        on("pointerup", ({ currentTarget }, signal) => {
          currentTarget.dispatchEvent(events("released", null, { signal }));
        }),
      ]}
    />
  );
}), events);

function GesturePad(handle: Handle) {
  let eventLog: Array<{ type: string; detail: unknown }> = [];

  return () => (
    <button
      type="button"
      data-testid="gesture-pad"
      mix={[
        gestureMixin(),
        gestureMixin.on("*", ({ type, detail }) => {
          eventLog.push({ type, detail });
          handle.update();
        }),
      ]}
    >
      <pre>{JSON.stringify(eventLog, null, 2)}</pre>
    </button>
  );
}

class TestPlayer extends TypedEventTarget<PlayerEvents["map"]> {
  #track: string | null = null;
  events =  new PlayerEvents({host: this});

  constructor(signal: AbortSignal) {
    super();
  }

  load(track: string) {
    this.#track = track;
    this.dispatchEvent(
      this.events({ loaded: { track }, played: { track } }),
    );
  }

  play() {
    if (!this.#track) return;
    this.dispatchEvent(this.events("played", { track: this.#track }));
  }

  stop() {
    this.dispatchEvent(this.events("stopped"));
  }
}

function PlayerUI(handle: Handle) {
  let player = new TestPlayer(handle.signal);
  let eventLog: Array<{ type: string; detail: unknown }> = [];

  player.events.on(player, {
    loaded({ type, detail }) {
      eventLog.push({ type, detail });
      handle.update();
    },
    played({ type, detail }) {
      eventLog.push({ type, detail });
      handle.update();
    },
    stopped({ type, detail }) {
      eventLog.push({ type, detail });
      handle.update();
    },
  }, { signal: handle.signal });

  handle.signal.addEventListener("abort", () => {
    player.stop();
  });

  return () => (
    <>
      <output data-testid="player-events">
        <pre>{JSON.stringify(eventLog, null, 2)}</pre>
      </output>
      <button
        data-testid="load-button"
        mix={on("click", () => player.load("North Star"))}
      >
        Load
      </button>
      <button data-testid="play-button" mix={on("click", () => player.play())}>
        Play
      </button>
      <button data-testid="stop-button" mix={on("click", () => player.stop())}>
        Stop
      </button>
    </>
  );
}

function ScopedActionForms(handle: Handle) {
  let events = new ScopedActionEvents();
  let firstStatus = "idle";
  let secondStatus = "idle";

  let changeStatus =
    (statusFor: "first" | "second") =>
    ({ type }: { type: string }) => {
      if (statusFor === "first") {
        firstStatus = type;
      } else {
        secondStatus = type;
      }

      handle.update();
    };

  let submit = (
    event: Dispatched<SubmitEvent, HTMLFormElement>,
    signal: AbortSignal,
  ) => {
    event.preventDefault();
    let form = event.currentTarget;

    form.dispatchEvent(events("actionSubmitted", null, { signal }));

    if (form.dataset.result === "error") {
      form.dispatchEvent(
        events("actionErrored",
          { error: new Error("Could not save") },
          { signal },
        ),
      );
    } else {
      form.dispatchEvent(events("actionSucceeded", null, { signal }));
    }
  };

  return () => (
    <>
      <form
        data-result="success"
        mix={[
          events.host(),
          events.on("*", changeStatus("first")),
          on("submit", submit),
        ]}
      >
        <button data-testid="first-submit">Save First</button>
        <output data-testid="first-status">{firstStatus}</output>
      </form>
      <form
        data-result="error"
        mix={[
          events.host(),
          events.on("*", changeStatus("second")),
          on("submit", submit),
        ]}
      >
        <button data-testid="second-submit">Save Second</button>
        <output data-testid="second-status">{secondStatus}</output>
      </form>
    </>
  );
}

function SearchForm(handle: Handle<Props<"div">>) {
  let events = new SearchEvents();

  let fetchBooks = async (
    query: string,
    input: HTMLInputElement,
    signal: AbortSignal,
  ) => {
    let opts = { signal };
    try {
      let resp = await fetch(`/api/search?q=${encodeURIComponent(query)}`, {
        signal,
      });
      if (!resp.ok) throw new Error("Network response was not ok");
      let data = await resp.json();
      if (!Array.isArray(data.books) || data.books.length === 0) {
        return input.dispatchEvent(
          events("booksNotFound", { reason: "emptyList" }, opts),
        );
      }
      input.dispatchEvent(events("booksFound", { books: data.books }, opts));
    } catch (error) {
      input.dispatchEvent(events("errorOccurred", error as Error, opts));
    }
  };

  return () => (
    <div mix={events.host()}>
      <form
        mix={on("submit", (evt) => {
          evt.preventDefault();
          let form = evt.currentTarget;
          let input = form.elements.namedItem("q") as HTMLInputElement | null;
          let query = input?.value.trim() ?? "";
          form.dispatchEvent(
            query
              ? events("querySubmitted", { query })
              : events("idle"),
          );
        })}
      >
        <input
          name="q"
          mix={[
            on("input", (evt) => {
              let input = evt.currentTarget;
              let query = input.value.trim();
              input.dispatchEvent(
                query
                  ? events("querySubmitted", { query })
                  : events("idle"),
              );
            }),
            events.on("querySubmitted", (event, signal) => {
              return void fetchBooks(
                event.detail.query,
                event.currentTarget,
                signal,
              );
            }),
          ]}
        />
        <button>Search</button>
      </form>
      <events.div
        child={(event) => (
          <output>
            <pre>
              {JSON.stringify(
                event ? { type: event.type, detail: event.detail } : undefined,
                null,
                2,
              )}
            </pre>
          </output>
        )}
      />
    </div>
  );
}

function TestAppProvider(
  handle: Handle<{ children?: RemixNode }, TestAppContext>,
) {
  let appContext = new TestAppContext({
    user: null,
    settings: { layout: "normal", theme: "dark" },
  });
  handle.context.set(appContext);

  return () => (
    <section>
      <button
        type="button"
        data-action="login"
        mix={on("click", () => {
          appContext.patch({ user: { name: "Ada", age: 37 } });
        })}
      >
        Login
      </button>
      <button
        type="button"
        data-action="theme"
        mix={on("click", () => {
          appContext.patch({
            settings: {
              layout: "zen",
              theme: "light",
            },
          });
        })}
      >
        Set Zen-Light Theme
      </button>
      <button
        type="button"
        data-action="loadContext"
        mix={on("click", () => {
          appContext.patch({
            user: { name: "Bob Lazar", age: 23 },
            settings: { layout: "grid", theme: "dark" },
          });
        })}
      >
        Set Full Context
      </button>
      {handle.props.children}
    </section>
  );
}

function UserDisplay(handle: Handle) {
  let updateCount = 0;
  let appContext = handle.context.get(TestAppProvider);

  appContext.on("user", () => {
    updateCount++;
    handle.update();
  }, {
    signal: handle.signal,
  });

  return () => (
    <output data-testid="user">
      {appContext.value.user?.name ?? "Not logged in"} AND updateCount:
      {updateCount}
    </output>
  );
}

function SettingsDisplay(handle: Handle) {
  let updateCount = 0;
  let appContext = handle.context.get(TestAppProvider);

  appContext.on("settings", () => {
    updateCount++;
    handle.update();
  }, {
    signal: handle.signal,
  });

  return () => (
    <output data-testid="settings">
      {appContext.value.settings.theme}:{appContext.value.settings.layout} AND
      updateCount:
      {updateCount}
    </output>
  );
}

function ContextSnapshot(handle: Handle) {
  let updateCount = 0;
  let appContext = handle.context.get(TestAppProvider);

  appContext.on("*", () => {
    updateCount++;
    handle.update();
  }, { signal: handle.signal });

  return () => (
    <output data-testid="snapshot">
      {appContext.value.user?.name ?? "none"}:{appContext.value.settings.theme}:
      {appContext.value.settings.layout} AND updateCount:{updateCount}
    </output>
  );
}

async function settleAsyncSearch() {
  await Promise.resolve();
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  await Promise.resolve();
}

async function settleProjectionEffects() {
  await Promise.resolve();
}

describe("CustomEvents component usage", () => {
  it("supports createMixin-style host behavior with multiple custom events", async (t) => {
    let result = render(<GesturePad />);
    t.after(() => result.cleanup());

    let pad = result.$('[data-testid="gesture-pad"]') as HTMLButtonElement;

    await result.act(() => {
      pad.dispatchEvent(
        new PointerEvent("pointerdown", {
          bubbles: true,
          pointerId: 7,
        }),
      );
    });

    assert.equal(
      pad.textContent,
      JSON.stringify(
        [
          {
            type: "activated",
            detail: { pointerId: 7 },
          },
        ],
        null,
        2,
      ),
    );

    await result.act(() => {
      pad.dispatchEvent(
        new PointerEvent("pointermove", {
          bubbles: true,
          clientX: 20,
          clientY: 35,
        }),
      );
    });

    assert.equal(
      pad.textContent,
      JSON.stringify(
        [
          {
            type: "activated",
            detail: { pointerId: 7 },
          },
          {
            type: "moved",
            detail: { x: 20, y: 35 },
          },
        ],
        null,
        2,
      ),
    );

    await result.act(() => {
      pad.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
    });

    assert.equal(
      pad.textContent,
      JSON.stringify(
        [
          {
            type: "activated",
            detail: { pointerId: 7 },
          },
          {
            type: "moved",
            detail: { x: 20, y: 35 },
          },
          {
            type: "released",
            detail: null,
          },
        ],
        null,
        2,
      ),
    );
  });

  it("supports TypedEventTarget classes dispatching granular events", async (t) => {
    let result = render(<PlayerUI />);
    t.after(() => result.cleanup());

    let loadButton = result.$(
      'button[data-testid="load-button"]',
    ) as HTMLButtonElement;
    let playButton = result.$(
      'button[data-testid="play-button"]',
    ) as HTMLButtonElement;
    let stopButton = result.$(
      'button[data-testid="stop-button"]',
    ) as HTMLButtonElement;
    let output = result.$(
      'output[data-testid="player-events"]',
    ) as HTMLOutputElement;

    await result.act(() => loadButton.click());

    assert.equal(
      output.textContent,
      JSON.stringify(
        [
          {
            type: "loaded",
            detail: { track: "North Star" },
          },
          {
            type: "played",
            detail: { track: "North Star" },
          },
        ],
        null,
        2,
      ),
    );

    await result.act(() => playButton.click());

    assert.equal(
      output.textContent,
      JSON.stringify(
        [
          {
            type: "loaded",
            detail: { track: "North Star" },
          },
          {
            type: "played",
            detail: { track: "North Star" },
          },
          {
            type: "played",
            detail: { track: "North Star" },
          },
        ],
        null,
        2,
      ),
    );

    await result.act(() => stopButton.click());

    assert.equal(
      output.textContent,
      JSON.stringify(
        [
          {
            type: "loaded",
            detail: { track: "North Star" },
          },
          {
            type: "played",
            detail: { track: "North Star" },
          },
          {
            type: "played",
            detail: { track: "North Star" },
          },
          {
            type: "stopped",
            detail: null,
          },
        ],
        null,
        2,
      ),
    );
  });

  it("supports form-scoped dispatchers without putting form in every event detail", async (t) => {
    let result = render(<ScopedActionForms />);
    t.after(() => result.cleanup());

    let firstSubmit = result.$(
      'button[data-testid="first-submit"]',
    ) as HTMLButtonElement;
    let secondSubmit = result.$(
      'button[data-testid="second-submit"]',
    ) as HTMLButtonElement;
    let firstStatus = result.$(
      'output[data-testid="first-status"]',
    ) as HTMLOutputElement;
    let secondStatus = result.$(
      'output[data-testid="second-status"]',
    ) as HTMLOutputElement;

    assert.equal(firstStatus.textContent, "idle");
    assert.equal(secondStatus.textContent, "idle");

    await result.act(() => firstSubmit.click());

    assert.equal(firstStatus.textContent, "actionSucceeded");
    assert.equal(secondStatus.textContent, "idle");

    await result.act(() => secondSubmit.click());

    assert.equal(firstStatus.textContent, "actionSucceeded");
    assert.equal(secondStatus.textContent, "actionErrored");
  });

  it("uses a reusable options object from a form event handler", async (t) => {
    t.mock.method(
      window,
      "fetch",
      async (input: RequestInfo, init?: RequestInit) => {
        let url = typeof input === "string" ? input : input.url;
        if (url.includes("q=dune")) {
          return new Response(JSON.stringify({ books: ["Dune", "Hyperion"] }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        } else if (url.includes("q=offline")) {
          return new Response(null, { status: 500 });
        } else {
          return new Response(JSON.stringify({ books: [] }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    );
    let result = render(<SearchForm />);
    t.after(() => result.cleanup());

    let input = result.$("input") as HTMLInputElement;
    let submitButton = result.$("button") as HTMLButtonElement;

    input.value = " dune ";
    await result.act(() => submitButton.click());

    assert.equal(
      result.$("output")?.textContent,
      JSON.stringify(
        {
          type: "querySubmitted",
          detail: { query: "dune" },
        },
        null,
        2,
      ),
    );

    input.value = "";
    await result.act(() => submitButton.click());

    assert.equal(
      result.$("output")?.textContent,
      JSON.stringify(
        {
          type: "idle",
          detail: null,
        },
        null,
        2,
      ),
    );

    input.value = "offline";
    await result.act(() => submitButton.click());
    await result.act(settleAsyncSearch);

    assert.equal(
      result.$("output")?.textContent,
      JSON.stringify(
        {
          type: "errorOccurred",
          detail: new Error("Network response was not ok"),
        },
        null,
        2,
      ),
    );

    input.value = "notfound";
    await result.act(async () => {
      submitButton.click();
      await settleAsyncSearch();
    });
    await result.act(settleAsyncSearch);

    assert.equal(
      result.$("output")?.textContent,
      JSON.stringify(
        {
          type: "booksNotFound",
          detail: { reason: "emptyList" },
        },
        null,
        2,
      ),
    );
  });

  it("aborts stale keystroke searches and skips their render consequences", async (t) => {
    type SearchRequest = {
      query: string;
      signal: AbortSignal;
      reject(error: unknown): void;
      resolveBooks(books: string[]): void;
    };

    let requests: SearchRequest[] = [];

    t.mock.method(window, "fetch", (input: RequestInfo, init?: RequestInit) => {
      let url = typeof input === "string" ? input : input.url;
      let query =
        new URL(url, window.location.href).searchParams.get("q") ?? "";
      let signal = init?.signal;

      assert.ok(signal instanceof AbortSignal);

      return new Promise<Response>((resolve, reject) => {
        let request: SearchRequest = {
          query,
          signal,
          reject,
          resolveBooks(books) {
            resolve(
              new Response(JSON.stringify({ books }), {
                status: 200,
                headers: { "Content-Type": "application/json" },
              }),
            );
          },
        };

        signal.addEventListener(
          "abort",
          () => {
            reject(
              new DOMException("The operation was aborted.", "AbortError"),
            );
          },
          { once: true },
        );

        requests.push(request);
      });
    });

    let result = render(<SearchForm />);
    t.after(() => result.cleanup());

    let input = result.$("input") as HTMLInputElement;
    let typeQuery = async (query: string) => {
      input.value = query;

      await result.act(() => {
        input.dispatchEvent(
          new InputEvent("input", {
            bubbles: true,
            data: query.at(-1) ?? null,
            inputType: "insertText",
          }),
        );
      });
    };

    await typeQuery("d");
    assert.equal(requests.length, 1);
    assert.equal(requests[0].query, "d");
    assert.equal(requests[0].signal.aborted, false);
    assert.equal(
      result.$("output")?.textContent,
      JSON.stringify(
        {
          type: "querySubmitted",
          detail: { query: "d" },
        },
        null,
        2,
      ),
    );

    await typeQuery("du");
    assert.equal(requests.length, 2);
    assert.equal(requests[0].signal.aborted, true);
    assert.equal(requests[1].query, "du");
    assert.equal(requests[1].signal.aborted, false);
    assert.equal(
      result.$("output")?.textContent,
      JSON.stringify(
        {
          type: "querySubmitted",
          detail: { query: "du" },
        },
        null,
        2,
      ),
    );

    await typeQuery("dun");
    assert.equal(requests.length, 3);
    assert.equal(requests[1].signal.aborted, true);
    assert.equal(requests[2].query, "dun");
    assert.equal(requests[2].signal.aborted, false);
    assert.equal(
      result.$("output")?.textContent,
      JSON.stringify(
        {
          type: "querySubmitted",
          detail: { query: "dun" },
        },
        null,
        2,
      ),
    );

    await typeQuery("dune");
    assert.equal(requests.length, 4);
    assert.equal(requests[2].signal.aborted, true);
    assert.equal(requests[3].query, "dune");
    assert.equal(requests[3].signal.aborted, false);
    assert.equal(
      result.$("output")?.textContent,
      JSON.stringify(
        {
          type: "querySubmitted",
          detail: { query: "dune" },
        },
        null,
        2,
      ),
    );

    await result.act(async () => {
      requests[0].resolveBooks(["Stale D"]);
      requests[1].reject(new Error("stale network failure"));
      requests[2].resolveBooks(["Stale Dun"]);
      await settleAsyncSearch();
    });

    assert.equal(
      result.$("output")?.textContent,
      JSON.stringify(
        {
          type: "querySubmitted",
          detail: { query: "dune" },
        },
        null,
        2,
      ),
    );

    await result.act(async () => {
      requests[3].resolveBooks(["Dune", "Dune Messiah"]);
      await settleAsyncSearch();
    });

    assert.equal(
      result.$("output")?.textContent,
      JSON.stringify(
        {
          type: "booksFound",
          detail: { books: ["Dune", "Dune Messiah"] },
        },
        null,
        2,
      ),
    );
  });

  it("supports AppContext-style providers with granular and batch events", async (t) => {
    let result = render(
      <TestAppProvider>
        <UserDisplay />
        <SettingsDisplay />
        <ContextSnapshot />
      </TestAppProvider>,
    );
    t.after(() => result.cleanup());

    assert.equal(
      result.$('[data-testid="user"]')?.textContent,
      "Not logged in AND updateCount:0",
    );
    assert.equal(
      result.$('[data-testid="snapshot"]')?.textContent,
      "none:dark:normal AND updateCount:0",
    );
    assert.equal(
      result.$('[data-testid="settings"]')?.textContent,
      "dark:normal AND updateCount:0",
    );

    await result.act(() =>
      (result.$('[data-action="login"]') as HTMLButtonElement).click(),
    );

    assert.equal(
      result.$('[data-testid="user"]')?.textContent,
      "Ada AND updateCount:1",
    );
    assert.equal(
      result.$('[data-testid="snapshot"]')?.textContent,
      "Ada:dark:normal AND updateCount:1",
    );
    assert.equal(
      result.$('[data-testid="settings"]')?.textContent,
      "dark:normal AND updateCount:0",
    );

    await result.act(() =>
      (result.$('[data-action="theme"]') as HTMLButtonElement).click(),
    );

    assert.equal(
      result.$('[data-testid="user"]')?.textContent,
      "Ada AND updateCount:1",
    );
    assert.equal(
      result.$('[data-testid="snapshot"]')?.textContent,
      "Ada:light:zen AND updateCount:2",
    );

    assert.equal(
      result.$('[data-testid="settings"]')?.textContent,
      "light:zen AND updateCount:1",
    );

    await result.act(() =>
      (result.$('[data-action="loadContext"]') as HTMLButtonElement).click(),
    );

    assert.equal(
      result.$('[data-testid="user"]')?.textContent,
      "Bob Lazar AND updateCount:2",
    );
    assert.equal(
      result.$('[data-testid="snapshot"]')?.textContent,
      "Bob Lazar:dark:grid AND updateCount:4",
    );
    assert.equal(
      result.$('[data-testid="settings"]')?.textContent,
      "dark:grid AND updateCount:2",
    );
  });
});
