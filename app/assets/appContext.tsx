import { addEventListeners, type Handle, type RemixNode } from "remix/ui";
import { customEvents } from "./utils/customEvents/index.tsx";

export type AppContextValue = {
  user: { name: string; age: number } | null;
  settings: {
    theme: "dark" | "light" | "system";
    layout: "zen" | "normal";
  };
};

export const appContextEvents = customEvents<AppContextValue>();
export type AppContext = ReturnType<
  typeof appContextEvents.withState<AppContextValue>
>;

export function AppProvider(
  handle: Handle<{ children?: RemixNode }, AppContext>,
) {
  let appContext = appContextEvents.withState({
    user: null,
    settings: { layout: "normal", theme: "system" },
  });
  handle.context.set(appContext);

  handle.queueTask(async (signal) => {
    // perform auth and other async stuff and dispatch context value
    appContext.update((draft) => {
      draft.user = { age: 23, name: "Bob Lazar" };
      draft.settings = { layout: "zen", theme: "light" };
    });
  });

  return () => <body>{handle.props.children}</body>;
}

// Components can subscribe to only the events they care about
export function UserDisplay(handle: Handle) {
  let appContext = handle.context.get(AppProvider);

  addEventListeners(appContext, handle.signal, {
    user() {
      void handle.update();
    },
  });

  return () => <div>{appContext.user?.name ?? "Not logged in"}</div>;
}

// Event-aware elements can display context values without calling handle.update().
export function EventUserDisplay(handle: Handle) {
  let appContext = handle.context.get(AppProvider);

  return () => (
    <div>
      <appContext.view.div on={appContext.events.user.name}>
        {(event) => event.detail ?? "Not logged in"}
      </appContext.view.div>
    </div>
  );
}

export function SettingsDisplay(handle: Handle) {
  let appContext = handle.context.get(AppProvider);

  addEventListeners(appContext, handle.signal, {
    settings() {
      void handle.update();
    },
  });

  return () => (
    <div>
      <pre>
        Layout: {appContext.settings.layout}, Theme: {appContext.settings.theme}
      </pre>
    </div>
  );
}

export function EventSettingsDisplay(handle: Handle) {
  let appContext = handle.context.get(AppProvider);

  return () => (
    <appContext.view.pre on={appContext.events.settings}>
      {({ detail: settings }) =>
        `Layout: ${settings.layout}, Theme: ${settings.theme}`
      }
    </appContext.view.pre>
  );
}
