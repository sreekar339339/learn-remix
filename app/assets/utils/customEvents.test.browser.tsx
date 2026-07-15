import * as assert from "remix/assert";
import { describe, it } from "remix/test";
import { addEventListeners, on, TypedEventTarget, type Handle } from "remix/ui";
import { render } from "remix/ui/test";
import { customEvents } from "./customEvents.tsx";

const checkoutEvents = customEvents<{
  submitted: { id: string };
  paid: null;
}>();

const checkoutEventsWithInitial = customEvents<{
  submitted: { id: string };
  paid: null;
}>();
checkoutEventsWithInitial.initial = { event: { paid: null } };

const checkoutEventsWithDispatchedInitial = customEvents<{
  submitted: { id: string };
  paid: null;
}>();
checkoutEventsWithDispatchedInitial.initial = {
  event: checkoutEventsWithDispatchedInitial.submitted({
    id: "mounted-order",
  }),
  dispatch: true,
};

const checkoutEventsWithHostedInitial = customEvents<{
  submitted: { id: string };
}>();
checkoutEventsWithHostedInitial.initial = {
  event: checkoutEventsWithHostedInitial.submitted({
    id: "hosted-mounted-order",
  }),
  dispatch: true,
};

const checkoutEventsWithoutInitial = customEvents<{
  submitted: { id: string };
}>();

const checkoutEventsWithHostMemory = customEvents<{
  submitted: { id: string };
  paid: null;
}>();
checkoutEventsWithHostMemory.initial = {
  event: { submitted: { id: "seed-order" } },
};

const checkoutEventsWithDescriptorMemory = customEvents<{
  submitted: { id: string };
}>();
checkoutEventsWithDescriptorMemory.initial = {
  event: { submitted: { id: "shared-order" } },
};

const shipmentEvents = customEvents<{
  submitted: { id: string };
}>();

const namespacedCheckoutEvents = customEvents<
  {
    submitted: { id: string };
  },
  "test-checkout"
>({
  namespace: "test-checkout",
});

const todoActionEvents = customEvents<{
  actionSubmitted: null;
  actionSucceeded: null;
  actionErrored: { message: string };
}>();

type NamespacedCheckoutEventMap =
  (typeof namespacedCheckoutEvents)["namespacedEventMap"];

declare global {
  interface HTMLElementEventMap extends NamespacedCheckoutEventMap {}
}

function originContainsElement(event: Event, element: Element) {
  let originTarget = (event as Event & { originTarget?: EventTarget })
    .originTarget;
  return originTarget instanceof Node && originTarget.contains(element);
}

class CheckoutTerminal extends TypedEventTarget<(typeof checkoutEvents)["eventMap"]> {
  constructor() {
    super();
    checkoutEvents.host(this);
  }
}

