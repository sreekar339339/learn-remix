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

import { CustomEvents } from "./customEvents.tsx";

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
type GestureEventMap = GestureEvents["map"];

class PlayerEvents extends CustomEvents<{
  loaded: { track: string };
  played: { track: string };
  stopped: null;
}> {}
type PlayerEventMap = PlayerEvents["map"];

class ScopedActionEvents extends CustomEvents<{
  actionSubmitted: null;
  actionSucceeded: null;
  actionErrored: { error: Error };
}> {}
type ScopedActionEventMap = ScopedActionEvents["map"];

type AppContext = {
  user: { name: string; age: number } | null;
  settings: {
    theme: "dark" | "light" | "system";
    layout: "zen" | "normal" | "grid";
  };
};

class TestAppContext extends TypedEventTarget<CustomEvents<AppContext>["map"]> {
  events = new CustomEvents<AppContext>();

  constructor(initial: Partial<AppContext>) {
    super();
    this.events.seed(this.events.change(initial));
    this.events.setHost(this);
  }

  get value(): AppContext {
    return this.events.getHost(this).latest?.events as AppContext;
  }

  patch(value: Partial<AppContext>) {
    this.dispatchEvent(this.events.change(value));
  }
}

let gestureEvents = new GestureEvents();

const gestureMixin = createMixin<HTMLElement>((handle) => {
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
            gestureEvents.activated({ pointerId: pointerId }, { signal }),
          );
        }),
        on("pointermove", ({ currentTarget, clientX, clientY }, signal) => {
          currentTarget.dispatchEvent(
            gestureEvents.moved({ x: clientX, y: clientY }, { signal }),
          );
        }),
        on("pointerup", ({ currentTarget }, signal) => {
          currentTarget.dispatchEvent(gestureEvents.released({ signal }));
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
        gestureEvents.on("change", ({ detail }) => {
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
  events = new PlayerEvents();

  constructor(signal: AbortSignal) {
    super();
    this.events.setHost(this, signal);
  }

  load(track: string) {
    this.#track = track;
    this.dispatchEvent(
      this.events.change({ loaded: { track }, played: { track } }),
    );
  }

  play() {
    if (!this.#track) return;
    this.dispatchEvent(this.events.played({ track: this.#track }));
  }

  stop() {
    this.dispatchEvent(this.events.stopped());
  }
}

function PlayerUI(handle: Handle) {
  let player = new TestPlayer(handle.signal);
  let events: PlayerEventMap["change"]["detail"][] = [];

  player.addEventListener(
    player.events.types.change,
    (({ detail }: PlayerEventMap["change"]) => {
      events.push(detail);
      handle.update();
    }) as EventListener,
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
  let events = new ScopedActionEvents();
  let firstStatus = "idle";
  let secondStatus = "idle";

  let changeStatus =
    (statusFor: "first" | "second") =>
    ({ detail }: ScopedActionEventMap["change"]) => {
      if (Array.isArray(detail.type)) return;

      if (statusFor === "first") {
        firstStatus = detail.type;
      } else {
        secondStatus = detail.type;
      }

      handle.update();
    };

  let submit = (
    event: Dispatched<SubmitEvent, HTMLFormElement>,
    signal: AbortSignal,
  ) => {
    event.preventDefault();
    let form = event.currentTarget;

    form.dispatchEvent(events.actionSubmitted({ signal }));

    if (form.dataset.result === "error") {
      form.dispatchEvent(
        events.actionErrored(
          { error: new Error("Could not save") },
          { signal },
        ),
      );
    } else {
      form.dispatchEvent(events.actionSucceeded({ signal }));
    }
  };

  return () => (
    <>
      <form
        data-result="success"
        mix={[
          events.host(),
          events.on("change", changeStatus("first")),
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
          events.on("change", changeStatus("second")),
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
  let searchEvents = new SearchEvents();
  searchEvents.seed(searchEvents.idle());

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
          searchEvents.booksNotFound({ reason: "emptyList" }, opts),
        );
      }
      input.dispatchEvent(searchEvents.booksFound({ books: data.books }, opts));
    } catch (error) {
      input.dispatchEvent(searchEvents.errorOccurred(error as Error, opts));
    }
  };

  return () => (
    <div>
      <form
        mix={on("submit", (evt) => {
          evt.preventDefault();
          let form = evt.currentTarget;
          let input = form.elements.namedItem("q") as HTMLInputElement | null;
          let query = input?.value.trim() ?? "";
          form.dispatchEvent(
            query
              ? searchEvents.querySubmitted({ query })
              : searchEvents.idle(),
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
                  ? searchEvents.querySubmitted({ query })
                  : searchEvents.idle(),
              );
            }),
            searchEvents.listen(),
            on(
              searchEvents.types.change,
              ({ currentTarget, detail }, signal) => {
                if (detail.type === "querySubmitted") {
                  return void fetchBooks(
                    detail.detail.query,
                    currentTarget,
                    signal,
                  );
                }
              },
            ),
          ]}
        />
        <button>Search</button>
      </form>
      <searchEvents.change
        render={({ detail }) => (
          <output>
            <pre>{JSON.stringify(detail, null, 2)}</pre>
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

  addEventListeners(appContext, handle.signal, {
    user() {
      updateCount++;
      handle.update();
    },
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

  addEventListeners(appContext, handle.signal, {
    settings() {
      updateCount++;
      handle.update();
    },
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

  addEventListeners(appContext, handle.signal, {
    change() {
      updateCount++;
      handle.update();
    },
  });

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
            detail: { pointerId: 7 },
            details: { activated: { pointerId: 7 } },
          },
          {
            type: "moved",
            detail: { x: 20, y: 35 },
            details: {
              activated: { pointerId: 7 },
              moved: { x: 20, y: 35 },
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
            type: "activated",
            detail: { pointerId: 7 },
            details: { activated: { pointerId: 7 } },
          },
          {
            type: "moved",
            detail: { x: 20, y: 35 },
            details: {
              activated: { pointerId: 7 },
              moved: { x: 20, y: 35 },
            },
          },
          {
            type: "released",
            detail: null,
            details: {
              activated: { pointerId: 7 },
              moved: { x: 20, y: 35 },
              released: null,
            },
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
            details: {
              loaded: { track: "North Star" },
              played: { track: "North Star" },
            },
          },
          {
            type: "stopped",
            detail: null,
            details: {
              loaded: { track: "North Star" },
              played: { track: "North Star" },
              stopped: null,
            },
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
          details: {
            idle: null,
            querySubmitted: { query: "dune" },
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
          type: "idle",
          detail: null,
          details: {
            idle: null,
            querySubmitted: { query: "dune" },
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
          type: "errorOccurred",
          detail: new Error("Network response was not ok"),
          details: {
            idle: null,
            querySubmitted: { query: "offline" },
            errorOccurred: new Error("Network response was not ok"),
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
          type: "booksNotFound",
          detail: { reason: "emptyList" },
          details: {
            idle: null,
            querySubmitted: { query: "notfound" },
            errorOccurred: new Error("Network response was not ok"),
            booksNotFound: { reason: "emptyList" },
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
          type: "querySubmitted",
          detail: { query: "d" },
          details: {
            idle: null,
            querySubmitted: { query: "d" },
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
          type: "querySubmitted",
          detail: { query: "du" },
          details: {
            idle: null,
            querySubmitted: { query: "du" },
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
          type: "querySubmitted",
          detail: { query: "dun" },
          details: {
            idle: null,
            querySubmitted: { query: "dun" },
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
          type: "querySubmitted",
          detail: { query: "dune" },
          details: {
            idle: null,
            querySubmitted: { query: "dune" },
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
          type: "querySubmitted",
          detail: { query: "dune" },
          details: {
            idle: null,
            querySubmitted: { query: "dune" },
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
          type: "booksFound",
          detail: { books: ["Dune", "Dune Messiah"] },
          details: {
            idle: null,
            querySubmitted: { query: "dune" },
            booksFound: { books: ["Dune", "Dune Messiah"] },
          },
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
