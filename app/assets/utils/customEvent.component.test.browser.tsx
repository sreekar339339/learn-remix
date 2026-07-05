import * as assert from "remix/assert";
import { describe, it } from "remix/test";
import {
  addEventListeners,
  createMixin,
  on,
  ref,
  type Handle,
  type Props,
  type RemixNode,
  TypedEventTarget,
} from "remix/ui";
import { render } from "remix/ui/test";

import {
  dispatchCustomEvent,
  type CustomEventMap,
  type Namespaced,
} from "./customEvent.ts";

type SearchEventMap = CustomEventMap<{
  booksFound: { books: string[] };
  booksNotFound: { reason: "emptyList" | { other: string } };
  errorOccurred: Error;
  querySubmitted: { query: string };
  idle: null;
}>;

type GestureEventMap = CustomEventMap<{
  activated: { pointerId: number };
  moved: { x: number; y: number };
  released: null;
}>;

type PlayerEventMap = CustomEventMap<{
  loaded: { track: string };
  played: { track: string };
  stopped: null;
}>;

type AppContext = {
  user: { name: string; age: number } | null;
  settings: {
    theme: "dark" | "light" | "system";
    layout: "zen" | "normal" | "grid";
  };
}

type AppContextEventMap = CustomEventMap<AppContext>;

declare global {
  interface HTMLElementEventMap
    extends
      Namespaced<SearchEventMap, "test-search">,
      Namespaced<GestureEventMap, "test-gesture"> {}
}

const gestureMixin = createMixin<HTMLElement>((handle) => {
  let target: HTMLElement | null = null;

  handle.addEventListener("insert", (event) => {
    target = event.node;
  });

  return (props) => (
    <handle.element
      {...props}
      mix={[
        on("pointerdown", (event, signal) => {
          if (!target) return;
          dispatchCustomEvent(target, signal, "test-gesture:activated", {
            pointerId: event.pointerId,
          });
        }),
        on("pointermove", (event, signal) => {
          if (!target) return;
          dispatchCustomEvent(target, signal, "test-gesture:moved", {
            x: event.clientX,
            y: event.clientY,
          });
        }),
        on("pointerup", (_, signal) => {
          if (!target) return;
          dispatchCustomEvent(target, signal, "test-gesture:released");
        }),
      ]}
    />
  );
});

function GesturePad(handle: Handle) {
  let events: GestureEventMap["change"]["detail"][] = [];

  return () => (
    <button
      type="button"
      data-testid="gesture-pad"
      mix={[
        gestureMixin(),
        on("test-gesture:change", ({ detail }) => {
          events.push(detail);
          handle.update();
        }),
      ]}
    >
      <pre>{JSON.stringify(events, null, 2)}</pre>
    </button>
  );
}

type PlayerEventTarget = TypedEventTarget<PlayerEventMap>;
class TestPlayer extends TypedEventTarget<PlayerEventMap> {
  #track: string | null = null;
  dispatch: dispatchCustomEvent.Dispatcher<PlayerEventTarget>;

  constructor(signal: AbortSignal) {
    super();
    this.dispatch = dispatchCustomEvent(this as PlayerEventTarget, signal);
  }

  load(track: string) {
    this.#track = track;
    this.dispatch("loaded", { track });
  }