function CheckoutButton(handle: Handle) {
  return () => (
    <button
      type="button"
      data-testid="checkout-button"
      mix={[
        checkoutEvents.listen(
          on("submitted", ({ currentTarget, detail, target }) => {
            currentTarget.dataset.submittedId = detail.id;
            currentTarget.dataset.currentTargetIsButton = String(
              currentTarget.dataset.testid === "checkout-button",
            );
            currentTarget.dataset.eventTargetIsButton = String(
              target === currentTarget,
            );
          }),
        ),
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

function CheckoutSummary(handle: Handle) {
  return () => (
    <section data-testid="checkout-summary-card">
      <button
        type="button"
        data-action="submit-checkout"
        mix={on("click", ({ currentTarget }) => {
          currentTarget.dispatchEvent(
            checkoutEvents.submitted({ id: "summary-order" }),
          );
        })}
      >
        Submit
      </button>
      <checkoutEvents.change
        initial={checkoutEvents.paid()}
        render={({ detail }) => {
          if (Array.isArray(detail.type)) return null;
          return (
            <output data-testid="checkout-summary">
              {detail.type}:{JSON.stringify(detail.detail)}
            </output>
          );
        }}
      />
      <output data-testid="initial-submitted-summary">
        <checkoutEvents.submitted
          initial={checkoutEvents.submitted({ id: "initial-order" })}
          render={({ detail }) => detail.id}
        />
      </output>
    </section>
  );
}

function CheckoutSummaryWithDescriptorInitial(handle: Handle) {
  return () => (
    <section data-testid="checkout-with-default-initial">
      <button
        type="button"
        data-action="submit-default-initial-checkout"
        mix={on("click", ({ currentTarget }) => {
          currentTarget.dispatchEvent(
            checkoutEventsWithInitial.submitted({ id: "default-order" }),
          );
        })}
      >
        Submit
      </button>
      <button
        type="button"
        data-testid="default-initial-listener"
        mix={checkoutEventsWithInitial.listen(
          on("change", ({ currentTarget }) => {
            currentTarget.dataset.changed = "true";
          }),
        )}
      >
        Listener
      </button>
      <output data-testid="default-initial-summary">
        <checkoutEventsWithInitial.change
          render={({ detail }) => {
            if (Array.isArray(detail.type)) return null;
            return `${detail.type}:${JSON.stringify(detail.detail)}`;
          }}
        />
      </output>
      <output data-testid="default-initial-override">
        <checkoutEventsWithInitial.change
          initial={checkoutEventsWithInitial.submitted({
            id: "override-order",
          })}
          render={({ detail }) => {
            if (Array.isArray(detail.type)) return null;
            return `${detail.type}:${JSON.stringify(detail.detail)}`;
          }}
        />
      </output>
    </section>
  );
}

function CheckoutWithDispatchedInitial(handle: Handle) {
  return () => (
    <section data-testid="checkout-with-dispatched-initial">
      <button
        type="button"
        data-testid="dispatched-initial-listener"
        mix={checkoutEventsWithDispatchedInitial.listen(
          on("change", ({ currentTarget, detail }) => {
            if (Array.isArray(detail.type)) return;
            currentTarget.dataset.changeCount = String(
              Number(currentTarget.dataset.changeCount ?? 0) + 1,
            );
            currentTarget.dataset.changedType = detail.type;
            currentTarget.dataset.changedDetail = JSON.stringify(
              detail.detail,
            );
          }),
          on("submitted", ({ currentTarget, detail }) => {
            currentTarget.dataset.submittedId = detail.id;
          }),
          on("paid", ({ currentTarget }) => {
            currentTarget.dataset.paid = "true";
          }),
        )}
      >
        Listener
      </button>
      <button
        type="button"
        data-testid="second-dispatched-initial-listener"
        mix={checkoutEventsWithDispatchedInitial.listen(
          on("submitted", ({ currentTarget, detail }) => {
            currentTarget.dataset.submitCount = String(
              Number(currentTarget.dataset.submitCount ?? 0) + 1,
            );
            currentTarget.dataset.submittedId = detail.id;
          }),
        )}
      >
        Second listener
      </button>
      <output data-testid="dispatched-initial-summary">
        <checkoutEventsWithDispatchedInitial.change
          render={({ detail }) => {
            if (Array.isArray(detail.type)) return null;
            return `${detail.type}:${JSON.stringify(detail.detail)}`;
          }}
        />
      </output>
      <output data-testid="dispatched-initial-override">
        <checkoutEventsWithDispatchedInitial.change
          initial={checkoutEventsWithDispatchedInitial.paid()}
          render={({ detail }) => {
            if (Array.isArray(detail.type)) return null;
            return `${detail.type}:${JSON.stringify(detail.detail)}`;
          }}
        />
      </output>
    </section>
  );
}

function CheckoutWithHostedDispatchedInitial(handle: Handle) {
  return () => (
    <section
      data-testid="checkout-with-hosted-dispatched-initial"
      mix={checkoutEventsWithHostedInitial.host()}
    >
      <button
        type="button"
        data-testid="hosted-dispatched-initial-listener"
        mix={checkoutEventsWithHostedInitial.listen(
          on("submitted", ({ currentTarget, detail }) => {
            currentTarget.dataset.submitCount = String(
              Number(currentTarget.dataset.submitCount ?? 0) + 1,
            );
            currentTarget.dataset.submittedId = detail.id;
          }),
        )}
      >
        Listener
      </button>
      <button
        type="button"
        data-testid="second-hosted-dispatched-initial-listener"
        mix={checkoutEventsWithHostedInitial.listen(
          on("submitted", ({ currentTarget, detail }) => {
            currentTarget.dataset.submitCount = String(
              Number(currentTarget.dataset.submitCount ?? 0) + 1,
            );
            currentTarget.dataset.submittedId = detail.id;
          }),
        )}
      >
        Second listener
      </button>
    </section>
  );
}

function CheckoutWithoutInitialDispatch(handle: Handle) {
  return () => (
    <button
      type="button"
      data-testid="no-initial-dispatch-listener"
      mix={checkoutEventsWithoutInitial.listen(
        on("submitted", ({ currentTarget, detail }) => {
          currentTarget.dataset.submittedId = detail.id;
        }),
      )}
    >
      Listener
    </button>
  );
}

function CheckoutWithHostMemory(handle: Handle) {
  return () => (
    <section
      data-testid="checkout-with-host-memory"
      mix={checkoutEventsWithHostMemory.host()}
    >
      <button
        type="button"
        data-testid="host-memory-listener"
        mix={checkoutEventsWithHostMemory.listen(
          on("submitted", ({ currentTarget, detail }) => {
            currentTarget.dataset.submittedId = detail.id;
          }),
          on("paid", ({ currentTarget }) => {
            currentTarget.dataset.paid = "true";
          }),
        )}
      >
        Listener
      </button>
      <button
        type="button"
        data-action="derive-host-memory-checkout"
        mix={on("click", ({ currentTarget }) => {
          currentTarget.dispatchEvent(
            checkoutEventsWithHostMemory.submitted((details) => ({
              id: `${details.submitted!.id}-next`,
            })),
          );
        })}
      >
        Derive
      </button>
      <button
        type="button"
        data-action="derive-host-memory-checkout-patch"
        mix={on("click", ({ currentTarget }) => {
          currentTarget.dispatchEvent(
            checkoutEventsWithHostMemory((details) => ({
              submitted: { id: `${details.submitted!.id}-patch` },
              paid: null,
            })),
          );
        })}
      >
        Derive patch
      </button>
    </section>
  );
}

function CheckoutWithDescriptorMemory(handle: Handle) {
  return () => (
    <section data-testid="checkout-with-descriptor-memory">
      <button
        type="button"
        data-testid="descriptor-memory-listener"
        mix={checkoutEventsWithDescriptorMemory.listen(
          on("submitted", ({ currentTarget, detail }) => {
            currentTarget.dataset.submittedId = detail.id;
          }),
        )}
      >
        Listener
      </button>
      <button
        type="button"
        data-action="derive-descriptor-memory-checkout"
        mix={on("click", ({ currentTarget }) => {
          currentTarget.dispatchEvent(
            checkoutEventsWithDescriptorMemory.submitted((details) => ({
              id: `${details.submitted!.id}-next`,
            })),
          );
        })}
      >
        Derive
      </button>
    </section>
  );
}

function CheckoutFormFields(handle: Handle) {
  return () => (
    <>
      <form data-testid="checkout-form">
        <input
          data-testid="checkout-form-input"
          mix={checkoutEvents.listen(
            on("submitted", ({ currentTarget, detail, originTarget }) => {
              currentTarget.dataset.submittedId = detail.id;
              currentTarget.dataset.originIsForm = String(
                originTarget === currentTarget.form,
              );
            }),
            { guard: originContainsElement },
          )}
        />
      </form>
      <input
        data-testid="outside-checkout-input"
        mix={checkoutEvents.listen(
          on("submitted", ({ currentTarget, detail }) => {
            currentTarget.dataset.submittedId = detail.id;
          }),
          { guard: originContainsElement },
        )}
      />
    </>
  );
}

function SiblingCheckoutBranches(handle: Handle) {
  return () => (
    <section data-testid="sibling-checkout">
      <div data-testid="checkout-producer-branch">
        <button
          type="button"
          data-action="submit-sibling-checkout"
          mix={on("click", ({ currentTarget }) => {
            currentTarget.dispatchEvent(
              checkoutEvents.submitted({ id: "sibling-order" }),
            );
          })}
        >
          Submit
        </button>
      </div>
      <div data-testid="checkout-consumer-branch">
        <button
          type="button"
          data-testid="sibling-checkout-listener"
          mix={checkoutEvents.listen(
            on("submitted", ({ currentTarget, detail }) => {
              currentTarget.dataset.submittedId = detail.id;
            }),
          )}
        >
          Listener
        </button>
        <output data-testid="sibling-checkout-summary">
          <checkoutEvents.submitted render={({ detail }) => detail.id} />
        </output>
      </div>
    </section>
  );
}

function HostedCheckout(handle: Handle) {
  return () => (
    <section data-testid="checkout-host" mix={checkoutEvents.host()}>
      <button
        type="button"
        data-testid="hosted-checkout-listener"
        mix={checkoutEvents.listen(
          on("submitted", ({ currentTarget, detail }) => {
            currentTarget.dataset.submittedId = detail.id;
          }),
        )}
      >
        Listener
      </button>
      <output data-testid="hosted-checkout-summary">
        <checkoutEvents.submitted render={({ detail }) => detail.id} />
      </output>
      <button
        type="button"
        data-action="dispatch-hosted-checkout"
        mix={on("click", ({ currentTarget }) => {
          currentTarget.closest("[data-testid='checkout-host']")!.dispatchEvent(
            checkoutEvents.submitted(
              { id: "hosted-order" },
              { bubbles: false },
            ),
          );
        })}
      >
        Checkout
      </button>
      <button
        type="button"
        data-action="dispatch-hosted-bubbling-checkout"
        mix={on("click", ({ currentTarget }) => {
          currentTarget.dispatchEvent(
            checkoutEvents.submitted({ id: "hosted-bubbling-order" }),
          );
        })}
      >
        Bubbling checkout
      </button>
      <button
        type="button"
        data-action="dispatch-hosted-composed-checkout"
        mix={on("click", ({ currentTarget }) => {
          currentTarget.dispatchEvent(
            checkoutEvents.submitted(
              { id: "hosted-composed-order" },
              { composed: true },
            ),
          );
        })}
      >
        Composed checkout
      </button>
    </section>
  );
}

function NativeChangeSafeCheckout(handle: Handle) {
  return () => (
    <section data-testid="native-change-card">
      <input
        data-testid="native-change-input"
        mix={checkoutEvents.listen(
          on("change", ({ currentTarget, detail }) => {
            if (Array.isArray(detail.type)) return;
            currentTarget.dataset.changedType = detail.type;
          }),
        )}
      />
      <checkoutEvents.change
        render={({ detail }) => {
          if (Array.isArray(detail.type)) return null;
          return (
            <output data-testid="native-change-summary">
              {detail.type}
            </output>
          );
        }}
      />
    </section>
  );
}

function NamespacedCheckoutButton(handle: Handle) {
  return () => (
    <button
      type="button"
      data-testid="namespaced-checkout-button"
      mix={[
        namespacedCheckoutEvents.listen(
          on("test-checkout:submitted", ({ currentTarget, detail, type }) => {
            currentTarget.dataset.submittedId = detail.id;
            currentTarget.dataset.eventType = type;
          }),
        ),
        on("click", ({ currentTarget }) => {
          currentTarget.dispatchEvent(
            namespacedCheckoutEvents.submitted({ id: "namespaced-order" }),
          );
        }),
      ]}
    >
      Checkout
    </button>
  );
}

function WindowForwardedCheckout(handle: Handle) {
  return () => (
    <>
      <button
        type="button"
        data-testid="window-checkout-listener"
        mix={checkoutEvents.listen(
          on("submitted", ({ currentTarget, detail }) => {
            currentTarget.dataset.submittedId = detail.id;
          }),
        )}
      >
        Listener
      </button>
      <button
        type="button"
        data-action="dispatch-shipment"
        mix={on("click", ({ currentTarget }) => {
          currentTarget.dispatchEvent(
            shipmentEvents.submitted({ id: "shipment-order" }),
          );
        })}
      >
        Ship
      </button>
      <button
        type="button"
        data-action="dispatch-checkout"
        mix={on("click", ({ currentTarget }) => {
          currentTarget.dispatchEvent(
            checkoutEvents.submitted({ id: "checkout-order" }),
          );
        })}
      >
        Checkout
      </button>
    </>
  );
}

function TodoActionRow(handle: Handle<{ completed: boolean }>) {
  return () => (
    <li data-testid="todo-action-row">
      <form data-testid="todo-delete-form" mix={todoActionEvents.host()}>
        <button
          type="button"
          data-testid="todo-delete-button"
          mix={[
            todoActionEvents.listen(
              on("change", ({ currentTarget, detail }) => {
                currentTarget.dataset.eventType = Array.isArray(detail.type)
                  ? detail.type.join(",")
                  : detail.type;
                currentTarget.classList.toggle(
                  "pending",
                  detail.type === "actionSubmitted",
                );
              }),
            ),
            on("click", ({ currentTarget }) => {
              currentTarget.form!.dispatchEvent(
                todoActionEvents.actionSubmitted(),
              );
            }),
          ]}
        >
          Delete
        </button>
      </form>

      <form data-testid="todo-edit-form" mix={todoActionEvents.host()}>
        <input
          data-testid="todo-edit-input"
          defaultValue="Write tests"
          mix={todoActionEvents.listen(
            on("change", ({ currentTarget, detail }) => {
              currentTarget.dataset.eventType = Array.isArray(detail.type)
                ? detail.type.join(",")
                : detail.type;
              currentTarget.classList.toggle(
                "pending",
                detail.type === "actionSubmitted",
              );
            }),
          )}
        />
        <button
          type="button"
          data-testid="todo-edit-button"
          mix={on("click", ({ currentTarget }) => {
            currentTarget.form!.dispatchEvent(
              todoActionEvents.actionSubmitted(),
            );
          })}
        >
          Save
        </button>
      </form>

      <form data-testid="todo-complete-form" mix={todoActionEvents.host()}>
        <button
          type="button"
          data-testid="todo-complete-button"
          mix={[
            todoActionEvents.listen(
              on("change", ({ currentTarget, detail }) => {
                currentTarget.dataset.eventType = Array.isArray(detail.type)
                  ? detail.type.join(",")
                  : detail.type;
                currentTarget.classList.toggle(
                  "pending",
                  detail.type === "actionSubmitted",
                );
              }),
            ),
            on("click", ({ currentTarget }) => {
              currentTarget.form!.dispatchEvent(
                todoActionEvents.actionSubmitted(),
              );
            }),
          ]}
        >
          <todoActionEvents.change
            initial={{ actionSucceeded: null }}
            render={({ detail }) => {
              let isCompleted =
                detail.type === "actionSubmitted"
                  ? !handle.props.completed
                  : handle.props.completed;
              return isCompleted ? "done" : "open";
            }}
          />
        </button>
      </form>
    </li>
  );
}

function assertCustomEventsTypes() {
  let checkoutTarget = new EventTarget();

  // @ts-expect-error event components are exposed directly, not under .on.
  checkoutEvents.on("submitted", () => {});

  <button
    mix={checkoutEvents.listen(on("submitted", () => {}), {
      // @ts-expect-error listen options align with Remix on() and do not accept initial.
      initial: { submitted: { id: "initial" } },
    })}
  />;

  <button
    mix={checkoutEvents.listen(
      on("submitted", ({ detail, currentTarget }) => {
        detail.id;
        currentTarget.disabled = true;
      }),
      on("paid", ({ detail }) => {
        detail satisfies null;
      }),
      on("submitted", ({ detail }) => {
        detail.id;
      }),
      on("paid", ({ detail }) => {
        detail satisfies null;
      }),
      on("submitted", ({ detail }) => {
        detail.id;
      }),
    )}
  />;

  checkoutEvents.host(checkoutTarget);

  let readyEvents = customEvents<{ ready: null }>();
  readyEvents.initial = { event: { ready: null } };
  readyEvents.initial = { event: readyEvents.ready(), dispatch: true };
  readyEvents.initial = { dispatch: false };
  readyEvents.initial = undefined;
  // @ts-expect-error descriptor initial event must use known event names.
  readyEvents.initial = { event: { done: null } };
  // @ts-expect-error dispatch: true requires an event.
  readyEvents.initial = { dispatch: true };
  // @ts-expect-error event cannot be undefined when dispatch is true.
  readyEvents.initial = { event: undefined, dispatch: true };

  customEvents<{ ready: null }>();
  customEvents<{ ready: null }, "ready-check">({
    namespace: "ready-check",
  });
  let inferredNamespaceEvents = customEvents<{ ready: null }, "inferred-ready">({
    namespace: "inferred-ready",
  });
  inferredNamespaceEvents.namespacedEventMap satisfies {
    "inferred-ready:ready": CustomEvent<null>;
  };
  // @ts-expect-error customEvents options only accept namespace.
  customEvents<{ ready: null }>({ initial: { event: { ready: null } } });

  checkoutEvents((details) => ({
    submitted: { id: `${details.submitted?.id ?? "typed-order"}-next` },
    paid: null,
  }));
  checkoutEvents({
    // @ts-expect-error aggregate event maps do not support per-event builders.
    submitted(details) {
      return { id: `${details.submitted?.id ?? "typed-order"}-next` };
    },
  });
  checkoutEvents.submitted({ id: "typed-order" });
  checkoutEvents.submitted((details) => ({
    id: `${details.submitted!.id}-next`,
  }));
  checkoutEvents.submitted({ id: "typed-order" }, { composed: true });
  checkoutEvents.paid(null);
  checkoutEvents.paid();
  checkoutEvents.paid(() => null);
  checkoutEvents.paid({ signal: new AbortController().signal });
  // @ts-expect-error non-null event details cannot be replaced with init.
  checkoutEvents.submitted({ signal: new AbortController().signal });
  // @ts-expect-error event factory calls should not accept extra detail keys.
  checkoutEvents.submitted({ id: "typed-order", update: () => {} });
  // @ts-expect-error event factory calls should not accept component props.
  checkoutEvents.submitted({ render: () => null });
  // @ts-expect-error event factory calls should not accept handle-shaped values.
  checkoutEvents.submitted({
    id: "handle",
    props: {},
    context: {} as Handle["context"],
    update: async () => new AbortController().signal,
    queueTask: () => {},
    frame: {} as Handle["frame"],
    frames: {} as Handle["frames"],
    signal: new AbortController().signal,
  });
  // @ts-expect-error submitted requires the submitted detail shape.
  checkoutEvents.submitted(null);
  // @ts-expect-error change is render-only; dispatch granular events instead.
  checkoutEvents.change(null);
}

void assertCustomEventsTypes;

describe("customEvents", () => {
  it("supports TypedEventTarget subclasses through host(this)", () => {
    let terminal = new CheckoutTerminal();
    let controller = new AbortController();
    let events: Array<string> = [];
    let submittedId = "";
    let form = document.createElement("form");
    let source: unknown;

    addEventListeners(terminal, controller.signal, {
      change(event) {
        events.push(event.type);
        if (
          !Array.isArray(event.detail.type) &&
          event.detail.type === "submitted"
        ) {
          submittedId = event.detail.details.submitted?.id ?? "";
        }
        source = event.source;
      },
      submitted(event) {
        events.push(event.type);
        submittedId = event.detail.id;
        source = event.source;
      },
    });

    terminal.dispatchEvent(
      checkoutEvents.submitted({ id: "terminal-order" }, { source: form }),
    );

    assert.deepEqual(events, ["change", "submitted"]);
    assert.equal(submittedId, "terminal-order");
    assert.equal(source, form);
  });

  it("uses a DOM element as the dispatch target for host element reactions", async (t) => {
    let result = render(<CheckoutButton />);
    t.after(() => result.cleanup());

    let button = result.$('[data-testid="checkout-button"]') as HTMLButtonElement;

    await result.act(() => button.click());

    assert.equal(button.dataset.submittedId, "button-order");
    assert.equal(button.dataset.currentTargetIsButton, "true");
    assert.equal(button.dataset.eventTargetIsButton, "true");
  });

  it("renders event components from parent-hosted DOM events and initial events", async (t) => {
    let result = render(<CheckoutSummary />);
    t.after(() => result.cleanup());

    let summary = result.$(
      '[data-testid="checkout-summary"]',
    ) as HTMLOutputElement;
    let initialSubmittedSummary = result.$(
      '[data-testid="initial-submitted-summary"]',
    ) as HTMLOutputElement;
    let button = result.$(
      '[data-action="submit-checkout"]',
    ) as HTMLButtonElement;

    assert.equal(summary.textContent, "paid:null");
    assert.equal(initialSubmittedSummary.textContent, "initial-order");

    await result.act(() => button.click());

    assert.equal(summary.textContent, 'submitted:{"id":"summary-order"}');
  });

  it("uses descriptor initial events as component defaults", async (t) => {
    let result = render(<CheckoutSummaryWithDescriptorInitial />);
    t.after(() => result.cleanup());

    let listener = result.$(
      '[data-testid="default-initial-listener"]',
    ) as HTMLButtonElement;
    let summary = result.$(
      '[data-testid="default-initial-summary"]',
    ) as HTMLOutputElement;
    let override = result.$(
      '[data-testid="default-initial-override"]',
    ) as HTMLOutputElement;
    let button = result.$(
      '[data-action="submit-default-initial-checkout"]',
    ) as HTMLButtonElement;

    assert.equal(summary.textContent, "paid:null");
    assert.equal(override.textContent, 'submitted:{"id":"override-order"}');
    assert.equal(listener.dataset.changed, undefined);

    await result.act(() => button.click());

    assert.equal(summary.textContent, 'submitted:{"id":"default-order"}');
    assert.equal(listener.dataset.changed, "true");
  });

  it("dispatches descriptor initial events once through window fallback when opted in", async (t) => {
    let result = render(<CheckoutWithDispatchedInitial />);
    t.after(() => result.cleanup());

    let listener = result.$(
      '[data-testid="dispatched-initial-listener"]',
    ) as HTMLButtonElement;
    let secondListener = result.$(
      '[data-testid="second-dispatched-initial-listener"]',
    ) as HTMLButtonElement;
    let summary = result.$(
      '[data-testid="dispatched-initial-summary"]',
    ) as HTMLOutputElement;
    let override = result.$(
      '[data-testid="dispatched-initial-override"]',
    ) as HTMLOutputElement;

    await result.act(() => Promise.resolve());

    assert.equal(listener.dataset.changedType, "submitted");
    assert.equal(listener.dataset.changeCount, "1");
    assert.equal(listener.dataset.changedDetail, '{"id":"mounted-order"}');
    assert.equal(listener.dataset.submittedId, "mounted-order");
    assert.equal(listener.dataset.paid, undefined);
    assert.equal(secondListener.dataset.submittedId, "mounted-order");
    assert.equal(secondListener.dataset.submitCount, "1");
    assert.equal(summary.textContent, 'submitted:{"id":"mounted-order"}');
    assert.equal(override.textContent, 'submitted:{"id":"mounted-order"}');
  });

  it("dispatches descriptor initial events from the nearest host boundary", async (t) => {
    let result = render(<CheckoutWithHostedDispatchedInitial />);
    let windowEvents: Array<string> = [];
    let countWindowEvent = (event: Event) => {
      windowEvents.push(event.type);
    };
    window.addEventListener("submitted", countWindowEvent);
    window.addEventListener("change", countWindowEvent);
    t.after(() => {
      window.removeEventListener("submitted", countWindowEvent);
      window.removeEventListener("change", countWindowEvent);
      result.cleanup();
    });

    let listener = result.$(
      '[data-testid="hosted-dispatched-initial-listener"]',
    ) as HTMLButtonElement;
    let secondListener = result.$(
      '[data-testid="second-hosted-dispatched-initial-listener"]',
    ) as HTMLButtonElement;

    await result.act(() => Promise.resolve());

    assert.equal(listener.dataset.submittedId, "hosted-mounted-order");
    assert.equal(listener.dataset.submitCount, "1");
    assert.equal(secondListener.dataset.submittedId, "hosted-mounted-order");
    assert.equal(secondListener.dataset.submitCount, "1");
    assert.deepEqual(windowEvents, []);
  });

  it("does not dispatch on mount when descriptor initial is unset", async (t) => {
    let result = render(<CheckoutWithoutInitialDispatch />);
    t.after(() => result.cleanup());

    let listener = result.$(
      '[data-testid="no-initial-dispatch-listener"]',
    ) as HTMLButtonElement;

    await result.act(() => Promise.resolve());

    assert.equal(listener.dataset.submittedId, undefined);
  });

  it("builds event details from the nearest host's latest details", async (t) => {
    let result = render(<CheckoutWithHostMemory />);
    t.after(() => result.cleanup());

    let listener = result.$(
      '[data-testid="host-memory-listener"]',
    ) as HTMLButtonElement;
    let button = result.$(
      '[data-action="derive-host-memory-checkout"]',
    ) as HTMLButtonElement;
    let patchButton = result.$(
      '[data-action="derive-host-memory-checkout-patch"]',
    ) as HTMLButtonElement;

    assert.equal(listener.dataset.submittedId, undefined);

    await result.act(() => button.click());
    assert.equal(listener.dataset.submittedId, "seed-order-next");

    await result.act(() => button.click());
    assert.equal(listener.dataset.submittedId, "seed-order-next-next");

    await result.act(() => patchButton.click());
    assert.equal(listener.dataset.submittedId, "seed-order-next-next-patch");
    assert.equal(listener.dataset.paid, "true");
  });

  it("falls back to descriptor-level latest details without a host", async (t) => {
    let result = render(<CheckoutWithDescriptorMemory />);
    t.after(() => result.cleanup());

    let listener = result.$(
      '[data-testid="descriptor-memory-listener"]',
    ) as HTMLButtonElement;
    let button = result.$(
      '[data-action="derive-descriptor-memory-checkout"]',
    ) as HTMLButtonElement;

    assert.equal(listener.dataset.submittedId, undefined);

    await result.act(() => button.click());
    assert.equal(listener.dataset.submittedId, "shared-order-next");

    await result.act(() => button.click());
    assert.equal(listener.dataset.submittedId, "shared-order-next-next");
  });

  it("lets sibling branches react without a host by default", async (t) => {
    let result = render(<SiblingCheckoutBranches />);
    t.after(() => result.cleanup());

    let dispatchButton = result.$(
      '[data-action="submit-sibling-checkout"]',
    ) as HTMLButtonElement;
    let listener = result.$(
      '[data-testid="sibling-checkout-listener"]',
    ) as HTMLButtonElement;
    let summary = result.$(
      '[data-testid="sibling-checkout-summary"]',
    ) as HTMLOutputElement;

    await result.act(() => dispatchButton.click());

    assert.equal(listener.dataset.submittedId, "sibling-order");
    assert.equal(summary.textContent, "sibling-order");
  });

  it("supports explicit guards for original-dispatch-target scoping", async (t) => {
    let result = render(<CheckoutFormFields />);
    t.after(() => result.cleanup());

    let form = result.$('[data-testid="checkout-form"]') as HTMLFormElement;
    let input = result.$(
      '[data-testid="checkout-form-input"]',
    ) as HTMLInputElement;
    let outsideInput = result.$(
      '[data-testid="outside-checkout-input"]',
    ) as HTMLInputElement;

    await result.act(() => {
      form.dispatchEvent(checkoutEvents.submitted({ id: "form-order" }));
    });

    assert.equal(input.dataset.submittedId, "form-order");
    assert.equal(input.dataset.originIsForm, "true");
    assert.equal(outsideInput.dataset.submittedId, undefined);
  });

  it("uses an explicit component host as the local observation point", async (t) => {
    let result = render(<HostedCheckout />);
    let windowEvents = 0;
    let countWindowEvent = () => {
      windowEvents++;
    };
    window.addEventListener("change", countWindowEvent);
    window.addEventListener("submitted", countWindowEvent);
    t.after(() => {
      window.removeEventListener("change", countWindowEvent);
      window.removeEventListener("submitted", countWindowEvent);
      result.cleanup();
    });

    let listener = result.$(
      '[data-testid="hosted-checkout-listener"]',
    ) as HTMLButtonElement;
    let summary = result.$(
      '[data-testid="hosted-checkout-summary"]',
    ) as HTMLOutputElement;
    let dispatchButton = result.$(
      '[data-action="dispatch-hosted-checkout"]',
    ) as HTMLButtonElement;

    await result.act(() => dispatchButton.click());

    assert.equal(listener.dataset.submittedId, "hosted-order");
    assert.equal(summary.textContent, "hosted-order");
    assert.equal(windowEvents, 0);
  });

  it("contains todo-row sibling form events inside each hosted form", async (t) => {
    let result = render(<TodoActionRow completed={false} />);
    let windowEvents: Array<string> = [];
    let countWindowEvent = (event: Event) => {
      windowEvents.push(event.type);
    };
    window.addEventListener("change", countWindowEvent);
    window.addEventListener("actionSubmitted", countWindowEvent);
    t.after(() => {
      window.removeEventListener("change", countWindowEvent);
      window.removeEventListener("actionSubmitted", countWindowEvent);
      result.cleanup();
    });

    let deleteButton = result.$(
      '[data-testid="todo-delete-button"]',
    ) as HTMLButtonElement;
    let editInput = result.$(
      '[data-testid="todo-edit-input"]',
    ) as HTMLInputElement;
    let editButton = result.$(
      '[data-testid="todo-edit-button"]',
    ) as HTMLButtonElement;
    let completeButton = result.$(
      '[data-testid="todo-complete-button"]',
    ) as HTMLButtonElement;

    assert.equal(completeButton.textContent, "open");

    await result.act(() => completeButton.click());

    assert.equal(completeButton.dataset.eventType, "actionSubmitted");
    assert.equal(completeButton.classList.contains("pending"), true);
    assert.equal(completeButton.textContent, "done");
    assert.equal(deleteButton.dataset.eventType, undefined);
    assert.equal(deleteButton.classList.contains("pending"), false);
    assert.equal(editInput.dataset.eventType, undefined);
    assert.equal(editInput.classList.contains("pending"), false);
    assert.deepEqual(windowEvents, []);

    await result.act(() => editButton.click());

    assert.equal(editInput.dataset.eventType, "actionSubmitted");
    assert.equal(editInput.classList.contains("pending"), true);
    assert.equal(completeButton.textContent, "done");
    assert.equal(deleteButton.dataset.eventType, undefined);
    assert.deepEqual(windowEvents, []);
  });

  it("stops hosted events before window unless composed is true", async (t) => {
    let result = render(<HostedCheckout />);
    let windowCarriers = 0;
    let windowExpandedEvents: Array<string> = [];
    let countWindowCarrier = () => {
      windowCarriers++;
    };
    let countWindowExpandedEvent = (event: Event) => {
      windowExpandedEvents.push(event.type);
    };
    window.addEventListener("rmx:custom-events:dispatch", countWindowCarrier);
    window.addEventListener("change", countWindowExpandedEvent);
    window.addEventListener("submitted", countWindowExpandedEvent);
    t.after(() => {
      window.removeEventListener(
        "rmx:custom-events:dispatch",
        countWindowCarrier,
      );
      window.removeEventListener("change", countWindowExpandedEvent);
      window.removeEventListener("submitted", countWindowExpandedEvent);
      result.cleanup();
    });

    let listener = result.$(
      '[data-testid="hosted-checkout-listener"]',
    ) as HTMLButtonElement;
    let summary = result.$(
      '[data-testid="hosted-checkout-summary"]',
    ) as HTMLOutputElement;
    let dispatchButton = result.$(
      '[data-action="dispatch-hosted-bubbling-checkout"]',
    ) as HTMLButtonElement;
    let composedDispatchButton = result.$(
      '[data-action="dispatch-hosted-composed-checkout"]',
    ) as HTMLButtonElement;

    await result.act(() => dispatchButton.click());

    assert.equal(listener.dataset.submittedId, "hosted-bubbling-order");
    assert.equal(summary.textContent, "hosted-bubbling-order");
    assert.equal(windowCarriers, 0);
    assert.deepEqual(windowExpandedEvents, []);

    await result.act(() => composedDispatchButton.click());

    assert.equal(listener.dataset.submittedId, "hosted-composed-order");
    assert.equal(summary.textContent, "hosted-composed-order");
    assert.equal(windowCarriers, 0);
    assert.deepEqual(windowExpandedEvents, ["change", "submitted"]);
  });

  it("ignores native DOM events with matching custom event names", async (t) => {
    let result = render(<NativeChangeSafeCheckout />);
    t.after(() => result.cleanup());

    let input = result.$(
      '[data-testid="native-change-input"]',
    ) as HTMLInputElement;

    await result.act(() => {
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });

    assert.equal(input.dataset.changedType, undefined);
    assert.equal(result.$('[data-testid="native-change-summary"]'), null);

    await result.act(() => {
      input.dispatchEvent(checkoutEvents.submitted({ id: "custom-order" }));
    });

    let summary = result.$(
      '[data-testid="native-change-summary"]',
    ) as HTMLOutputElement;

    assert.equal(input.dataset.changedType, "submitted");
    assert.equal(summary.textContent, "submitted");
  });

  it("supports namespaced DOM events through descriptor-wide listening", async (t) => {
    let result = render(<NamespacedCheckoutButton />);
    t.after(() => result.cleanup());

    let button = result.$(
      '[data-testid="namespaced-checkout-button"]',
    ) as HTMLButtonElement;
    let directButton = document.createElement("button");
    let directEvents: Array<string> = [];
    document.body.append(directButton);
    t.after(() => directButton.remove());

    addEventListeners(directButton, new AbortController().signal, {
      "test-checkout:change"(event) {
        directEvents.push(event.type);
        assert.equal(event.detail.name, "test-checkout:submitted");
      },
      "test-checkout:submitted"(event) {
        directEvents.push(`${event.type}:${event.detail.id}`);
      },
    });

    await result.act(() => button.click());
    assert.equal(button.dataset.submittedId, "namespaced-order");
    assert.equal(button.dataset.eventType, "test-checkout:submitted");

    directButton.dispatchEvent(
      namespacedCheckoutEvents.submitted({ id: "direct-order" }),
    );

    assert.equal(button.dataset.submittedId, "direct-order");
    assert.deepEqual(directEvents, [
      "test-checkout:change",
      "test-checkout:submitted:direct-order",
    ]);
  });

  it("filters window-forwarded events by descriptor owner", async (t) => {
    let result = render(<WindowForwardedCheckout />);
    t.after(() => result.cleanup());

    let listener = result.$(
      '[data-testid="window-checkout-listener"]',
    ) as HTMLButtonElement;
    let shipmentButton = result.$(
      '[data-action="dispatch-shipment"]',
    ) as HTMLButtonElement;
    let checkoutButton = result.$(
      '[data-action="dispatch-checkout"]',
    ) as HTMLButtonElement;

    await result.act(() => shipmentButton.click());

    assert.equal(listener.dataset.submittedId, undefined);

    await result.act(() => checkoutButton.click());

    assert.equal(listener.dataset.submittedId, "checkout-order");
  });

  it("returns an inert event when the customEvents signal is already aborted", async () => {
    let button = document.createElement("button");
    let controller = new AbortController();
    let events: Array<string> = [];

    button.addEventListener("submitted", () => {
      events.push("submitted");
    });
    button.addEventListener("paid", () => {
      events.push("paid");
    });

    controller.abort();
    button.dispatchEvent(
      checkoutEvents(
        { submitted: { id: "aborted-order" } },
        { signal: controller.signal },
      ),
    );
    button.dispatchEvent(checkoutEvents.paid({ signal: controller.signal }));

    assert.deepEqual(events, []);
  });
});
