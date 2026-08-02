import * as assert from "remix/assert";
import { it } from "remix/test";
import { CustomEventsRuntime } from "./runtime.ts";

const subscriptionCount = 5_000;
const dispatchCount = 500;
const targetKey = String(subscriptionCount - 1);

it("benchmarks keyed subscription matching", async () => {
  let runtime = new CustomEventsRuntime();
  let host = document.createElement("section");
  let origin = document.createElement("button");
  host.append(origin);
  let unregisterHost = runtime.registerHost(host);
  let cleanups: Array<() => void> = [];
  let notifications = 0;

  for (let index = 0; index < subscriptionCount; index++) {
    let element = document.createElement("output");
    element.id = String(index);
    host.append(element);
    cleanups.push(
      runtime.subscribe("projection", {
        element,
        eventTypes: new Set(["itemUpdated"]),
        notify() {
          notifications++;
        },
      }),
    );
  }

  function createKeyedEvent() {
    let init = { bubbles: true, cancelable: false };
    return runtime.createProductEvent(
      "itemUpdated",
      null,
      init,
      [{
        type: "itemUpdated",
        detail: null,
        routingKeys: [targetKey],
      }],
    );
  }

  for (let index = 0; index < 20; index++) {
    await runtime.dispatch(origin, createKeyedEvent());
  }
  notifications = 0;

  let started = performance.now();
  for (let index = 0; index < dispatchCount; index++) {
    await runtime.dispatch(origin, createKeyedEvent());
  }
  let duration = performance.now() - started;

  console.log("[customEvents keyed matching]", {
    subscriptions: subscriptionCount,
    dispatches: dispatchCount,
    durationMs: Number(duration.toFixed(2)),
    averageDispatchMs: Number((duration / dispatchCount).toFixed(4)),
  });
  assert.equal(notifications, dispatchCount);

  for (let cleanup of cleanups) cleanup();
  unregisterHost();
});
