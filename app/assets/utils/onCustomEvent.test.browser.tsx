import * as assert from "remix/assert";
import { describe, it } from "remix/test";
import { on, ref, type Handle, TypedEventTarget } from "remix/ui";
import { render } from "remix/ui/test";

import {
  dispatchCustomEvent,
  type CustomEventMap,
} from "./customEvent.ts";
import { onCustomEvent, sourceContainsElement } from "./onCustomEvent.tsx";

type CheckoutEventMap = CustomEventMap<{
  paymentStatus: "idle" | "pending" | "paid";
}>;

type CartEventMap = CustomEventMap<{
  itemCount: number;
}>;

type NotificationEventMap = CustomEventMap<{
  unreadCount: number;
}>;

type OrderEventMap = CustomEventMap<{
  selectedQuantity: number;
}>;

type UploadEventMap = CustomEventMap<{
  uploadProgress: number;
}>;

function CheckoutPaymentButton(handle: Handle) {
  let checkoutTarget = new TypedEventTarget<CheckoutEventMap>();
  let onCheckout = onCustomEvent.with({ target: checkoutTarget });
  let dispatch = dispatchCustomEvent.bind(null, {
    target: checkoutTarget,
    signal: handle.signal,
  });

  return () => (
    <>
      <button
        type="button"
        data-testid="pay-button"
        mix={onCheckout("paymentStatus", ({ detail }, button) => {
          button.dataset.status = detail;
          button.toggleAttribute("aria-busy", detail === "pending");
        })}
      >
        Pay now
      </button>
      <button
        type="button"
        data-action="submit-payment"
        mix={on("click", () => {
          dispatch({ paymentStatus: "pending" });
        })}
      >
        Submit payment
      </button>
    </>
  );
}

function CartBadge(handle: Handle) {
  let cartTarget = new TypedEventTarget<CartEventMap>();
  let onCart = onCustomEvent.with({
    target: cartTarget,
    initial: { itemCount: 2 },
  });
  let dispatch = dispatchCustomEvent.bind(null, {
    target: cartTarget,
    signal: handle.signal,
  });

  return () => (
    <>
      <output data-testid="cart-badge">
        <onCart.itemCount render={({ detail }) => <span>{detail} items</span>} />
      </output>
      <button
        type="button"
        data-action="add-cart-item"
        mix={on("click", () => {
          dispatch({ itemCount: 3 });
        })}
      >
        Add item
      </button>
    </>
  );
}

function NotificationBell(handle: Handle) {
  let notificationTarget = new TypedEventTarget<NotificationEventMap>();
  let onNotifications = onCustomEvent.with({ target: notificationTarget });
  let dispatch = dispatchCustomEvent.bind(null, {
    target: notificationTarget,
    signal: handle.signal,
  });

  handle.queueTask(() => {
    dispatch({ unreadCount: 5 });
  });

  return () => (
    <output data-testid="notification-bell">
      <onNotifications.unreadCount
        render={({ detail }) => <span>{detail} unread</span>}
      />
    </output>
  );
}

function OrderQuantityRows(handle: Handle) {
  let orderTarget = new TypedEventTarget<OrderEventMap>();
  let onOrder = onCustomEvent.with({
    target: orderTarget,
    guard: sourceContainsElement,
  });
  let firstRow: HTMLElement | undefined;
  let secondRow: HTMLElement | undefined;

  let dispatch = (source: HTMLElement | undefined, selectedQuantity: number) => {
    if (!source) return;
    dispatchCustomEvent(
      {
        target: orderTarget,
        signal: handle.signal,
        source,
      },
      { selectedQuantity },
    );
  };

  return () => (
    <>
      <section
        data-testid="order-row-a"
        mix={ref((element) => {
          firstRow = element;
        })}
      >
        <onOrder.selectedQuantity
          render={({ detail }) => <span>{detail} selected</span>}
        />
      </section>
      <section
        data-testid="order-row-b"
        mix={ref((element) => {
          secondRow = element;
        })}
      >
        <onOrder.selectedQuantity
          render={({ detail }) => <span>{detail} selected</span>}
        />
      </section>
      <button
        type="button"
        data-action="select-row-a"
        mix={on("click", () => dispatch(firstRow, 1))}
      >
        Select first row
      </button>
      <button
        type="button"
        data-action="select-row-b"
        mix={on("click", () => dispatch(secondRow, 2))}
      >
        Select second row
      </button>
    </>
  );
}

