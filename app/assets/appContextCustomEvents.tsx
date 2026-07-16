import {
  addEventListeners,
  TypedEventTarget,
  type Handle,
  type RemixNode,
} from "remix/ui";
import { CustomEvents } from "./utils/customEvents.tsx";

type AppContextValue = {
  user: { name: string; age: number } | null;
  settings: {
    theme: "dark" | "light" | "system";
    layout: "zen" | "normal";
  };
};

class AppContext extends TypedEventTarget<
  CustomEvents<AppContextValue>["__eventMap"]
> {
  events: CustomEvents<AppContextValue>;

  constructor(initial: Partial<AppContextValue>) {
    super();
    this.events = new CustomEvents<AppContextValue>();
    this.events.seedInitialEvent(this.events.events(initial));
    this.events.setHost(this);
  }

  get value() {
    return this.events.getHost(this).latest?.events as AppContextValue;
  }

  set value(value: Partial<AppContextValue>) {
    this.dispatchEvent(this.events.events(value));
  }
}

function AppProvider(handle: Handle<{ children?: RemixNode }, AppContext>) {
  let appContext = new AppContext({
    user: null,
    settings: { layout: "normal", theme: "system" },
  });
  handle.context.set(appContext);

  handle.queueTask(async (signal) => {
    // perform auth and other async stuff and dispatch context value
    await Promise.resolve();
    appContext.value = {
      user: { age: 23, name: "Bob Lazar" },
      settings: { layout: "zen", theme: "light" },
    };
  });

  return () => <body>{handle.props.children}</body>;
}

// Components can subscribe to only the events they care about
function UserDisplay(handle: Handle) {
  let appContext = handle.context.get(AppProvider);

  addEventListeners(appContext, handle.signal, {
    user() {
      handle.update();
    },
  });

  return () => <div>{appContext.value.user?.name ?? "Not logged in"}</div>;
}

// Event components can display context values without calling handle.update().
function EventUserDisplay(handle: Handle) {
  let appContext = handle.context.get(AppProvider);

  return () => (
    <appContext.events.user
      render={({ detail }) => <div>{detail?.name ?? "Not logged in"}</div>}
    />
  );
}

function SettingsDisplay(handle: Handle) {
  let appContext = handle.context.get(AppProvider);

  addEventListeners(appContext, handle.signal, {
    settings() {
      handle.update();
    },
  });

  return () => (
    <div>
      <pre>
        Layout: {appContext.value.settings?.layout}, Theme:{" "}
        {appContext.value.settings?.theme}
      </pre>
    </div>
  );
}

function EventSettingsDisplay(handle: Handle) {
  let appContext = handle.context.get(AppProvider);

  return () => (
    <appContext.events.settings
      render={({ detail }) => (
        <div>
          <pre>
            Layout: {detail.layout}, Theme: {detail.theme}
          </pre>
        </div>
      )}
    />
  );
}
