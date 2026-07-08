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

import {
  dispatchCustomEvent,
  type CustomEventMap,
  type DispatchCustomEvent,
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

type ScopedActionEventMap = CustomEventMap<{
  actionSubmitted: null;
  actionSucceeded: null;
  actionErrored: { error: Error };
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
          dispatchCustomEvent(
            { target, signal, namespace: "test-gesture" },
            { activated: { pointerId: event.pointerId } },
          );
        }),
        on("pointermove", (event, signal) => {
          if (!target) return;
          dispatchCustomEvent(
            { target, signal, namespace: "test-gesture" },
            { moved: { x: event.clientX, y: event.clientY } },
          );
        }),
        on("pointerup", (_, signal) => {
          if (!target) return;
          dispatchCustomEvent(
            { target, signal, namespace: "test-gesture" },
            { released: null },
          );
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

class TestPlayer extends TypedEventTarget<PlayerEventMap> {
  #track: string | null = null;
  dispatch: DispatchCustomEvent<TestPlayer>;

  constructor(signal: AbortSignal) {
    super();
    this.dispatch = dispatchCustomEvent.bind(null, {
      target: this as TestPlayer,
      signal,
    });
  }

  load(track: string) {
    this.#track = track;
    this.dispatch({ loaded: { track }, played: { track } });
  }

  play() {
    if (!this.#track) return;
    this.dispatch({ played: { track: this.#track } });
  }

  stop() {
    this.dispatch({ stopped: null });
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

function ScopedActionForms(handle: Handle) {
  let target = new TypedEventTarget<ScopedActionEventMap>();
  let firstStatus = "idle";
  let secondStatus = "idle";

  let formRef =
    (statusFor: "first" | "second") =>
    (form: HTMLFormElement, signal: AbortSignal) => {
      addEventListeners(target, signal, {
        change(event) {
          if (event.source !== form) return;
          let { detail } = event;
          if (Array.isArray(detail.type)) return;

          if (statusFor === "first") {
            firstStatus = detail.type;
          } else {
            secondStatus = detail.type;
          }

          handle.update();
        },
      });
    };

  let submit = (
    event: Dispatched<SubmitEvent, HTMLFormElement>,
    signal: AbortSignal,
  ) => {
    event.preventDefault();
    let form = event.currentTarget;
    let options = { target, signal, source: form };
    let dispatch = dispatchCustomEvent.bind(null, options);

    dispatch({ actionSubmitted: null });

    if (form.dataset.result === "error") {
      dispatch(
        { actionErrored: { error: new Error("Could not save") } },
      );
    } else {
      dispatch({ actionSucceeded: null });
    }
  };

  return () => (
    <>
      <form
        data-result="success"
        mix={[ref(formRef("first")), on("submit", submit)]}
      >
        <button data-testid="first-submit">Save First</button>
        <output data-testid="first-status">{firstStatus}</output>
      </form>
      <form
        data-result="error"
        mix={[ref(formRef("second")), on("submit", submit)]}
      >
        <button data-testid="second-submit">Save Second</button>
        <output data-testid="second-status">{secondStatus}</output>
      </form>
    </>
  );
}

function SearchForm(handle: Handle<Props<"div">>) {
  let event: SearchEventMap["change"]["detail"] = {
    type: "idle",
    detail: null,
    details: { idle: null },
  };

  let searchTargetRef = (target: HTMLDivElement) => {
    let search = async (query: string, signal: AbortSignal) => {
      let options = { target, signal, namespace: "test-search" as const };
      let dispatch = dispatchCustomEvent.bind(null, options);

      if (!query) return dispatch({ idle: null });
      dispatch({ querySubmitted: { query } });
      try {
        let resp = await fetch(`/api/search?q=${encodeURIComponent(query)}`, {
          signal,
        });
        if (!resp.ok) throw new Error("Network response was not ok");
        let data = await resp.json();
        if (!Array.isArray(data.books) || data.books.length === 0) {
          return dispatch(
            { booksNotFound: { reason: "emptyList" } },
          );
        }
        dispatch(
          { booksFound: { books: data.books } },
        );
      } catch (error) {
        dispatch({ errorOccurred: error as Error });
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
  let dispatch = dispatchCustomEvent.bind(null, {target, signal: handle.signal});
  addEventListeners(target, handle.signal, {
    change({ detail }) {
      Object.assign(appContext, detail.details);
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
        mix={on("click", () => {
          dispatch(
            { user: { name: "Ada", age: 37 } },
          );
        })}
      >
        Login
      </button>
      <button
        type="button"
        data-action="theme"
        mix={on("click", () => {
          dispatch({
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
          dispatch({
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
            type: "activated",
            name: "test-gesture:activated",
            detail: { pointerId: 7 },
            details: { activated: { pointerId: 7 } },
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
            name: "test-gesture:activated",
            detail: { pointerId: 7 },
            details: { activated: { pointerId: 7 } },
          },
          {
            type: "moved",
            name: "test-gesture:moved",
            detail: { x: 20, y: 35 },
            details: { moved: { x: 20, y: 35 } },
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
            name: "test-gesture:activated",
            detail: { pointerId: 7 },
            details: { activated: { pointerId: 7 } },
          },
          {
            type: "moved",
            name: "test-gesture:moved",
            detail: { x: 20, y: 35 },
            details: { moved: { x: 20, y: 35 } },
          },
          {
            type: "released",
            name: "test-gesture:released",
            detail: null,
            details: { released: null },
          },
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
            type: ["loaded", "played"],
            detail: {
              loaded: { track: "North Star" },
              played: { track: "North Star" },
            },
            details: {
              loaded: { track: "North Star" },
              played: { track: "North Star" },
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
            type: ["loaded", "played"],
            detail: {
              loaded: { track: "North Star" },
              played: { track: "North Star" },
            },
            details: {
              loaded: { track: "North Star" },
              played: { track: "North Star" },
            },
          },
          {
            type: "played",
            detail: { track: "North Star" },
            details: { played: { track: "North Star" } },
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
            type: ["loaded", "played"],
            detail: {
              loaded: { track: "North Star" },
              played: { track: "North Star" },
            },
            details: {
              loaded: { track: "North Star" },
              played: { track: "North Star" },
            },
          },
          {
            type: "played",
            detail: { track: "North Star" },
            details: { played: { track: "North Star" } },
          },
          { type: "stopped", detail: null, details: { stopped: null } },
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
          name: "test-search:querySubmitted",
          detail: { query: "dune" },
          details: { querySubmitted: { query: "dune" } },
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
          name: "test-search:idle",
          detail: null,
          details: { idle: null },
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
          type: "errorOccurred",
          name: "test-search:errorOccurred",
          detail: new Error("Network response was not ok"),
          details: { errorOccurred: new Error("Network response was not ok") },
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
          type: "booksNotFound",
          name: "test-search:booksNotFound",
          detail: { reason: "emptyList" },
          details: { booksNotFound: { reason: "emptyList" } },
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
          name: "test-search:querySubmitted",
          detail: { query: "d" },
          details: { querySubmitted: { query: "d" } },
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
          name: "test-search:querySubmitted",
          detail: { query: "du" },
          details: { querySubmitted: { query: "du" } },
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
          name: "test-search:querySubmitted",
          detail: { query: "dun" },
          details: { querySubmitted: { query: "dun" } },
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
          name: "test-search:querySubmitted",
          detail: { query: "dune" },
          details: { querySubmitted: { query: "dune" } },
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
          name: "test-search:querySubmitted",
          detail: { query: "dune" },
          details: { querySubmitted: { query: "dune" } },
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
          name: "test-search:booksFound",
          detail: { books: ["Dune", "Dune Messiah"] },
          details: { booksFound: { books: ["Dune", "Dune Messiah"] } },
        },
        null,
        2,
      ),
    );
  });

  it("supports AppContext-style providers with granular and batch details events", async (t) => {
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
