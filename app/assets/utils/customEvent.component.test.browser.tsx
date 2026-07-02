import * as assert from "remix/assert";
import { describe, it } from "remix/test";
import {
  addEventListeners,
  on,
  ref,
  type Handle,
  type Props,
  type RemixNode,
} from "remix/ui";
import { render } from "remix/ui/test";

import {
  dispatchCustomEvent,
  type CustomEventMap,
} from "./customEvent.ts";

type SearchEventMap = CustomEventMap<
  {
    booksFound: { books: string[] };
    booksNotFound: { reason: "emptyList" | { other: string } };
    errorOccurred: Error;
    querySubmitted: { query: string };
    idle: null;
  },
  { namespace: "search"; target: HTMLDivElement }
>;

async function fetchBooks(query: string, dispatch: SearchEventMap["dispatcher"], signal: AbortSignal) {
  dispatch("search:querySubmitted", { query });
  try {
    let resp = await fetch(`/api/search?q=${encodeURIComponent(query)}`, { signal });
    if (!resp.ok) throw new Error("Network response was not ok");
    let data = await resp.json();
    if (!Array.isArray(data.books) || data.books.length === 0) {
      return dispatch("search:booksNotFound", { reason: "emptyList" });
    }
    dispatch("search:booksFound", { books: data.books });
  } catch (error) {
    dispatch("search:errorOccurred", error as Error);
  }
}

