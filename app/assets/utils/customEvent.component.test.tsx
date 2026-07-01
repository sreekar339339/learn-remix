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
    errorOccurred: Error;
    querySubmitted: { query: string };
    reset: null;
  },
  "search"
>;

type User = { name: string; age: number } | null;
type Settings = {
  theme: "dark" | "light" | "system";
  layout: "normal" | "zen";
};

type TestAppContext = {
  user: User;
  settings: Settings;
};

type AppContextEventMap = CustomEventMap<TestAppContext, "context">;

function SearchForm(handle: Handle<Props<"div">>) {
  let status = "idle";

  let searchTargetRef = (target: SearchEventMap["target"]["div"]) => {
    addEventListeners(target, handle.signal, {
      "search:querySubmitted"({ detail }) {
        status = `query:${detail.query}`;
        handle.update();
      },
      "search:reset"() {
        status = "idle";
        handle.update();
      },
      submit(evt, signal) {
        evt.preventDefault();

        let form = evt.target as HTMLFormElement;
        let dispatch = dispatchCustomEvent(target, signal);
        let query = String(new FormData(form).get("q") ?? "").trim();

        if (!query) {
          dispatch("search:reset");
          return;
        }

        dispatch("search:querySubmitted", { query });
      },
    });
  };

  return () => (
    <div mix={ref(searchTargetRef)}>
      <form>
        <input name="q" />
        <button>Search</button>
      </form>
      <output>{status}</output>
    </div>
  );
}

function SearchResults(handle: Handle<Props<"section">>) {
  let status = "waiting";
  let dispatch: SearchEventMap["dispatcherWithoutSignal"];

  let searchTargetRef = (target: SearchEventMap["target"]["section"]) => {
    dispatch = dispatchCustomEvent(target);
    addEventListeners(target, handle.signal, {
      "search:booksFound"({ detail }) {
        status = detail.books.join(", ");
        handle.update();
      },
      "search:errorOccurred"({ detail }) {
        status = detail.message;
        handle.update();
      },
    });
  };

  return () => (
    <section mix={ref(searchTargetRef)}>
      <button
        type="button"
        mix={on("click", (_, signal) => {
          dispatch(signal, "search:booksFound", {
            books: ["Dune", "Hyperion"],
          });
        })}
      >
        Load
      </button>
      <button
        type="button"
        mix={on("click", (_, signal) => {
          let dispatchWithSignal = dispatch(signal);
          dispatchWithSignal("search:errorOccurred", new Error("offline"));
        })}
      >
        Error
      </button>
      <output>{status}</output>
    </section>
  );
}

function DirectDispatchWidget(handle: Handle<Props<"div">>) {
  let status = "active";

  let directTargetRef = (target: SearchEventMap["target"]["div"]) => {
    addEventListeners(target, handle.signal, {
      "search:reset"() {
        status = "idle";
        handle.update();
      },
    });
  };

  return () => (
    <div mix={ref(directTargetRef)}>
      <button
        type="button"
        mix={on("click", (evt, signal) => {
          dispatchCustomEvent(
            evt.currentTarget.parentElement as SearchEventMap["target"]["div"],
            signal,
            "search:reset",
          );
        })}
      >
        Reset
      </button>
      <output>{status}</output>
    </div>
  );
}

function TestAppProvider(
  handle: Handle<
    { children?: RemixNode },
    {
      context: TestAppContext;
      target: AppContextEventMap["target"]["section"];
    }
  >,
) {
  let context: TestAppContext = {
    user: null,
    settings: { layout: "normal", theme: "dark" },
  };
  let dispatch: AppContextEventMap["dispatcherWithoutSignal"];

  let appContextRef = (target: AppContextEventMap["target"]["section"]) => {
    handle.context.set({ context, target });
    dispatch = dispatchCustomEvent(target);
    addEventListeners(target, handle.signal, {
      "context:changeMany"({ detail }) {
        Object.assign(context, detail);
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
        Theme
      </button>
      {handle.props.children}
    </section>
  );
}

function UserDisplay(handle: Handle) {
  let provider = handle.context.get(TestAppProvider);
  let user = provider.context.user;

  addEventListeners(provider.target, handle.signal, {
    "context:user"({ detail }) {
      user = detail;
      handle.update();
    },
  });

  return () => <output data-testid="user">{user?.name ?? "Not logged in"}</output>;
}

function ContextSnapshot(handle: Handle) {
  let provider = handle.context.get(TestAppProvider);
  let context = provider.context;

  addEventListeners(provider.target, handle.signal, {
    "context:changeMany"() {
      handle.update();
    },
  });

  return () => (
    <output data-testid="snapshot">
      {`${context.user?.name ?? "none"}:${context.settings.theme}:${context.settings.layout}`}
    </output>
  );
}

describe("dispatchCustomEvent component usage", () => {
  it("uses a target-and-signal-bound dispatcher from a form event handler", async () => {
    let result = render(<SearchForm />);

    try {
      let input = result.$("input") as HTMLInputElement;
      let form = result.$("form") as HTMLFormElement;

      input.value = " dune ";
      await result.act(() => form.requestSubmit());

      assert.equal(result.$("output")?.textContent, "query:dune");

      input.value = "";
      await result.act(() => form.requestSubmit());

      assert.equal(result.$("output")?.textContent, "idle");
    } finally {
      result.cleanup();
    }
  });

  it("uses a target-only dispatcher with signal supplied later", async () => {
    let result = render(<SearchResults />);

    try {
      await result.act(() => result.$$("button")[0].click());
      assert.equal(result.$("output")?.textContent, "Dune, Hyperion");

      await result.act(() => result.$$("button")[1].click());
      assert.equal(result.$("output")?.textContent, "offline");
    } finally {
      result.cleanup();
    }
  });

  it("uses direct dispatch for a one-shot no-detail component event", async () => {
    let result = render(<DirectDispatchWidget />);

    try {
      await result.act(() => result.$("button")?.click());
      assert.equal(result.$("output")?.textContent, "idle");
    } finally {
      result.cleanup();
    }
  });

  it("supports AppContext-style providers with granular and aggregate subscribers", async () => {
    let result = render(
      <TestAppProvider>
        <UserDisplay />
        <ContextSnapshot />
      </TestAppProvider>,
    );

    try {
      assert.equal(
        result.$('[data-testid="user"]')?.textContent,
        "Not logged in",
      );
      assert.equal(
        result.$('[data-testid="snapshot"]')?.textContent,
        "none:dark:normal",
      );

      await result.act(() =>
        (result.$('[data-action="login"]') as HTMLButtonElement).click(),
      );

      assert.equal(result.$('[data-testid="user"]')?.textContent, "Ada");
      assert.equal(
        result.$('[data-testid="snapshot"]')?.textContent,
        "Ada:dark:normal",
      );

      await result.act(() =>
        (result.$('[data-action="theme"]') as HTMLButtonElement).click(),
      );

      assert.equal(result.$('[data-testid="user"]')?.textContent, "Ada");
      assert.equal(
        result.$('[data-testid="snapshot"]')?.textContent,
        "Ada:light:zen",
      );
    } finally {
      result.cleanup();
    }
  });
});