function UploadProgressMeter(handle: Handle) {
  let uploadTarget = new TypedEventTarget<UploadEventMap>();
  let dispatch = dispatchCustomEvent.bind(null, {
    target: uploadTarget,
    signal: handle.signal,
  });

  return () => (
    <>
      <progress
        data-testid="upload-progress"
        max={100}
        mix={onCustomEvent(
          uploadTarget,
          "uploadProgress",
          ({ detail }, progress) => {
            progress.value = detail;
          },
          25,
        )}
      />
      <button
        type="button"
        data-action="finish-upload"
        mix={on("click", () => {
          dispatch({ uploadProgress: 100 });
        })}
      >
        Finish upload
      </button>
    </>
  );
}

describe("onCustomEvent", () => {
  it("updates button attributes from checkout payment events", async (t) => {
    let result = render(<CheckoutPaymentButton />);
    t.after(() => result.cleanup());

    let payButton = result.$('[data-testid="pay-button"]') as HTMLButtonElement;
    let submitButton = result.$(
      '[data-action="submit-payment"]',
    ) as HTMLButtonElement;

    assert.equal(payButton.dataset.status, undefined);
    assert.equal(payButton.hasAttribute("aria-busy"), false);

    await result.act(() => submitButton.click());

    assert.equal(payButton.dataset.status, "pending");
    assert.equal(payButton.hasAttribute("aria-busy"), true);
  });

  it("renders a cart badge from initial and later cart events", async (t) => {
    let result = render(<CartBadge />);
    t.after(() => result.cleanup());

    let badge = result.$('[data-testid="cart-badge"]') as HTMLOutputElement;
    let addButton = result.$('[data-action="add-cart-item"]') as HTMLButtonElement;

    assert.equal(badge.textContent, "2 items");

    await result.act(() => addButton.click());

    assert.equal(badge.textContent, "3 items");
  });

  it("renders notification count events dispatched from setup tasks", async (t) => {
    let result = render(<NotificationBell />);
    t.after(() => result.cleanup());

    let bell = result.$('[data-testid="notification-bell"]') as HTMLOutputElement;

    assert.equal(bell.textContent, "5 unread");
  });

  it("scopes order row rendering to the parent element guard host", async (t) => {
    let result = render(<OrderQuantityRows />);
    t.after(() => result.cleanup());

    let firstRow = result.$('[data-testid="order-row-a"]') as HTMLElement;
    let secondRow = result.$('[data-testid="order-row-b"]') as HTMLElement;
    let firstButton = result.$('[data-action="select-row-a"]') as HTMLButtonElement;
    let secondButton = result.$('[data-action="select-row-b"]') as HTMLButtonElement;

    await result.act(() => firstButton.click());

    assert.equal(firstRow.textContent, "1 selected");
    assert.equal(secondRow.textContent, "");

    await result.act(() => secondButton.click());

    assert.equal(firstRow.textContent, "1 selected");
    assert.equal(secondRow.textContent, "2 selected");
  });

  it("supports direct upload progress effects with an initial detail", async (t) => {
    let result = render(<UploadProgressMeter />);
    t.after(() => result.cleanup());

    let progress = result.$(
      '[data-testid="upload-progress"]',
    ) as HTMLProgressElement;
    let finishButton = result.$(
      '[data-action="finish-upload"]',
    ) as HTMLButtonElement;

    assert.equal(progress.value, 25);

    await result.act(() => finishButton.click());

    assert.equal(progress.value, 100);
  });
});
