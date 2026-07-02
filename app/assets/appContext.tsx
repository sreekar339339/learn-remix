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

type AppContextEventMap = CustomEventMap<AppContext, "context">;

function AppProvider(
  handle: Handle<
    { children?: RemixNode },
    { target: AppContextEventMap["target"]["body"]; context: AppContext }
  >,
) {
  let appContext: AppContext = {
    user: null,
    settings: { layout: "normal", theme: "dark" },
  };
  let appContextTargetRef: RefCallback<
    AppContextEventMap["target"]["body"]
  > = (target, signal) => {
    handle.context.set({ context: appContext, target });
    addEventListeners(target, signal, {
      "context:change"({ detail }) {
        if ("changes" in detail) {
          Object.assign(appContext, detail.changes);
          return;
        }
      },
    });
    // perform auth and other async stuff and dispatch context value
    dispatchCustomEvent(target, signal, "context:change", {changes: {
      user: {age: 23, name: 'Bob Lazar'},
      settings: {layout: 'zen', theme: 'light'}
    }})
  };



  return () => (
    <body mix={ref(appContextTargetRef)}>{handle.props.children}</body>
  );
}

// Components can subscribe to only the events they care about
function UserDisplay(handle: Handle) {
  let context = handle.context.get(AppProvider).context

  addEventListeners(handle.context.get(AppProvider).target, handle.signal, {
    "context:user"() {
      handle.update();
    },
  });

  return () => <div>{context.user?.name ?? "Not logged in"}</div>;
}

function SomeComponent(handle: Handle) {
  let context = handle.context.get(AppProvider).context;

  addEventListeners(handle.context.get(AppProvider).target, handle.signal, {
    "context:change"() {
      handle.update();
    },
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
type ThemeEventMap = CustomEventMap<Theme, "theme">;

function ThemeProvider(
  handle: Handle<
    { children?: RemixNode },
    { target: ThemeEventMap["target"]["div"]; theme: Theme }
  >,
) {
  let theme: Theme = { value: "dark" };
  let dispatch: ThemeEventMap["dispatcherWithoutSignal"];
  let themeTargetRef: RefCallback<ThemeEventMap["target"]["div"]> = (
    target,
    signal,
  ) => {
    handle.context.set({ theme, target });
    dispatch = dispatchCustomEvent(target);
    addEventListeners(target, signal, {
      "theme:change"({ detail }) {
        if ("changes" in detail) {
          Object.assign(theme, detail.changes);
          return;
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
              theme.value === 'dark' ? 'light' : 'dark',
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
  let theme = handle.context.get(ThemeProvider).theme
  // Subscribe to granular updates
  addEventListeners(handle.context.get(ThemeProvider).target, handle.signal, {
    "theme:value"() {
      handle.update();
    },
  });

  return () => (
    <div mix={[css({ backgroundColor: theme.value === "dark" ? "#000" : "#fff" })]}>
      Current theme: {theme.value}
    </div>
  );
}
