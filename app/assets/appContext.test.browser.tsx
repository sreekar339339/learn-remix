import * as assert from "remix/assert";
import { describe, it } from "remix/test";
import { on, type Handle } from "remix/ui";
import { render } from "remix/ui/test";
import {
  AppContext,
  AppProvider,
  EventSettingsDisplay,
  EventUserDisplay,
  SettingsDisplay,
  UserDisplay,
} from "./appContext.tsx";

async function settleEvents() {
  await Promise.resolve();
  await Promise.resolve();
}

describe("AppContext", () => {
  it("patches its model and emits only the affected granular events", () => {
    let context = new AppContext({
      user: null,
      settings: { layout: "normal", theme: "system" },
    });
    let calls: string[] = [];

    assert.deepEqual(context.value, {
      user: null,
      settings: { layout: "normal", theme: "system" },
    });

    context.on("user", (event) => {
      assert.equal(event.currentTarget, context);
      calls.push(`named:${event.detail?.name ?? "none"}`);
    }, {});

    context.on({
      settings(event) {
        assert.equal(event.currentTarget, context);
        calls.push(`map:${event.detail.theme}:${event.detail.layout}`);
      },
      "*"(event) {
        calls.push(`all:${event.type}`);
      },
    });

    let originalValue = context.value;
    context.patch({ user: { name: "Ada", age: 37 } });

    assert.equal(context.value, originalValue);
    assert.deepEqual(context.value.user, { name: "Ada", age: 37 });
    assert.deepEqual(calls, [
      "named:Ada",
      "all:user",
    ]);

    context.patch({
      user: { name: "Grace", age: 85 },
      settings: { layout: "zen", theme: "dark" },
    });

    assert.deepEqual(context.value, {
      user: { name: "Grace", age: 85 },
      settings: { layout: "zen", theme: "dark" },
    });
    assert.deepEqual(calls, [
      "named:Ada",
      "all:user",
      "named:Grace",
      "all:user",
      "map:dark:zen",
      "all:settings",
    ]);
  });

  it("supports explicit cleanup and AbortSignal-owned subscriptions", () => {
    let context = new AppContext({
      user: null,
      settings: { layout: "normal", theme: "system" },
    });
    let controller = new AbortController();
    let cleanedCalls = 0;
    let abortedCalls = 0;

    let cleanup = context.on("user", () => {
      cleanedCalls++;
    }, {});
    context.on("settings", () => {
      abortedCalls++;
    }, { signal: controller.signal });

    context.patch({
      user: { name: "Ada", age: 37 },
      settings: { layout: "zen", theme: "light" },
    });
    assert.equal(cleanedCalls, 1);
    assert.equal(abortedCalls, 1);

    cleanup();
    controller.abort();
    context.patch({
      user: null,
      settings: { layout: "normal", theme: "system" },
    });
    assert.equal(cleanedCalls, 1);
    assert.equal(abortedCalls, 1);
  });

  it("provides context and updates imperative and event-aware consumers", async (t) => {
    function Controls(handle: Handle) {
      let context = handle.context.get(AppProvider);

      return () => (
        <nav>
          <button
            data-action="user"
            mix={on("click", () => {
              context.patch({ user: { name: "Ada", age: 37 } });
            })}
          >
            Set user
          </button>
          <button
            data-action="settings"
            mix={on("click", () => {
              context.patch({
                settings: { layout: "normal", theme: "dark" },
              });
            })}
          >
            Set settings
          </button>
        </nav>
      );
    }

    let result = render(
      <AppProvider>
        <section data-testid="app-context">
          <div data-consumer="user">
            <UserDisplay />
          </div>
          <div data-consumer="event-user">
            <EventUserDisplay />
          </div>
          <div data-consumer="settings">
            <SettingsDisplay />
          </div>
          <div data-consumer="event-settings">
            <EventSettingsDisplay />
          </div>
          <Controls />
        </section>
      </AppProvider>,
    );
    t.after(() => result.cleanup());

    await result.act(settleEvents);

    assert.equal(
      result.$('[data-consumer="user"]')?.textContent,
      "Bob Lazar",
    );
    assert.equal(
      result.$('[data-consumer="event-user"]')?.textContent,
      "Bob Lazar",
    );
    assert.equal(
      result.$('[data-consumer="settings"]')?.textContent?.trim(),
      "Layout: zen, Theme: light",
    );
    assert.equal(
      result.$('[data-consumer="event-settings"]')?.textContent,
      "Layout: zen, Theme: light",
    );

    await result.act(() =>
      (result.$('[data-action="user"]') as HTMLButtonElement).click()
    );
    await result.act(settleEvents);

    assert.equal(
      result.$('[data-consumer="user"]')?.textContent,
      "Ada",
    );
    assert.equal(
      result.$('[data-consumer="event-user"]')?.textContent,
      "Ada",
    );
    assert.equal(
      result.$('[data-consumer="settings"]')?.textContent?.trim(),
      "Layout: zen, Theme: light",
    );
    assert.equal(
      result.$('[data-consumer="event-settings"]')?.textContent,
      "Layout: zen, Theme: light",
    );

    await result.act(() =>
      (result.$('[data-action="settings"]') as HTMLButtonElement).click()
    );
    await result.act(settleEvents);

    assert.equal(
      result.$('[data-consumer="user"]')?.textContent,
      "Ada",
    );
    assert.equal(
      result.$('[data-consumer="event-user"]')?.textContent,
      "Ada",
    );
    assert.equal(
      result.$('[data-consumer="settings"]')?.textContent?.trim(),
      "Layout: normal, Theme: dark",
    );
    assert.equal(
      result.$('[data-consumer="event-settings"]')?.textContent,
      "Layout: normal, Theme: dark",
    );
  });
});
