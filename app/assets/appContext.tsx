import { TypedEventTarget, type Handle, type RemixNode } from "remix/ui";
import { CustomEvents } from "./utils/customEvents/index.tsx";

export type AppContextValue = {
  user: { name: string; age: number } | null;
  settings: {
    theme: "dark" | "light" | "system";
    layout: "zen" | "normal";
  };
};

export class AppContext extends TypedEventTarget<
  CustomEvents<AppContextValue>["map"]
> {
  #events = new CustomEvents<AppContextValue>({ host: this });
  on = this.#events.on;
  readonly value: AppContextValue;

  constructor(initial: AppContextValue) {
    super();
    this.value = initial;
  }

  patch(value: Partial<AppContextValue>) {
    Object.assign(this.value, value);
    this.dispatchEvent(this.#events(value));
  }
}

export function AppProvider(
  handle: Handle<{ children?: RemixNode }, AppContext>,
) {
  let appContext = new AppContext({
    user: null,
    settings: { layout: "normal", theme: "system" },
  });
  handle.context.set(appContext);

  handle.queueTask(async (signal) => {
    // perform auth and other async stuff and dispatch context value
    appContext.patch({
      user: { age: 23, name: "Bob Lazar" },
      settings: { layout: "zen", theme: "light" },
    });
  });

  return () => <body>{handle.props.children}</body>;
}

// Components can subscribe to only the events they care about
export function UserDisplay(handle: Handle) {
  let appContext = handle.context.get(AppProvider);

  appContext.on(
    "user",
    () => {
      void handle.update();
    },
    { signal: handle.signal },
  );

  return () => <div>{appContext.value.user?.name ?? "Not logged in"}</div>;
}

// Event-aware elements can display context values without calling handle.update().
export function EventUserDisplay(handle: Handle) {
  let appContext = handle.context.get(AppProvider);

  return () => (
    <appContext.on.user.div
      child={(event) => event?.detail?.name ?? "Not logged in"}
    />
  );
}

export function SettingsDisplay(handle: Handle) {
  let appContext = handle.context.get(AppProvider);

  appContext.on(
    "settings",
    () => {
      void handle.update();
    },
    { signal: handle.signal },
  );

  return () => (
    <div>
      <pre>
        Layout: {appContext.value.settings.layout}, Theme:{" "}
        {appContext.value.settings.theme}
      </pre>
    </div>
  );
}

export function EventSettingsDisplay(handle: Handle) {
  let appContext = handle.context.get(AppProvider);

  return () => (
    <appContext.on.settings.pre
      child={(event) =>
        `Layout: ${event?.detail.layout}, Theme: ${event?.detail.theme}`
      }
    />
  );
}