  play() {
    if (!this.#track) return;
    this.dispatch("played", { track: this.#track });
  }

  stop() {
    this.dispatch("stopped");
  }
}

function PlayerUI(handle: Handle) {
  let player = new TestPlayer(handle.signal);
  let events: PlayerEventMap["change"]["detail"][] = [];

  player.addEventListener(
    "change",
    ({ detail }) => {
      events.push(detail);
      handle.update();
    },
    { signal: handle.signal },
  );

  handle.signal.addEventListener("abort", () => {
    player.stop();
  });

  return () => (
    <>
      <output data-testid="player-events">
        <pre>{JSON.stringify(events, null, 2)}</pre>
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

function SearchForm(handle: Handle<Props<"div">>) {
  let event: SearchEventMap["change"]["detail"] = {
    event: { type: "idle" },
  };

  let searchTargetRef = (target: HTMLDivElement) => {
    let search = async (query: string, signal: AbortSignal) => {
      let dispatch = dispatchCustomEvent(target, signal);
      if (!query) return dispatch("test-search:idle");
      dispatch("test-search:querySubmitted", { query });
      try {
        let resp = await fetch(`/api/search?q=${encodeURIComponent(query)}`, {
          signal,
        });
        if (!resp.ok) throw new Error("Network response was not ok");
        let data = await resp.json();
        if (!Array.isArray(data.books) || data.books.length === 0) {
          return dispatch("test-search:booksNotFound", { reason: "emptyList" });
        }
        dispatch("test-search:booksFound", { books: data.books });
      } catch (error) {
        dispatch("test-search:errorOccurred", error as Error);
      }
    };
    addEventListeners(target, handle.signal, {
      input(evt, signal) {
        let input = evt.target as HTMLInputElement;
        search(input.value.trim(), signal);
      },
      submit(evt, signal) {
        evt.preventDefault();
        let form = evt.target as HTMLFormElement;
        let query = String(new FormData(form).get("q") ?? "").trim();
        search(query, signal);
      },
      "test-search:change"({ detail }) {
        event = detail;
        handle.update();
      },
    });
  };

  return () => (
    <div mix={ref(searchTargetRef)}>
      <form>
        <input name="q" />
        <button>Search</button>
      </form>
      <output>
        <pre>{JSON.stringify(event, null, 2)}</pre>
      </output>
    </div>
  );
}

function TestAppProvider(
  handle: Handle<
    { children?: RemixNode },
    {
      target: TypedEventTarget<AppContextEventMap>;
      appContext: AppContext;
    }
  >,
) {
  let target = new TypedEventTarget<AppContextEventMap>();
  let appContext: AppContext = {
    user: null,
    settings: { layout: "normal", theme: "dark" },
  };
  addEventListeners(target, handle.signal, {
    change({ detail }) {
      if (detail.event) {
        Object.assign(appContext, { [detail.event.type]: detail.event.detail });
      } else {
        Object.assign(appContext, detail.changes);
      }
    },
  });
  handle.context.set({
    appContext,
    target,
  });

  return () => (
    <section>
      <button
        type="button"
        data-action="login"
        mix={on("click", (_, signal) => {
          dispatchCustomEvent(target, signal, "user", { name: "Ada", age: 37 });
        })}
      >
        Login
      </button>
      <button
        type="button"
        data-action="theme"
        mix={on("click", (_, signal) => {
          dispatchCustomEvent(target, signal, "change", {
            changes: {
              settings: {
                layout: "zen",
                theme: "light",
              },
            },
          });
        })}
      >
        Set Zen-Light Theme
      </button>
      <button
        type="button"
        data-action="loadContext"
        mix={on("click", (_, signal) => {
          dispatchCustomEvent(target, signal, "change", {
            changes: {
              user: { name: "Bob Lazar", age: 23 },
              settings: { layout: "grid", theme: "dark" },
            },
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
  let provider = handle.context.get(TestAppProvider);
  let context = provider.appContext;
  addEventListeners(provider.target, handle.signal, {
    user() {
      updateCount++;
      handle.update();
    },
  });
  return () => (
    <output data-testid="user">
      {context.user?.name ?? "Not logged in"} AND updateCount:{updateCount}
    </output>
  );
}

function SettingsDisplay(handle: Handle) {
  let updateCount = 0;
  let provider = handle.context.get(TestAppProvider);
  let context = provider.appContext;
  addEventListeners(provider.target, handle.signal, {
    settings() {
      updateCount++;
      handle.update();
    },
  });
  return () => (
    <output data-testid="settings">
      {context.settings.theme}:{context.settings.layout} AND updateCount:
      {updateCount}
    </output>
  );
}

function ContextSnapshot(handle: Handle) {
  let updateCount = 0;
  let provider = handle.context.get(TestAppProvider);
  let context = provider.appContext;
  addEventListeners(provider.target, handle.signal, {
    change() {
      updateCount++;
      handle.update();
    },
  });

  return () => (
    <output data-testid="snapshot">
      {context.user?.name ?? "none"}:{context.settings.theme}:
      {context.settings.layout} AND updateCount:{updateCount}
    </output>
  );
}

async function settleAsyncSearch() {
  await Promise.resolve();
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  await Promise.resolve();
}

describe("dispatchCustomEvent component usage", () => {
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
            event: {
              type: "activated",
              namespacedType: "test-gesture:activated",
              detail: { pointerId: 7 },
            },
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
            event: {
              type: "activated",
              namespacedType: "test-gesture:activated",
              detail: { pointerId: 7 },
            },
            },
          {
            event: {
              type: "moved",
              namespacedType: "test-gesture:moved",
              detail: { x: 20, y: 35 },
            },
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
            event: {
              type: "activated",
              namespacedType: "test-gesture:activated",
              detail: { pointerId: 7 },
            },
            },
          {
            event: {
              type: "moved",
              namespacedType: "test-gesture:moved",
              detail: { x: 20, y: 35 },
            },
            },
          { event: { type: "released", namespacedType: "test-gesture:released" } },
        ],
        null,
        2,
      ),
    );
  });

  it("supports TypedEventTarget classes dispatching granular and change events", async (t) => {
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
            event: {
              type: "loaded",
              detail: { track: "North Star" },
            },
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
            event: {
              type: "loaded",
              detail: { track: "North Star" },
            },
            },
          {
            event: {
              type: "played",
              detail: { track: "North Star" },
            },
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
            event: {
              type: "loaded",
              detail: { track: "North Star" },
            },
            },
          {
            event: {
              type: "played",
              detail: { track: "North Star" },
            },
            },
          { event: { type: "stopped" } },
        ],
        null,
        2,
      ),
    );
  });

  it("uses a target-and-signal-bound dispatcher from a form event handler", async (t) => {
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
          event: {
            type: "querySubmitted",
            namespacedType: "test-search:querySubmitted",
            detail: { query: "dune" },
          },
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
          event: {
            type: "idle",
            namespacedType: "test-search:idle",
          },
          },
        null,
        2,
      ),
    );

    input.value = "offline";
    await result.act(() => submitButton.click());

    assert.equal(
      result.$("output")?.textContent,
      JSON.stringify(
        {
          event: {
            type: "errorOccurred",
            namespacedType: "test-search:errorOccurred",
            detail: new Error("Network response was not ok"),
          },
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

    assert.equal(
      result.$("output")?.textContent,
      JSON.stringify(
        {
          event: {
            type: "booksNotFound",
            namespacedType: "test-search:booksNotFound",
            detail: { reason: "emptyList" },
          },
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
          event: {
            type: "querySubmitted",
            namespacedType: "test-search:querySubmitted",
            detail: { query: "d" },
          },
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
          event: {
            type: "querySubmitted",
            namespacedType: "test-search:querySubmitted",
            detail: { query: "du" },
          },
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
          event: {
            type: "querySubmitted",
            namespacedType: "test-search:querySubmitted",
            detail: { query: "dun" },
          },
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
          event: {
            type: "querySubmitted",
            namespacedType: "test-search:querySubmitted",
            detail: { query: "dune" },
          },
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
          event: {
            type: "querySubmitted",
            namespacedType: "test-search:querySubmitted",
            detail: { query: "dune" },
          },
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
          event: {
            type: "booksFound",
            namespacedType: "test-search:booksFound",
            detail: { books: ["Dune", "Dune Messiah"] },
          },
          },
        null,
        2,
      ),
    );
  });

  it("supports AppContext-style providers with granular and patch changes", async (t) => {
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
      "Bob Lazar:dark:grid AND updateCount:3",
    );
    assert.equal(
      result.$('[data-testid="settings"]')?.textContent,
      "dark:grid AND updateCount:2",
    );
  });
});
