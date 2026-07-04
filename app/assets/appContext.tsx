import {
  addEventListeners,
  css,
  on,
  ref,
  type Handle,
  type RefCallback,
  type RemixNode,
} from "remix/ui";
import {
  dispatchCustomEvent,
  type CustomEventMap,
} from "./utils/customEvent.ts";

type User = { name: string; age: number } | null;
type Settings = {
  theme: "dark" | "light" | "system";
  layout: "zen" | "normal";
};

type AppContext = {
  user: User;
  settings: Settings;
};

type AppContextEventMap = CustomEventMap<
  AppContext,
  { namespace: "context" }
>;

declare global {
  type AppContextEventTypes = AppContextEventMap["namespacedEvents"];
  interface HTMLElementEventMap extends AppContextEventTypes {}
}

function AppProvider(
  handle: Handle<
    { children?: RemixNode },
    { target: HTMLBodyElement; context: AppContext }
  >,
) {
  let appContext: AppContext = {
    user: null,
    settings: { layout: "normal", theme: "dark" },
  };
  let target: HTMLBodyElement;

  handle.context.set({
    context: appContext,
    get target() {
      return target;
    },
  });

  let appContextTargetRef: RefCallback<HTMLBodyElement> = async (
    node,
    signal,
  ) => {
    target = node;
    addEventListeners(node, signal, {
      "context:change"({ detail }) {
        if ("changes" in detail) {
          Object.assign(appContext, detail.changes);
        } else {
          Object.assign(appContext, { [detail.type]: detail.detail });
        }
      },
    });
    // perform auth and other async stuff and dispatch context value
    await Promise.resolve();
    dispatchCustomEvent(node, signal, "context:change", {
      changes: {
        user: { age: 23, name: "Bob Lazar" },
        settings: { layout: "zen", theme: "light" },
      },
    });
  };

  return () => (
    <body mix={ref(appContextTargetRef)}>{handle.props.children}</body>
  );
}

// Components can subscribe to only the events they care about
function UserDisplay(handle: Handle) {
  let provider = handle.context.get(AppProvider);
  let context = provider.context;

  handle.queueTask(() => {
    addEventListeners(provider.target, handle.signal, {
      "context:user"() {
        handle.update();
      },
    });
  });

  return () => <div>{context.user?.name ?? "Not logged in"}</div>;
}

function SomeComponent(handle: Handle) {
  let provider = handle.context.get(AppProvider);
  let context = provider.context;

  handle.queueTask(() => {
    addEventListeners(provider.target, handle.signal, {
      "context:change"() {
        handle.update();
      },
    });
  });

  return () => (
    <div>
      <pre>{JSON.stringify(context, null, 2)}</pre>
    </div>
  );
}

type Theme = {
  value: "light" | "dark";
};

type ThemeDispatcherWithoutSignal =
  dispatchCustomEvent.DispatcherWithoutSignal<HTMLDivElement>;

declare global {
  type ThemeEventMap = CustomEventMap<
    Theme,
    { namespace: "theme" }
  >;
  type ThemeEventTypes = ThemeEventMap["namespacedEvents"];
  interface HTMLElementEventMap extends ThemeEventTypes {}
}

function ThemeProvider(
  handle: Handle<
    { children?: RemixNode },
    { target: HTMLDivElement; theme: Theme }
  >,
) {
  let theme: Theme = { value: "dark" };
  let target: HTMLDivElement;
  let dispatch: ThemeDispatcherWithoutSignal;

  handle.context.set({
    theme,
    get target() {
      return target;
    },
  });

  let themeTargetRef: RefCallback<HTMLDivElement> = (
    node,
    signal,
  ) => {
    target = node;
    dispatch = dispatchCustomEvent(node);
    addEventListeners(node, signal, {
      "theme:change"({ detail }) {
        if ("changes" in detail) {
          Object.assign(theme, detail.changes);
        } else {
          Object.assign(theme, { [detail.type]: detail.detail });
        }
      },
    });
  };

  return () => (
    <div mix={ref(themeTargetRef)}>
      <button
        mix={[
          on("click", (_, signal) => {
            // No update needed - consumers subscribe to changes
            dispatch(
              signal,
              "theme:value",
              theme.value === "dark" ? "light" : "dark",
            );
          }),
        ]}
      >
        Toggle Theme
      </button>
      {handle.props.children}
    </div>
  );
}

function ThemedContent(handle: Handle) {
  let provider = handle.context.get(ThemeProvider);
  let theme = provider.theme;

  // Subscribe to granular updates
  handle.queueTask(() => {
    addEventListeners(provider.target, handle.signal, {
      "theme:value"() {
        handle.update();
      },
    });
  });

  return () => (
    <div
      mix={[css({ backgroundColor: theme.value === "dark" ? "#000" : "#fff" })]}
    >
      Current theme: {theme.value}
    </div>
  );
}