function SearchForm(handle: Handle<Props<"div">>) {
  let event: SearchEventMap["types"]["search:change"]["detail"] = {
    event: "search:idle",
    type: "idle",
  };

  let searchTargetRef = (target: SearchEventMap["target"]) => {
    let search = (query: string, signal: AbortSignal) => {
      let dispatch = dispatchCustomEvent(target, signal);
      if (!query) return dispatch("search:idle");
      fetchBooks(query, dispatch, signal);
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
      "search:change"({ detail }) {
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
      <output><pre>{JSON.stringify(event, null, 2)}</pre></output>
    </div>
  );
}

type TestAppContext = {
  user: { name: string; age: number } | null;;
  settings: {
    theme: "dark" | "light" | "system";
    layout: "normal" | "zen" | "grid";
  };
};

type AppContextEventMap = CustomEventMap<
  TestAppContext,
  { namespace: "context"; target: HTMLElement }
>;

function TestAppProvider(
  handle: Handle<
    { children?: RemixNode },
    {
      context: TestAppContext;
      target: AppContextEventMap["target"];
    }
  >,
) {
  let context: TestAppContext = {
    user: null,
    settings: { layout: "normal", theme: "system" },
  };
  let target: AppContextEventMap["target"];
  let dispatch: AppContextEventMap["dispatcherWithoutSignal"];

  handle.context.set({
    context,
    get target() {
      return target;
    },
  });

  let appContextRef = (node: AppContextEventMap["target"]) => {
    target = node;
    dispatch = dispatchCustomEvent(node);
    addEventListeners(node, handle.signal, {
      "context:change"({ detail }) {
        if ("changes" in detail) {
          Object.assign(context, detail.changes);
        } else {
          Object.assign(context, { [detail.type]: detail.detail });
        }
      },
    });
  };

  return () => (
    <section mix={ref(appContextRef)}>
      <button
        type="button"
        data-action="login"
        mix={on("click", (_, signal) => {
          dispatch(signal, "context:user", { name: "Ada", age: 37 });
        })}
      >
        Login
      </button>
      <button
        type="button"
        data-action="theme"
        mix={on("click", (_, signal) => {
          dispatch(signal, "context:settings", {
            layout: "zen",
            theme: "light",
          });
        })}
      >
        Set Zen-Light Theme
      </button>
      <button
        type="button"
        data-action="reset"
        mix={on("click", (_, signal) => {
          dispatch(signal, "context:change", {
            changes: {
              user: null,
              settings: { layout: "normal", theme: "system" },
            },
          });
        })}
      >
        Reset Context
      </button>
      <button
        type="button"
        data-action="loadContext"
        mix={on("click", (_, signal) => {
          dispatch(signal, "context:change", {
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
  let context = provider.context;
  handle.queueTask(() => {
    addEventListeners(provider.target, handle.signal, {
      "context:user"() {
        updateCount++;
        handle.update();
      },
    });
  });

  return () => (
    <output data-testid="user">{context.user?.name ?? "Not logged in"} AND updateCount:{updateCount}</output>
  )
}

function SettingsDisplay(handle: Handle) {
  let updateCount = 0;
  let provider = handle.context.get(TestAppProvider);
  let context = provider.context;
  handle.queueTask(() => {
    addEventListeners(provider.target, handle.signal, {
      "context:settings"() {
        updateCount++;
        handle.update();
      },
    });
  });

  return () => (
    <output data-testid="settings">
      {context.settings.theme}:{context.settings.layout} AND updateCount:{updateCount}
    </output>
  );
}

function ContextSnapshot(handle: Handle) {
  let updateCount = 0;
  let provider = handle.context.get(TestAppProvider);
  let context = provider.context;
  handle.queueTask(() => {
    addEventListeners(provider.target, handle.signal, {
      "context:change"() {
        updateCount++;
        handle.update();
      },
    });
  });

  return () => (
    <output data-testid="snapshot">
      {context.user?.name ?? "none"}:{context.settings.theme}:{context.settings.layout} AND updateCount:{updateCount}
    </output>
  );
}

async function settleAsyncSearch() {
  await Promise.resolve();
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  await Promise.resolve();
}

describe("dispatchCustomEvent component usage", () => {
  it("uses a target-and-signal-bound dispatcher from a form event handler", async (t) => {
    t.mock.method(window, "fetch", async (input: RequestInfo, init?: RequestInit) => {
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
    });
    let result = render(<SearchForm />);

    try {
      let input = result.$("input") as HTMLInputElement;
      let submitButton = result.$("button") as HTMLButtonElement;

      input.value = " dune ";
      await result.act(() => submitButton.click());

      assert.equal(result.$("output")?.textContent, JSON.stringify({
        event: "search:querySubmitted",
        type: "querySubmitted",
        detail: { query: "dune" },
      }, null, 2));

      input.value = "";
      await result.act(() => submitButton.click());

      assert.equal(result.$("output")?.textContent, JSON.stringify({
        event: "search:idle",
        type: "idle",
      }, null, 2));

      input.value = "offline";
      await result.act(() => submitButton.click());

      assert.equal(result.$("output")?.textContent, JSON.stringify({
        event: "search:errorOccurred",
        type: "errorOccurred",
        detail: new Error("Network response was not ok"),
      }, null, 2));

      input.value = "notfound";
      await result.act(async () => {
        submitButton.click();
        await settleAsyncSearch();
      });

      assert.equal(result.$("output")?.textContent, JSON.stringify({
        event: "search:booksNotFound",
        type: "booksNotFound",
        detail: { reason: "emptyList" },
      }, null, 2));
    } finally {
      result.cleanup();
    }
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
      let query = new URL(url, window.location.href).searchParams.get("q") ?? "";
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
            reject(new DOMException("The operation was aborted.", "AbortError"));
          },
          { once: true },
        );

        requests.push(request);
      });
    });

    let result = render(<SearchForm />);

    try {
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
      assert.equal(result.$("output")?.textContent, JSON.stringify({
        event: "search:querySubmitted",
        type: "querySubmitted",
        detail: { query: "d" },
      }, null, 2));

      await typeQuery("du");
      assert.equal(requests.length, 2);
      assert.equal(requests[0].signal.aborted, true);
      assert.equal(requests[1].query, "du");
      assert.equal(requests[1].signal.aborted, false);
      assert.equal(result.$("output")?.textContent, JSON.stringify({
        event: "search:querySubmitted",
        type: "querySubmitted",
        detail: { query: "du" },
      }, null, 2));

      await typeQuery("dun");
      assert.equal(requests.length, 3);
      assert.equal(requests[1].signal.aborted, true);
      assert.equal(requests[2].query, "dun");
      assert.equal(requests[2].signal.aborted, false);
      assert.equal(result.$("output")?.textContent, JSON.stringify({
        event: "search:querySubmitted",
        type: "querySubmitted",
        detail: { query: "dun" },
      }, null, 2));

      await typeQuery("dune");
      assert.equal(requests.length, 4);
      assert.equal(requests[2].signal.aborted, true);
      assert.equal(requests[3].query, "dune");
      assert.equal(requests[3].signal.aborted, false);
      assert.equal(result.$("output")?.textContent, JSON.stringify({
        event: "search:querySubmitted",
        type: "querySubmitted",
        detail: { query: "dune" },
      }, null, 2));

      await result.act(async () => {
        requests[0].resolveBooks(["Stale D"]);
        requests[1].reject(new Error("stale network failure"));
        requests[2].resolveBooks(["Stale Dun"]);
        await settleAsyncSearch();
      });

      assert.equal(result.$("output")?.textContent, JSON.stringify({
        event: "search:querySubmitted",
        type: "querySubmitted",
        detail: { query: "dune" },
      }, null, 2));

      await result.act(async () => {
        requests[3].resolveBooks(["Dune", "Dune Messiah"]);
        await settleAsyncSearch();
      });

      assert.equal(result.$("output")?.textContent, JSON.stringify({
        event: "search:booksFound",
        type: "booksFound",
        detail: { books: ["Dune", "Dune Messiah"] },
      }, null, 2));
    } finally {
      result.cleanup();
    }
  });

  it("supports AppContext-style providers with granular and patch changes", async () => {
    let result = render(
      <TestAppProvider>
        <UserDisplay />
        <SettingsDisplay />
        <ContextSnapshot />
      </TestAppProvider>
    );

    try {
      assert.equal(
        result.$('[data-testid="user"]')?.textContent,
        "Not logged in AND updateCount:0",
      );
      assert.equal(
        result.$('[data-testid="snapshot"]')?.textContent,
        "none:system:normal AND updateCount:0",
      );
      assert.equal(
        result.$('[data-testid="settings"]')?.textContent,
        "system:normal AND updateCount:0",
      );

      await result.act(() =>
        (result.$('[data-action="login"]') as HTMLButtonElement).click(),
      );

      assert.equal(result.$('[data-testid="user"]')?.textContent, "Ada AND updateCount:1");
      assert.equal(
        result.$('[data-testid="snapshot"]')?.textContent,
        "Ada:system:normal AND updateCount:1",
      );
      assert.equal(
        result.$('[data-testid="settings"]')?.textContent,
        "system:normal AND updateCount:0",
      );

      await result.act(() =>
        (result.$('[data-action="theme"]') as HTMLButtonElement).click(),
      );

      assert.equal(result.$('[data-testid="user"]')?.textContent, "Ada AND updateCount:1");
      assert.equal(
        result.$('[data-testid="snapshot"]')?.textContent,
        "Ada:light:zen AND updateCount:2",
      );

      assert.equal(
        result.$('[data-testid="settings"]')?.textContent,
        "light:zen AND updateCount:1",
      );

      await result.act(() =>
        (result.$('[data-action="reset"]') as HTMLButtonElement).click(),
      );

      assert.equal(result.$('[data-testid="user"]')?.textContent, "Not logged in AND updateCount:2");
      assert.equal(
        result.$('[data-testid="snapshot"]')?.textContent,
        "none:system:normal AND updateCount:3",
      );
      assert.equal(
        result.$('[data-testid="settings"]')?.textContent,
        "system:normal AND updateCount:2",
      );

      await result.act(() =>
        (result.$('[data-action="loadContext"]') as HTMLButtonElement).click(),
      );

      assert.equal(result.$('[data-testid="user"]')?.textContent, "Bob Lazar AND updateCount:3");
      assert.equal(
        result.$('[data-testid="snapshot"]')?.textContent,
        "Bob Lazar:dark:grid AND updateCount:4",
      );
      assert.equal(
        result.$('[data-testid="settings"]')?.textContent,
        "dark:grid AND updateCount:3",
      );
    } finally {
      result.cleanup();
    }
  });
});
